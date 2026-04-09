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
		log.Fatalf("Failed to parse Redis URL: %v", err)
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

	_, msg, err := conn.ReadMessage()
	if err != nil || string(msg) != "READY" {
		return
	}

	time.Sleep(50 * time.Millisecond)

	ctx := c.Request.Context()
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
