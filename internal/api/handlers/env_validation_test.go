package handlers

import (
	"strings"
	"testing"
)

func TestNormalizeGitHubRepoURL(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "https",
			input: "https://github.com/YHQZ1/hatch.git",
			want:  "https://github.com/YHQZ1/hatch",
		},
		{
			name:  "ssh",
			input: "git@github.com:YHQZ1/hatch.git",
			want:  "https://github.com/YHQZ1/hatch",
		},
		{
			name:  "slug",
			input: "YHQZ1/hatch",
			want:  "https://github.com/YHQZ1/hatch",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := normalizeGitHubRepoURL(tt.input)
			if err != nil {
				t.Fatalf("normalizeGitHubRepoURL(%q): %v", tt.input, err)
			}
			if got != tt.want {
				t.Fatalf("normalizeGitHubRepoURL(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestNormalizeGitHubRepoURLRejectsNonRepositoryURLs(t *testing.T) {
	cases := []string{
		"https://example.com/YHQZ1/hatch",
		"https://github.com/YHQZ1/hatch/issues",
		"https://github.com/YHQZ1/hatch?tab=readme",
		"github.com/YHQZ1/hatch",
	}

	for _, value := range cases {
		if _, err := normalizeGitHubRepoURL(value); err == nil {
			t.Fatalf("expected %q to be rejected", value)
		}
	}
}

func TestNormalizeHealthCheckPath(t *testing.T) {
	if got, err := normalizeHealthCheckPath(""); err != nil || got != "/" {
		t.Fatalf("empty health check = %q, %v; want /", got, err)
	}
	if got, err := normalizeHealthCheckPath("/health/ready"); err != nil || got != "/health/ready" {
		t.Fatalf("valid health check = %q, %v", got, err)
	}
	for _, value := range []string{"health", "/health check", "/" + strings.Repeat("x", 1024)} {
		if _, err := normalizeHealthCheckPath(value); err == nil {
			t.Fatalf("expected health check %q to be rejected", value)
		}
	}
}

func TestNormalizeEnvVars(t *testing.T) {
	envVars, err := normalizeEnvVars(map[string]string{
		" node_env ": "production",
		"_TOKEN":     "secret",
	})
	if err != nil {
		t.Fatalf("normalizeEnvVars: %v", err)
	}

	if envVars["NODE_ENV"] != "production" {
		t.Fatalf("expected NODE_ENV to be normalized, got %q", envVars["NODE_ENV"])
	}
	if envVars["_TOKEN"] != "secret" {
		t.Fatalf("expected _TOKEN to be preserved, got %q", envVars["_TOKEN"])
	}
}

func TestNormalizeEnvVarsRejectsInvalidKeys(t *testing.T) {
	cases := []string{
		"1TOKEN",
		"BAD-KEY",
		"BAD KEY",
		"BAD.KEY",
	}

	for _, key := range cases {
		if _, err := normalizeEnvVars(map[string]string{key: "value"}); err == nil {
			t.Fatalf("expected %q to be rejected", key)
		}
	}
}

func TestNormalizeEnvVarsRejectsOversizedValues(t *testing.T) {
	_, err := normalizeEnvVars(map[string]string{
		"BIG_VALUE": strings.Repeat("x", maxEnvValueLength+1),
	})
	if err == nil {
		t.Fatal("expected oversized value to be rejected")
	}
}

func TestNormalizeEnvVarsRejectsTooManyEntries(t *testing.T) {
	envVars := map[string]string{}
	for i := 0; i <= maxEnvVars; i++ {
		envVars["KEY_"+strings.Repeat("X", i+1)] = "value"
	}

	if _, err := normalizeEnvVars(envVars); err == nil {
		t.Fatal("expected too many environment variables to be rejected")
	}
}
