package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestCheckSubdomain(t *testing.T) {
	f := newProjectFixture(t, "active") // owns "shop"
	h := f.handler(t, nil)

	tests := []struct {
		name      string
		available bool
		reason    string
	}{
		{"fresh-name", true, ""},
		{"Fresh-Name", true, ""},
		{"shop", false, "subdomain already in use"},
		{"SHOP", false, "subdomain already in use"},
		{"api", false, "subdomain is reserved"},
		{"-bad-", false, "subdomain must be 1-63 characters and contain only lowercase letters, numbers, and hyphens"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gin.SetMode(gin.TestMode)
			rec := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(rec)
			c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
			c.Set("user_id", f.user.ID.String())
			c.Params = gin.Params{{Key: "name", Value: tt.name}}

			h.CheckSubdomain(c)

			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, body %s", rec.Code, rec.Body)
			}
			var got struct {
				Available bool   `json:"available"`
				Reason    string `json:"reason"`
			}
			if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
				t.Fatal(err)
			}
			if got.Available != tt.available || got.Reason != tt.reason {
				t.Errorf("got %+v, want available=%v reason=%q", got, tt.available, tt.reason)
			}
		})
	}
}

func TestCheckSubdomainRequiresASignedInUser(t *testing.T) {
	f := newProjectFixture(t, "active")
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	c.Params = gin.Params{{Key: "name", Value: "shop"}}

	f.handler(t, nil).CheckSubdomain(c)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", rec.Code)
	}
}
