package handlers

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"

	"github.com/YHQZ1/hatch/internal/jobs"
	"github.com/YHQZ1/hatch/internal/secrets"
	"github.com/YHQZ1/hatch/internal/store"
	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
	"github.com/YHQZ1/hatch/internal/store/storetest"
)

type failingInserter struct{}

func (failingInserter) InsertTx(context.Context, pgx.Tx, river.JobArgs, *river.InsertOpts) (*rivertype.JobInsertResult, error) {
	return nil, errors.New("job table unavailable")
}

type projectFixture struct {
	pool    *pgxpool.Pool
	q       *dbpkg.Queries
	user    dbpkg.User
	project dbpkg.Project
}

func newProjectFixture(t *testing.T, status string) projectFixture {
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
	project, err := q.CreateProject(ctx, dbpkg.CreateProjectParams{
		UserID: user.ID, RepoName: "octo/shop", RepoUrl: "https://github.com/octo/shop",
		Branch: "main", DockerfilePath: "Dockerfile", Port: 8080, Subdomain: ptr("shop"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if status != project.Status {
		if err := q.SetProjectStatus(ctx, dbpkg.SetProjectStatusParams{ID: project.ID, Status: status}); err != nil {
			t.Fatal(err)
		}
	}
	return projectFixture{pool: pool, q: q, user: user, project: project}
}

func (f projectFixture) call(t *testing.T, handler gin.HandlerFunc) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/", nil)
	c.Set("user_id", f.user.ID.String())
	c.Params = gin.Params{{Key: "id", Value: f.project.ID.String()}}
	handler(c)
	return rec
}

func (f projectFixture) jobKinds(t *testing.T) []string {
	t.Helper()
	rows, err := f.pool.Query(context.Background(), `SELECT kind FROM river_job ORDER BY id`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var kinds []string
	for rows.Next() {
		var kind string
		if err := rows.Scan(&kind); err != nil {
			t.Fatal(err)
		}
		kinds = append(kinds, kind)
	}
	return kinds
}

func (f projectFixture) handler(t *testing.T, inserter jobs.Inserter) *ProjectHandler {
	t.Helper()
	codec, err := secrets.NewCodec(strings.Repeat("k", 32))
	if err != nil {
		t.Fatal(err)
	}
	return NewProjectHandler(f.pool, inserter, "", codec)
}

func TestSuspendingAProjectQueuesTheScaleJobWithTheStatusChange(t *testing.T) {
	f := newProjectFixture(t, "active")
	inserter, err := jobs.NewInserter(f.pool)
	if err != nil {
		t.Fatal(err)
	}

	rec := f.call(t, f.handler(t, inserter).SuspendProject)

	if rec.Code != http.StatusAccepted {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body)
	}
	if got, _ := f.q.GetProjectByID(context.Background(), f.project.ID); got.Status != "suspending" {
		t.Errorf("project status = %q, want suspending", got.Status)
	}
	if kinds := f.jobKinds(t); len(kinds) != 1 || kinds[0] != "scale" {
		t.Errorf("jobs = %v, want one scale job", kinds)
	}
}

func TestAProjectIsNotSuspendedWhenItsJobCannotBeQueued(t *testing.T) {
	f := newProjectFixture(t, "active")

	rec := f.call(t, f.handler(t, failingInserter{}).SuspendProject)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
	if got, _ := f.q.GetProjectByID(context.Background(), f.project.ID); got.Status != "active" {
		t.Errorf("project status = %q, want active: the change must roll back with the job", got.Status)
	}
}

func TestDeletingAProjectQueuesTheCleanupJobWithTheStatusChange(t *testing.T) {
	f := newProjectFixture(t, "active")
	inserter, err := jobs.NewInserter(f.pool)
	if err != nil {
		t.Fatal(err)
	}

	rec := f.call(t, f.handler(t, inserter).DeleteProject)

	if rec.Code != http.StatusAccepted {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body)
	}
	if got, _ := f.q.GetProjectByID(context.Background(), f.project.ID); got.Status != "deleting" {
		t.Errorf("project status = %q, want deleting", got.Status)
	}
	if kinds := f.jobKinds(t); len(kinds) != 1 || kinds[0] != "destroy_app" {
		t.Errorf("jobs = %v, want one destroy_app job", kinds)
	}
}

func TestAProjectIsNotMarkedDeletingWhenItsJobCannotBeQueued(t *testing.T) {
	f := newProjectFixture(t, "active")

	rec := f.call(t, f.handler(t, failingInserter{}).DeleteProject)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
	if got, _ := f.q.GetProjectByID(context.Background(), f.project.ID); got.Status != "active" {
		t.Errorf("project status = %q, want active", got.Status)
	}
}
