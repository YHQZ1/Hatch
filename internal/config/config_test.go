package config

import (
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestParseCSVDedupesAndTrimsOrigins(t *testing.T) {
	got := parseCSV(" http://localhost:3000,https://app.hatchcloud.xyz, http://localhost:3000 ,,")
	want := []string{"http://localhost:3000", "https://app.hatchcloud.xyz"}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parseCSV() = %#v, want %#v", got, want)
	}
}

func TestValidateAllowsDevelopmentDefaults(t *testing.T) {
	cfg := Config{
		Environment:        "development",
		FrontendURL:        "http://localhost:3000",
		WebhookBaseURL:     "http://localhost:8080",
		CORSAllowedOrigins: []string{"http://localhost:3000"},
		GitHubAppSlug:      "hatch-local-dev",
	}

	if err := cfg.Validate(); err != nil {
		t.Fatalf("Validate() returned error in development: %v", err)
	}
}

func TestValidateRejectsWeakProductionSecrets(t *testing.T) {
	cfg := validProductionConfig()
	cfg.DataEncryptionKey = "short"

	err := cfg.Validate()
	if err == nil || !strings.Contains(err.Error(), "DATA_ENCRYPTION_KEY") {
		t.Fatalf("Validate() error = %v, want DATA_ENCRYPTION_KEY error", err)
	}
}

func TestValidateRequiresAnAppSlugNotAURL(t *testing.T) {
	for _, slug := range []string{
		"https://github.com/settings/apps/hatch-local-dev",
		"github.com/apps/hatch",
		"hatch local",
		"",
	} {
		cfg := validProductionConfig()
		cfg.GitHubAppSlug = slug

		err := cfg.Validate()
		if err == nil || !strings.Contains(err.Error(), "GITHUB_APP_SLUG") {
			t.Errorf("slug %q: Validate() error = %v, want GITHUB_APP_SLUG error", slug, err)
		}
	}
}

func TestValidateRejectsLocalhostProductionURLs(t *testing.T) {
	cfg := validProductionConfig()
	cfg.FrontendURL = "http://localhost:3000"

	err := cfg.Validate()
	if err == nil || !strings.Contains(err.Error(), "FRONTEND_URL") {
		t.Fatalf("Validate() error = %v, want FRONTEND_URL error", err)
	}
}

func TestValidateRejectsCORSOriginWithPath(t *testing.T) {
	cfg := validProductionConfig()
	cfg.CORSAllowedOrigins = []string{"https://app.hatchcloud.xyz/path"}

	if err := cfg.Validate(); err == nil {
		t.Fatal("expected CORS origin with a path to be rejected")
	}
}

func validProductionConfig() Config {
	return Config{
		Environment:        "production",
		FrontendURL:        "https://app.hatchcloud.xyz",
		GitHubRedirectURI:  "https://api.hatchcloud.xyz/auth/callback",
		WebhookBaseURL:     "https://api.hatchcloud.xyz",
		CORSAllowedOrigins: []string{"https://app.hatchcloud.xyz"},
		GitHubAppSlug:      "hatch",
		DataEncryptionKey:  strings.Repeat("d", 32),
	}
}

func TestDeploymentURLScheme(t *testing.T) {
	tests := []struct {
		name string
		env  map[string]string
		want string
	}{
		{"defaults to http", nil, "http"},
		{"https when an HTTPS listener is set", map[string]string{"ALB_HTTPS_LISTENER_ARN": "arn:listener"}, "https"},
		{"explicit value wins", map[string]string{"ALB_HTTPS_LISTENER_ARN": "arn:listener", "DEPLOYMENT_URL_SCHEME": "http"}, "http"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("DEPLOYMENT_URL_SCHEME", "")
			t.Setenv("ALB_HTTPS_LISTENER_ARN", "")
			for k, v := range tt.env {
				t.Setenv(k, v)
			}
			if got := DeploymentURLScheme(); got != tt.want {
				t.Fatalf("DeploymentURLScheme() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestValidateRejectsUnknownDeploymentURLScheme(t *testing.T) {
	cfg := Config{
		Environment:         "development",
		CORSAllowedOrigins:  []string{"http://localhost:3000"},
		DeploymentURLScheme: "ftp",
	}

	err := cfg.Validate()
	if err == nil || !strings.Contains(err.Error(), "DEPLOYMENT_URL_SCHEME") {
		t.Fatalf("Validate() error = %v, want DEPLOYMENT_URL_SCHEME error", err)
	}
}

// allVars is every variable the serve role needs, with development values.
var allVars = map[string]string{
	"DATABASE_URL":            "postgres://hatch:hatch@localhost:5433/hatch?sslmode=disable",
	"REDIS_URL":               "redis://localhost:6379",
	"RABBITMQ_URL":            "amqp://guest:guest@localhost:5672/",
	"ECR_REGISTRY":            "123456789012.dkr.ecr.ap-south-1.amazonaws.com",
	"ECR_REPOSITORY":          "hatch-builds",
	"ECS_CLUSTER_NAME":        "hatch",
	"ALB_LISTENER_ARN":        "arn:aws:elasticloadbalancing:listener/plain",
	"VPC_ID":                  "vpc-1",
	"SUBNET_A":                "subnet-a",
	"SUBNET_B":                "subnet-b",
	"ECS_SG_ID":               "sg-1",
	"TASK_EXECUTION_ROLE_ARN": "arn:aws:iam::123456789012:role/hatch-task-execution",
	"BASE_DOMAIN":             "apps.example.com",
	"GITHUB_CLIENT_ID":        "client-id",
	"GITHUB_CLIENT_SECRET":    "client-secret",
	"GITHUB_REDIRECT_URI":     "http://localhost:8080/auth/callback",
	"GITHUB_APP_SLUG":         "hatch-local-dev",
	"WEBHOOK_BASE_URL":        "http://localhost:8080",
}

// setEnv clears every variable Load reads, then sets the given ones.
func setEnv(t *testing.T, vars map[string]string) {
	t.Helper()
	for key := range allVars {
		t.Setenv(key, "")
	}
	for _, key := range []string{
		"ENVIRONMENT", "DATA_ENCRYPTION_KEY", "AWS_REGION", "ALB_HTTPS_LISTENER_ARN",
		"DEPLOYMENT_URL_SCHEME", "BUILD_TIMEOUT", "PORT", "FRONTEND_URL",
		"CORS_ALLOWED_ORIGINS", "ALB_ARN",
	} {
		t.Setenv(key, "")
	}
	for key, value := range vars {
		t.Setenv(key, value)
	}
}

func without(vars map[string]string, keys ...string) map[string]string {
	out := map[string]string{}
	for k, v := range vars {
		out[k] = v
	}
	for _, key := range keys {
		delete(out, key)
	}
	return out
}

func TestLoadServeReadsEverything(t *testing.T) {
	setEnv(t, allVars)

	cfg, err := Load(RoleServe)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Port != "8080" || cfg.FrontendURL != "http://localhost:3000" {
		t.Errorf("defaults: port=%q frontend=%q", cfg.Port, cfg.FrontendURL)
	}
	if !reflect.DeepEqual(cfg.CORSAllowedOrigins, []string{"http://localhost:3000"}) {
		t.Errorf("CORS origins = %v", cfg.CORSAllowedOrigins)
	}
	if cfg.BuildTimeout != 30*time.Minute || cfg.AWSRegion != "ap-south-1" {
		t.Errorf("defaults: timeout=%v region=%q", cfg.BuildTimeout, cfg.AWSRegion)
	}
	if cfg.ALBListenerARN != "arn:aws:elasticloadbalancing:listener/plain" || cfg.DeploymentURLScheme != "http" {
		t.Errorf("listener=%q scheme=%q", cfg.ALBListenerARN, cfg.DeploymentURLScheme)
	}
}

func TestLoadPrefersTheHTTPSListener(t *testing.T) {
	setEnv(t, allVars)
	t.Setenv("ALB_HTTPS_LISTENER_ARN", "arn:aws:elasticloadbalancing:listener/https")

	cfg, err := Load(RoleWorker)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.ALBListenerARN != "arn:aws:elasticloadbalancing:listener/https" || cfg.DeploymentURLScheme != "https" {
		t.Fatalf("listener=%q scheme=%q", cfg.ALBListenerARN, cfg.DeploymentURLScheme)
	}
}

func TestLoadReportsEveryMissingVariable(t *testing.T) {
	setEnv(t, without(allVars, "GITHUB_APP_SLUG", "DATABASE_URL", "VPC_ID"))

	_, err := Load(RoleServe)
	if err == nil {
		t.Fatal("expected an error")
	}
	want := "missing required environment variables: DATABASE_URL, GITHUB_APP_SLUG, VPC_ID"
	if err.Error() != want {
		t.Fatalf("error = %q, want %q", err, want)
	}
}

func TestWorkerDoesNotNeedTheAPISettings(t *testing.T) {
	setEnv(t, without(allVars,
		"GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "GITHUB_REDIRECT_URI", "GITHUB_APP_SLUG", "WEBHOOK_BASE_URL"))

	if _, err := Load(RoleWorker); err != nil {
		t.Fatalf("worker should load without API settings: %v", err)
	}
	if _, err := Load(RoleServe); err == nil {
		t.Fatal("serve should require the API settings")
	}
}

func TestMigrateOnlyNeedsTheDatabase(t *testing.T) {
	setEnv(t, map[string]string{"DATABASE_URL": allVars["DATABASE_URL"]})

	cfg, err := Load(RoleMigrate)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.DatabaseURL != allVars["DATABASE_URL"] {
		t.Fatalf("DatabaseURL = %q", cfg.DatabaseURL)
	}

	setEnv(t, nil)
	if _, err := Load(RoleMigrate); err == nil || !strings.Contains(err.Error(), "DATABASE_URL") {
		t.Fatalf("error = %v, want DATABASE_URL", err)
	}
}

func TestLoadRejectsABadBuildTimeout(t *testing.T) {
	setEnv(t, allVars)
	t.Setenv("BUILD_TIMEOUT", "soon")

	_, err := Load(RoleWorker)
	if err == nil || !strings.Contains(err.Error(), "BUILD_TIMEOUT") {
		t.Fatalf("error = %v, want BUILD_TIMEOUT", err)
	}
}

func TestProductionNeedsAnEncryptionKeyForEveryRole(t *testing.T) {
	for _, role := range []Role{RoleServe, RoleWorker} {
		cfg := validProductionConfig()
		cfg.Role = role
		cfg.DataEncryptionKey = "short"

		err := cfg.Validate()
		if err == nil || !strings.Contains(err.Error(), "DATA_ENCRYPTION_KEY") {
			t.Errorf("role %d: error = %v, want DATA_ENCRYPTION_KEY", role, err)
		}
	}
}

func TestWorkerProductionSkipsTheAPIChecks(t *testing.T) {
	cfg := Config{
		Role:              RoleWorker,
		Environment:       "production",
		DataEncryptionKey: strings.Repeat("d", 32),
	}

	if err := cfg.Validate(); err != nil {
		t.Fatalf("worker should not need the API settings: %v", err)
	}
}
