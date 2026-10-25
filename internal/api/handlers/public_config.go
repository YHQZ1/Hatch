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
	webhooks            bool
	awsConnections      bool
}

// NewPublicConfigHandler serves the settings the UI needs before sign-in.
// webhooks says whether the GitHub App's webhook is set up on this server, which
// decides whether "deploy on every push" can work at all. awsConnections says
// whether this server is set up to connect users' AWS accounts, which decides
// whether the page offers to.
func NewPublicConfigHandler(baseDomain, deploymentURLScheme string, webhooks, awsConnections bool) *PublicConfigHandler {
	return &PublicConfigHandler{baseDomain: baseDomain, deploymentURLScheme: deploymentURLScheme, webhooks: webhooks, awsConnections: awsConnections}
}

func (h *PublicConfigHandler) Get(c *gin.Context) {
	c.Header("Cache-Control", "public, max-age=60")
	c.JSON(http.StatusOK, gin.H{
		"base_domain":           h.baseDomain,
		"deployment_url_scheme": h.deploymentURLScheme,
		"webhooks":              h.webhooks,
		"aws_connections":       h.awsConnections,
	})
}
