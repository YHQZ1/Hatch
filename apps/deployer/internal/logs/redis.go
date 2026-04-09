package logs

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type Streamer struct {
	client *redis.Client
}

func NewStreamer(url string) *Streamer {
	opt, err := redis.ParseURL(url)
	if err != nil {
		opt = &redis.Options{Addr: url}
	}
	return &Streamer{client: redis.NewClient(opt)}
}

func (s *Streamer) Publish(ctx context.Context, id, message string) {
	channel := fmt.Sprintf("deployment:%s", id)
	listKey := fmt.Sprintf("logs:%s", id)

	pipe := s.client.Pipeline()
	pipe.RPush(ctx, listKey, message)
	pipe.Expire(ctx, listKey, 7*24*time.Hour)
	pipe.Publish(ctx, channel, message)
	_, _ = pipe.Exec(ctx)
}
