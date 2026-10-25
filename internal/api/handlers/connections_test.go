package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/YHQZ1/hatch/internal/store"
	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
	"github.com/YHQZ1/hatch/internal/store/storetest"
)

const (
	testPrincipal = "arn:aws:iam::111122223333:role/hatch-server"
	testTemplate  = "https://hatch-templates.s3.amazonaws.com/v1/hatch-connect.yaml"
	testRole      = "arn:aws:iam::123456789012:role/hatch-control"
)

type connectionFixture struct {
	pool    *pgxpool.Pool
	q       *dbpkg.Queries
	owner   dbpkg.User
	other   dbpkg.User
	handler *ConnectionHandler
}

func newConnectionFixture(t *testing.T) connectionFixture {
	t.Helper()
	dbURL := storetest.NewDatabase(t)
	if _, err := store.Migrate(context.Background(), dbURL); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	pool, err := store.Connect(context.Background(), dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(pool.Close)

	q := dbpkg.New(pool)
	owner, err := q.CreateUser(context.Background(), dbpkg.CreateUserParams{GithubID: 1, GithubUsername: "octo", AccessToken: "x"})
	if err != nil {
		t.Fatal(err)
	}
	other, err := q.CreateUser(context.Background(), dbpkg.CreateUserParams{GithubID: 2, GithubUsername: "hubot", AccessToken: "x"})
	if err != nil {
		t.Fatal(err)
	}
	return connectionFixture{pool: pool, q: q, owner: owner, other: other, handler: NewConnectionHandler(pool, testPrincipal, testTemplate)}
}

// do calls a handler as a user, with an optional JSON body and path id.
func (f connectionFixture) do(t *testing.T, h gin.HandlerFunc, user dbpkg.User, id, body string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", user.ID.String())
	if id != "" {
		c.Params = gin.Params{{Key: "id", Value: id}}
	}
	h(c)
	// The engine does this when a handler returns; a bare test context does not,
	// and a handler that only sets a status (204) would read as 200.
	c.Writer.WriteHeaderNow()
	return rec
}

const validBody = `{"region":"ap-south-1","monthly_budget_usd":10,"budget_email":"me@example.com"}`

func (f connectionFixture) create(t *testing.T, user dbpkg.User, body string) connectionResponse {
	t.Helper()
	rec := f.do(t, f.handler.Create, user, "", body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create = %d: %s", rec.Code, rec.Body)
	}
	return decodeConnection(t, rec)
}

func decodeConnection(t *testing.T, rec *httptest.ResponseRecorder) connectionResponse {
	t.Helper()
	var got connectionResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode %q: %v", rec.Body, err)
	}
	return got
}

func (f connectionFixture) row(t *testing.T, id uuid.UUID, user dbpkg.User) dbpkg.CloudConnection {
	t.Helper()
	row, err := f.q.GetCloudConnectionForUser(context.Background(), dbpkg.GetCloudConnectionForUserParams{ID: id, UserID: user.ID})
	if err != nil {
		t.Fatal(err)
	}
	return row
}

func TestCreatingAConnectionStoresItAndReturnsTheLinkThatCarriesItsExternalId(t *testing.T) {
	f := newConnectionFixture(t)
	got := f.create(t, f.owner, validBody)

	if got.Status != "pending" || got.Region != "ap-south-1" || got.StackName != "hatch-connect" || got.MonthlyBudgetUSD != 10 {
		t.Fatalf("response = %+v", got)
	}
	row := f.row(t, got.ID, f.owner)
	if row.PrincipalArn != testPrincipal || len(row.ExternalID) != 48 {
		t.Fatalf("row = principal %q, external id %q", row.PrincipalArn, row.ExternalID)
	}

	q, err := url.ParseQuery(got.QuickCreateURL[strings.Index(got.QuickCreateURL, "quickcreate?")+len("quickcreate?"):])
	if err != nil {
		t.Fatal(err)
	}
	if q.Get("param_ExternalId") != row.ExternalID || q.Get("param_HatchPrincipalArn") != testPrincipal || q.Get("templateURL") != testTemplate {
		t.Errorf("link = %s", got.QuickCreateURL)
	}
}

func TestNoResponseCarriesTheExternalIdOutsideTheLink(t *testing.T) {
	f := newConnectionFixture(t)
	created := f.create(t, f.owner, validBody)
	row := f.row(t, created.ID, f.owner)

	for name, rec := range map[string]*httptest.ResponseRecorder{
		"get":  f.do(t, f.handler.Get, f.owner, created.ID.String(), ""),
		"list": f.do(t, f.handler.List, f.owner, "", ""),
	} {
		body := rec.Body.String()
		if strings.Contains(body, "external_id") {
			t.Errorf("%s: the response has an external_id field: %s", name, body)
		}
		// The ExternalId is allowed inside the link the owner opens, and nowhere else.
		if n := strings.Count(body, row.ExternalID); n != 1 {
			t.Errorf("%s: the ExternalId appears %d times, want once (in the link)", name, n)
		}
	}
}

func TestCreatingAConnectionRefusesWhatTheStackWouldRefuse(t *testing.T) {
	tests := []struct {
		name, body, want string
	}{
		{"a made-up region", `{"region":"mars-1","monthly_budget_usd":10,"budget_email":"me@example.com"}`, "not an AWS region"},
		{"a zero budget", `{"region":"ap-south-1","monthly_budget_usd":0,"budget_email":"me@example.com"}`, "at least 1"},
		{"a bad email", `{"region":"ap-south-1","monthly_budget_usd":10,"budget_email":"me"}`, "email"},
		{"a certificate from another region", `{"region":"ap-south-1","monthly_budget_usd":10,"budget_email":"me@example.com","certificate_arn":"arn:aws:acm:us-east-1:123456789012:certificate/x"}`, "certificate"},
		{"a body that is not JSON", `nope`, "invalid request body"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			f := newConnectionFixture(t)
			rec := f.do(t, f.handler.Create, f.owner, "", tc.body)
			if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), tc.want) {
				t.Fatalf("status %d: %s", rec.Code, rec.Body)
			}
			if n, _ := f.q.CountCloudConnectionsByUser(context.Background(), f.owner.ID); n != 0 {
				t.Errorf("a refused request left %d rows", n)
			}
		})
	}
}

func TestACertificateIsKeptAndSharedWithTheLink(t *testing.T) {
	f := newConnectionFixture(t)
	body := `{"region":"ap-south-1","monthly_budget_usd":25,"budget_email":"me@example.com","certificate_arn":"arn:aws:acm:ap-south-1:123456789012:certificate/abc"}`
	got := f.create(t, f.owner, body)
	if got.CertificateARN == nil || !strings.Contains(got.QuickCreateURL, "param_CertificateArn=") {
		t.Fatalf("response = %+v", got)
	}
}

func TestConnectionsAreNotSetUpWithoutTheServersSettings(t *testing.T) {
	f := newConnectionFixture(t)
	for _, h := range []*ConnectionHandler{
		NewConnectionHandler(f.pool, "", ""),
		NewConnectionHandler(f.pool, testPrincipal, ""),
		NewConnectionHandler(f.pool, "", testTemplate),
	} {
		rec := f.do(t, h.Create, f.owner, "", validBody)
		if rec.Code != http.StatusServiceUnavailable || !strings.Contains(rec.Body.String(), "not set up") {
			t.Errorf("status %d: %s", rec.Code, rec.Body)
		}
	}
	if n, _ := f.q.CountCloudConnectionsByUser(context.Background(), f.owner.ID); n != 0 {
		t.Errorf("%d rows were created", n)
	}
}

func TestAUserSeesOnlyTheirOwnConnections(t *testing.T) {
	f := newConnectionFixture(t)
	mine := f.create(t, f.owner, validBody)
	theirs := f.create(t, f.other, validBody)

	var list []connectionResponse
	rec := f.do(t, f.handler.List, f.owner, "", "")
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil || len(list) != 1 || list[0].ID != mine.ID {
		t.Fatalf("list = %s (%v)", rec.Body, err)
	}

	roleBody := `{"role_arn":"` + testRole + `"}`
	for name, call := range map[string]func() *httptest.ResponseRecorder{
		"get": func() *httptest.ResponseRecorder { return f.do(t, f.handler.Get, f.owner, theirs.ID.String(), "") },
		"set role": func() *httptest.ResponseRecorder {
			return f.do(t, f.handler.SetRole, f.owner, theirs.ID.String(), roleBody)
		},
		"delete":   func() *httptest.ResponseRecorder { return f.do(t, f.handler.Delete, f.owner, theirs.ID.String(), "") },
		"unknown":  func() *httptest.ResponseRecorder { return f.do(t, f.handler.Get, f.owner, uuid.NewString(), "") },
		"not a id": func() *httptest.ResponseRecorder { return f.do(t, f.handler.Get, f.owner, "nope", "") },
	} {
		if rec := call(); rec.Code != http.StatusNotFound {
			t.Errorf("%s: status %d: %s", name, rec.Code, rec.Body)
		}
	}
	// None of that touched the other user's connection.
	if row := f.row(t, theirs.ID, f.other); row.RoleArn != nil {
		t.Errorf("another user's connection was changed: %+v", row)
	}
}

func TestGivingTheRoleSavesItWithItsAccountAndStaysPending(t *testing.T) {
	f := newConnectionFixture(t)
	created := f.create(t, f.owner, validBody)

	rec := f.do(t, f.handler.SetRole, f.owner, created.ID.String(), `{"role_arn":"`+testRole+`"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	got := decodeConnection(t, rec)
	if got.Status != "pending" || got.RoleARN == nil || *got.RoleARN != testRole || got.AWSAccountID == nil || *got.AWSAccountID != "123456789012" {
		t.Fatalf("response = %+v", got)
	}
	if got.QuickCreateURL == "" {
		t.Error("a connection that is not verified yet lost its link")
	}

	for _, bad := range []string{`{"role_arn":"arn:aws:iam::123456789012:user/me"}`, `{"role_arn":""}`, `{"role_arn":"hatch-control"}`, `nope`} {
		if rec := f.do(t, f.handler.SetRole, f.owner, created.ID.String(), bad); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status %d", bad, rec.Code)
		}
	}
	if row := f.row(t, created.ID, f.owner); row.RoleArn == nil || *row.RoleArn != testRole {
		t.Errorf("a refused role replaced the saved one: %+v", row.RoleArn)
	}
}

func TestGivingADifferentRoleDiscardsWhatWasLearnedAboutTheOldOne(t *testing.T) {
	f := newConnectionFixture(t)
	created := f.create(t, f.owner, validBody)
	// As verification would have left a connected one.
	if _, err := f.pool.Exec(context.Background(), `
		UPDATE cloud_connections
		SET status = 'connected', role_arn = $2, aws_account_id = '123456789012', template_version = '1',
		    serves_https = false, stack_outputs = '{"ClusterName":"hatch"}', last_verified_at = now()
		WHERE id = $1`, created.ID, testRole); err != nil {
		t.Fatal(err)
	}
	connected := decodeConnection(t, f.do(t, f.handler.Get, f.owner, created.ID.String(), ""))
	if connected.Status != "connected" || connected.TemplateUpToDate == nil || !*connected.TemplateUpToDate {
		t.Fatalf("connected = %+v", connected)
	}
	if connected.QuickCreateURL != "" {
		t.Error("a connected connection still offers the link that creates the stack")
	}

	rec := f.do(t, f.handler.SetRole, f.owner, created.ID.String(), `{"role_arn":"arn:aws:iam::210987654321:role/hatch-control"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	row := f.row(t, created.ID, f.owner)
	if row.Status != "pending" || row.TemplateVersion != nil || row.ServesHttps != nil || row.StackOutputs != nil || row.LastVerifiedAt != nil {
		t.Errorf("row kept what it learned about the old role: %+v", row)
	}
}

func TestDeletingAConnectionForgetsItOnly(t *testing.T) {
	f := newConnectionFixture(t)
	created := f.create(t, f.owner, validBody)
	kept := f.create(t, f.owner, validBody)

	if rec := f.do(t, f.handler.Delete, f.owner, created.ID.String(), ""); rec.Code != http.StatusNoContent {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	if rec := f.do(t, f.handler.Get, f.owner, created.ID.String(), ""); rec.Code != http.StatusNotFound {
		t.Errorf("a deleted connection is still found: %d", rec.Code)
	}
	if rec := f.do(t, f.handler.Get, f.owner, kept.ID.String(), ""); rec.Code != http.StatusOK {
		t.Errorf("the other connection went too: %d", rec.Code)
	}
}

func TestAUserCannotHaveMoreConnectionsThanTheCap(t *testing.T) {
	f := newConnectionFixture(t)
	for range maxConnectionsPerUser {
		f.create(t, f.owner, validBody)
	}
	rec := f.do(t, f.handler.Create, f.owner, "", validBody)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	// The cap is per user.
	f.create(t, f.other, validBody)
}

func TestEveryConnectionGetsItsOwnExternalId(t *testing.T) {
	f := newConnectionFixture(t)
	a := f.row(t, f.create(t, f.owner, validBody).ID, f.owner)
	b := f.row(t, f.create(t, f.owner, validBody).ID, f.owner)
	if a.ExternalID == b.ExternalID {
		t.Fatal("two connections share an ExternalId")
	}
}
