package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/YHQZ1/hatch/internal/proxy"
	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
)

// TrafficHandler reports how much traffic the user's apps got in the last
// hour, as counted by the built-in proxy of the local target.
type TrafficHandler struct {
	queries *dbpkg.Queries
	// stats is nil when Hatch has no proxy of its own (the AWS target).
	stats *proxy.Stats
}

func NewTrafficHandler(pool *pgxpool.Pool, stats *proxy.Stats) *TrafficHandler {
	return &TrafficHandler{queries: dbpkg.New(pool), stats: stats}
}

type trafficResponse struct {
	// Available is false when nothing counts traffic, so the page can say so
	// instead of showing zeros.
	Available     bool                     `json:"available"`
	WindowMinutes int                      `json:"window_minutes"`
	Since         *time.Time               `json:"since,omitempty"`
	Apps          map[string]proxy.Traffic `json:"apps"`
}

// Get answers with the last hour of each of the user's apps, keyed by
// subdomain. An app with no requests yet is included with zeros.
func (h *TrafficHandler) Get(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	if h.stats == nil {
		c.JSON(http.StatusOK, trafficResponse{WindowMinutes: proxy.Window, Apps: map[string]proxy.Traffic{}})
		return
	}

	projects, err := h.queries.GetProjectsByUserID(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load projects"})
		return
	}
	since := h.stats.Since()
	response := trafficResponse{
		Available:     true,
		WindowMinutes: proxy.Window,
		Since:         &since,
		Apps:          make(map[string]proxy.Traffic, len(projects)),
	}
	for _, project := range projects {
		if project.Subdomain != nil && *project.Subdomain != "" {
			response.Apps[*project.Subdomain] = h.stats.Snapshot(*project.Subdomain)
		}
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, response)
}
