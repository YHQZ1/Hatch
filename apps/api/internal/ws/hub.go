package ws

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"time"

	"github.com/YHQZ1/hatch/apps/api/internal/auth"
	dbpkg "github.com/YHQZ1/hatch/packages/db/gen"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
)

type Hub struct {
	redis         *redis.Client
	queries       *dbpkg.Queries
	jwtSecret     string
	allowedOrigin string
}

func NewHub(url, jwtSecret, allowedOrigin string, db *sql.DB) *Hub {
	opt, err := redis.ParseURL(url)
	if err != nil {
		log.Fatalf("Failed to parse Redis URL: %v", err)
	}
	return &Hub{
		redis:         redis.NewClient(opt),
		queries:       dbpkg.New(db),
		jwtSecret:     jwtSecret,
		allowedOrigin: allowedOrigin,
	}
}

func (h *Hub) HandleDeploymentLogs(c *gin.Context) {
	id := c.Param("id")
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			return origin == "" || origin == h.allowedOrigin
		},
	}

	ctx := c.Request.Context()
	if err := h.authenticateDeployment(ctx, c.Request, id); err != nil {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	_, msg, err := conn.ReadMessage()
	if err != nil || string(msg) != "READY" {
		return
	}

	time.Sleep(50 * time.Millisecond)

	listKey := "logs:" + id

	history, err := h.redis.LRange(ctx, listKey, 0, -1).Result()
	if err == nil {
		for _, line := range history {
			if err := conn.WriteMessage(websocket.TextMessage, []byte(line)); err != nil {
				return
			}
		}
	}

	channel := "deployment:" + id
	sub := h.redis.Subscribe(ctx, channel)
	defer sub.Close()

	pubsub := sub.Channel()
	for {
		select {
		case msg, ok := <-pubsub:
			if !ok {
				return
			}
			if err := conn.WriteMessage(websocket.TextMessage, []byte(msg.Payload)); err != nil {
				return
			}
		case <-ctx.Done():
			return
		}
	}
}

func (h *Hub) authenticateDeployment(ctx context.Context, r *http.Request, deploymentID string) error {
	deploymentUUID, err := uuid.Parse(deploymentID)
	if err != nil {
		return err
	}

	cookie, err := r.Cookie(auth.SessionCookieName)
	if err != nil {
		return err
	}
	if cookie.Value == "" {
		return jwt.ErrTokenMalformed
	}

	token, err := jwt.Parse(cookie.Value, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(h.jwtSecret), nil
	})
	if err != nil || !token.Valid {
		return jwt.ErrSignatureInvalid
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return jwt.ErrTokenInvalidClaims
	}
	userIDRaw, ok := claims["user_id"].(string)
	if !ok {
		return jwt.ErrTokenInvalidClaims
	}
	userID, err := uuid.Parse(userIDRaw)
	if err != nil {
		return err
	}

	_, err = h.queries.GetDeploymentByIDAndUserID(ctx, dbpkg.GetDeploymentByIDAndUserIDParams{
		ID:     deploymentUUID,
		UserID: userID,
	})
	return err
}
