package stream_test

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/YHQZ1/hatch/internal/store"
	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
	"github.com/YHQZ1/hatch/internal/store/storetest"
	"github.com/YHQZ1/hatch/internal/stream"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type fixture struct {
	pool       *pgxpool.Pool
	q          *dbpkg.Queries
	deployment dbpkg.Deployment
}

func newFixture(t *testing.T) fixture {
	t.Helper()
	url := storetest.NewDatabase(t)
	if _, err := store.Migrate(context.Background(), url); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	pool, err := store.Connect(context.Background(), url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(pool.Close)

	ctx := context.Background()
	q := dbpkg.New(pool)
	user, err := q.CreateUser(ctx, dbpkg.CreateUserParams{GithubID: 1, GithubUsername: "octo", AccessToken: "x"})
	if err != nil {
		t.Fatal(err)
	}
	sub := "shop"
	project, err := q.CreateProject(ctx, dbpkg.CreateProjectParams{
		UserID: user.ID, RepoName: "shop", RepoUrl: "https://github.com/octo/shop",
		Branch: "main", DockerfilePath: "Dockerfile", Port: 8080, Subdomain: &sub, HealthCheck: "/",
	})
	if err != nil {
		t.Fatal(err)
	}
	return fixture{pool: pool, q: q, deployment: newDeployment(t, q, project)}
}

func newDeployment(t *testing.T, q *dbpkg.Queries, project dbpkg.Project) dbpkg.Deployment {
	t.Helper()
	d, err := q.CreateDeployment(context.Background(), dbpkg.CreateDeploymentParams{
		ProjectID: project.ID, Branch: "main", Cpu: 256, MemoryMb: 512, Port: 8080, HealthCheck: "/", Subdomain: project.Subdomain,
	})
	if err != nil {
		t.Fatal(err)
	}
	return d
}

func lines(t *testing.T, f fixture, id uuid.UUID) []dbpkg.GetDeploymentLogsAfterRow {
	t.Helper()
	rows, err := f.q.GetDeploymentLogsAfter(context.Background(), dbpkg.GetDeploymentLogsAfterParams{DeploymentID: id, Seq: 0, Limit: 100000})
	if err != nil {
		t.Fatal(err)
	}
	return rows
}

func TestLinesAreNumberedWithoutGapsWhenWritersRace(t *testing.T) {
	f := newFixture(t)
	sink := stream.NewPostgres(f.pool)
	id := f.deployment.ID.String()

	const writers, each = 20, 25
	var wg sync.WaitGroup
	for w := 0; w < writers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < each; i++ {
				sink.Publish(context.Background(), id, fmt.Sprintf("writer %d line %d", w, i))
			}
		}()
	}
	wg.Wait()

	rows := lines(t, f, f.deployment.ID)
	if len(rows) != writers*each {
		t.Fatalf("stored %d lines, want %d", len(rows), writers*each)
	}
	for i, row := range rows {
		if row.Seq != int64(i+1) {
			t.Fatalf("line %d has seq %d: numbering has a gap or a repeat", i, row.Seq)
		}
	}
}

func TestEachWritersLinesKeepTheirOrder(t *testing.T) {
	f := newFixture(t)
	sink := stream.NewPostgres(f.pool)
	id := f.deployment.ID.String()
	for i := 0; i < 5; i++ {
		sink.Publish(context.Background(), id, fmt.Sprintf("line %d", i))
	}
	for i, row := range lines(t, f, f.deployment.ID) {
		if want := fmt.Sprintf("line %d", i); row.Line != want {
			t.Errorf("line %d = %q, want %q", i, row.Line, want)
		}
	}
}

func TestPublishStoresAfterTheCallersContextIsCanceled(t *testing.T) {
	f := newFixture(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	stream.NewPostgres(f.pool).Publish(ctx, f.deployment.ID.String(), "why the job stopped")
	if rows := lines(t, f, f.deployment.ID); len(rows) != 1 {
		t.Fatalf("stored %d lines, want 1: the last lines of a stopped job must be kept", len(rows))
	}
}

func TestPublishIgnoresWhatCannotBeStored(t *testing.T) {
	f := newFixture(t)
	sink := stream.NewPostgres(f.pool)
	// None of these may panic or block.
	sink.Publish(context.Background(), "not-a-uuid", "x")
	sink.Publish(context.Background(), uuid.NewString(), "a deployment that does not exist")
	sink.Publish(context.Background(), f.deployment.ID.String(), "nul \x00 byte and bad utf8 \xff")
	rows := lines(t, f, f.deployment.ID)
	if len(rows) != 1 || rows[0].Line != "nul  byte and bad utf8 �" {
		t.Fatalf("rows = %+v", rows)
	}
}

func waitFor(t *testing.T, wake <-chan struct{}, within time.Duration) bool {
	t.Helper()
	select {
	case <-wake:
		return true
	case <-time.After(within):
		return false
	}
}

func startBroker(t *testing.T, f fixture) *stream.Broker {
	t.Helper()
	b := stream.NewBroker(f.pool)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		_ = b.Run(ctx)
	}()
	t.Cleanup(func() {
		cancel()
		<-done
	})
	return b
}

func TestAWatcherIsWokenByItsOwnDeploymentOnly(t *testing.T) {
	f := newFixture(t)
	// A project may have only one active deployment, so finish the first.
	if err := f.q.SetDeploymentStatus(context.Background(), dbpkg.SetDeploymentStatusParams{ID: f.deployment.ID, Status: "live"}); err != nil {
		t.Fatal(err)
	}
	other := newDeployment(t, f.q, dbpkg.Project{ID: f.deployment.ProjectID, Subdomain: f.deployment.Subdomain})
	b := startBroker(t, f)
	mine, cancelMine := b.Subscribe(f.deployment.ID)
	defer cancelMine()
	theirs, cancelTheirs := b.Subscribe(other.ID)
	defer cancelTheirs()
	// The first wake-up says "LISTEN is on"; drain it.
	waitFor(t, mine, 2*time.Second)
	waitFor(t, theirs, 2*time.Second)

	stream.NewPostgres(f.pool).Publish(context.Background(), f.deployment.ID.String(), "hello")

	if !waitFor(t, mine, 3*time.Second) {
		t.Fatal("the deployment's watcher was not woken by a new log line")
	}
	if waitFor(t, theirs, 300*time.Millisecond) {
		t.Fatal("a watcher of another deployment was woken")
	}
}

func TestAWatcherIsWokenWhenTheStatusChanges(t *testing.T) {
	f := newFixture(t)
	b := startBroker(t, f)
	wake, cancel := b.Subscribe(f.deployment.ID)
	defer cancel()
	waitFor(t, wake, 2*time.Second)

	if err := f.q.SetDeploymentStatus(context.Background(), dbpkg.SetDeploymentStatusParams{ID: f.deployment.ID, Status: "building"}); err != nil {
		t.Fatal(err)
	}
	if !waitFor(t, wake, 3*time.Second) {
		t.Fatal("the watcher was not woken by a status change")
	}
}

func TestTheBrokerListensAgainAfterItsConnectionIsKilled(t *testing.T) {
	f := newFixture(t)
	b := startBroker(t, f)
	wake, cancel := b.Subscribe(f.deployment.ID)
	defer cancel()
	waitFor(t, wake, 2*time.Second)

	// Kill every other connection to this database: the listener's among them.
	if _, err := f.pool.Exec(context.Background(),
		`SELECT pg_terminate_backend(pid) FROM pg_stat_activity
		 WHERE datname = current_database() AND pid <> pg_backend_pid() AND query LIKE 'LISTEN%'`); err != nil {
		t.Fatal(err)
	}
	// Watchers are woken once it is back (they may have missed something) ...
	if !waitFor(t, wake, 5*time.Second) {
		t.Fatal("watchers were not woken after the listener reconnected")
	}
	// ... and what happens afterwards is heard again.
	stream.NewPostgres(f.pool).Publish(context.Background(), f.deployment.ID.String(), "after the reconnect")
	if !waitFor(t, wake, 3*time.Second) {
		t.Fatal("a new line was not heard after the reconnect")
	}
}
