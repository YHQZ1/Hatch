FROM golang:1.23-alpine AS builder
WORKDIR /app

COPY go.work go.work.sum ./
COPY packages/ ./packages/
COPY apps/deployer/go.mod apps/deployer/go.sum* ./apps/deployer/

RUN go mod download

COPY apps/deployer/ ./apps/deployer/
RUN go build -o worker ./apps/deployer/cmd/worker/main.go

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/worker .
CMD ["./worker"]