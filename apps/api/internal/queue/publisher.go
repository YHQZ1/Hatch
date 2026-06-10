package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

type BuildJobEvent struct {
	DeploymentID   string `json:"deployment_id"`
	RepoURL        string `json:"repo_url"`
	Branch         string `json:"branch"`
	DockerfilePath string `json:"dockerfile_path"`
	UserToken      string `json:"user_token"`
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
	conn     *amqp.Connection
	ch       *amqp.Channel
	confirms <-chan amqp.Confirmation
	mu       sync.Mutex
}

func NewPublisher(url string) *Publisher {
	conn, err := amqp.Dial(url)
	if err != nil {
		log.Fatalf("Failed to connect to RabbitMQ: %v", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		log.Fatalf("Failed to open RabbitMQ channel: %v", err)
	}
	if err := ch.Confirm(false); err != nil {
		log.Fatalf("Failed to enable RabbitMQ publisher confirms: %v", err)
	}
	confirms := ch.NotifyPublish(make(chan amqp.Confirmation, 1))

	_, err = ch.QueueDeclare("hatch.build.jobs", true, false, false, false, nil)
	if err != nil {
		log.Fatalf("Failed to declare build queue: %v", err)
	}

	_, err = ch.QueueDeclare("hatch.cleanup.jobs", true, false, false, false, nil)
	if err != nil {
		log.Fatalf("Failed to declare cleanup queue: %v", err)
	}

	_, err = ch.QueueDeclare("hatch.service.jobs", true, false, false, false, nil)
	if err != nil {
		log.Fatalf("Failed to declare service queue: %v", err)
	}

	return &Publisher{conn: conn, ch: ch, confirms: confirms}
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

func (p *Publisher) Close() {
	if err := p.ch.Close(); err != nil {
		log.Printf("Failed to close RabbitMQ channel: %v", err)
	}
	if err := p.conn.Close(); err != nil {
		log.Printf("Failed to close RabbitMQ connection: %v", err)
	}
}
