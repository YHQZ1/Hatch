package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	amqp "github.com/rabbitmq/amqp091-go"
)

type BuildJobEvent struct {
	DeploymentID string `json:"deployment_id"`
	RepoURL      string `json:"repo_url"`
	Branch       string `json:"branch"`
	UserToken    string `json:"user_token"`
	Port         int    `json:"port"`
}

type Publisher struct {
	conn *amqp.Connection
	ch   *amqp.Channel
}

func NewPublisher(rabbitmqURL string) *Publisher {
	conn, err := amqp.Dial(rabbitmqURL)
	if err != nil {
		log.Fatalf("failed to connect to rabbitmq: %v", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		log.Fatalf("failed to open channel: %v", err)
	}

	// declare queue (idempotent — safe to call if already exists)
	_, err = ch.QueueDeclare(
		"hatch.build.jobs",
		true, // durable
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		log.Fatalf("failed to declare queue: %v", err)
	}

	log.Println("rabbitmq publisher connected")
	return &Publisher{conn: conn, ch: ch}
}

func (p *Publisher) PublishBuildJob(ctx context.Context, job BuildJobEvent) error {
	body, err := json.Marshal(job)
	if err != nil {
		return fmt.Errorf("failed to marshal job: %w", err)
	}

	return p.ch.PublishWithContext(ctx,
		"",                 // exchange
		"hatch.build.jobs", // routing key
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
	p.ch.Close()
	p.conn.Close()
}
