package main

import (
	"log"
	"os"
	"strings"
	"time"
)

func mustGetEnv(key string) string {
	val := os.Getenv(key)
	if val == "" {
		log.Fatalf("Missing required environment variable: %s", key)
	}
	return val
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func getDurationEnv(key string, fallback time.Duration) time.Duration {
	val := os.Getenv(key)
	if val == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(val)
	if err != nil {
		log.Fatalf("Invalid duration for %s: %v", key, err)
	}
	return parsed
}

func validateProductionSecret(environment, key, value string) {
	if environment != "production" {
		return
	}
	if len(strings.TrimSpace(value)) < 32 {
		log.Fatalf("%s must be at least 32 characters in production", key)
	}
}
