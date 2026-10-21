// Package storetest gives tests a real, empty Postgres database.
package storetest

import (
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	_ "github.com/lib/pq"
)

// EnvVar names the variable holding a Postgres URL the tests may create
// databases in. It needs a role allowed to create and drop databases.
const EnvVar = "HATCH_TEST_DATABASE_URL"

var counter atomic.Int64

// NewDatabase creates an empty database for one test and returns its URL. The
// database is dropped when the test ends. The test is skipped when EnvVar is
// not set, so `go test` works without Postgres; CI sets it.
func NewDatabase(t *testing.T) string {
	t.Helper()
	adminURL := os.Getenv(EnvVar)
	if adminURL == "" {
		t.Skipf("%s is not set; skipping the test that needs Postgres", EnvVar)
	}

	admin, err := sql.Open("postgres", adminURL)
	if err != nil {
		t.Fatalf("open admin connection: %v", err)
	}
	t.Cleanup(func() { _ = admin.Close() })

	name := fmt.Sprintf("hatch_test_%d_%d", time.Now().UnixNano(), counter.Add(1))
	if _, err := admin.Exec(`CREATE DATABASE "` + name + `"`); err != nil {
		t.Fatalf("create database: %v", err)
	}
	t.Cleanup(func() {
		if _, err := admin.Exec(`DROP DATABASE IF EXISTS "` + name + `" WITH (FORCE)`); err != nil {
			t.Errorf("drop database %s: %v", name, err)
		}
	})

	u, err := url.Parse(adminURL)
	if err != nil {
		t.Fatalf("parse %s: %v", EnvVar, err)
	}
	u.Path = "/" + strings.TrimPrefix(name, "/")
	return u.String()
}
