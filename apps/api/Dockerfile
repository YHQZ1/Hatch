FROM golang:1.23-alpine AS builder
WORKDIR /app

COPY go.work go.work.sum ./
COPY packages/ ./packages/

COPY apps/api/go.mod apps/api/go.sum* ./apps/api/

RUN go mod download

COPY apps/api/ ./apps/api/

RUN go build -o main ./apps/api/cmd/server/main.go

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/main .
EXPOSE 8080
CMD ["./main"]