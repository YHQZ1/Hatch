package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

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

type Publisher struct {
	conn *amqp.Connection
	ch   *amqp.Channel
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

	_, err = ch.QueueDeclare("hatch.build.jobs", true, false, false, false, nil)
	if err != nil {
		log.Fatalf("Failed to declare build queue: %v", err)
	}

	_, err = ch.QueueDeclare("hatch.cleanup.jobs", true, false, false, false, nil)
	if err != nil {
		log.Fatalf("Failed to declare cleanup queue: %v", err)
	}

	return &Publisher{conn: conn, ch: ch}
}

func (p *Publisher) PublishBuildJob(ctx context.Context, job BuildJobEvent) error {
	body, err := json.Marshal(job)
	if err != nil {
		return fmt.Errorf("failed to marshal build job: %w", err)
	}

	return p.ch.PublishWithContext(ctx,
		"",
		"hatch.build.jobs",
		false,
		false,
		amqp.Publishing{
			ContentType:  "application/json",
			DeliveryMode: amqp.Persistent,
			Body:         body,
		},
	)
}

func (p *Publisher) PublishCleanupJob(ctx context.Context, deploymentIDs []string) error {
	body, err := json.Marshal(deploymentIDs)
	if err != nil {
		return fmt.Errorf("failed to marshal cleanup job: %w", err)
	}

	return p.ch.PublishWithContext(ctx,
		"",
		"hatch.cleanup.jobs",
		false,
		false,
		amqp.Publishing{
			ContentType:  "application/json",
			DeliveryMode: amqp.Persistent,
			Body:         body,
		},
	)
}

func (p *Publisher) Close() {
	if err := p.ch.Close(); err != nil {
		log.Printf("Failed to close RabbitMQ channel: %v", err)
	}
	if err := p.conn.Close(); err != nil {
		log.Printf("Failed to close RabbitMQ connection: %v", err)
	}
}
