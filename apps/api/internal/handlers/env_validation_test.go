package handlers

import (
	"strings"
	"testing"
)

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
