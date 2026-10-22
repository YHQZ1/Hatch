package stream

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"
	"unicode/utf8"

	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	// MaxLines is how many lines one deployment's log keeps. The last one says
	// the log was cut, so a runaway build cannot fill the database.
	MaxLines = 20000
	// MaxLineBytes is how long one line may be before it is cut.
	MaxLineBytes = 8192

	limitLine = "[log limit reached: later output is not kept]"
	// A write that is waiting on the database gives up after this long, so a
	// slow database never holds up a build.
	writeTimeout = 5 * time.Second
)

// Postgres is a Sink that stores each line in the deployment_logs table. A
// trigger there wakes whoever is watching the deployment (see Broker), so this
// works across processes: a worker writes, the API streams.
type Postgres struct {
	queries *dbpkg.Queries
}

func NewPostgres(pool *pgxpool.Pool) *Postgres {
	return &Postgres{queries: dbpkg.New(pool)}
}

// Publish stores one line. It never fails its caller: a line that cannot be
// stored is logged and dropped. It still writes if ctx was canceled, so the
// last lines of a stopped job (why it stopped) are kept.
func (p *Postgres) Publish(ctx context.Context, deploymentID, line string) {
	id, err := uuid.Parse(deploymentID)
	if err != nil {
		slog.Warn("log line for an invalid deployment id dropped", "deployment_id", deploymentID)
		return
	}
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), writeTimeout)
	defer cancel()

	_, err = p.queries.AppendDeploymentLog(ctx, dbpkg.AppendDeploymentLogParams{
		DeploymentID: id,
		Line:         clean(line),
		MaxLines:     MaxLines,
		LimitLine:    limitLine,
	})
	// No row comes back once the log is full; that is the limit, not a failure.
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		slog.Warn("could not store a deployment log line", "deployment_id", deploymentID, "error", err)
	}
}

// clean makes a line safe to store: valid UTF-8, no NUL bytes (Postgres text
// cannot hold them), and no longer than MaxLineBytes.
func clean(line string) string {
	line = strings.ToValidUTF8(strings.ReplaceAll(line, "\x00", ""), "�")
	if len(line) <= MaxLineBytes {
		return line
	}
	cut := MaxLineBytes
	for cut > 0 && !utf8.RuneStart(line[cut]) {
		cut--
	}
	return line[:cut] + "…"
}
