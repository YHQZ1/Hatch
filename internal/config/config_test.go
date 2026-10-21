package config

import (
	"reflect"
	"strings"
	"testing"
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
		JWTSecret:          "short",
	}

	if err := cfg.Validate(); err != nil {
		t.Fatalf("Validate() returned error in development: %v", err)
	}
}

func TestValidateRejectsWeakProductionSecrets(t *testing.T) {
	cfg := validProductionConfig()
	cfg.JWTSecret = "short"

	err := cfg.Validate()
	if err == nil || !strings.Contains(err.Error(), "JWT_SECRET") {
		t.Fatalf("Validate() error = %v, want JWT_SECRET error", err)
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
		JWTSecret:          strings.Repeat("j", 32),
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
