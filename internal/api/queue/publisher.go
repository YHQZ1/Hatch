package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

type BuildJobEvent struct {
	DeploymentID   string `json:"deployment_id"`
	RepoURL        string `json:"repo_url"`
	Branch         string `json:"branch"`
	DockerfilePath string `json:"dockerfile_path"`
	UserID         string `json:"user_id"`
	Port           int    `json:"port"`
	Subdomain      string `json:"subdomain"`
	CPU            int32  `json:"cpu"`
	MemoryMB       int32  `json:"memory_mb"`
	HealthCheck    string `json:"health_check"`
}

type CleanupJobEvent struct {
	ProjectID string `json:"project_id"`
	Slug      string `json:"slug"`
}

type ServiceControlJobEvent struct {
	ProjectID string `json:"project_id"`
	Slug      string `json:"slug"`
	Action    string `json:"action"`
}

type Publisher struct {
	url      string
	conn     *amqp.Connection
	ch       *amqp.Channel
	confirms <-chan amqp.Confirmation
	mu       sync.Mutex
}

func NewPublisher(url string) *Publisher {
	conn, ch, confirms, err := connect(url)
	if err != nil {
		slog.Warn("RabbitMQ publisher is starting disconnected", "error", err)
	}

	return &Publisher{url: url, conn: conn, ch: ch, confirms: confirms}
}

func (p *Publisher) PublishBuildJob(ctx context.Context, job BuildJobEvent) error {
	body, err := json.Marshal(job)
	if err != nil {
		return fmt.Errorf("failed to marshal build job: %w", err)
	}

	return p.publish(ctx, "hatch.build.jobs", body)
}

func (p *Publisher) PublishCleanupJob(ctx context.Context, job CleanupJobEvent) error {
	body, err := json.Marshal(job)
	if err != nil {
		return fmt.Errorf("failed to marshal cleanup job: %w", err)
	}

	return p.publish(ctx, "hatch.cleanup.jobs", body)
}

func (p *Publisher) PublishServiceControlJob(ctx context.Context, job ServiceControlJobEvent) error {
	body, err := json.Marshal(job)
	if err != nil {
		return fmt.Errorf("failed to marshal service control job: %w", err)
	}

	return p.publish(ctx, "hatch.service.jobs", body)
}

func (p *Publisher) publish(ctx context.Context, queue string, body []byte) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	var lastErr error
	for attempt := 1; attempt <= 3; attempt++ {
		if err := p.reconnect(); err != nil {
			lastErr = err
			if ctx.Err() != nil {
				return ctx.Err()
			}
			time.Sleep(time.Duration(attempt) * 150 * time.Millisecond)
			continue
		}
		if err := p.publishOnce(ctx, queue, body); err != nil {
			if isAmbiguousPublishError(err) || ctx.Err() != nil {
				return err
			}
			lastErr = err
			if p.ch != nil {
				_ = p.ch.Close()
			}
			if p.conn != nil {
				_ = p.conn.Close()
			}
			time.Sleep(time.Duration(attempt) * 150 * time.Millisecond)
			continue
		}
		return nil
	}

	return lastErr
}

func (p *Publisher) publishOnce(ctx context.Context, queue string, body []byte) error {
	if err := p.ch.PublishWithContext(ctx,
		"",
		queue,
		true,
		false,
		amqp.Publishing{
			ContentType:  "application/json",
			DeliveryMode: amqp.Persistent,
			Body:         body,
		},
	); err != nil {
		return err
	}

	timeout := time.NewTimer(10 * time.Second)
	defer timeout.Stop()

	select {
	case confirm, ok := <-p.confirms:
		if !ok {
			return fmt.Errorf("rabbitmq confirmation channel closed")
		}
		if !confirm.Ack {
			return fmt.Errorf("rabbitmq rejected publish to %s", queue)
		}
		return nil
	case <-ctx.Done():
		return ctx.Err()
	case <-timeout.C:
		return fmt.Errorf("timed out waiting for rabbitmq publish confirmation")
	}
}

func isAmbiguousPublishError(err error) bool {
	if err == nil {
		return false
	}
	message := err.Error()
	return strings.Contains(message, "timed out waiting for rabbitmq publish confirmation") ||
		strings.Contains(message, "rabbitmq confirmation channel closed")
}

func (p *Publisher) Close() {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.ch != nil && !p.ch.IsClosed() {
		if err := p.ch.Close(); err != nil {
			slog.Warn("failed to close the RabbitMQ channel", "error", err)
		}
	}
	if p.conn != nil && !p.conn.IsClosed() {
		if err := p.conn.Close(); err != nil {
			slog.Warn("failed to close the RabbitMQ connection", "error", err)
		}
	}
}

func (p *Publisher) Healthy() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.reconnect() == nil
}

func (p *Publisher) reconnect() error {
	if p.conn != nil && !p.conn.IsClosed() && p.ch != nil && !p.ch.IsClosed() {
		return nil
	}

	conn, ch, confirms, err := connect(p.url)
	if err != nil {
		return err
	}
	p.conn = conn
	p.ch = ch
	p.confirms = confirms
	return nil
}

func connect(url string) (*amqp.Connection, *amqp.Channel, <-chan amqp.Confirmation, error) {
	conn, err := amqp.DialConfig(url, amqp.Config{
		Heartbeat: 10 * time.Second,
		Locale:    "en_US",
		Dial:      amqp.DefaultDial(5 * time.Second),
	})
	if err != nil {
		return nil, nil, nil, fmt.Errorf("connect to RabbitMQ: %w", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		_ = conn.Close()
		return nil, nil, nil, fmt.Errorf("open RabbitMQ channel: %w", err)
	}
	if err := ch.Confirm(false); err != nil {
		_ = ch.Close()
		_ = conn.Close()
		return nil, nil, nil, fmt.Errorf("enable RabbitMQ publisher confirms: %w", err)
	}
	confirms := ch.NotifyPublish(make(chan amqp.Confirmation, 1))

	for _, queueName := range []string{"hatch.build.jobs", "hatch.cleanup.jobs", "hatch.service.jobs"} {
		if _, err := ch.QueueDeclare(queueName, true, false, false, false, nil); err != nil {
			_ = ch.Close()
			_ = conn.Close()
			return nil, nil, nil, fmt.Errorf("declare queue %s: %w", queueName, err)
		}
	}

	return conn, ch, confirms, nil
}
