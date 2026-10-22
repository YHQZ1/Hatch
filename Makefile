SHELL := /bin/bash

DEV_PID_FILE := .hatch-dev.pids
DEV_PORTS := 3000 8080

.PHONY: dev stop-dev check-dev-ports infra web build up down migrate test lint lint-go lint-web test-web fmt check


infra:
	docker compose up -d postgres redis

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
	process_pids="$$(pgrep -f 'go run ./cmd/hatch|/go-build.*/exe/hatch (serve|worker)|vite|pnpm.* dev' 2>/dev/null || true)"; \
	for pid in $$process_pids; do \
		cwd="$$(lsof -a -p "$$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')"; \
		case "$$cwd" in \
			"$$workspace"|"$$workspace/web") \
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
	@test -f .env || { echo "Missing .env (copy .env.example)"; exit 1; }
	@test -d web/node_modules || { echo "Run: cd web && pnpm install"; exit 1; }
	@set -e; \
	rm -f "$(DEV_PID_FILE)"; \
	trap '$(MAKE) --no-print-directory stop-dev >/dev/null 2>&1 || true; wait' INT TERM EXIT; \
	go run ./cmd/hatch serve & echo $$! >> "$(DEV_PID_FILE)"; \
	( cd web && pnpm dev ) & echo $$! >> "$(DEV_PID_FILE)"; \
	wait

VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)

# Build the web UI into web/dist, which the hatch binary embeds.
web:
	cd web && pnpm install --frozen-lockfile && pnpm build

build: web
	go build -ldflags "-X main.version=$(VERSION)" -o bin/hatch ./cmd/hatch

up:
	docker compose up

down:
	docker compose down

# Applies the migrations embedded in the binary to DATABASE_URL (from .env).
migrate:
	go run ./cmd/hatch migrate

# Checks (CI runs `make check` and the web build)

test:
	go test -race ./...

lint: lint-go lint-web

lint-go:
	@command -v golangci-lint >/dev/null || { echo "golangci-lint not found: https://golangci-lint.run/welcome/install/"; exit 1; }
	golangci-lint run ./...

lint-web:
	cd web && pnpm lint

test-web:
	cd web && pnpm test

fmt:
	gofmt -w cmd internal

check: lint test test-web
