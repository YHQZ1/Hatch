package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"testing"

	dbpkg "github.com/YHQZ1/hatch/packages/db/gen"
	"github.com/YHQZ1/hatch/packages/secrets"
	"github.com/google/uuid"
)

func TestMatchWebhookProjectVerifiesEncryptedSecret(t *testing.T) {
	codec, err := secrets.NewCodec("test-webhook-secret-key")
	if err != nil {
		t.Fatalf("NewCodec: %v", err)
	}

	plainSecret := "webhook-secret"
	storedSecret, err := codec.Encrypt(plainSecret)
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}

	handler := &WebhookHandler{secrets: codec}
	body := []byte(`{"ref":"refs/heads/main"}`)
	project := dbpkg.Project{
		ID:            uuid.New(),
		WebhookSecret: sql.NullString{String: storedSecret, Valid: true},
	}

	matched, ok := handler.matchWebhookProject([]dbpkg.Project{project}, body, signatureFor(body, plainSecret))
	if !ok {
		t.Fatal("expected encrypted webhook secret to match")
	}
	if matched.ID != project.ID {
		t.Fatalf("expected project %s, got %s", project.ID, matched.ID)
	}
}

func TestMatchWebhookProjectRejectsUnsignedWebhook(t *testing.T) {
	codec, err := secrets.NewCodec("test-webhook-secret-key")
	if err != nil {
		t.Fatalf("NewCodec: %v", err)
	}

	handler := &WebhookHandler{secrets: codec}
	project := dbpkg.Project{
		ID:            uuid.New(),
		WebhookSecret: sql.NullString{String: "webhook-secret", Valid: true},
	}

	if _, ok := handler.matchWebhookProject([]dbpkg.Project{project}, []byte("{}"), ""); ok {
		t.Fatal("expected unsigned webhook to be rejected")
	}
}

func signatureFor(body []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}
