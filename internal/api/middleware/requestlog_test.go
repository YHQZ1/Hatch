package middleware

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/YHQZ1/hatch/internal/logging"
)

// logRecords runs one request through the middleware and returns the JSON log
// lines it produced, plus the response.
func logRecords(t *testing.T, level string, setup func(r *gin.Engine), req *http.Request) ([]map[string]any, *httptest.ResponseRecorder) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	var buf bytes.Buffer
	logging.Setup(&buf, "production", level)

	r := gin.New()
	r.Use(RequestID(), AccessLog(), Recovery())
	setup(r)

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	var records []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
		if line == "" {
			continue
		}
		var record map[string]any
		if err := json.Unmarshal([]byte(line), &record); err != nil {
			t.Fatalf("log line is not JSON: %q", line)
		}
		records = append(records, record)
	}
	return records, rec
}

func TestRequestIDIsGeneratedAndReturned(t *testing.T) {
	records, rec := logRecords(t, "", func(r *gin.Engine) {
		r.GET("/ping", func(c *gin.Context) { c.String(200, "pong") })
	}, httptest.NewRequest(http.MethodGet, "/ping", nil))

	id := rec.Header().Get(RequestIDHeader)
	if len(id) != 16 {
		t.Fatalf("generated request ID = %q, want 16 hex characters", id)
	}
	if len(records) != 1 || records[0]["request_id"] != id {
		t.Fatalf("log record = %v, want request_id %q", records, id)
	}
}

func TestRequestIDKeepsAPlainCallerValueAndReplacesOthers(t *testing.T) {
	for header, keep := range map[string]bool{
		"trace-abc_123.x":       true,
		"has space":             false,
		"semi;colon":            false,
		strings.Repeat("a", 65): false,
		"newline\ninjected":     false,
	} {
		req := httptest.NewRequest(http.MethodGet, "/ping", nil)
		req.Header.Set(RequestIDHeader, header)
		_, rec := logRecords(t, "", func(r *gin.Engine) {
			r.GET("/ping", func(c *gin.Context) { c.String(200, "pong") })
		}, req)

		got := rec.Header().Get(RequestIDHeader)
		if keep && got != header {
			t.Errorf("%q should be kept, got %q", header, got)
		}
		if !keep && got == header {
			t.Errorf("%q should be replaced", header)
		}
	}
}

func TestAccessLogFields(t *testing.T) {
	records, _ := logRecords(t, "", func(r *gin.Engine) {
		r.GET("/api/projects/:id", func(c *gin.Context) {
			c.Set("user_id", "u-42")
			c.JSON(200, gin.H{"ok": true})
		})
	}, httptest.NewRequest(http.MethodGet, "/api/projects/p1?code=SECRET&state=x", nil))

	if len(records) != 1 {
		t.Fatalf("records = %v", records)
	}
	rec := records[0]
	want := map[string]any{
		"msg": "request", "level": "INFO", "method": "GET", "path": "/api/projects/p1",
		"route": "/api/projects/:id", "status": float64(200), "user_id": "u-42",
	}
	for key, value := range want {
		if rec[key] != value {
			t.Errorf("%s = %v, want %v", key, rec[key], value)
		}
	}
	for _, key := range []string{"duration_ms", "bytes", "client_ip", "request_id"} {
		if _, ok := rec[key]; !ok {
			t.Errorf("record lacks %s: %v", key, rec)
		}
	}
	if encoded, _ := json.Marshal(rec); strings.Contains(string(encoded), "SECRET") {
		t.Fatalf("the query string leaked into the log: %s", encoded)
	}
}

func TestAccessLogLevelsFollowTheStatus(t *testing.T) {
	cases := []struct {
		path   string
		status int
		want   string
	}{
		{"/ok", 200, "INFO"},
		{"/missing", 404, "WARN"},
		{"/broken", 503, "ERROR"},
	}
	for _, tc := range cases {
		records, _ := logRecords(t, "", func(r *gin.Engine) {
			r.GET(tc.path, func(c *gin.Context) { c.Status(tc.status) })
		}, httptest.NewRequest(http.MethodGet, tc.path, nil))
		if len(records) != 1 || records[0]["level"] != tc.want {
			t.Errorf("%s: records = %v, want level %s", tc.path, records, tc.want)
		}
	}
}

func TestHealthChecksAndAssetsAreOnlyLoggedAtDebug(t *testing.T) {
	setup := func(r *gin.Engine) {
		r.GET("/health", func(c *gin.Context) { c.String(200, "ok") })
		r.GET("/assets/app.js", func(c *gin.Context) { c.String(200, "js") })
	}
	for _, path := range []string{"/health", "/assets/app.js"} {
		quiet, _ := logRecords(t, "info", setup, httptest.NewRequest(http.MethodGet, path, nil))
		if len(quiet) != 0 {
			t.Errorf("%s was logged at info: %v", path, quiet)
		}
		verbose, _ := logRecords(t, "debug", setup, httptest.NewRequest(http.MethodGet, path, nil))
		if len(verbose) != 1 || verbose[0]["level"] != "DEBUG" {
			t.Errorf("%s at debug: %v", path, verbose)
		}
	}
}

func TestRecoveryReturns500AndLogsThePanic(t *testing.T) {
	records, rec := logRecords(t, "", func(r *gin.Engine) {
		r.GET("/boom", func(c *gin.Context) { panic("something broke") })
	}, httptest.NewRequest(http.MethodGet, "/boom", nil))

	if rec.Code != http.StatusInternalServerError || !strings.Contains(rec.Body.String(), "internal server error") {
		t.Fatalf("response = %d %q", rec.Code, rec.Body.String())
	}
	var panicRecord map[string]any
	for _, record := range records {
		if record["msg"] == "panic while handling a request" {
			panicRecord = record
		}
	}
	if panicRecord == nil {
		t.Fatalf("no panic record in %v", records)
	}
	if panicRecord["panic"] != "something broke" || panicRecord["level"] != "ERROR" ||
		panicRecord["request_id"] == nil || !strings.Contains(panicRecord["stack"].(string), "requestlog_test.go") {
		t.Errorf("panic record = %v", panicRecord)
	}
}
