package jobs

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
)

// loggedDeployment makes a deployment of project that is daysAgo old, in status,
// with lines log lines. It is not active unless status says so.
func (h *harness) loggedDeployment(project uuid.UUID, daysAgo int, status string, lines int) uuid.UUID {
	h.t.Helper()
	ctx := context.Background()
	subdomain := "shop"
	d, err := h.q.CreateDeployment(ctx, dbpkg.CreateDeploymentParams{
		ProjectID: project, Branch: "main", Cpu: 256, MemoryMb: 512, Port: 8080, HealthCheck: "/", Subdomain: &subdomain,
	})
	if err != nil {
		h.t.Fatal(err)
	}
	if _, err := h.pool.Exec(ctx,
		`UPDATE deployments SET status = 'live', created_at = now() - make_interval(days => $2) WHERE id = $1`, d.ID, daysAgo); err != nil {
		h.t.Fatal(err)
	}
	for i := range lines {
		if _, err := h.pool.Exec(ctx,
			`INSERT INTO deployment_logs (deployment_id, seq, line) VALUES ($1, $2, 'line')`, d.ID, i+1); err != nil {
			h.t.Fatal(err)
		}
	}
	if status != "live" {
		if _, err := h.pool.Exec(ctx, `UPDATE deployments SET status = $2 WHERE id = $1`, d.ID, status); err != nil {
			h.t.Fatal(err)
		}
	}
	return d.ID
}

func (h *harness) logLines(id uuid.UUID) int {
	h.t.Helper()
	var n int
	if err := h.pool.QueryRow(context.Background(), `SELECT count(*) FROM deployment_logs WHERE deployment_id = $1`, id).Scan(&n); err != nil {
		h.t.Fatal(err)
	}
	return n
}

func (h *harness) otherProject() uuid.UUID {
	h.t.Helper()
	subdomain := "blog"
	p, err := h.q.CreateProject(context.Background(), dbpkg.CreateProjectParams{
		UserID: h.project.UserID, RepoName: "octo/blog", RepoUrl: "https://github.com/octo/blog",
		Branch: "main", DockerfilePath: "Dockerfile", Port: 8080, Subdomain: &subdomain,
	})
	if err != nil {
		h.t.Fatal(err)
	}
	return p.ID
}

func TestPruningDeletesOnlyOldLogsOfFinishedDeploymentsBeyondTheNewestFew(t *testing.T) {
	h := newHarness(t)
	shop := h.project.ID

	// The project's newest five: one recent and four that are past retention
	// but still among the newest, so their logs stay.
	newest := []uuid.UUID{h.loggedDeployment(shop, 10, "live", 4)}
	for range KeptLogs - 1 {
		newest = append(newest, h.loggedDeployment(shop, 100, "live", 3))
	}
	// Older than those, so beyond the newest five, and past retention.
	oldFailed := h.loggedDeployment(shop, 200, "failed", 4)
	oldCanceled := h.loggedDeployment(shop, 201, "canceled", 4)
	oldLive := h.loggedDeployment(shop, 202, "live", 4)
	// Just as old, but not finished as far as anyone knows. Made last: only one
	// deployment of a project may be active.
	oldStuck := h.loggedDeployment(shop, 203, "building", 4)
	// Another project is counted on its own: its old deployment is among its newest five.
	blogOld := h.loggedDeployment(h.otherProject(), 365, "live", 4)

	removed, err := newPruneLogsWorker(h.deps).prune(context.Background(), time.Now().Add(-LogRetention))
	if err != nil {
		t.Fatal(err)
	}

	for name, id := range map[string]uuid.UUID{"failed": oldFailed, "canceled": oldCanceled, "live": oldLive} {
		if n := h.logLines(id); n != 0 {
			t.Errorf("old %s deployment still has %d lines", name, n)
		}
	}
	for name, id := range map[string]uuid.UUID{"unfinished": oldStuck, "other project's": blogOld} {
		if n := h.logLines(id); n != 4 {
			t.Errorf("the %s deployment has %d lines left, want 4", name, n)
		}
	}
	for i, id := range newest {
		want := 3
		if i == 0 {
			want = 4
		}
		if n := h.logLines(id); n != want {
			t.Errorf("one of the newest five has %d lines left, want %d", n, want)
		}
	}
	if removed != 12 {
		t.Errorf("removed %d lines, want 12", removed)
	}
}

func TestPruningWorksThroughALargeBacklogInBatches(t *testing.T) {
	h := newHarness(t)
	for range KeptLogs {
		h.loggedDeployment(h.project.ID, 1, "live", 1)
	}
	old := h.loggedDeployment(h.project.ID, 90, "live", 0)
	if _, err := h.pool.Exec(context.Background(),
		`INSERT INTO deployment_logs (deployment_id, seq, line) SELECT $1, g, 'x' FROM generate_series(1, $2) g`, old, pruneBatch*2+17); err != nil {
		t.Fatal(err)
	}

	removed, err := newPruneLogsWorker(h.deps).prune(context.Background(), time.Now().Add(-LogRetention))
	if err != nil {
		t.Fatal(err)
	}
	if removed != int64(pruneBatch*2+17) || h.logLines(old) != 0 {
		t.Errorf("removed %d lines, %d left; want all %d removed", removed, h.logLines(old), pruneBatch*2+17)
	}
}

func TestOldLogsArePrunedWhenTheRunnerStarts(t *testing.T) {
	h := newHarness(t)
	for range KeptLogs {
		h.loggedDeployment(h.project.ID, 1, "live", 1)
	}
	old := h.loggedDeployment(h.project.ID, 90, "live", 5)

	h.start()
	eventually(t, func() bool { return h.logLines(old) == 0 }, func() string {
		return "the old log was not pruned after the runner started"
	})
}
