package handlers

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
	"github.com/YHQZ1/hatch/internal/stream"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	// logBatch is how many lines are read from the database at a time.
	logBatch = 500
	// keepAliveEvery is how often an idle stream sends a comment, so proxies
	// and browsers do not decide it is dead.
	keepAliveEvery = 15 * time.Second
	// recheckEvery is how often the stream looks at the database even if it
	// heard nothing: a wake-up is only a hint, and this is the safety net.
	recheckEvery = 5 * time.Second
	// reconnectAfter tells the browser how long to wait before it reconnects.
	reconnectAfter = 3 * time.Second
)

// LogStreamHandler serves a deployment's log as server-sent events (ADR 0012).
type LogStreamHandler struct {
	queries *dbpkg.Queries
	broker  *stream.Broker
	// stop ends every stream when it is closed, so shutting Hatch down does not
	// wait for browsers that still have a log open.
	stop <-chan struct{}
}

func NewLogStreamHandler(pool *pgxpool.Pool, broker *stream.Broker, stop <-chan struct{}) *LogStreamHandler {
	return &LogStreamHandler{queries: dbpkg.New(pool), broker: broker, stop: stop}
}

// Stream is GET /api/deployments/:id/logs/stream. It sends these events:
//
//	log     one line of the log; its id is the line's number
//	status  the deployment's status, when the stream starts and each time it changes
//	end     the deployment reached a final status and every line has been sent
//
// A browser that reconnects sends the number of the last line it saw in
// Last-Event-ID (or ?after=) and gets only what came after. The stream ends by
// itself once the deployment is finished, which is also how a finished
// deployment's whole log is read.
func (h *LogStreamHandler) Stream(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if _, err := h.queries.GetDeploymentByIDAndUserID(c.Request.Context(), dbpkg.GetDeploymentByIDAndUserIDParams{
		ID: id, UserID: userID,
	}); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "deployment not found"})
		return
	}
	after, err := lastSeen(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	w := c.Writer
	// The server gives every response 30 seconds to be written; a stream lasts as
	// long as the build does.
	if err := http.NewResponseController(w).SetWriteDeadline(time.Time{}); err != nil {
		slog.WarnContext(c.Request.Context(), "could not lift the write deadline for a log stream", "error", err)
	}
	header := w.Header()
	header.Set("Content-Type", "text/event-stream")
	header.Set("Cache-Control", "no-cache, no-transform")
	// Proxies that buffer would hold lines back until the stream ends.
	header.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	if _, err := fmt.Fprintf(w, "retry: %d\n\n", reconnectAfter.Milliseconds()); err != nil {
		return
	}
	w.Flush()

	// Subscribe before reading anything, so a line written in between still wakes us.
	wake, unsubscribe := h.broker.Subscribe(id)
	defer unsubscribe()

	ctx := c.Request.Context()
	tick := time.NewTicker(recheckEvery)
	defer tick.Stop()
	lastStatus := ""
	lastWrite := time.Now()

	for {
		// The status is read before the lines. If it is final, every line written
		// before it was set is among the lines read next, so none is cut off.
		status, err := h.queries.GetDeploymentStatus(ctx, id)
		if err != nil {
			// The deployment is gone (its project was deleted) or the database is
			// down; the browser will reconnect and find out which.
			if !errors.Is(err, pgx.ErrNoRows) && ctx.Err() == nil {
				slog.WarnContext(ctx, "log stream could not read the deployment", "deployment_id", id, "error", err)
			}
			return
		}
		if status != lastStatus {
			if err := writeEvent(w, 0, "status", status); err != nil {
				return
			}
			lastStatus, lastWrite = status, time.Now()
		}

		rows, err := h.queries.GetDeploymentLogsAfter(ctx, dbpkg.GetDeploymentLogsAfterParams{
			DeploymentID: id, Seq: after, Limit: logBatch,
		})
		if err != nil {
			if ctx.Err() == nil {
				slog.WarnContext(ctx, "log stream could not read lines", "deployment_id", id, "error", err)
			}
			return
		}
		for _, row := range rows {
			if err := writeEvent(w, row.Seq, "log", row.Line); err != nil {
				return
			}
			after = row.Seq
			lastWrite = time.Now()
		}
		w.Flush()
		// More may be waiting (a full batch), and a finished deployment needs one
		// more look to confirm it has been sent everything and say so.
		if len(rows) == logBatch || (len(rows) > 0 && isFinalStatus(status)) {
			continue
		}
		if isFinalStatus(status) {
			_ = writeEvent(w, 0, "end", status)
			w.Flush()
			return
		}

		select {
		case <-ctx.Done():
			return
		case <-h.stop:
			return
		case <-wake:
		case <-tick.C:
			if time.Since(lastWrite) >= keepAliveEvery {
				if _, err := fmt.Fprint(w, ": keep-alive\n\n"); err != nil {
					return
				}
				w.Flush()
				lastWrite = time.Now()
			}
		}
	}
}

// lastSeen is the number of the last line the client has: from the
// Last-Event-ID header a reconnecting browser sends, else ?after=, else 0.
func lastSeen(c *gin.Context) (int64, error) {
	raw := c.GetHeader("Last-Event-ID")
	if raw == "" {
		raw = c.Query("after")
	}
	if raw == "" {
		return 0, nil
	}
	n, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || n < 0 {
		return 0, errors.New("the last line seen must be a whole number, 0 or more")
	}
	return n, nil
}

func isFinalStatus(status string) bool {
	switch strings.ToLower(status) {
	case "live", "failed", "canceled", "cancelled", "error":
		return true
	}
	return false
}

// writeEvent writes one server-sent event. A line with newlines in it is sent as
// several data fields, which the browser joins back together.
func writeEvent(w http.ResponseWriter, id int64, event, data string) error {
	var b strings.Builder
	if id > 0 {
		fmt.Fprintf(&b, "id: %d\n", id)
	}
	fmt.Fprintf(&b, "event: %s\n", event)
	for _, part := range strings.Split(strings.NewReplacer("\r\n", "\n", "\r", "\n").Replace(data), "\n") {
		fmt.Fprintf(&b, "data: %s\n", part)
	}
	b.WriteString("\n")
	_, err := fmt.Fprint(w, b.String())
	return err
}
