package handlers

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

// CheckSubdomain says whether an address can be given to a new project, so the
// new-project page can warn before the user fills in the rest. Addresses are
// unique across every account, so the answer comes from the database, not from
// the caller's own projects. It only reports; creating the project still
// decides, because someone else may take the address in between.
func (h *ProjectHandler) CheckSubdomain(c *gin.Context) {
	if _, err := getUserID(c); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	subdomain, err := normalizeSubdomain(c.Param("name"))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"available": false, "reason": err.Error()})
		return
	}

	_, err = h.queries.GetProjectBySubdomain(c.Request.Context(), ptr(subdomain))
	switch {
	case err == nil:
		c.JSON(http.StatusOK, gin.H{"available": false, "reason": "subdomain already in use"})
	case errors.Is(err, pgx.ErrNoRows):
		c.JSON(http.StatusOK, gin.H{"available": true})
	default:
		slog.ErrorContext(c.Request.Context(), "failed to check subdomain", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check subdomain"})
	}
}
