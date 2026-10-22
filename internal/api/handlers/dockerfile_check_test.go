package handlers

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// checkDockerfile asks the handler about owner/repo's Dockerfile at path.
func checkDockerfile(t *testing.T, h *GitHubHandler, path string) (int, dockerfileCheckResponse) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	user := uuid.NewString()
	router := gin.New()
	router.GET("/repos/:owner/:repo/dockerfile", func(c *gin.Context) {
		c.Set("user_id", user)
		h.CheckDockerfile(c)
	})
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest("GET", "/repos/octo/shop/dockerfile?path="+path, nil))
	var body dockerfileCheckResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	return rec.Code, body
}

func TestTheSameUserAsksGitHubOnceForTheSameDockerfile(t *testing.T) {
	var calls atomic.Int32
	github := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{
			"encoding": "base64",
			"content":  base64.StdEncoding.EncodeToString([]byte("FROM alpine\nEXPOSE 3000\n")),
		})
	}))
	defer github.Close()

	h := NewGitHubHandler()
	h.apiURL = github.URL
	h.token = func(*gin.Context) (string, bool) { return "t", true }
	gin.SetMode(gin.TestMode)
	user := uuid.NewString()
	router := gin.New()
	router.GET("/repos/:owner/:repo/dockerfile", func(c *gin.Context) {
		c.Set("user_id", user)
		h.CheckDockerfile(c)
	})
	get := func(path string) dockerfileCheckResponse {
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, httptest.NewRequest("GET", "/repos/octo/shop/dockerfile?path="+path, nil))
		var body dockerfileCheckResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || rec.Code != http.StatusOK {
			t.Fatalf("status %d, body %s", rec.Code, rec.Body)
		}
		return body
	}

	first, second := get("Dockerfile"), get("Dockerfile")
	if !first.Exists || len(first.Ports) != 1 || first.Ports[0] != 3000 || second.Ports[0] != 3000 {
		t.Fatalf("answers %+v and %+v", first, second)
	}
	if calls.Load() != 1 {
		t.Fatalf("GitHub was asked %d times for the same Dockerfile, want 1", calls.Load())
	}
	get("api/Dockerfile")
	if calls.Load() != 2 {
		t.Fatalf("a different folder was served from the cache (%d calls)", calls.Load())
	}
}

func TestAMissingDockerfileIsAskedAboutEachTime(t *testing.T) {
	var calls atomic.Int32
	github := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusNotFound)
	}))
	defer github.Close()

	h := NewGitHubHandler()
	h.apiURL = github.URL
	h.token = func(*gin.Context) (string, bool) { return "t", true }

	// Not remembered: the user is about to fix it and check again.
	for i := 0; i < 2; i++ {
		if status, body := checkDockerfile(t, h, "Dockerfile"); status != http.StatusNotFound || body.Exists {
			t.Fatalf("status %d, body %+v", status, body)
		}
	}
	if calls.Load() != 2 {
		t.Fatalf("GitHub was asked %d times, want 2", calls.Load())
	}
}
