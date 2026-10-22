package stream

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

const maxStoredLogLines int64 = 5000

// Redis is a Sink that keeps recent lines in Redis and publishes each one to
// the channel the WebSocket hub reads. It goes away when log streaming moves to
// Postgres.
type Redis struct {
	client *redis.Client
}

func NewRedis(url string) *Redis {
	opt, err := redis.ParseURL(url)
	if err != nil {
		opt = &redis.Options{Addr: url}
	}
	return &Redis{client: redis.NewClient(opt)}
}

func (s *Redis) Publish(ctx context.Context, id, message string) {
	channel := fmt.Sprintf("deployment:%s", id)
	listKey := fmt.Sprintf("logs:%s", id)

	pipe := s.client.Pipeline()
	pipe.RPush(ctx, listKey, message)
	pipe.LTrim(ctx, listKey, -maxStoredLogLines, -1)
	pipe.Expire(ctx, listKey, 7*24*time.Hour)
	pipe.Publish(ctx, channel, message)
	_, _ = pipe.Exec(ctx)
}

// Close releases the Redis connection.
func (s *Redis) Close() error { return s.client.Close() }
