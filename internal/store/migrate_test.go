package store

import (
	"context"
	"database/sql"
	"strings"
	"testing"

	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
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

// The health-check migration gives each existing project what its latest
// deployment used. Its file is repeatable, so it is run again here over data
// that looks like what the old schema left behind.
func TestHealthCheckMigrationBackfillsFromTheLatestDeployment(t *testing.T) {
	q, pool := newQueries(t)
	ctx := context.Background()
	user := createUser(t, q, 1, "alice")
	project := createProject(t, q, user, "shop")

	for _, check := range []string{"/old", "/latest"} {
		if _, err := q.CreateDeployment(ctx, dbpkg.CreateDeploymentParams{
			ProjectID: project.ID, Branch: "main", Cpu: 256, MemoryMb: 512, Port: 8080,
			HealthCheck: check, Subdomain: project.Subdomain,
		}); err != nil {
			t.Fatal(err)
		}
		// Only one deployment may be active at a time.
		if _, err := pool.Exec(ctx, `UPDATE deployments SET status = 'live' WHERE project_id = $1`, project.ID); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pool.Exec(ctx, `UPDATE projects SET health_check = '/' WHERE id = $1`, project.ID); err != nil {
		t.Fatal(err)
	}

	file, err := migrationFiles.ReadFile("migrations/000013_project_health_check.up.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, string(file)); err != nil {
		t.Fatalf("run the migration again: %v", err)
	}

	got, err := q.GetProjectByID(ctx, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.HealthCheck != "/latest" {
		t.Errorf("health_check = %q, want /latest", got.HealthCheck)
	}
}
