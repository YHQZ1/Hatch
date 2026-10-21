package ws

import "testing"

func TestIsAllowedOriginRequiresExactConfiguredOrigin(t *testing.T) {
	hub := &Hub{
		allowedOrigin: map[string]struct{}{
			"http://localhost:3000":      {},
			"https://app.hatchcloud.xyz": {},
		},
	}

	tests := []struct {
		name   string
		origin string
		want   bool
	}{
		{name: "configured localhost", origin: "http://localhost:3000", want: true},
		{name: "configured app domain", origin: "https://app.hatchcloud.xyz", want: true},
		{name: "empty origin rejected", origin: "", want: false},
		{name: "different scheme rejected", origin: "http://app.hatchcloud.xyz", want: false},
		{name: "different host rejected", origin: "https://evil.example", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := hub.isAllowedOrigin(tt.origin); got != tt.want {
				t.Fatalf("isAllowedOrigin(%q) = %v, want %v", tt.origin, got, tt.want)
			}
		})
	}
}
