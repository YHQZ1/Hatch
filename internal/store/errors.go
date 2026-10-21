package store

import (
	"errors"

	"github.com/jackc/pgx/v5/pgconn"
)

// Postgres error codes (https://www.postgresql.org/docs/current/errcodes-appendix.html).
const (
	codeUniqueViolation = "23505"
)

// IsUniqueViolation reports whether err is Postgres rejecting a row because it
// would duplicate a unique value, for example a subdomain already in use.
func IsUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == codeUniqueViolation
}
