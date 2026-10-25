package handlers

import (
	"errors"
	"log/slog"
	"net/http"
	"time"

	awsconn "github.com/YHQZ1/hatch/internal/cloud/aws"
	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// maxConnectionsPerUser bounds the rows one user can create. v1 has one account
// and one region per connection, so this is generous.
const maxConnectionsPerUser = 5

// ConnectionHandler manages a user's connections to their own AWS accounts
// (ADR 0001). Creating one only records it and builds the link that starts the
// hatch-connect stack; nothing here calls AWS.
type ConnectionHandler struct {
	queries *dbpkg.Queries
	// principalARN and templateURL are this server's settings (ADRs 0020, 0022).
	// Without them a connection cannot be started.
	principalARN string
	templateURL  string
}

func NewConnectionHandler(pool *pgxpool.Pool, principalARN, templateURL string) *ConnectionHandler {
	return &ConnectionHandler{queries: dbpkg.New(pool), principalARN: principalARN, templateURL: templateURL}
}

func (h *ConnectionHandler) enabled() bool { return h.principalARN != "" && h.templateURL != "" }

// connectionResponse is what the API says about a connection. It is its own type
// and not the database row, which carries the ExternalId: that goes into the link
// the owner opens and nowhere else.
type connectionResponse struct {
	ID               uuid.UUID  `json:"id"`
	Provider         string     `json:"provider"`
	Status           string     `json:"status"`
	Region           string     `json:"region"`
	StackName        string     `json:"stack_name"`
	MonthlyBudgetUSD int32      `json:"monthly_budget_usd"`
	BudgetEmail      string     `json:"budget_email"`
	CertificateARN   *string    `json:"certificate_arn"`
	RoleARN          *string    `json:"role_arn"`
	AWSAccountID     *string    `json:"aws_account_id"`
	TemplateVersion  *string    `json:"template_version"`
	TemplateUpToDate *bool      `json:"template_up_to_date"`
	ServesHTTPS      *bool      `json:"serves_https"`
	LastError        *string    `json:"last_error"`
	LastVerifiedAt   *time.Time `json:"last_verified_at"`
	CreatedAt        time.Time  `json:"created_at"`
	// QuickCreateURL opens the stack in the user's AWS console. It is given while
	// the connection is not yet connected, so a reloaded page can show it again.
	QuickCreateURL string `json:"quick_create_url,omitempty"`
}

func (h *ConnectionHandler) response(c *gin.Context, row dbpkg.CloudConnection) connectionResponse {
	out := connectionResponse{
		ID: row.ID, Provider: row.Provider, Status: row.Status, Region: row.Region,
		StackName: row.StackName, MonthlyBudgetUSD: row.MonthlyBudgetUsd, BudgetEmail: row.BudgetEmail,
		CertificateARN: row.CertificateArn, RoleARN: row.RoleArn, AWSAccountID: row.AwsAccountID,
		TemplateVersion: row.TemplateVersion, ServesHTTPS: row.ServesHttps, LastError: row.LastError,
		LastVerifiedAt: row.LastVerifiedAt, CreatedAt: row.CreatedAt,
	}
	if row.TemplateVersion != nil {
		out.TemplateUpToDate = ptr(*row.TemplateVersion == awsconn.CurrentTemplateVersion)
	}
	if row.Status != "connected" && h.enabled() {
		link, err := awsconn.QuickCreateURL(h.linkParams(row))
		if err != nil {
			// Built from values that passed the same checks when it was created, so
			// this means the server's settings changed since.
			slog.WarnContext(c.Request.Context(), "could not build the quick-create link of a connection", "connection_id", row.ID, "error", err)
		} else {
			out.QuickCreateURL = link
		}
	}
	return out
}

// linkParams uses the principal the connection was created with, so changing
// this server's principal later does not rewrite a link the user has half used.
func (h *ConnectionHandler) linkParams(row dbpkg.CloudConnection) awsconn.LinkParams {
	return awsconn.LinkParams{
		Region:           row.Region,
		TemplateURL:      h.templateURL,
		StackName:        row.StackName,
		PrincipalARN:     row.PrincipalArn,
		ExternalID:       row.ExternalID,
		MonthlyBudgetUSD: int(row.MonthlyBudgetUsd),
		BudgetEmail:      row.BudgetEmail,
		CertificateARN:   derefString(row.CertificateArn),
	}
}

// own finds the connection named in the path among the signed-in user's own. A
// connection that is not theirs is reported as missing, the same as one that does
// not exist.
func (h *ConnectionHandler) own(c *gin.Context) (dbpkg.CloudConnection, bool) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return dbpkg.CloudConnection{}, false
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "connection not found"})
		return dbpkg.CloudConnection{}, false
	}
	row, err := h.queries.GetCloudConnectionForUser(c.Request.Context(), dbpkg.GetCloudConnectionForUserParams{ID: id, UserID: userID})
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "connection not found"})
		return dbpkg.CloudConnection{}, false
	}
	if err != nil {
		slog.ErrorContext(c.Request.Context(), "could not read a connection", "connection_id", id, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read the connection"})
		return dbpkg.CloudConnection{}, false
	}
	return row, true
}

type createConnectionRequest struct {
	Region           string `json:"region"`
	MonthlyBudgetUSD int    `json:"monthly_budget_usd"`
	BudgetEmail      string `json:"budget_email"`
	// CertificateARN is optional: without one apps are served over HTTP (ADR 0021).
	CertificateARN string `json:"certificate_arn"`
}

// Create is POST /api/connections: it records a pending connection with a fresh
// ExternalId and returns the link that opens the stack.
func (h *ConnectionHandler) Create(c *gin.Context) {
	ctx := c.Request.Context()
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	if !h.enabled() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "AWS connections are not set up on this Hatch server"})
		return
	}
	var req createConnectionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	externalID, err := awsconn.NewExternalID()
	if err != nil {
		slog.ErrorContext(ctx, "could not generate an external id", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start the connection"})
		return
	}
	params := awsconn.LinkParams{
		Region: req.Region, TemplateURL: h.templateURL, StackName: awsconn.DefaultStackName,
		PrincipalARN: h.principalARN, ExternalID: externalID,
		MonthlyBudgetUSD: req.MonthlyBudgetUSD, BudgetEmail: req.BudgetEmail, CertificateARN: req.CertificateARN,
	}
	// Building the link checks every value, so what is stored is what the link
	// will carry. The messages are written for the person filling the form.
	if _, err := awsconn.QuickCreateURL(params); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	count, err := h.queries.CountCloudConnectionsByUser(ctx, userID)
	if err != nil {
		slog.ErrorContext(ctx, "could not count a user's connections", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start the connection"})
		return
	}
	if count >= maxConnectionsPerUser {
		c.JSON(http.StatusConflict, gin.H{"error": "there are already as many connections as one account may have; remove one first"})
		return
	}

	var cert *string
	if req.CertificateARN != "" {
		cert = &req.CertificateARN
	}
	row, err := h.queries.CreateCloudConnection(ctx, dbpkg.CreateCloudConnectionParams{
		UserID: userID, Region: params.Region, StackName: params.StackName, ExternalID: externalID,
		PrincipalArn: params.PrincipalARN, MonthlyBudgetUsd: int32(params.MonthlyBudgetUSD),
		BudgetEmail: params.BudgetEmail, CertificateArn: cert,
	})
	if err != nil {
		slog.ErrorContext(ctx, "could not create a connection", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start the connection"})
		return
	}
	c.JSON(http.StatusCreated, h.response(c, row))
}

// List is GET /api/connections.
func (h *ConnectionHandler) List(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	rows, err := h.queries.ListCloudConnectionsByUser(c.Request.Context(), userID)
	if err != nil {
		slog.ErrorContext(c.Request.Context(), "could not list connections", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list connections"})
		return
	}
	out := make([]connectionResponse, 0, len(rows))
	for _, row := range rows {
		out = append(out, h.response(c, row))
	}
	c.JSON(http.StatusOK, out)
}

// Get is GET /api/connections/:id.
func (h *ConnectionHandler) Get(c *gin.Context) {
	if row, ok := h.own(c); ok {
		c.JSON(http.StatusOK, h.response(c, row))
	}
}

type setRoleRequest struct {
	RoleARN string `json:"role_arn"`
}

// SetRole is PUT /api/connections/:id/role: the user gives the ARN of the
// hatch-control role their stack created. It does not check that the role works;
// that is verification's job. A different role than before starts over.
func (h *ConnectionHandler) SetRole(c *gin.Context) {
	row, ok := h.own(c)
	if !ok {
		return
	}
	var req setRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	account, err := awsconn.AccountIDOfRole(req.RoleARN)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updated, err := h.queries.SetCloudConnectionRole(c.Request.Context(), dbpkg.SetCloudConnectionRoleParams{
		ID: row.ID, UserID: row.UserID, RoleArn: &req.RoleARN, AwsAccountID: &account,
	})
	if err != nil {
		slog.ErrorContext(c.Request.Context(), "could not save a connection's role", "connection_id", row.ID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save the role"})
		return
	}
	c.JSON(http.StatusOK, h.response(c, updated))
}

// Delete is DELETE /api/connections/:id. It forgets the connection; the stack in
// the user's account is not touched (tearing it down is Phase 4).
func (h *ConnectionHandler) Delete(c *gin.Context) {
	row, ok := h.own(c)
	if !ok {
		return
	}
	if _, err := h.queries.DeleteCloudConnection(c.Request.Context(), dbpkg.DeleteCloudConnectionParams{ID: row.ID, UserID: row.UserID}); err != nil {
		slog.ErrorContext(c.Request.Context(), "could not delete a connection", "connection_id", row.ID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to remove the connection"})
		return
	}
	c.Status(http.StatusNoContent)
}
