// Package config loads Hatch's configuration from the environment.
package config

import (
	"crypto/rsa"
	"fmt"
	"net"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strings"
	"time"

	awsconn "github.com/YHQZ1/hatch/internal/cloud/aws"
	"github.com/YHQZ1/hatch/internal/githubapp"
)

// Role says which part of Hatch is starting, and so which settings it needs.
type Role int

const (
	// RoleServe runs the API and web UI together with the workers.
	RoleServe Role = iota
	// RoleWorker runs only the build and deploy workers.
	RoleWorker
	// RoleMigrate applies database migrations and needs only the database.
	RoleMigrate
)

// appSlugPattern matches the slug GitHub gives an App: the last part of
// github.com/apps/<slug>.
var appSlugPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9-]*$`)

// Where Hatch builds and runs apps.
const (
	// TargetLocal builds and runs apps with this host's Docker.
	TargetLocal = "local"
	// TargetAWS builds and runs apps on AWS. It is the old hosted prototype's
	// path and still reads Hatch's own AWS settings.
	TargetAWS = "aws"
)

// minWebhookSecretLength is the shortest webhook secret accepted: GitHub signs
// every delivery with it, so a guessable one would let anyone forge a push.
const minWebhookSecretLength = 16

type Config struct {
	Role Role

	// Target is TargetLocal (the default) or TargetAWS.
	Target string

	DatabaseURL       string
	Environment       string
	DataEncryptionKey string
	AWSRegion         string

	// The GitHub App, as itself: builds clone with its installation tokens.
	// The client ID doubles as the issuer of the App's JWT.
	GitHubClientID   string
	GitHubAppKeyPath string
	GitHubAppKey     *rsa.PrivateKey

	// API and web UI (RoleServe).
	Port               string
	FrontendURL        string
	CORSAllowedOrigins []string
	GitHubClientSecret string
	GitHubRedirectURI  string
	GitHubAppSlug      string
	// GitHubWebhookSecret is the secret of the GitHub App's webhook. It is
	// optional: without it Hatch cannot tell that a push happened, so pushes
	// deploy nothing (ADR 0010).
	GitHubWebhookSecret string
	ALBArn              string

	// AWSPrincipalARN is the AWS identity this Hatch assumes roles from, and
	// ConnectTemplateURL is where the hatch-connect template is published
	// (ADRs 0020 and 0022). Both are optional and go together: without them
	// users cannot connect an AWS account, and the rest of Hatch works as before.
	AWSPrincipalARN    string
	ConnectTemplateURL string

	// LocalProxyAddr is where the built-in proxy serves apps (TargetLocal).
	LocalProxyAddr string

	// Builder worker.
	ECRRegistry   string
	ECRRepository string
	BuildTimeout  time.Duration

	// Deployer worker (also read by the API for metrics).
	ECSClusterName       string
	ALBListenerARN       string
	VPCID                string
	SubnetA              string
	SubnetB              string
	ECSSecurityGroupID   string
	TaskExecutionRoleARN string

	// BaseDomain and DeploymentURLScheme describe where deployed apps are
	// reached. The web UI reads them from GET /api/config.
	BaseDomain          string
	DeploymentURLScheme string
}

// reader collects every missing or malformed setting so Load can report them
// all at once instead of stopping at the first.
type reader struct {
	missing  []string
	problems []string
}

func (r *reader) require(key string) string {
	value := os.Getenv(key)
	if value == "" {
		r.missing = append(r.missing, key)
	}
	return value
}

func (r *reader) duration(key string, fallback time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(value)
	if err != nil {
		r.problems = append(r.problems, fmt.Sprintf("%s is not a valid duration: %v", key, err))
		return fallback
	}
	return parsed
}

func (r *reader) err() error {
	var parts []string
	if len(r.missing) > 0 {
		sort.Strings(r.missing)
		parts = append(parts, "missing required environment variables: "+strings.Join(r.missing, ", "))
	}
	parts = append(parts, r.problems...)
	if len(parts) == 0 {
		return nil
	}
	return fmt.Errorf("%s", strings.Join(parts, "; "))
}

// Load reads the settings the role needs from the environment. It returns one
// error listing everything that is missing or invalid.
func Load(role Role) (*Config, error) {
	r := &reader{}
	cfg := &Config{
		Role:        role,
		Target:      getEnv("HATCH_TARGET", TargetLocal),
		DatabaseURL: r.require("DATABASE_URL"),
		Environment: getEnv("ENVIRONMENT", "development"),
	}
	if cfg.Target != TargetLocal && cfg.Target != TargetAWS {
		r.problems = append(r.problems, fmt.Sprintf("HATCH_TARGET must be %q or %q, not %q", TargetLocal, TargetAWS, cfg.Target))
	}

	if role != RoleMigrate {
		cfg.DataEncryptionKey = getEnv("DATA_ENCRYPTION_KEY", "")
		cfg.AWSRegion = getEnv("AWS_REGION", "ap-south-1")

		cfg.GitHubClientID = r.require("GITHUB_CLIENT_ID")
		cfg.GitHubAppKeyPath = r.require("GITHUB_APP_PRIVATE_KEY_PATH")
		if cfg.GitHubAppKeyPath != "" {
			key, err := githubapp.LoadKeyFile(cfg.GitHubAppKeyPath)
			if err != nil {
				r.problems = append(r.problems, "GITHUB_APP_PRIVATE_KEY_PATH: "+err.Error())
			}
			cfg.GitHubAppKey = key
		}

		cfg.BuildTimeout = r.duration("BUILD_TIMEOUT", 30*time.Minute)

		switch cfg.Target {
		case TargetAWS:
			cfg.ECRRegistry = r.require("ECR_REGISTRY")
			cfg.ECRRepository = r.require("ECR_REPOSITORY")

			cfg.ECSClusterName = r.require("ECS_CLUSTER_NAME")
			cfg.ALBListenerARN = firstNonEmpty(getEnv("ALB_HTTPS_LISTENER_ARN", ""), r.require("ALB_LISTENER_ARN"))
			cfg.VPCID = r.require("VPC_ID")
			cfg.SubnetA = r.require("SUBNET_A")
			cfg.SubnetB = r.require("SUBNET_B")
			cfg.ECSSecurityGroupID = r.require("ECS_SG_ID")
			cfg.TaskExecutionRoleARN = r.require("TASK_EXECUTION_ROLE_ARN")
			cfg.BaseDomain = r.require("BASE_DOMAIN")
			cfg.DeploymentURLScheme = DeploymentURLScheme()
		case TargetLocal:
			// Apps are served by the built-in proxy at <name>.localhost:<port>.
			cfg.LocalProxyAddr = getEnv("LOCAL_PROXY_ADDR", "127.0.0.1:8081")
			_, port, err := net.SplitHostPort(cfg.LocalProxyAddr)
			if err != nil || port == "" {
				r.problems = append(r.problems, "LOCAL_PROXY_ADDR must be host:port, for example 127.0.0.1:8081")
			}
			cfg.BaseDomain = "localhost:" + port
			cfg.DeploymentURLScheme = "http"
		}
	}

	// Read by every role that works jobs: the API starts a connection, a worker
	// verifies it.
	if role != RoleMigrate {
		cfg.AWSPrincipalARN = strings.TrimSpace(getEnv("HATCH_AWS_PRINCIPAL_ARN", ""))
		cfg.ConnectTemplateURL = strings.TrimSpace(getEnv("HATCH_CONNECT_TEMPLATE_URL", ""))
		switch {
		case cfg.AWSPrincipalARN == "" && cfg.ConnectTemplateURL == "":
		case cfg.AWSPrincipalARN == "" || cfg.ConnectTemplateURL == "":
			r.problems = append(r.problems, "HATCH_AWS_PRINCIPAL_ARN and HATCH_CONNECT_TEMPLATE_URL go together: set both to let users connect an AWS account, or neither")
		default:
			if err := awsconn.ValidatePrincipalARN(cfg.AWSPrincipalARN); err != nil {
				r.problems = append(r.problems, "HATCH_AWS_PRINCIPAL_ARN: "+err.Error())
			}
			if err := awsconn.ValidateTemplateURL(cfg.ConnectTemplateURL); err != nil {
				r.problems = append(r.problems, "HATCH_CONNECT_TEMPLATE_URL: "+err.Error())
			}
		}
	}

	if role == RoleServe {
		cfg.Port = getEnv("PORT", "8080")
		cfg.FrontendURL = strings.TrimRight(getEnv("FRONTEND_URL", "http://localhost:3000"), "/")
		cfg.CORSAllowedOrigins = parseCSV(getEnv("CORS_ALLOWED_ORIGINS", cfg.FrontendURL))
		cfg.GitHubClientSecret = r.require("GITHUB_CLIENT_SECRET")
		cfg.GitHubRedirectURI = r.require("GITHUB_REDIRECT_URI")
		cfg.GitHubAppSlug = r.require("GITHUB_APP_SLUG")
		cfg.GitHubWebhookSecret = strings.TrimSpace(getEnv("GITHUB_WEBHOOK_SECRET", ""))
		if cfg.GitHubWebhookSecret != "" && len(cfg.GitHubWebhookSecret) < minWebhookSecretLength {
			r.problems = append(r.problems, fmt.Sprintf("GITHUB_WEBHOOK_SECRET must be at least %d characters, such as the output of `openssl rand -hex 32`", minWebhookSecretLength))
		}
		cfg.ALBArn = getEnv("ALB_ARN", "")
	}

	if err := r.err(); err != nil {
		return nil, err
	}
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	return cfg, nil
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

// Validate checks the settings for the role the config was loaded for.
func (c *Config) Validate() error {
	if c.DeploymentURLScheme != "" && c.DeploymentURLScheme != "http" && c.DeploymentURLScheme != "https" {
		return fmt.Errorf("DEPLOYMENT_URL_SCHEME must be http or https")
	}
	if c.Role == RoleServe {
		if !appSlugPattern.MatchString(c.GitHubAppSlug) {
			return fmt.Errorf("GITHUB_APP_SLUG must be the GitHub App's slug (letters, digits, and hyphens), not a URL")
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
	}
	if c.Environment != "production" || c.Role == RoleMigrate {
		return nil
	}
	if len(strings.TrimSpace(c.DataEncryptionKey)) < 32 {
		return fmt.Errorf("DATA_ENCRYPTION_KEY must be at least 32 characters in production")
	}
	if c.Role != RoleServe {
		return nil
	}
	for name, value := range map[string]string{
		"FRONTEND_URL":        c.FrontendURL,
		"GITHUB_REDIRECT_URI": c.GitHubRedirectURI,
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
