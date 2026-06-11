package secrets

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
	"strings"
)

const encryptedPrefix = "hatch:v1:"

type Codec struct {
	aead cipher.AEAD
}

func NewCodec(key string) (*Codec, error) {
	key = strings.TrimSpace(key)
	if key == "" {
		return &Codec{}, nil
	}

	sum := sha256.Sum256([]byte(key))
	block, err := aes.NewCipher(sum[:])
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Codec{aead: aead}, nil
}

func (c *Codec) Encrypt(value string) (string, error) {
	if c == nil || c.aead == nil || value == "" {
		return value, nil
	}
	if strings.HasPrefix(value, encryptedPrefix) {
		return value, nil
	}

	nonce := make([]byte, c.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	ciphertext := c.aead.Seal(nil, nonce, []byte(value), nil)
	payload := append(nonce, ciphertext...)
	return encryptedPrefix + base64.RawURLEncoding.EncodeToString(payload), nil
}

func (c *Codec) Decrypt(value string) (string, error) {
	if value == "" || !strings.HasPrefix(value, encryptedPrefix) {
		return value, nil
	}
	if c == nil || c.aead == nil {
		return "", fmt.Errorf("encrypted secret requires DATA_ENCRYPTION_KEY")
	}

	encoded := strings.TrimPrefix(value, encryptedPrefix)
	payload, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return "", fmt.Errorf("invalid encrypted secret payload: %w", err)
	}
	nonceSize := c.aead.NonceSize()
	if len(payload) <= nonceSize {
		return "", fmt.Errorf("invalid encrypted secret payload")
	}

	nonce := payload[:nonceSize]
	ciphertext := payload[nonceSize:]
	plaintext, err := c.aead.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("failed to decrypt secret: %w", err)
	}
	return string(plaintext), nil
}
