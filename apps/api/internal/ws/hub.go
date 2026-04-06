package ws

import (
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Hub struct {
	redis *redis.Client
}

func NewHub(url string) *Hub {
	opt, err := redis.ParseURL(url)
	if err != nil {
		log.Fatalf("ws: failed to parse redis url: %v", err)
	}
	return &Hub{redis: redis.NewClient(opt)}
}

func (h *Hub) HandleDeploymentLogs(c *gin.Context) {
	id := c.Param("id")
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	// Wait for client to signal readiness
	_, msg, err := conn.ReadMessage()
	if err != nil || string(msg) != "READY" {
		return
	}

	// Buffer pause for frontend listener attachment
	time.Sleep(50 * time.Millisecond)

	ctx := c.Request.Context()
	listKey := "logs:" + id

	// Step 1: Stream historical logs from Redis List
	history, _ := h.redis.LRange(ctx, listKey, 0, -1).Result()
	for _, line := range history {
		if err := conn.WriteMessage(websocket.TextMessage, []byte(line)); err != nil {
			return
		}
		time.Sleep(10 * time.Microsecond)
	}

	// Step 2: Stream live logs via PubSub
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
