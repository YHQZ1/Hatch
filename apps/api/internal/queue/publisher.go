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
}

type Publisher struct {
	conn *amqp.Connection
	ch   *amqp.Channel
}

func NewPublisher(url string) *Publisher {
	conn, err := amqp.Dial(url)
	if err != nil {
		log.Fatalf("rabbitmq: failed to connect: %v", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		log.Fatalf("rabbitmq: failed to open channel: %v", err)
	}

	_, err = ch.QueueDeclare("hatch.build.jobs", true, false, false, false, nil)
	if err != nil {
		log.Fatalf("rabbitmq: failed to declare queue: %v", err)
	}

	return &Publisher{conn: conn, ch: ch}
}

func (p *Publisher) PublishBuildJob(ctx context.Context, job BuildJobEvent) error {
	body, err := json.Marshal(job)
	if err != nil {
		return fmt.Errorf("failed to marshal job: %w", err)
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

func (p *Publisher) Close() {
	p.ch.Close()
	p.conn.Close()
}
