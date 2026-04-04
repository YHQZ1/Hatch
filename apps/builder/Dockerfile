FROM golang:1.23-alpine AS builder
WORKDIR /app
RUN apk add --no-cache git docker-cli
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o worker ./cmd/worker

FROM alpine:latest
WORKDIR /app
RUN apk add --no-cache git docker-cli
COPY --from=builder /app/worker .
CMD ["./worker"]