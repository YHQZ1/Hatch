package handlers

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/YHQZ1/hatch/internal/jobs"
	"github.com/YHQZ1/hatch/internal/secrets"
	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
)

const appWebhookSecret = "0123456789abcdef0123456789abcdef"

func signatureFor(body []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

// webhookFixture is the shop project, following main with auto-deploy on, and a
// handler holding the App's webhook secret.
type webhookFixture struct {
	projectFixture
	handler *WebhookHandler
	codec   *secrets.Codec
}

func newWebhookFixture(t *testing.T, secret string) webhookFixture {
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
	if _, err := f.pool.Exec(context.Background(), `UPDATE projects SET auto_deploy = true WHERE id = $1`, f.project.ID); err != nil {
		t.Fatal(err)
	}
	return webhookFixture{projectFixture: f, handler: NewWebhookHandler(f.pool, inserter, codec, secret), codec: codec}
}

// delivery is one webhook request as GitHub sends it.
type delivery struct {
	event, id, signedWith string
	body                  string
}

func push(ref, repo string) string {
	return fmt.Sprintf(`{"ref":%q,"repository":{"html_url":"https://github.com/%s"},"head_commit":{"id":"abc123def456","message":"Fix the thing\n\nLonger description"}}`, ref, repo)
}

func (f webhookFixture) send(t *testing.T, d delivery) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/webhooks/github", bytes.NewBufferString(d.body))
	if d.event != "" {
		c.Request.Header.Set("X-GitHub-Event", d.event)
	}
	if d.id != "" {
		c.Request.Header.Set("X-GitHub-Delivery", d.id)
	}
	if d.signedWith != "" {
		c.Request.Header.Set("X-Hub-Signature-256", signatureFor([]byte(d.body), d.signedWith))
	}
	f.handler.HandleGitHub(c)
	// A server writes a status set without a body when the handler returns; called
	// directly, it has to be flushed for the recorder to see it.
	c.Writer.WriteHeaderNow()
	return rec
}

func (f webhookFixture) deployments(t *testing.T) []dbpkg.Deployment {
	t.Helper()
	rows, err := f.q.GetDeploymentsByProjectID(context.Background(), f.project.ID)
	if err != nil {
		t.Fatal(err)
	}
	return rows
}

func TestAPushToTheFollowedBranchDeploysIt(t *testing.T) {
	f := newWebhookFixture(t, appWebhookSecret)
	ctx := context.Background()
	sealed, err := f.codec.Encrypt("s3cret")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.q.CreateProjectEnvVar(ctx, dbpkg.CreateProjectEnvVarParams{ProjectID: f.project.ID, Key: "API_KEY", Value: sealed}); err != nil {
		t.Fatal(err)
	}

	rec := f.send(t, delivery{event: "push", id: "d-1", signedWith: appWebhookSecret, body: push("refs/heads/main", "octo/shop")})

	if rec.Code != http.StatusAccepted {
		t.Fatalf("status %d, body %s", rec.Code, rec.Body)
	}
	ds := f.deployments(t)
	if len(ds) != 1 || ds[0].Status != "queued" || ds[0].Branch != "main" {
		t.Fatalf("deployments = %+v", ds)
	}
	if ds[0].CommitSha == nil || *ds[0].CommitSha != "abc123def456" || ds[0].CommitMessage == nil || *ds[0].CommitMessage != "Fix the thing" {
		t.Errorf("commit = %v / %v, want the pushed commit's id and first line", ds[0].CommitSha, ds[0].CommitMessage)
	}
	vars, err := f.q.GetEnvVarsByDeployment(ctx, ds[0].ID)
	if err != nil || len(vars) != 1 || vars[0].Key != "API_KEY" {
		t.Errorf("environment = %+v, %v, want the project's variables", vars, err)
	}
	if kinds := f.jobKinds(t); len(kinds) != 1 || kinds[0] != "build" {
		t.Errorf("jobs = %v, want one build", kinds)
	}
	var body struct {
		Deployments []string `json:"deployments"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || len(body.Deployments) != 1 || body.Deployments[0] != ds[0].ID.String() {
		t.Errorf("response = %s", rec.Body)
	}
}

func TestADeliveryIsRefusedUnlessItIsSignedWithTheAppsSecret(t *testing.T) {
	tests := map[string]delivery{
		"no signature":         {event: "push", id: "d", body: push("refs/heads/main", "octo/shop")},
		"another secret":       {event: "push", id: "d", signedWith: "a-different-secret-entirely", body: push("refs/heads/main", "octo/shop")},
		"an unsigned ping":     {event: "ping", id: "d", body: `{}`},
		"an unsigned other":    {event: "installation", id: "d", body: `{}`},
		"a signature for body": {}, // filled in below
	}
	// A valid signature for a different body must not pass for this one.
	other := push("refs/heads/other", "octo/shop")
	tests["a signature for body"] = delivery{event: "push", id: "d", body: push("refs/heads/main", "octo/shop"), signedWith: ""}
	for name, d := range tests {
		t.Run(name, func(t *testing.T) {
			f := newWebhookFixture(t, appWebhookSecret)
			gin.SetMode(gin.TestMode)
			rec := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(rec)
			c.Request = httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString(d.body))
			c.Request.Header.Set("X-GitHub-Event", d.event)
			c.Request.Header.Set("X-GitHub-Delivery", d.id)
			switch {
			case name == "a signature for body":
				c.Request.Header.Set("X-Hub-Signature-256", signatureFor([]byte(other), appWebhookSecret))
			case d.signedWith != "":
				c.Request.Header.Set("X-Hub-Signature-256", signatureFor([]byte(d.body), d.signedWith))
			}
			f.handler.HandleGitHub(c)
			c.Writer.WriteHeaderNow()

			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("status %d, want 401", rec.Code)
			}
			if n := len(f.deployments(t)); n != 0 {
				t.Errorf("a refused delivery deployed %d time(s)", n)
			}
		})
	}
}

func TestWithoutASecretEveryDeliveryIsRefused(t *testing.T) {
	f := newWebhookFixture(t, "")
	// Even one signed with the empty string, which an attacker could compute.
	rec := f.send(t, delivery{event: "push", id: "d", signedWith: "x", body: push("refs/heads/main", "octo/shop")})
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status %d, want 503", rec.Code)
	}
	if n := len(f.deployments(t)); n != 0 {
		t.Errorf("deployed %d time(s) with no secret configured", n)
	}
}

func TestPingAndOtherEventsAreAcceptedAndIgnored(t *testing.T) {
	f := newWebhookFixture(t, appWebhookSecret)
	if rec := f.send(t, delivery{event: "ping", id: "p", signedWith: appWebhookSecret, body: `{"zen":"hi"}`}); rec.Code != http.StatusOK {
		t.Errorf("ping: status %d", rec.Code)
	}
	for _, event := range []string{"installation", "installation_repositories", "issues"} {
		if rec := f.send(t, delivery{event: event, id: "e", signedWith: appWebhookSecret, body: `{}`}); rec.Code != http.StatusNoContent {
			t.Errorf("%s: status %d, want 204", event, rec.Code)
		}
	}
	if n := len(f.deployments(t)); n != 0 {
		t.Errorf("deployed %d time(s)", n)
	}
}

func TestAPushThatShouldNotDeployDoesNot(t *testing.T) {
	ctx := context.Background()
	tests := []struct {
		name  string
		setup func(t *testing.T, f webhookFixture)
		body  string
	}{
		{"another branch", nil, push("refs/heads/feature", "octo/shop")},
		{"a tag", nil, push("refs/tags/v1", "octo/shop")},
		{"a deleted branch", nil, `{"ref":"refs/heads/main","deleted":true,"repository":{"html_url":"https://github.com/octo/shop"}}`},
		{"another repository", nil, push("refs/heads/main", "octo/elsewhere")},
		{"auto-deploy off", func(t *testing.T, f webhookFixture) {
			if _, err := f.pool.Exec(ctx, `UPDATE projects SET auto_deploy = false WHERE id = $1`, f.project.ID); err != nil {
				t.Fatal(err)
			}
		}, push("refs/heads/main", "octo/shop")},
		{"a suspended project", func(t *testing.T, f webhookFixture) {
			if err := f.q.SetProjectStatus(ctx, dbpkg.SetProjectStatusParams{ID: f.project.ID, Status: "suspended"}); err != nil {
				t.Fatal(err)
			}
		}, push("refs/heads/main", "octo/shop")},
		{"a deployment already in progress", func(t *testing.T, f webhookFixture) {
			if _, err := f.q.CreateDeployment(ctx, dbpkg.CreateDeploymentParams{ProjectID: f.project.ID, Branch: "main", Cpu: 1, MemoryMb: 1, Port: 80, HealthCheck: "/"}); err != nil {
				t.Fatal(err)
			}
		}, push("refs/heads/main", "octo/shop")},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newWebhookFixture(t, appWebhookSecret)
			if tt.setup != nil {
				tt.setup(t, f)
			}
			before := len(f.deployments(t))

			rec := f.send(t, delivery{event: "push", id: "d-x", signedWith: appWebhookSecret, body: tt.body})

			if rec.Code != http.StatusNoContent {
				t.Fatalf("status %d, body %s; want 204", rec.Code, rec.Body)
			}
			if after := len(f.deployments(t)); after != before {
				t.Errorf("deployed %d time(s)", after-before)
			}
		})
	}
}

func TestARedeliveredPushDeploysOnlyOnce(t *testing.T) {
	f := newWebhookFixture(t, appWebhookSecret)
	d := delivery{event: "push", id: "same-delivery", signedWith: appWebhookSecret, body: push("refs/heads/main", "octo/shop")}

	if rec := f.send(t, d); rec.Code != http.StatusAccepted {
		t.Fatalf("first: status %d", rec.Code)
	}
	// The deployment finishes, so only the redelivery check can stop a second one.
	if _, err := f.pool.Exec(context.Background(), `UPDATE deployments SET status = 'live'`); err != nil {
		t.Fatal(err)
	}
	if rec := f.send(t, d); rec.Code != http.StatusNoContent {
		t.Fatalf("redelivery: status %d, want 204", rec.Code)
	}
	if n := len(f.deployments(t)); n != 1 {
		t.Fatalf("%d deployments after a redelivery, want 1", n)
	}
	// A new delivery of a new push does deploy.
	if rec := f.send(t, delivery{event: "push", id: "another-delivery", signedWith: appWebhookSecret, body: d.body}); rec.Code != http.StatusAccepted {
		t.Fatalf("new delivery: status %d", rec.Code)
	}
}

func TestTheRepositoryIsMatchedWithoutRegardToCase(t *testing.T) {
	f := newWebhookFixture(t, appWebhookSecret)
	rec := f.send(t, delivery{event: "push", id: "d", signedWith: appWebhookSecret, body: push("refs/heads/main", "Octo/SHOP")})
	if rec.Code != http.StatusAccepted || len(f.deployments(t)) != 1 {
		t.Fatalf("status %d, %d deployments", rec.Code, len(f.deployments(t)))
	}
}

func TestOnePushDeploysEveryProjectBuiltFromTheRepository(t *testing.T) {
	f := newWebhookFixture(t, appWebhookSecret)
	ctx := context.Background()
	other, err := f.q.CreateProject(ctx, dbpkg.CreateProjectParams{
		UserID: f.user.ID, RepoName: "shop-staging", RepoUrl: "https://github.com/octo/shop", Branch: "main",
		DockerfilePath: "Dockerfile", Port: 8081, Subdomain: ptr("shop-staging"), HealthCheck: "/", AutoDeploy: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	// And one that follows another branch, which this push is not for.
	if _, err := f.q.CreateProject(ctx, dbpkg.CreateProjectParams{
		UserID: f.user.ID, RepoName: "shop-release", RepoUrl: "https://github.com/octo/shop", Branch: "release",
		DockerfilePath: "Dockerfile", Port: 8082, Subdomain: ptr("shop-release"), HealthCheck: "/", AutoDeploy: true,
	}); err != nil {
		t.Fatal(err)
	}

	rec := f.send(t, delivery{event: "push", id: "d", signedWith: appWebhookSecret, body: push("refs/heads/main", "octo/shop")})

	if rec.Code != http.StatusAccepted {
		t.Fatalf("status %d", rec.Code)
	}
	var count int
	for _, id := range []uuid.UUID{f.project.ID, other.ID} {
		rows, err := f.q.GetDeploymentsByProjectID(ctx, id)
		if err != nil || len(rows) != 1 {
			t.Fatalf("project %s has %d deployments (%v), want 1", id, len(rows), err)
		}
		count++
	}
	if kinds := f.jobKinds(t); len(kinds) != count {
		t.Errorf("jobs = %v, want %d builds", kinds, count)
	}
}

func TestAPushWithoutADeliveryIdIsRejected(t *testing.T) {
	f := newWebhookFixture(t, appWebhookSecret)
	rec := f.send(t, delivery{event: "push", signedWith: appWebhookSecret, body: push("refs/heads/main", "octo/shop")})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d, want 400", rec.Code)
	}
}

func TestMalformedBodiesAreRejectedAfterTheSignatureIsChecked(t *testing.T) {
	f := newWebhookFixture(t, appWebhookSecret)
	for name, body := range map[string]string{
		"not json":                       `nope`,
		"no repository":                  `{"ref":"refs/heads/main"}`,
		"a repository that isn't GitHub": `{"ref":"refs/heads/main","repository":{"html_url":"https://example.com/octo/shop"}}`,
	} {
		rec := f.send(t, delivery{event: "push", id: "d", signedWith: appWebhookSecret, body: body})
		if rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status %d, want 400", name, rec.Code)
		}
	}
	if n := len(f.deployments(t)); n != 0 {
		t.Errorf("deployed %d time(s)", n)
	}
}
