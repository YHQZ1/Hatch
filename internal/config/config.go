package config

import (
	"fmt"
	"log"
	"net/url"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Port               string
	FrontendURL        string
	CORSAllowedOrigins []string
	GitHubClientID     string
	GitHubClientSecret string
	GitHubRedirectURI  string
	JWTSecret          string
	DatabaseURL        string
	RedisURL           string
	RabbitMQURL        string
	WebhookBaseURL     string
	Environment        string
	DataEncryptionKey  string
	AWSRegion          string
	ECSClusterName     string
	ALBListenerARN     string
	ALBArn             string

	// BaseDomain and DeploymentURLScheme describe where deployed apps are
	// reached. The web UI reads them from GET /api/config.
	BaseDomain          string
	DeploymentURLScheme string
}

func Load() *Config {
	_ = godotenv.Load()

	cfg := &Config{
		Port:               getEnv("PORT", "8080"),
		FrontendURL:        strings.TrimRight(getEnv("FRONTEND_URL", "http://localhost:3000"), "/"),
		CORSAllowedOrigins: parseCSV(getEnv("CORS_ALLOWED_ORIGINS", getEnv("FRONTEND_URL", "http://localhost:3000"))),
		GitHubClientID:     mustGetEnv("GITHUB_CLIENT_ID"),
		GitHubClientSecret: mustGetEnv("GITHUB_CLIENT_SECRET"),
		GitHubRedirectURI:  mustGetEnv("GITHUB_REDIRECT_URI"),
		JWTSecret:          mustGetEnv("JWT_SECRET"),
		DatabaseURL:        mustGetEnv("DATABASE_URL"),
		RedisURL:           mustGetEnv("REDIS_URL"),
		RabbitMQURL:        mustGetEnv("RABBITMQ_URL"),
		WebhookBaseURL:     strings.TrimRight(mustGetEnv("WEBHOOK_BASE_URL"), "/"),
		Environment:        getEnv("ENVIRONMENT", "development"),
		DataEncryptionKey:  getEnv("DATA_ENCRYPTION_KEY", ""),
		AWSRegion:          getEnv("AWS_REGION", "ap-south-1"),
		ECSClusterName:     getEnv("ECS_CLUSTER_NAME", ""),
		ALBListenerARN:     firstNonEmpty(getEnv("ALB_HTTPS_LISTENER_ARN", ""), getEnv("ALB_LISTENER_ARN", "")),
		ALBArn:             getEnv("ALB_ARN", ""),

		BaseDomain:          getEnv("BASE_DOMAIN", ""),
		DeploymentURLScheme: DeploymentURLScheme(),
	}
	if err := cfg.Validate(); err != nil {
		log.Fatal(err)
	}
	return cfg
}

// DeploymentURLScheme returns how deployed apps are reached: the value of
// DEPLOYMENT_URL_SCHEME, or https when an HTTPS load balancer listener is
// configured and http otherwise.
func DeploymentURLScheme() string {
	if scheme := getEnv("DEPLOYMENT_URL_SCHEME", ""); scheme != "" {
		return scheme
	}
	if getEnv("ALB_HTTPS_LISTENER_ARN", "") != "" {
		return "https"
	}
	return "http"
}

func (c *Config) Validate() error {
	if c.DeploymentURLScheme != "" && c.DeploymentURLScheme != "http" && c.DeploymentURLScheme != "https" {
		return fmt.Errorf("DEPLOYMENT_URL_SCHEME must be http or https")
	}
	if len(c.CORSAllowedOrigins) == 0 {
		return fmt.Errorf("CORS_ALLOWED_ORIGINS must include at least one origin")
	}
	for _, origin := range c.CORSAllowedOrigins {
		parsed, err := url.Parse(origin)
		if err != nil ||
			(parsed.Scheme != "http" && parsed.Scheme != "https") ||
			parsed.Host == "" ||
			(parsed.Path != "" && parsed.Path != "/") ||
			parsed.RawQuery != "" ||
			parsed.Fragment != "" ||
			parsed.User != nil {
			return fmt.Errorf("CORS_ALLOWED_ORIGINS contains an invalid origin: %s", origin)
		}
	}
	if c.Environment != "production" {
		return nil
	}
	if len(strings.TrimSpace(c.JWTSecret)) < 32 {
		return fmt.Errorf("JWT_SECRET must be at least 32 characters in production")
	}
	if len(strings.TrimSpace(c.DataEncryptionKey)) < 32 {
		return fmt.Errorf("DATA_ENCRYPTION_KEY must be at least 32 characters in production")
	}
	for name, value := range map[string]string{
		"FRONTEND_URL":        c.FrontendURL,
		"GITHUB_REDIRECT_URI": c.GitHubRedirectURI,
		"WEBHOOK_BASE_URL":    c.WebhookBaseURL,
	} {
		parsed, err := url.Parse(value)
		if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil {
			return fmt.Errorf("%s must be an absolute HTTPS URL in production", name)
		}
	}
	for _, origin := range c.CORSAllowedOrigins {
		if !strings.HasPrefix(origin, "https://") {
			return fmt.Errorf("CORS_ALLOWED_ORIGINS must use HTTPS in production")
		}
	}
	return nil
}

func parseCSV(value string) []string {
	parts := strings.Split(value, ",")
	values := make([]string, 0, len(parts))
	seen := map[string]struct{}{}
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if _, ok := seen[part]; ok {
			continue
		}
		values = append(values, part)
		seen[part] = struct{}{}
	}
	return values
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func mustGetEnv(key string) string {
	val := os.Getenv(key)
	if val == "" {
		log.Fatalf("Missing required environment variable: %s", key)
	}
	return val
}
