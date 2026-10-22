package handlers

import (
	"strings"

	"github.com/google/uuid"
)

// minShortIDLength is the fewest hex digits of an id that name a deployment in
// an address. Ids are random, so eight digits (32 bits) are far more than
// enough to tell one user's deployments apart.
const minShortIDLength = 8

// shortIDRange turns the first hex digits of a UUID (dashes allowed, any case)
// into the lowest and highest UUID that start with them, so the deployment can
// be found as a range over the primary key. It reports false for anything that
// is not between minShortIDLength and 31 hex digits; a whole id is parsed as a
// UUID before this is tried.
func shortIDRange(ref string) (low, high uuid.UUID, ok bool) {
	digits := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(ref), "-", ""))
	if len(digits) < minShortIDLength || len(digits) >= 32 {
		return uuid.Nil, uuid.Nil, false
	}
	for _, r := range digits {
		if (r < '0' || r > '9') && (r < 'a' || r > 'f') {
			return uuid.Nil, uuid.Nil, false
		}
	}
	pad := 32 - len(digits)
	low, err := uuid.Parse(digits + strings.Repeat("0", pad))
	if err != nil {
		return uuid.Nil, uuid.Nil, false
	}
	high, err = uuid.Parse(digits + strings.Repeat("f", pad))
	if err != nil {
		return uuid.Nil, uuid.Nil, false
	}
	return low, high, true
}
