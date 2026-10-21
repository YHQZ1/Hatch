package logging

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"log/slog"
	"strings"
	"testing"
)

func TestProductionLogsJSON(t *testing.T) {
	var buf bytes.Buffer
	Setup(&buf, "production", "")

	slog.Info("deployment started", "deployment_id", "d1", "attempt", 2)

	var line map[string]any
	if err := json.Unmarshal(buf.Bytes(), &line); err != nil {
		t.Fatalf("output is not JSON: %v\n%s", err, buf.String())
	}
	if line["msg"] != "deployment started" || line["level"] != "INFO" ||
		line["deployment_id"] != "d1" || line["attempt"] != float64(2) {
		t.Fatalf("unexpected fields: %v", line)
	}
}

func TestDevelopmentLogsReadableText(t *testing.T) {
	var buf bytes.Buffer
	Setup(&buf, "development", "")

	slog.Warn("slow query", "ms", 1200)

	out := buf.String()
	if strings.HasPrefix(strings.TrimSpace(out), "{") {
		t.Fatalf("expected text output, got JSON: %s", out)
	}
	for _, want := range []string{"level=WARN", `msg="slow query"`, "ms=1200"} {
		if !strings.Contains(out, want) {
			t.Errorf("output %q lacks %q", out, want)
		}
	}
}

func TestLevelFiltersRecords(t *testing.T) {
	for level, wantDebug := range map[string]bool{"debug": true, "info": false, "": false, "nonsense": false} {
		var buf bytes.Buffer
		Setup(&buf, "production", level)
		slog.Debug("detail")
		if got := buf.Len() > 0; got != wantDebug {
			t.Errorf("level %q: debug logged = %v, want %v", level, got, wantDebug)
		}
	}

	var buf bytes.Buffer
	Setup(&buf, "production", "error")
	slog.Warn("quiet")
	slog.Error("loud")
	if strings.Contains(buf.String(), "quiet") || !strings.Contains(buf.String(), "loud") {
		t.Fatalf("error level output = %q", buf.String())
	}
}

func TestContextAttributesAreAddedToRecords(t *testing.T) {
	var buf bytes.Buffer
	Setup(&buf, "production", "")

	ctx := WithAttrs(context.Background(), slog.String("request_id", "abc123"))
	ctx = WithAttrs(ctx, slog.String("user_id", "u1"))
	slog.InfoContext(ctx, "handled")
	slog.Info("outside a request")

	lines := strings.Split(strings.TrimSpace(buf.String()), "\n")
	var first, second map[string]any
	_ = json.Unmarshal([]byte(lines[0]), &first)
	_ = json.Unmarshal([]byte(lines[1]), &second)
	if first["request_id"] != "abc123" || first["user_id"] != "u1" {
		t.Errorf("request line lacks context attributes: %v", first)
	}
	if _, has := second["request_id"]; has {
		t.Errorf("a line logged without the context must not carry request_id: %v", second)
	}
}

func TestContextAttributesSurviveLoggerWith(t *testing.T) {
	var buf bytes.Buffer
	logger := Setup(&buf, "production", "").With("component", "api")

	logger.InfoContext(WithAttrs(context.Background(), slog.String("request_id", "r1")), "x")

	var line map[string]any
	_ = json.Unmarshal(buf.Bytes(), &line)
	if line["component"] != "api" || line["request_id"] != "r1" {
		t.Fatalf("fields = %v", line)
	}
}

func TestStandardLogOutputGoesThroughTheHandler(t *testing.T) {
	var buf bytes.Buffer
	Setup(&buf, "production", "")

	log.Printf("old style message %d", 7)

	var line map[string]any
	if err := json.Unmarshal(buf.Bytes(), &line); err != nil {
		t.Fatalf("standard log output is not JSON: %v\n%s", err, buf.String())
	}
	if line["msg"] != "old style message 7" {
		t.Fatalf("msg = %v", line["msg"])
	}
}
