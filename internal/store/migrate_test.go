package store

import (
	"context"
	"database/sql"
	"strings"
	"testing"

	"github.com/YHQZ1/hatch/internal/store/storetest"
)

func migrationCount(t *testing.T) uint {
	t.Helper()
	entries, err := migrationFiles.ReadDir("migrations")
	if err != nil {
		t.Fatal(err)
	}
	var n uint
	for _, entry := range entries {
		if strings.HasSuffix(entry.Name(), ".up.sql") {
			n++
		}
	}
	return n
}

func TestMigrateAppliesEveryMigrationAndIsRepeatable(t *testing.T) {
	url := storetest.NewDatabase(t)
	want := migrationCount(t)
	if want == 0 {
		t.Fatal("no embedded migrations found")
	}

	for run := 1; run <= 2; run++ {
		version, err := Migrate(context.Background(), url)
		if err != nil {
			t.Fatalf("run %d: %v", run, err)
		}
		if version != want {
			t.Fatalf("run %d: version = %d, want %d", run, version, want)
		}
	}

	db, err := sql.Open("pgx", url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, table := range []string{"users", "projects", "deployments", "project_env_vars", "webhook_deliveries"} {
		var exists bool
		err := db.QueryRow(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)`, table).Scan(&exists)
		if err != nil || !exists {
			t.Errorf("table %s missing after migrating (err=%v)", table, err)
		}
	}
}

func TestMigrateReportsAnUnreachableDatabase(t *testing.T) {
	_, err := Migrate(context.Background(), "postgres://nobody@127.0.0.1:1/none?sslmode=disable&connect_timeout=1")
	if err == nil {
		t.Fatal("expected an error")
	}
}

func TestMigrateURL(t *testing.T) {
	for in, want := range map[string]string{
		"postgres://u:p@h:5432/db?sslmode=disable": "pgx5://u:p@h:5432/db?sslmode=disable",
		"postgresql://u@h/db":                      "pgx5://u@h/db",
		"pgx5://already@h/db":                      "pgx5://already@h/db",
	} {
		if got := migrateURL(in); got != want {
			t.Errorf("migrateURL(%q) = %q, want %q", in, got, want)
		}
	}
}
