FROM golang:1.23-alpine AS builder
WORKDIR /app

COPY go.work go.work.sum ./
COPY packages/ ./packages/
COPY apps/builder/go.mod apps/builder/go.sum* ./apps/builder/

RUN go mod download

COPY apps/builder/ ./apps/builder/
RUN go build -o worker ./apps/builder/cmd/worker/main.go

FROM alpine:latest
RUN apk add --no-cache docker-cli git
WORKDIR /app
COPY --from=builder /app/worker .
CMD ["./worker"]