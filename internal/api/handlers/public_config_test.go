package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestPublicConfigReturnsDeploymentSettings(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/api/config", NewPublicConfigHandler("apps.example.com", "https", false, false).Get)
	r.GET("/api/config-with-webhooks", NewPublicConfigHandler("apps.example.com", "https", true, true).Get)

	get := func(path string) map[string]any {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d", rec.Code)
		}
		var got map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
			t.Fatal(err)
		}
		return got
	}

	got := get("/api/config")
	if got["base_domain"] != "apps.example.com" || got["deployment_url_scheme"] != "https" {
		t.Fatalf("body = %v", got)
	}
	// Whether a push can deploy a project depends on the server, so the UI is told.
	if got["webhooks"] != false {
		t.Errorf("webhooks = %v, want false when the App's webhook is not set up", got["webhooks"])
	}
	if get("/api/config-with-webhooks")["webhooks"] != true {
		t.Error("webhooks is not true when the App's webhook is set up")
	}
	// Likewise whether an AWS account can be connected at all.
	if got["aws_connections"] != false {
		t.Errorf("aws_connections = %v, want false when connecting is not set up", got["aws_connections"])
	}
	if get("/api/config-with-webhooks")["aws_connections"] != true {
		t.Error("aws_connections is not true when connecting is set up")
	}
}
