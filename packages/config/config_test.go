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

func validProductionConfig() Config {
	return Config{
		Environment:        "production",
		FrontendURL:        "https://app.hatchcloud.xyz",
		WebhookBaseURL:     "https://api.hatchcloud.xyz",
		CORSAllowedOrigins: []string{"https://app.hatchcloud.xyz"},
		JWTSecret:          strings.Repeat("j", 32),
		DataEncryptionKey:  strings.Repeat("d", 32),
	}
}
