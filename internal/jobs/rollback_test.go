package jobs

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/YHQZ1/hatch/internal/runtime"
	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
)

// release makes a deployment that went live with its own image, n hours ago.
func (h *harness) release(env map[string]string, hoursAgo int) dbpkg.Deployment {
	h.t.Helper()
	ctx := context.Background()
	d := h.newDeployment(env)
	image := "fake.registry/hatch:" + d.ID.String()
	if _, err := h.q.FinishDeployment(ctx, dbpkg.FinishDeploymentParams{ID: d.ID, ImageUri: &image}); err != nil {
		h.t.Fatal(err)
	}
	if _, err := h.pool.Exec(ctx,
		`UPDATE deployments SET created_at = now() - make_interval(hours => $2), deployed_at = now() - make_interval(hours => $2) WHERE id = $1`,
		d.ID, hoursAgo); err != nil {
		h.t.Fatal(err)
	}
	return h.status(d.ID)
}

// rollbackOf creates the deployment a rollback to src makes, and its deploy job's arguments.
func (h *harness) rollbackOf(src dbpkg.Deployment) (dbpkg.Deployment, DeployArgs) {
	h.t.Helper()
	ctx := context.Background()
	d, err := h.q.CreateRollbackDeployment(ctx, src.ID)
	if err != nil {
		h.t.Fatal(err)
	}
	if err := h.q.CopyDeploymentEnvVars(ctx, dbpkg.CopyDeploymentEnvVarsParams{FromDeploymentID: src.ID, ToDeploymentID: d.ID}); err != nil {
		h.t.Fatal(err)
	}
	return d, DeployArgs{
		DeploymentID: d.ID, ImageURI: *src.ImageUri, Subdomain: "shop", Port: d.Port, CPU: d.Cpu, MemoryMB: d.MemoryMb,
		HealthCheck: d.HealthCheck, RollbackOf: &src.ID,
	}
}

func TestARollbackRunsTheStoredImageWithItsEnvironmentAndBuildsNothing(t *testing.T) {
	h := newHarness(t)
	old := h.release(map[string]string{"API_KEY": "old-secret"}, 48)
	h.release(map[string]string{"API_KEY": "new-secret"}, 1) // what runs now
	rollback, args := h.rollbackOf(old)
	client, _ := h.start()

	if _, err := client.Insert(context.Background(), args, nil); err != nil {
		t.Fatal(err)
	}
	live := h.waitForStatus(rollback.ID, "live")

	if n := len(h.builder.Built()); n != 0 {
		t.Errorf("a rollback built %d images, want none", n)
	}
	deploys := h.runtime.Deploys()
	if len(deploys) != 1 || deploys[0].ImageURI != *old.ImageUri {
		t.Fatalf("deploys = %+v, want the old release's image", deploys)
	}
	if deploys[0].EnvVars["API_KEY"] != "old-secret" {
		t.Errorf("environment = %v, want the one the old release ran with, not the current one", deploys[0].EnvVars)
	}
	if live.ImageUri == nil || *live.ImageUri != *old.ImageUri || live.CommitSha != old.CommitSha {
		t.Errorf("the rollback deployment = image %v, commit %v", live.ImageUri, live.CommitSha)
	}
	if text := h.logs.text(rollback.ID); !strings.Contains(text, "Rolling back to") || !strings.Contains(text, "nothing is built") {
		t.Errorf("log does not say what is happening:\n%s", text)
	}
	if d := h.builder.Deleted(); len(d) != 0 {
		t.Errorf("a rollback deleted images: %v", d)
	}
}

func TestACanceledOrFailedRollbackNeverDeletesTheReleasesImage(t *testing.T) {
	for name, deployErr := range map[string]error{
		"canceled": runtime.ErrCanceled,
		"failed":   errors.New("service never became healthy"),
	} {
		t.Run(name, func(t *testing.T) {
			h := newHarness(t)
			h.runtime.DeployFunc = func(context.Context, runtime.DeploySpec) (runtime.Release, error) {
				return runtime.Release{}, deployErr
			}
			old := h.release(nil, 48)
			rollback, args := h.rollbackOf(old)
			if name == "canceled" {
				if _, err := h.pool.Exec(context.Background(), `UPDATE deployments SET status = 'canceled' WHERE id = $1`, rollback.ID); err != nil {
					t.Fatal(err)
				}
			}
			client, _ := h.start()
			if _, err := client.Insert(context.Background(), args, nil); err != nil {
				t.Fatal(err)
			}
			h.waitForStatus(rollback.ID, map[string]string{"canceled": "canceled", "failed": "failed"}[name])
			eventually(t, func() bool { return h.jobState("deploy") != "available" && h.jobState("deploy") != "running" },
				func() string { return "the deploy job to finish: " + h.jobState("deploy") })

			if d := h.builder.Deleted(); len(d) != 0 {
				t.Errorf("the image the earlier release still needs was deleted: %v", d)
			}
		})
	}
}

func TestADeployThatFailsForGoodDeletesTheImageItBuilt(t *testing.T) {
	h := newHarness(t)
	h.runtime.DeployFunc = func(context.Context, runtime.DeploySpec) (runtime.Release, error) {
		return runtime.Release{}, errors.New("service never became healthy")
	}
	d := h.newDeployment(nil)
	client, _ := h.start()
	if _, err := client.Insert(context.Background(), h.buildArgs(d), nil); err != nil {
		t.Fatal(err)
	}
	h.waitForStatus(d.ID, "failed")

	built := "fake.registry/hatch:" + d.ID.String()
	eventually(t, func() bool { return len(h.builder.Deleted()) == 1 }, func() string { return fmt.Sprintf("the failed build's image to be deleted: %v", h.builder.Deleted()) })
	if got := h.builder.Deleted()[0].URI; got != built {
		t.Errorf("deleted %q, want %q", got, built)
	}
}

func TestOldImagesAreRemovedWhenADeploymentGoesLive(t *testing.T) {
	h := newHarness(t)
	// Seven earlier releases, oldest first, each with its own image.
	var releases []dbpkg.Deployment
	for i := 0; i < 7; i++ {
		releases = append(releases, h.release(nil, 100-i*10))
	}
	d := h.newDeployment(nil)
	client, _ := h.start()
	if _, err := client.Insert(context.Background(), h.buildArgs(d), nil); err != nil {
		t.Fatal(err)
	}
	h.waitForStatus(d.ID, "live")

	// Eight releases now; the newest KeptReleases keep their images.
	oldest := map[string]bool{}
	for _, r := range releases[:8-KeptReleases] {
		oldest[*r.ImageUri] = true
	}
	eventually(t, func() bool { return len(h.builder.Deleted()) == len(oldest) }, func() string {
		return fmt.Sprintf("the oldest %d images to be deleted, got %v", len(oldest), h.builder.Deleted())
	})
	for _, image := range h.builder.Deleted() {
		if !oldest[image.URI] {
			t.Errorf("deleted %q, which is one of the newest releases", image.URI)
		}
	}
	for i, r := range releases {
		got := h.status(r.ID).ImageUri
		if gone := i < len(oldest); gone != (got == nil) {
			t.Errorf("release %d (%d of 7, oldest first): image recorded = %v, want it forgotten = %v", i, i+1, got != nil, gone)
		}
	}
	if h.status(d.ID).ImageUri == nil {
		t.Error("the deployment that just went live lost its image")
	}
}

func TestAnImageThatWasRolledBackToCountsAsNewAndIsKept(t *testing.T) {
	h := newHarness(t)
	var releases []dbpkg.Deployment
	for i := 0; i < 6; i++ { // oldest first
		releases = append(releases, h.release(nil, 60-i*10))
	}
	// Rolling back to the oldest makes its image the newest, so the second
	// oldest is the one that goes.
	rollback, args := h.rollbackOf(releases[0])
	client, _ := h.start()
	if _, err := client.Insert(context.Background(), args, nil); err != nil {
		t.Fatal(err)
	}
	h.waitForStatus(rollback.ID, "live")

	eventually(t, func() bool { return len(h.builder.Deleted()) == 1 }, func() string {
		return fmt.Sprintf("one image to be deleted, got %v", h.builder.Deleted())
	})
	if got, want := h.builder.Deleted()[0].URI, *releases[1].ImageUri; got != want {
		t.Errorf("deleted %q, want %q (the oldest image that was not rolled back to)", got, want)
	}
	if h.status(releases[0].ID).ImageUri == nil {
		t.Error("the release that was rolled back to lost its image")
	}
}

func TestOnlyAReleaseThatWentLiveWithAnImageCanBeCopiedForARollback(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	live := h.release(nil, 5)
	failed := h.newDeployment(nil)
	if err := h.q.FailDeployment(ctx, dbpkg.FailDeploymentParams{ID: failed.ID}); err != nil {
		t.Fatal(err)
	}
	forgotten := h.release(nil, 50)
	if err := h.q.ForgetImages(ctx, dbpkg.ForgetImagesParams{ProjectID: h.project.ID, ImageUris: []string{*forgotten.ImageUri}}); err != nil {
		t.Fatal(err)
	}

	for name, id := range map[string]uuid.UUID{"a failed deployment": failed.ID, "a release whose image was removed": forgotten.ID} {
		if _, err := h.q.CreateRollbackDeployment(ctx, id); err == nil {
			t.Errorf("%s was copied for a rollback", name)
		}
	}
	if _, err := h.q.CreateRollbackDeployment(ctx, live.ID); err != nil {
		t.Errorf("a live release was refused: %v", err)
	}
}
