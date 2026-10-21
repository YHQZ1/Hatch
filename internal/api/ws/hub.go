package ws

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/YHQZ1/hatch/internal/api/auth"
	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
)

type Hub struct {
	redis         *redis.Client
	queries       *dbpkg.Queries
	sessions      *auth.Sessions
	allowedOrigin map[string]struct{}
}

const (
	maxClientMessageSize = 64
	writeWait            = 10 * time.Second
	pongWait             = 60 * time.Second
	pingPeriod           = (pongWait * 9) / 10
	maxLogHistoryLines   = 5000
)

func NewHub(url string, sessions *auth.Sessions, allowedOrigins []string, db *sql.DB) (*Hub, error) {
	opt, err := redis.ParseURL(url)
	if err != nil {
		return nil, fmt.Errorf("parse REDIS_URL: %w", err)
	}
	originSet := make(map[string]struct{}, len(allowedOrigins))
	for _, origin := range allowedOrigins {
		if origin != "" {
			originSet[origin] = struct{}{}
		}
	}
	return &Hub{
		redis:         redis.NewClient(opt),
		queries:       dbpkg.New(db),
		sessions:      sessions,
		allowedOrigin: originSet,
	}, nil
}

func (h *Hub) Close() error {
	return h.redis.Close()
}

func (h *Hub) HandleDeploymentLogs(c *gin.Context) {
	id := c.Param("id")
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return h.isAllowedOrigin(r.Header.Get("Origin"))
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
	conn.SetReadLimit(maxClientMessageSize)
	if err := conn.SetReadDeadline(time.Now().Add(pongWait)); err != nil {
		return
	}
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(pongWait))
	})

	_, msg, err := conn.ReadMessage()
	if err != nil || string(msg) != "READY" {
		return
	}

	var writeMu sync.Mutex
	done := make(chan struct{})
	go h.readPump(conn, done)

	pingTicker := time.NewTicker(pingPeriod)
	defer pingTicker.Stop()

	listKey := "logs:" + id
	channel := "deployment:" + id
	sub := h.redis.Subscribe(ctx, channel)
	defer sub.Close()
	if _, err := sub.Receive(ctx); err != nil {
		return
	}

	history, err := h.redis.LRange(ctx, listKey, -maxLogHistoryLines, -1).Result()
	if err == nil {
		for _, line := range history {
			if err := writeSocketMessage(conn, &writeMu, websocket.TextMessage, []byte(line)); err != nil {
				return
			}
		}
	}

	pubsub := sub.Channel()
	for {
		select {
		case msg, ok := <-pubsub:
			if !ok {
				return
			}
			if err := writeSocketMessage(conn, &writeMu, websocket.TextMessage, []byte(msg.Payload)); err != nil {
				return
			}
		case <-pingTicker.C:
			if err := writeSocketMessage(conn, &writeMu, websocket.PingMessage, nil); err != nil {
				return
			}
		case <-done:
			return
		case <-ctx.Done():
			return
		}
	}
}

func (h *Hub) isAllowedOrigin(origin string) bool {
	if origin == "" {
		return false
	}
	_, ok := h.allowedOrigin[origin]
	return ok
}

func (h *Hub) readPump(conn *websocket.Conn, done chan<- struct{}) {
	defer close(done)
	for {
		if _, _, err := conn.NextReader(); err != nil {
			return
		}
	}
}

func writeSocketMessage(conn *websocket.Conn, mu *sync.Mutex, messageType int, payload []byte) error {
	mu.Lock()
	defer mu.Unlock()
	if err := conn.SetWriteDeadline(time.Now().Add(writeWait)); err != nil {
		return err
	}
	return conn.WriteMessage(messageType, payload)
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
	user, err := h.sessions.Lookup(ctx, cookie.Value)
	if err != nil {
		return err
	}
	userID := user.ID

	_, err = h.queries.GetDeploymentByIDAndUserID(ctx, dbpkg.GetDeploymentByIDAndUserIDParams{
		ID:     deploymentUUID,
		UserID: userID,
	})
	return err
}
