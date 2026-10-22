package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/YHQZ1/hatch/internal/jobs"
	"github.com/YHQZ1/hatch/internal/secrets"
	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
	"github.com/YHQZ1/hatch/internal/stream"
)

// rollbackFixture is a project with releases the user can roll back to.
type rollbackFixture struct {
	projectFixture
	handler *DeploymentHandler
}

func newRollbackFixture(t *testing.T) rollbackFixture {
	t.Helper()
	f := newProjectFixture(t, "active")
	inserter, err := jobs.NewInserter(f.pool)
	if err != nil {
		t.Fatal(err)
	}
	codec, err := secrets.NewCodec(strings.Repeat("k", 32))
	if err != nil {
		t.Fatal(err)
	}
	return rollbackFixture{projectFixture: f, handler: NewDeploymentHandler(f.pool, inserter, stream.Discard{}, codec)}
}

// release adds a deployment of the project that went live with its own image,
// hoursAgo hours ago, with one environment variable.
func (f rollbackFixture) release(t *testing.T, hoursAgo int, value string) dbpkg.Deployment {
	t.Helper()
	ctx := context.Background()
	d, err := f.q.CreateDeployment(ctx, dbpkg.CreateDeploymentParams{
		ProjectID: f.project.ID, Branch: "main", Cpu: 256, MemoryMb: 512, Port: 8080, HealthCheck: "/health", Subdomain: f.project.Subdomain,
		CommitSha: ptr("abcdef1234567"), CommitMessage: ptr("Ship it"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.q.CreateEnvVar(ctx, dbpkg.CreateEnvVarParams{DeploymentID: d.ID, Key: "API_KEY", Value: "sealed-" + value}); err != nil {
		t.Fatal(err)
	}
	image := "hatch-local:" + d.ID.String()
	if _, err := f.q.FinishDeployment(ctx, dbpkg.FinishDeploymentParams{ID: d.ID, ImageUri: &image}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, `UPDATE deployments SET created_at = now() - make_interval(hours => $2) WHERE id = $1`, d.ID, hoursAgo); err != nil {
		t.Fatal(err)
	}
	got, err := f.q.GetDeploymentByID(ctx, d.ID)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

func (f rollbackFixture) rollback(t *testing.T, id string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/", nil)
	c.Set("user_id", f.user.ID.String())
	c.Params = gin.Params{{Key: "id", Value: id}}
	f.handler.RollbackDeployment(c)
	return rec
}

func TestRollingBackCopiesTheReleaseAndQueuesOnlyADeploy(t *testing.T) {
	f := newRollbackFixture(t)
	old := f.release(t, 48, "old")
	f.release(t, 1, "new") // the release that runs now

	rec := f.rollback(t, old.ID.String())

	if rec.Code != http.StatusCreated {
		t.Fatalf("status %d, body %s", rec.Code, rec.Body)
	}
	var made DeploymentResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &made); err != nil {
		t.Fatal(err)
	}
	if made.ID == old.ID.String() || made.Status != "queued" {
		t.Errorf("response = %+v, want a new queued deployment", made)
	}
	if made.ImageURI == nil || *made.ImageURI != *old.ImageUri {
		t.Errorf("image = %v, want the old release's %v", made.ImageURI, *old.ImageUri)
	}
	if made.HealthCheck != "/health" || made.Port != 8080 || made.CommitSHA == nil || *made.CommitSHA != "abcdef1234567" {
		t.Errorf("settings not copied: %+v", made)
	}

	madeID := uuid.MustParse(made.ID)
	vars, err := f.q.GetEnvVarsByDeployment(context.Background(), madeID)
	if err != nil || len(vars) != 1 || vars[0].Key != "API_KEY" || vars[0].Value != "sealed-old" {
		t.Errorf("environment = %+v, %v, want the old release's, as stored", vars, err)
	}
	if kinds := f.jobKinds(t); len(kinds) != 1 || kinds[0] != "deploy" {
		t.Errorf("jobs = %v, want one deploy job and no build", kinds)
	}
	var args struct {
		RollbackOf string `json:"rollback_of"`
		ImageURI   string `json:"image_uri"`
	}
	if err := f.pool.QueryRow(context.Background(), `SELECT args FROM river_job WHERE kind = 'deploy'`).Scan(&args); err != nil {
		t.Fatal(err)
	}
	if args.RollbackOf != old.ID.String() || args.ImageURI != *old.ImageUri {
		t.Errorf("job args = %+v", args)
	}
}

func TestARollbackIsRefusedWhenItCannotWork(t *testing.T) {
	ctx := context.Background()
	tests := []struct {
		name  string
		setup func(t *testing.T, f rollbackFixture) string // returns the deployment id to roll back to
		want  int
		text  string
	}{
		{"the release that is running now", func(t *testing.T, f rollbackFixture) string {
			f.release(t, 48, "old")
			return f.release(t, 1, "new").ID.String()
		}, http.StatusConflict, "already running"},
		{"a deployment that failed", func(t *testing.T, f rollbackFixture) string {
			f.release(t, 48, "old")
			d, err := f.q.CreateDeployment(ctx, dbpkg.CreateDeploymentParams{ProjectID: f.project.ID, Branch: "main", Cpu: 1, MemoryMb: 1, Port: 80, HealthCheck: "/"})
			if err != nil {
				t.Fatal(err)
			}
			if err := f.q.FailDeployment(ctx, dbpkg.FailDeploymentParams{ID: d.ID}); err != nil {
				t.Fatal(err)
			}
			return d.ID.String()
		}, http.StatusConflict, "went live"},
		{"a release whose image was removed", func(t *testing.T, f rollbackFixture) string {
			old := f.release(t, 48, "old")
			f.release(t, 1, "new")
			if err := f.q.ForgetImages(ctx, dbpkg.ForgetImagesParams{ProjectID: f.project.ID, ImageUris: []string{*old.ImageUri}}); err != nil {
				t.Fatal(err)
			}
			return old.ID.String()
		}, http.StatusConflict, "image is still kept"},
		{"a suspended project", func(t *testing.T, f rollbackFixture) string {
			old := f.release(t, 48, "old")
			f.release(t, 1, "new")
			if err := f.q.SetProjectStatus(ctx, dbpkg.SetProjectStatusParams{ID: f.project.ID, Status: "suspended"}); err != nil {
				t.Fatal(err)
			}
			return old.ID.String()
		}, http.StatusConflict, "not active"},
		{"while another deployment is in progress", func(t *testing.T, f rollbackFixture) string {
			old := f.release(t, 48, "old")
			f.release(t, 1, "new")
			if _, err := f.q.CreateDeployment(ctx, dbpkg.CreateDeploymentParams{ProjectID: f.project.ID, Branch: "main", Cpu: 1, MemoryMb: 1, Port: 80, HealthCheck: "/"}); err != nil {
				t.Fatal(err)
			}
			return old.ID.String()
		}, http.StatusConflict, "already running"},
		{"a deployment that does not exist", func(t *testing.T, f rollbackFixture) string {
			return uuid.NewString()
		}, http.StatusNotFound, "not found"},
		{"an id that is not one", func(t *testing.T, f rollbackFixture) string { return "nope" }, http.StatusBadRequest, "invalid id"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newRollbackFixture(t)
			id := tt.setup(t, f)
			before := len(f.jobKinds(t))

			rec := f.rollback(t, id)

			if rec.Code != tt.want || !strings.Contains(rec.Body.String(), tt.text) {
				t.Fatalf("status %d, body %s; want %d containing %q", rec.Code, rec.Body, tt.want, tt.text)
			}
			if after := len(f.jobKinds(t)); after != before {
				t.Errorf("a refused rollback queued %d job(s)", after-before)
			}
		})
	}
}

func TestSomeoneElsesReleaseCannotBeRolledBackTo(t *testing.T) {
	f := newRollbackFixture(t)
	old := f.release(t, 48, "old")
	f.release(t, 1, "new")

	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/", nil)
	c.Set("user_id", uuid.NewString()) // a different user
	c.Params = gin.Params{{Key: "id", Value: old.ID.String()}}
	f.handler.RollbackDeployment(c)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status %d, want 404", rec.Code)
	}
	if kinds := f.jobKinds(t); len(kinds) != 0 {
		t.Errorf("jobs = %v", kinds)
	}
}
