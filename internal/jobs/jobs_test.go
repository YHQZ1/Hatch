package jobs

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"

	"github.com/YHQZ1/hatch/internal/build"
	buildfake "github.com/YHQZ1/hatch/internal/build/fake"
	"github.com/YHQZ1/hatch/internal/githubapp"
	"github.com/YHQZ1/hatch/internal/runtime"
	runtimefake "github.com/YHQZ1/hatch/internal/runtime/fake"
	"github.com/YHQZ1/hatch/internal/secrets"
	"github.com/YHQZ1/hatch/internal/store"
	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
	"github.com/YHQZ1/hatch/internal/store/storetest"
)

// recordingSink keeps every log line, per deployment.
type recordingSink struct {
	mu    sync.Mutex
	lines map[string][]string
}

func (s *recordingSink) Publish(_ context.Context, id, line string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.lines == nil {
		s.lines = map[string][]string{}
	}
	s.lines[id] = append(s.lines[id], line)
}

func (s *recordingSink) text(id uuid.UUID) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return strings.Join(s.lines[id.String()], "\n")
}

type fakeTokens struct {
	token string
	err   error
	owner string
	name  string
}

func (f *fakeTokens) InstallationToken(_ context.Context, owner, name string) (string, error) {
	f.owner, f.name = owner, name
	return f.token, f.err
}

// harness is Hatch's job runner over a real Postgres, with fake providers.
type harness struct {
	t       *testing.T
	pool    *pgxpool.Pool
	q       *dbpkg.Queries
	deps    Deps
	builder *buildfake.Builder
	runtime *runtimefake.Runtime
	logs    *recordingSink
	tokens  *fakeTokens
	codec   *secrets.Codec
	project dbpkg.Project
}

func newHarness(t *testing.T) *harness {
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

	codec, err := secrets.NewCodec(strings.Repeat("k", 32))
	if err != nil {
		t.Fatal(err)
	}
	h := &harness{
		t:       t,
		pool:    pool,
		q:       dbpkg.New(pool),
		builder: &buildfake.Builder{},
		runtime: &runtimefake.Runtime{},
		logs:    &recordingSink{},
		tokens:  &fakeTokens{token: "ghs_clone"},
		codec:   codec,
	}
	h.deps = Deps{
		Pool:         pool,
		Builder:      h.builder,
		Runtime:      h.runtime,
		Logs:         h.logs,
		Secrets:      codec,
		CloneTokens:  h.tokens,
		BuildTimeout: 10 * time.Second,
	}

	ctx := context.Background()
	user, err := h.q.CreateUser(ctx, dbpkg.CreateUserParams{GithubID: 1, GithubUsername: "octo", AccessToken: "x"})
	if err != nil {
		t.Fatal(err)
	}
	subdomain := "shop"
	h.project, err = h.q.CreateProject(ctx, dbpkg.CreateProjectParams{
		UserID: user.ID, RepoName: "octo/shop", RepoUrl: "https://github.com/octo/shop",
		Branch: "main", DockerfilePath: "Dockerfile", Port: 8080, Subdomain: &subdomain,
	})
	if err != nil {
		t.Fatal(err)
	}
	return h
}

// start runs a job client until the test ends or stop is called.
func (h *harness) start() (client *river.Client[pgx.Tx], stop func()) {
	h.t.Helper()
	client, err := NewClient(h.deps)
	if err != nil {
		h.t.Fatal(err)
	}
	if err := client.Start(context.Background()); err != nil {
		h.t.Fatal(err)
	}
	var once sync.Once
	stop = func() {
		once.Do(func() {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			_ = client.StopAndCancel(ctx)
		})
	}
	h.t.Cleanup(stop)
	return client, stop
}

func (h *harness) newDeployment(env map[string]string) dbpkg.Deployment {
	h.t.Helper()
	ctx := context.Background()
	subdomain := "shop"
	d, err := h.q.CreateDeployment(ctx, dbpkg.CreateDeploymentParams{
		ProjectID: h.project.ID, Branch: "main", Cpu: 256, MemoryMb: 512, Port: 8080,
		HealthCheck: "/", Subdomain: &subdomain,
	})
	if err != nil {
		h.t.Fatal(err)
	}
	for k, v := range env {
		sealed, err := h.codec.Encrypt(v)
		if err != nil {
			h.t.Fatal(err)
		}
		if _, err := h.q.CreateEnvVar(ctx, dbpkg.CreateEnvVarParams{DeploymentID: d.ID, Key: k, Value: sealed}); err != nil {
			h.t.Fatal(err)
		}
	}
	return d
}

func (h *harness) buildArgs(d dbpkg.Deployment) BuildArgs {
	return BuildArgs{
		DeploymentID: d.ID, RepoURL: h.project.RepoUrl, Branch: "main", DockerfilePath: "Dockerfile",
		Subdomain: "shop", Port: 8080, CPU: 256, MemoryMB: 512, HealthCheck: "/",
	}
}

func (h *harness) status(id uuid.UUID) dbpkg.Deployment {
	h.t.Helper()
	d, err := h.q.GetDeploymentByID(context.Background(), id)
	if err != nil {
		h.t.Fatal(err)
	}
	return d
}

// jobState returns the state of the only job of a kind, or "" if there is none.
func (h *harness) jobState(kind string) string {
	h.t.Helper()
	var state string
	err := h.pool.QueryRow(context.Background(), `SELECT state::text FROM river_job WHERE kind = $1 ORDER BY id DESC LIMIT 1`, kind).Scan(&state)
	if errors.Is(err, pgx.ErrNoRows) {
		return ""
	}
	if err != nil {
		h.t.Fatal(err)
	}
	return state
}

// eventually waits for cond, failing the test with what() when it never holds.
func eventually(t *testing.T, cond func() bool, what func() string) {
	t.Helper()
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(25 * time.Millisecond)
	}
	t.Fatalf("timed out waiting: %s", what())
}

func (h *harness) waitForStatus(id uuid.UUID, want string) dbpkg.Deployment {
	h.t.Helper()
	eventually(h.t, func() bool { return h.status(id).Status == want }, func() string {
		return fmt.Sprintf("deployment status %q (is %q)\nlogs:\n%s", want, h.status(id).Status, h.logs.text(id))
	})
	return h.status(id)
}

func TestADeploymentGoesFromBuildToLive(t *testing.T) {
	h := newHarness(t)
	d := h.newDeployment(map[string]string{"API_KEY": "s3cret"})
	client, _ := h.start()

	if _, err := client.Insert(context.Background(), h.buildArgs(d), nil); err != nil {
		t.Fatal(err)
	}
	live := h.waitForStatus(d.ID, "live")

	built := h.builder.Built()
	if len(built) != 1 {
		t.Fatalf("builds = %d, want 1", len(built))
	}
	if built[0].CloneToken != "ghs_clone" || built[0].RepoURL != h.project.RepoUrl || built[0].DeploymentID != d.ID.String() {
		t.Errorf("build spec = %+v", built[0])
	}
	if h.tokens.owner != "octo" || h.tokens.name != "shop" {
		t.Errorf("clone token requested for %s/%s", h.tokens.owner, h.tokens.name)
	}

	deploys := h.runtime.Deploys()
	if len(deploys) != 1 {
		t.Fatalf("deploys = %d, want 1", len(deploys))
	}
	if deploys[0].ImageURI != "fake.registry/hatch:"+d.ID.String() || deploys[0].EnvVars["API_KEY"] != "s3cret" {
		t.Errorf("deploy spec = %+v, want the built image and the decrypted environment", deploys[0])
	}
	if live.Url == nil || *live.Url != "http://shop.fake" || live.ImageUri == nil || *live.ImageUri != deploys[0].ImageURI {
		t.Errorf("live deployment = url %v, image %v", live.Url, live.ImageUri)
	}
	// The deployment goes live a moment before River records the job done.
	eventually(t, func() bool { return h.jobState("build") == "completed" && h.jobState("deploy") == "completed" },
		func() string {
			return "build and deploy jobs completed: " + h.jobState("build") + ", " + h.jobState("deploy")
		})
}

func TestABuildFailureIsRecordedAndNotRetried(t *testing.T) {
	h := newHarness(t)
	h.builder.BuildFunc = func(context.Context, build.Spec) (build.Image, error) {
		return build.Image{}, &build.Error{Stage: build.StageSource, Err: errors.New("git clone failed")}
	}
	d := h.newDeployment(nil)
	client, _ := h.start()

	if _, err := client.Insert(context.Background(), h.buildArgs(d), nil); err != nil {
		t.Fatal(err)
	}
	failed := h.waitForStatus(d.ID, "failed")

	if failed.ErrorStage == nil || *failed.ErrorStage != "source_sync" || failed.ErrorMessage == nil || *failed.ErrorMessage != "git clone failed" {
		t.Errorf("failure = stage %v, message %v", failed.ErrorStage, failed.ErrorMessage)
	}
	eventually(t, func() bool { return h.jobState("build") == "cancelled" }, func() string { return "build job state " + h.jobState("build") })
	if got := h.jobState("deploy"); got != "" {
		t.Errorf("a failed build enqueued a deploy job (%q)", got)
	}
	if n := len(h.builder.Built()); n != 1 {
		t.Errorf("builds = %d, want 1: a failed build must not be retried", n)
	}
}

func TestAMissingGitHubAppInstallationFailsTheBuildWithAnExplanation(t *testing.T) {
	h := newHarness(t)
	h.tokens.err = githubapp.ErrNotInstalled
	d := h.newDeployment(nil)
	client, _ := h.start()

	if _, err := client.Insert(context.Background(), h.buildArgs(d), nil); err != nil {
		t.Fatal(err)
	}
	failed := h.waitForStatus(d.ID, "failed")

	if failed.ErrorStage == nil || *failed.ErrorStage != "auth" ||
		failed.ErrorMessage == nil || !strings.Contains(*failed.ErrorMessage, "not installed on octo/shop") {
		t.Errorf("failure = stage %v, message %v", failed.ErrorStage, failed.ErrorMessage)
	}
	if len(h.builder.Built()) != 0 {
		t.Error("a build started without access to the repository")
	}
}

func TestACanceledDeploymentStopsTheBuild(t *testing.T) {
	h := newHarness(t)
	started := make(chan struct{})
	h.builder.BuildFunc = func(ctx context.Context, _ build.Spec) (build.Image, error) {
		close(started)
		<-ctx.Done()
		return build.Image{}, fmt.Errorf("%w: %w", build.ErrCanceled, ctx.Err())
	}
	d := h.newDeployment(nil)
	client, _ := h.start()
	if _, err := client.Insert(context.Background(), h.buildArgs(d), nil); err != nil {
		t.Fatal(err)
	}
	<-started

	if _, err := h.q.CancelDeploymentByIDAndUserID(context.Background(), dbpkg.CancelDeploymentByIDAndUserIDParams{ID: d.ID, UserID: h.project.UserID}); err != nil {
		t.Fatal(err)
	}

	eventually(t, func() bool { return h.jobState("build") == "completed" }, func() string { return "build job state " + h.jobState("build") })
	if got := h.status(d.ID).Status; got != "canceled" {
		t.Errorf("status = %q, want it to stay canceled", got)
	}
	if got := h.jobState("deploy"); got != "" {
		t.Errorf("a canceled build enqueued a deploy job (%q)", got)
	}
}

func TestADeployFailureIsRecorded(t *testing.T) {
	h := newHarness(t)
	h.runtime.DeployFunc = func(context.Context, runtime.DeploySpec) (runtime.Release, error) {
		return runtime.Release{}, errors.New("service never became healthy")
	}
	d := h.newDeployment(nil)
	client, _ := h.start()

	if _, err := client.Insert(context.Background(), h.buildArgs(d), nil); err != nil {
		t.Fatal(err)
	}
	failed := h.waitForStatus(d.ID, "failed")

	if failed.ErrorStage == nil || *failed.ErrorStage != "deploy" || failed.ErrorMessage == nil || !strings.Contains(*failed.ErrorMessage, "never became healthy") {
		t.Errorf("failure = stage %v, message %v", failed.ErrorStage, failed.ErrorMessage)
	}
}

func TestAPanickingBuildFailsTheDeploymentInsteadOfLeavingItBuilding(t *testing.T) {
	h := newHarness(t)
	h.builder.BuildFunc = func(context.Context, build.Spec) (build.Image, error) { panic("boom") }
	d := h.newDeployment(nil)
	client, _ := h.start()

	if _, err := client.Insert(context.Background(), h.buildArgs(d), nil); err != nil {
		t.Fatal(err)
	}
	failed := h.waitForStatus(d.ID, "failed")

	if failed.ErrorMessage == nil || !strings.Contains(*failed.ErrorMessage, "panic: boom") {
		t.Errorf("error message = %v", failed.ErrorMessage)
	}
	eventually(t, func() bool { return h.jobState("build") == "cancelled" }, func() string { return "build job state " + h.jobState("build") })
}

// This is the guarantee that matters most for builds: stopping Hatch part-way
// through one does not lose it, and does not fail it.
func TestABuildInterruptedByShutdownResumesOnTheNextStart(t *testing.T) {
	h := newHarness(t)
	var calls sync.Mutex
	count := 0
	started := make(chan struct{})
	h.builder.BuildFunc = func(ctx context.Context, spec build.Spec) (build.Image, error) {
		calls.Lock()
		count++
		first := count == 1
		calls.Unlock()
		if first {
			close(started)
			<-ctx.Done()
			return build.Image{}, ctx.Err()
		}
		return build.Image{URI: "fake.registry/hatch:" + spec.DeploymentID}, nil
	}
	d := h.newDeployment(nil)
	first, stopFirst := h.start()
	if _, err := first.Insert(context.Background(), h.buildArgs(d), nil); err != nil {
		t.Fatal(err)
	}
	<-started

	stopFirst()

	if got := h.status(d.ID).Status; got != "building" {
		t.Fatalf("status after shutdown = %q, want building (not failed)", got)
	}
	// River hands an interrupted job back without counting the attempt.
	if got := h.jobState("build"); got != "available" {
		t.Fatalf("build job state after shutdown = %q, want available", got)
	}

	h.start()
	h.waitForStatus(d.ID, "live")
	eventually(t, func() bool { return h.jobState("build") == "completed" }, func() string { return "build job state " + h.jobState("build") })
}

func TestDestroyAppRemovesTheServiceImagesAndProject(t *testing.T) {
	h := newHarness(t)
	d := h.newDeployment(nil)
	image := "fake.registry/hatch:" + d.ID.String()
	if _, err := h.q.FinishDeployment(context.Background(), dbpkg.FinishDeploymentParams{ID: d.ID, ImageUri: &image}); err != nil {
		t.Fatal(err)
	}
	client, _ := h.start()

	if _, err := client.Insert(context.Background(), DestroyAppArgs{ProjectID: h.project.ID, Subdomain: "shop"}, nil); err != nil {
		t.Fatal(err)
	}

	eventually(t, func() bool {
		_, err := h.q.GetProjectByID(context.Background(), h.project.ID)
		return errors.Is(err, pgx.ErrNoRows)
	}, func() string { return "the project to be deleted" })
	if got := h.runtime.Destroyed(); len(got) != 1 || got[0].Subdomain != "shop" {
		t.Errorf("destroyed = %+v", got)
	}
	if got := h.builder.Deleted(); len(got) != 1 || got[0].URI != image {
		t.Errorf("deleted images = %+v, want %s", got, image)
	}
}

func TestAFailedDestroyLeavesTheProjectMarkedForRetry(t *testing.T) {
	h := newHarness(t)
	h.runtime.DestroyErr = errors.New("ECS is unreachable")
	client, _ := h.start()

	if _, err := client.Insert(context.Background(), DestroyAppArgs{ProjectID: h.project.ID, Subdomain: "shop"}, nil); err != nil {
		t.Fatal(err)
	}

	eventually(t, func() bool {
		p, err := h.q.GetProjectByID(context.Background(), h.project.ID)
		return err == nil && p.Status == "delete_failed"
	}, func() string { return "the project to be marked delete_failed" })
	p, _ := h.q.GetProjectByID(context.Background(), h.project.ID)
	if p.DeleteError == nil || !strings.Contains(*p.DeleteError, "unreachable") {
		t.Errorf("delete error = %v", p.DeleteError)
	}
}

func TestScalePausesAndResumesAProject(t *testing.T) {
	h := newHarness(t)
	client, _ := h.start()
	ctx := context.Background()

	if _, err := client.Insert(ctx, ScaleArgs{ProjectID: h.project.ID, Subdomain: "shop", Replicas: 0}, nil); err != nil {
		t.Fatal(err)
	}
	eventually(t, func() bool {
		p, _ := h.q.GetProjectByID(ctx, h.project.ID)
		return p.Status == "suspended"
	}, func() string { return "the project to be suspended" })

	if _, err := client.Insert(ctx, ScaleArgs{ProjectID: h.project.ID, Subdomain: "shop", Replicas: 1}, nil); err != nil {
		t.Fatal(err)
	}
	eventually(t, func() bool {
		p, _ := h.q.GetProjectByID(ctx, h.project.ID)
		return p.Status == "active" && len(h.runtime.Scales()) == 2
	}, func() string { return "the project to be active again" })
	if got := h.runtime.Scales(); got[0].Replicas != 0 || got[1].Replicas != 1 {
		t.Errorf("scales = %+v", got)
	}
}

func TestAFailedScaleMarksTheProject(t *testing.T) {
	h := newHarness(t)
	h.runtime.ScaleErr = errors.New("no such service")
	client, _ := h.start()

	if _, err := client.Insert(context.Background(), ScaleArgs{ProjectID: h.project.ID, Subdomain: "shop", Replicas: 0}, nil); err != nil {
		t.Fatal(err)
	}

	eventually(t, func() bool {
		p, _ := h.q.GetProjectByID(context.Background(), h.project.ID)
		return p.Status == "suspend_failed"
	}, func() string { return "the project to be marked suspend_failed" })
}

func TestJobsAreEnqueuedInTheCallersTransaction(t *testing.T) {
	h := newHarness(t)
	inserter, err := NewInserter(h.pool)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()

	tx, err := h.pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := inserter.InsertTx(ctx, tx, ScaleArgs{ProjectID: h.project.ID, Subdomain: "shop", Replicas: 0}, nil); err != nil {
		t.Fatal(err)
	}
	if err := tx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	if got := h.jobState("scale"); got != "" {
		t.Fatalf("a rolled-back transaction left a job behind (%q)", got)
	}

	tx, err = h.pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := inserter.InsertTx(ctx, tx, ScaleArgs{ProjectID: h.project.ID, Subdomain: "shop", Replicas: 0}, nil); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if got := h.jobState("scale"); got != "available" {
		t.Fatalf("committed job state = %q, want available", got)
	}
}

func TestCloneTokenFailures(t *testing.T) {
	boom := errors.New("github is down")
	tests := map[string]struct {
		repoURL string
		tokens  *fakeTokens
	}{
		"not a GitHub URL": {"https://example.com/octocat/hello", &fakeTokens{token: "x"}},
		"GitHub failure":   {"https://github.com/octocat/hello", &fakeTokens{err: boom}},
	}
	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			w := &buildWorker{deps: Deps{CloneTokens: tt.tokens}}

			token, err := w.cloneToken(context.Background(), tt.repoURL)

			if err == nil || token != "" {
				t.Fatalf("token = %q, err = %v; want an error and no token", token, err)
			}
		})
	}
}

func TestCloneTokenIsTrimmed(t *testing.T) {
	w := &buildWorker{deps: Deps{CloneTokens: &fakeTokens{token: " ghs_abc \n"}}}

	got, err := w.cloneToken(context.Background(), "https://github.com/octocat/hello-world.git")

	if err != nil || got != "ghs_abc" {
		t.Fatalf("cloneToken = %q, %v", got, err)
	}
}
