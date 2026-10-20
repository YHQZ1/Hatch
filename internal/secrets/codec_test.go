package secrets

import (
	"strings"
	"testing"
)

func TestCodecEncryptDecryptRoundTrip(t *testing.T) {
	codec, err := NewCodec("test-secret-key")
	if err != nil {
		t.Fatalf("NewCodec: %v", err)
	}

	encrypted, err := codec.Encrypt("github-token")
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}
	if encrypted == "github-token" {
		t.Fatal("expected encrypted value to differ from plaintext")
	}
	if !strings.HasPrefix(encrypted, encryptedPrefix) {
		t.Fatalf("expected encrypted prefix, got %q", encrypted)
	}

	decrypted, err := codec.Decrypt(encrypted)
	if err != nil {
		t.Fatalf("Decrypt: %v", err)
	}
	if decrypted != "github-token" {
		t.Fatalf("expected round trip value, got %q", decrypted)
	}
}

func TestCodecPlaintextCompatibility(t *testing.T) {
	codec, err := NewCodec("test-secret-key")
	if err != nil {
		t.Fatalf("NewCodec: %v", err)
	}

	value, err := codec.Decrypt("legacy-token")
	if err != nil {
		t.Fatalf("Decrypt plaintext: %v", err)
	}
	if value != "legacy-token" {
		t.Fatalf("expected legacy plaintext, got %q", value)
	}
}

func TestCodecDisabledMode(t *testing.T) {
	codec, err := NewCodec("")
	if err != nil {
		t.Fatalf("NewCodec: %v", err)
	}

	encrypted, err := codec.Encrypt("plain")
	if err != nil {
		t.Fatalf("Encrypt disabled: %v", err)
	}
	if encrypted != "plain" {
		t.Fatalf("expected plaintext when disabled, got %q", encrypted)
	}

	enabled, err := NewCodec("test-secret-key")
	if err != nil {
		t.Fatalf("NewCodec enabled: %v", err)
	}
	secret, err := enabled.Encrypt("secret")
	if err != nil {
		t.Fatalf("Encrypt enabled: %v", err)
	}
	if _, err := codec.Decrypt(secret); err == nil {
		t.Fatal("expected encrypted value to require a key")
	}
}
