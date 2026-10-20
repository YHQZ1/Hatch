package handlers

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

var outboundHTTPClient = &http.Client{Timeout: 12 * time.Second}

func getUserID(c *gin.Context) (uuid.UUID, error) {
	val, exists := c.Get("user_id")
	if !exists {
		return uuid.Nil, errors.New("missing user_id")
	}

	idStr, ok := val.(string)
	if !ok {
		return uuid.Nil, errors.New("invalid user_id type")
	}

	id, err := uuid.Parse(idStr)
	if err != nil {
		return uuid.Nil, errors.New("invalid uuid format")
	}

	return id, nil
}
