package store

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"strings"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5" // registers the pgx5 scheme
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivermigrate"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

// Migrate applies every pending migration and returns the schema version the
// database is at afterwards. River's tables come first, because Hatch's own
// migrations may refer to them. It is safe to call when nothing is pending.
func Migrate(ctx context.Context, databaseURL string) (uint, error) {
	if err := migrateRiver(ctx, databaseURL); err != nil {
		return 0, err
	}
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

// migrateRiver creates or upgrades the tables the job runner keeps its jobs in.
func migrateRiver(ctx context.Context, databaseURL string) error {
	pool, err := Connect(ctx, databaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	migrator, err := rivermigrate.New(riverpgxv5.New(pool), nil)
	if err != nil {
		return fmt.Errorf("prepare job table migrations: %w", err)
	}
	if _, err := migrator.Migrate(ctx, rivermigrate.DirectionUp, nil); err != nil {
		return fmt.Errorf("apply job table migrations: %w", err)
	}
	return nil
}
