package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// PublicConfigHandler tells the web UI settings it needs before sign-in, such
// as where deployed apps are served. Nothing here is secret.
type PublicConfigHandler struct {
	baseDomain          string
	deploymentURLScheme string
}

func NewPublicConfigHandler(baseDomain, deploymentURLScheme string) *PublicConfigHandler {
	return &PublicConfigHandler{baseDomain: baseDomain, deploymentURLScheme: deploymentURLScheme}
}

func (h *PublicConfigHandler) Get(c *gin.Context) {
	c.Header("Cache-Control", "public, max-age=60")
	c.JSON(http.StatusOK, gin.H{
		"base_domain":           h.baseDomain,
		"deployment_url_scheme": h.deploymentURLScheme,
	})
}
