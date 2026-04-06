package handlers

import (
	"errors"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func getUserID(c *gin.Context) (uuid.UUID, error) {
	val, exists := c.Get("user_id")
	if !exists {
		return uuid.Nil, errors.New("unauthorized: missing user_id")
	}

	idStr, ok := val.(string)
	if !ok {
		return uuid.Nil, errors.New("unauthorized: invalid user_id type")
	}

	id, err := uuid.Parse(idStr)
	if err != nil {
		return uuid.Nil, errors.New("unauthorized: invalid uuid format")
	}

	return id, nil
}
