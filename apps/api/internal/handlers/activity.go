package handlers

import (
	"net/http"

	dbpkg "github.com/YHQZ1/hatch/packages/db/gen"
	"github.com/gin-gonic/gin"
)

func (h *ProjectHandler) GetActivity(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	logs, err := h.queries.GetActivityLogsByUserID(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch activity logs"})
		return
	}

	if logs == nil {
		logs = []dbpkg.ActivityLog{}
	}

	c.JSON(http.StatusOK, logs)
}
