package aws

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
)

// NewExternalID returns a random ExternalId for one connection: 48 hex digits,
// inside what IAM and the template accept (32 to 128 of [A-Za-z0-9_+=,.@:/-]).
// It stops another Hatch user from making Hatch assume a role they do not own.
func NewExternalID() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate an external id: %w", err)
	}
	return hex.EncodeToString(b), nil
}
