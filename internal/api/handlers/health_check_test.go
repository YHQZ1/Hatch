package handlers

import "testing"

func TestEffectiveHealthCheck(t *testing.T) {
	tests := []struct {
		name, requested, stored, want string
		wantErr                       bool
	}{
		{"the request wins", "/ready", "/health", "/ready", false},
		{"blank falls back to the project's", "", "/health", "/health", false},
		{"whitespace counts as blank", "   ", "/health", "/health", false},
		{"nothing anywhere is the root", "", "", "/", false},
		{"the request is trimmed", "  /up ", "/health", "/up", false},
		{"relative paths are refused", "health", "/health", "", true},
		{"spaces inside are refused", "/a b", "/health", "", true},
		{"a bad stored value is refused too", "", "nope", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := effectiveHealthCheck(tt.requested, tt.stored)
			if (err != nil) != tt.wantErr || got != tt.want {
				t.Errorf("effectiveHealthCheck(%q, %q) = %q, %v; want %q (error %v)", tt.requested, tt.stored, got, err, tt.want, tt.wantErr)
			}
		})
	}
}
