package ws

import (
	"context"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // allow all origins in dev
	},
}

type Hub struct {
	redis *redis.Client
}

func NewHub(redisURL string) *Hub {
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Fatalf("failed to parse redis url: %v", err)
	}
	client := redis.NewClient(opt)
	return &Hub{redis: client}
}

// GET /ws/deployments/:id
func (h *Hub) HandleDeploymentLogs(c *gin.Context) {
	deploymentID := c.Param("id")
	if deploymentID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing deployment id"})
		return
	}

	// upgrade HTTP connection to WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("websocket upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	log.Printf("websocket connected for deployment %s", deploymentID)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// subscribe to Redis channel for this deployment
	channel := "deployment:" + deploymentID
	sub := h.redis.Subscribe(ctx, channel)
	defer sub.Close()

	// handle client disconnect
	go func() {
		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				cancel()
				return
			}
		}
	}()

	// forward Redis messages to WebSocket
	ch := sub.Channel()
	for {
		select {
		case msg, ok := <-ch:
			if !ok {
				return
			}
			if err := conn.WriteMessage(websocket.TextMessage, []byte(msg.Payload)); err != nil {
				log.Printf("websocket write failed: %v", err)
				return
			}
		case <-ctx.Done():
			return
		}
	}
}
