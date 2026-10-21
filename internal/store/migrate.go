package store

import (
	"embed"
	"errors"
	"fmt"
	"strings"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5" // registers the pgx5 scheme
	"github.com/golang-migrate/migrate/v4/source/iofs"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

// Migrate applies every pending migration and returns the schema version the
// database is at afterwards. It is safe to call when nothing is pending.
func Migrate(databaseURL string) (uint, error) {
	source, err := iofs.New(migrationFiles, "migrations")
	if err != nil {
		return 0, fmt.Errorf("read embedded migrations: %w", err)
	}
	m, err := migrate.NewWithSourceInstance("iofs", source, migrateURL(databaseURL))
	if err != nil {
		return 0, fmt.Errorf("connect to the database: %w", err)
	}
	defer m.Close()

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return 0, fmt.Errorf("apply migrations: %w", err)
	}

	version, dirty, err := m.Version()
	if err != nil {
		return 0, fmt.Errorf("read the schema version: %w", err)
	}
	if dirty {
		return 0, fmt.Errorf("migration %d did not finish; fix the database by hand, then rerun", version)
	}
	return version, nil
}

// migrateURL turns a postgres:// URL into the scheme the pgx driver registers.
func migrateURL(databaseURL string) string {
	for _, scheme := range []string{"postgres://", "postgresql://"} {
		if strings.HasPrefix(databaseURL, scheme) {
			return "pgx5://" + strings.TrimPrefix(databaseURL, scheme)
		}
	}
	return databaseURL
}
