.PHONY: dev infra build

dev:
	docker compose up -d postgres redis rabbitmq

infra:
	docker compose up -d postgres redis rabbitmq

build:
	docker compose build

up:
	docker compose up

down:
	docker compose down

migrate:
	migrate -path packages/db/migrations \
		-database "postgres://hatch:hatch@localhost:5432/hatch?sslmode=disable" up