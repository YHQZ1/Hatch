SHELL := /bin/bash

DEV_PID_FILE := .hatch-dev.pids
DEV_PORTS := 3000 8080

.PHONY: dev stop-dev check-dev-ports infra build up down migrate test lint lint-go lint-web fmt check

GO_MODULES := apps/api apps/builder apps/deployer packages/config packages/db packages/secrets

infra:
	docker compose up -d postgres redis rabbitmq

stop-dev:
	@set -e; \
	pids=""; \
	if [ -f "$(DEV_PID_FILE)" ]; then \
		pids="$$(cat "$(DEV_PID_FILE)" 2>/dev/null || true)"; \
	fi; \
	for port in $(DEV_PORTS); do \
		port_pids="$$(lsof -tiTCP:$$port -sTCP:LISTEN 2>/dev/null || true)"; \
		if [ -n "$$port_pids" ]; then \
			pids="$$pids $$port_pids"; \
		fi; \
	done; \
	workspace="$$(pwd)"; \
	process_pids="$$(pgrep -f 'go run cmd/(server|worker)/main.go|/go-build.*/(exe/)?main|next dev|npm run dev' 2>/dev/null || true)"; \
	for pid in $$process_pids; do \
		cwd="$$(lsof -a -p "$$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')"; \
		case "$$cwd" in \
			"$$workspace/apps/api"|"$$workspace/apps/builder"|"$$workspace/apps/deployer"|"$$workspace/apps/web") \
				pids="$$pids $$pid"; \
				;; \
		esac; \
	done; \
	pids="$$(printf '%s\n' $$pids | awk 'NF && !seen[$$1]++')"; \
	if [ -z "$$pids" ]; then \
		rm -f "$(DEV_PID_FILE)"; \
		echo "No Hatch dev processes to stop."; \
		exit 0; \
	fi; \
	collect_children() { \
		for parent in "$$@"; do \
			children="$$(pgrep -P "$$parent" 2>/dev/null || true)"; \
			if [ -n "$$children" ]; then \
				printf '%s\n' $$children; \
				collect_children $$children; \
			fi; \
		done; \
	}; \
	all_pids="$$( { printf '%s\n' $$pids; collect_children $$pids; } | awk 'NF && !seen[$$1]++')"; \
	echo "Stopping Hatch dev processes: $$all_pids"; \
	kill $$all_pids 2>/dev/null || true; \
	sleep 1; \
	for pid in $$all_pids; do \
		if kill -0 $$pid 2>/dev/null; then \
			kill -9 $$pid 2>/dev/null || true; \
		fi; \
	done; \
	rm -f "$(DEV_PID_FILE)"

check-dev-ports:
	@for port in $(DEV_PORTS); do \
		if lsof -tiTCP:$$port -sTCP:LISTEN >/dev/null 2>&1; then \
			echo "Port $$port is still in use after stop-dev."; \
			echo "Run: lsof -nP -iTCP:$$port -sTCP:LISTEN"; \
			exit 1; \
		fi; \
	done

dev: infra stop-dev check-dev-ports
	@test -f apps/api/.env || { echo "Missing apps/api/.env"; exit 1; }
	@test -f apps/builder/.env || { echo "Missing apps/builder/.env"; exit 1; }
	@test -f apps/deployer/.env || { echo "Missing apps/deployer/.env"; exit 1; }
	@test -f apps/web/.env.development.local || cp apps/web/.env.example apps/web/.env.development.local
	@set -e; \
	rm -f "$(DEV_PID_FILE)"; \
	trap '$(MAKE) --no-print-directory stop-dev >/dev/null 2>&1 || true; wait' INT TERM EXIT; \
	( cd apps/api && go run cmd/server/main.go ) & echo $$! >> "$(DEV_PID_FILE)"; \
	( cd apps/builder && go run cmd/worker/main.go ) & echo $$! >> "$(DEV_PID_FILE)"; \
	( cd apps/deployer && go run cmd/worker/main.go ) & echo $$! >> "$(DEV_PID_FILE)"; \
	( cd apps/web && npm run dev ) & echo $$! >> "$(DEV_PID_FILE)"; \
	wait

build:
	docker compose build

up:
	docker compose up

down:
	docker compose down

migrate:
	migrate -path packages/db/migrations \
		-database "postgres://hatch:hatch@localhost:5433/hatch?sslmode=disable" up

# Checks (CI runs `make check` and the web build)

test:
	@set -e; for m in $(GO_MODULES); do \
		echo "==> go test $$m"; \
		( cd $$m && go test -race ./... ); \
	done

lint: lint-go lint-web

lint-go:
	@command -v golangci-lint >/dev/null || { echo "golangci-lint not found: https://golangci-lint.run/welcome/install/"; exit 1; }
	@set -e; for m in $(GO_MODULES); do \
		echo "==> golangci-lint $$m"; \
		( cd $$m && golangci-lint run ./... ); \
	done

lint-web:
	cd apps/web && npm run lint

fmt:
	@set -e; for m in $(GO_MODULES); do gofmt -w $$m; done

check: lint test
