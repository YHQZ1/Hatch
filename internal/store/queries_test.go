package store

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"

	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
	"github.com/YHQZ1/hatch/internal/store/storetest"
)

// newQueries returns the generated queries over a freshly migrated database.
func newQueries(t *testing.T) (*dbpkg.Queries, *sql.DB) {
	t.Helper()
	url := storetest.NewDatabase(t)
	if _, err := Migrate(url); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	db, err := Connect(url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return dbpkg.New(db), db
}

func str(s string) sql.NullString { return sql.NullString{String: s, Valid: true} }

func createUser(t *testing.T, q *dbpkg.Queries, githubID int64, name string) dbpkg.User {
	t.Helper()
	user, err := q.CreateUser(context.Background(), dbpkg.CreateUserParams{
		GithubID: githubID, GithubUsername: name, AccessToken: "token-" + name,
	})
	if err != nil {
		t.Fatal(err)
	}
	return user
}

func createProject(t *testing.T, q *dbpkg.Queries, user dbpkg.User, subdomain string) dbpkg.Project {
	t.Helper()
	project, err := q.CreateProject(context.Background(), dbpkg.CreateProjectParams{
		UserID: user.ID, RepoName: "octo/" + subdomain, RepoUrl: "https://github.com/octo/" + subdomain,
		Branch: "main", DockerfilePath: "Dockerfile", Port: 8080,
		Subdomain: str(subdomain), WebhookSecret: str("secret"),
	})
	if err != nil {
		t.Fatal(err)
	}
	return project
}

func createDeployment(t *testing.T, q *dbpkg.Queries, project dbpkg.Project) dbpkg.Deployment {
	t.Helper()
	deployment, err := q.CreateDeployment(context.Background(), dbpkg.CreateDeploymentParams{
		ProjectID: project.ID, Branch: "main", Cpu: 256, MemoryMb: 512, Port: 8080,
		HealthCheck: "/health", Subdomain: project.Subdomain,
		CommitSha: str("abc123"), CommitMessage: str("Fix things"),
	})
	if err != nil {
		t.Fatal(err)
	}
	return deployment
}

func TestUsersAreUpsertedByGitHubID(t *testing.T) {
	q, _ := newQueries(t)
	ctx := context.Background()

	first := createUser(t, q, 42, "octocat")
	if first.ID == uuid.Nil || first.CreatedAt.IsZero() || first.GithubUsername != "octocat" {
		t.Fatalf("unexpected user: %+v", first)
	}

	renamed, err := q.CreateUser(ctx, dbpkg.CreateUserParams{GithubID: 42, GithubUsername: "octo-renamed", AccessToken: "new-token"})
	if err != nil {
		t.Fatal(err)
	}
	if renamed.ID != first.ID || renamed.GithubUsername != "octo-renamed" || renamed.AccessToken != "new-token" {
		t.Fatalf("a second sign-in should update the same user, got %+v", renamed)
	}

	byGitHub, err := q.GetUserByGithubID(ctx, 42)
	if err != nil || byGitHub.ID != first.ID {
		t.Fatalf("GetUserByGithubID = %+v, %v", byGitHub, err)
	}
	byID, err := q.GetUserByID(ctx, first.ID)
	if err != nil || byID.GithubID != 42 {
		t.Fatalf("GetUserByID = %+v, %v", byID, err)
	}
	if _, err := q.GetUserByID(ctx, uuid.New()); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("unknown user error = %v, want sql.ErrNoRows", err)
	}
}

func TestProjectsAreScopedToTheirOwner(t *testing.T) {
	q, _ := newQueries(t)
	ctx := context.Background()
	alice := createUser(t, q, 1, "alice")
	bob := createUser(t, q, 2, "bob")

	project := createProject(t, q, alice, "shop")
	if project.Status != "active" || !project.AutoDeploy || project.CreatedAt.IsZero() {
		t.Fatalf("unexpected defaults: %+v", project)
	}
	if !project.Subdomain.Valid || project.Subdomain.String != "shop" ||
		!project.WebhookSecret.Valid || project.GithubWebhookID.Valid {
		t.Fatalf("nullable columns did not round trip: %+v", project)
	}

	if got, err := q.GetProjectByIDAndUserID(ctx, dbpkg.GetProjectByIDAndUserIDParams{ID: project.ID, UserID: alice.ID}); err != nil || got.ID != project.ID {
		t.Fatalf("owner lookup = %+v, %v", got, err)
	}
	if _, err := q.GetProjectByIDAndUserID(ctx, dbpkg.GetProjectByIDAndUserIDParams{ID: project.ID, UserID: bob.ID}); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("another user must not see the project, error = %v", err)
	}
	if list, err := q.GetProjectsByUserID(ctx, bob.ID); err != nil || len(list) != 0 {
		t.Fatalf("bob's projects = %v, %v", list, err)
	}

	bySubdomain, err := q.GetProjectBySubdomain(ctx, str("shop"))
	if err != nil || bySubdomain.ID != project.ID {
		t.Fatalf("GetProjectBySubdomain = %+v, %v", bySubdomain, err)
	}
}

func TestProjectsListNewestFirstAndHideDeleted(t *testing.T) {
	q, db := newQueries(t)
	ctx := context.Background()
	user := createUser(t, q, 1, "alice")
	older := createProject(t, q, user, "older")
	time.Sleep(10 * time.Millisecond)
	newer := createProject(t, q, user, "newer")

	list, err := q.GetProjectsByUserID(ctx, user.ID)
	if err != nil || len(list) != 2 || list[0].ID != newer.ID || list[1].ID != older.ID {
		t.Fatalf("list = %v, %v; want newest first", list, err)
	}

	if _, err := db.ExecContext(ctx, `UPDATE projects SET status = 'deleted' WHERE id = $1`, older.ID); err != nil {
		t.Fatal(err)
	}
	list, _ = q.GetProjectsByUserID(ctx, user.ID)
	if len(list) != 1 || list[0].ID != newer.ID {
		t.Fatalf("deleted projects must be hidden, got %v", list)
	}
}

func TestDuplicateSubdomainIsAUniqueViolation(t *testing.T) {
	q, _ := newQueries(t)
	user := createUser(t, q, 1, "alice")
	createProject(t, q, user, "taken")

	_, err := q.CreateProject(context.Background(), dbpkg.CreateProjectParams{
		UserID: user.ID, RepoName: "octo/other", RepoUrl: "https://github.com/octo/other",
		Branch: "main", DockerfilePath: "Dockerfile", Port: 80, Subdomain: str("taken"),
	})
	if err == nil || !IsUniqueViolation(err) {
		t.Fatalf("error = %v, want a unique violation", err)
	}
	if IsUniqueViolation(sql.ErrNoRows) || IsUniqueViolation(nil) {
		t.Fatal("IsUniqueViolation must be false for other errors")
	}
}

func TestProjectUpdates(t *testing.T) {
	q, _ := newQueries(t)
	ctx := context.Background()
	user := createUser(t, q, 1, "alice")
	project := createProject(t, q, user, "shop")

	updated, err := q.UpdateProjectSettings(ctx, dbpkg.UpdateProjectSettingsParams{
		ID: project.ID, UserID: user.ID, RepoName: "octo/renamed", Branch: "release",
		DockerfilePath: "api/Dockerfile", Port: 9000, AutoDeploy: false,
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.RepoName != "octo/renamed" || updated.Branch != "release" || updated.Port != 9000 || updated.AutoDeploy {
		t.Fatalf("settings not applied: %+v", updated)
	}

	err = q.UpdateProjectWebhook(ctx, dbpkg.UpdateProjectWebhookParams{
		ID: project.ID, WebhookSecret: str("s2"), GithubWebhookID: sql.NullInt64{Int64: 77, Valid: true}, AutoDeploy: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	got, _ := q.GetProjectByID(ctx, project.ID)
	if !got.GithubWebhookID.Valid || got.GithubWebhookID.Int64 != 77 || !got.AutoDeploy {
		t.Fatalf("webhook not stored: %+v", got)
	}
	if err := q.ClearProjectWebhook(ctx, project.ID); err != nil {
		t.Fatal(err)
	}
	got, _ = q.GetProjectByID(ctx, project.ID)
	// Clearing forgets the hook and turns auto-deploy off; the secret stays.
	if got.GithubWebhookID.Valid || got.AutoDeploy || got.WebhookSecret.String != "s2" {
		t.Fatalf("webhook not cleared as expected: %+v", got)
	}

	deleting, err := q.MarkProjectDeleting(ctx, dbpkg.MarkProjectDeletingParams{ID: project.ID, UserID: user.ID})
	if err != nil || deleting.Status != "deleting" || !deleting.DeleteRequestedAt.Valid {
		t.Fatalf("MarkProjectDeleting = %+v, %v", deleting, err)
	}
}

func TestDeploymentLifecycle(t *testing.T) {
	q, _ := newQueries(t)
	ctx := context.Background()
	user := createUser(t, q, 1, "alice")
	project := createProject(t, q, user, "shop")

	deployment := createDeployment(t, q, project)
	if deployment.Status != "queued" || deployment.DeployedAt.Valid || deployment.Url.Valid {
		t.Fatalf("new deployment should be queued and not live: %+v", deployment)
	}
	if !deployment.CommitSha.Valid || deployment.CommitSha.String != "abc123" || deployment.Cpu != 256 {
		t.Fatalf("values did not round trip: %+v", deployment)
	}

	if _, err := q.UpdateDeploymentStatus(ctx, dbpkg.UpdateDeploymentStatusParams{ID: deployment.ID, Status: "building"}); err != nil {
		t.Fatal(err)
	}
	active, err := q.GetActiveDeploymentByProjectIDAndUserID(ctx, dbpkg.GetActiveDeploymentByProjectIDAndUserIDParams{ProjectID: project.ID, UserID: user.ID})
	if err != nil || active.ID != deployment.ID || active.Status != "building" {
		t.Fatalf("active deployment = %+v, %v", active, err)
	}

	live, err := q.UpdateDeploymentLive(ctx, dbpkg.UpdateDeploymentLiveParams{
		ID: deployment.ID, ImageUri: str("registry/app:1"), EcsTaskArn: str("arn:task"),
		Url: str("https://shop.example.com"), EcsServiceName: str("svc"), TargetGroupArn: str("arn:tg"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if live.Status != "live" || !live.DeployedAt.Valid || live.Url.String != "https://shop.example.com" || live.ImageUri.String != "registry/app:1" {
		t.Fatalf("UpdateDeploymentLive = %+v", live)
	}
	if _, err := q.GetActiveDeploymentByProjectIDAndUserID(ctx, dbpkg.GetActiveDeploymentByProjectIDAndUserIDParams{ProjectID: project.ID, UserID: user.ID}); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("a live deployment is not active, error = %v", err)
	}
}

func TestOnlyOneActiveDeploymentPerProject(t *testing.T) {
	q, _ := newQueries(t)
	ctx := context.Background()
	user := createUser(t, q, 1, "alice")
	project := createProject(t, q, user, "shop")
	first := createDeployment(t, q, project)

	_, err := q.CreateDeployment(ctx, dbpkg.CreateDeploymentParams{
		ProjectID: project.ID, Branch: "main", Cpu: 256, MemoryMb: 512, Port: 8080, HealthCheck: "/",
	})
	if !IsUniqueViolation(err) {
		t.Fatalf("a second active deployment should violate the unique index, error = %v", err)
	}

	if _, err := q.UpdateDeploymentLive(ctx, dbpkg.UpdateDeploymentLiveParams{ID: first.ID, Url: str("https://x")}); err != nil {
		t.Fatal(err)
	}
	if _, err := q.CreateDeployment(ctx, dbpkg.CreateDeploymentParams{
		ProjectID: project.ID, Branch: "main", Cpu: 256, MemoryMb: 512, Port: 8080, HealthCheck: "/",
	}); err != nil {
		t.Fatalf("once the first is live a new deployment is allowed: %v", err)
	}

	list, err := q.GetDeploymentsByProjectID(ctx, project.ID)
	if err != nil || len(list) != 2 || list[0].ID == first.ID {
		t.Fatalf("deployments = %v, %v; want newest first", list, err)
	}
}

func TestFailingAndCancelingDeployments(t *testing.T) {
	q, _ := newQueries(t)
	ctx := context.Background()
	alice := createUser(t, q, 1, "alice")
	bob := createUser(t, q, 2, "bob")
	project := createProject(t, q, alice, "shop")
	deployment := createDeployment(t, q, project)

	if _, err := q.CancelDeploymentByIDAndUserID(ctx, dbpkg.CancelDeploymentByIDAndUserIDParams{ID: deployment.ID, UserID: bob.ID}); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("another user must not cancel it, error = %v", err)
	}
	canceled, err := q.CancelDeploymentByIDAndUserID(ctx, dbpkg.CancelDeploymentByIDAndUserIDParams{ID: deployment.ID, UserID: alice.ID})
	if err != nil || canceled.Status != "canceled" {
		t.Fatalf("cancel = %+v, %v", canceled, err)
	}
	if _, err := q.CancelDeploymentByIDAndUserID(ctx, dbpkg.CancelDeploymentByIDAndUserIDParams{ID: deployment.ID, UserID: alice.ID}); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("a finished deployment cannot be canceled again, error = %v", err)
	}

	next := createDeployment(t, q, project)
	failed, err := q.MarkDeploymentFailed(ctx, dbpkg.MarkDeploymentFailedParams{ID: next.ID, ErrorStage: str("build"), ErrorMessage: str("exit status 1")})
	if err != nil {
		t.Fatal(err)
	}
	if failed.Status != "failed" || !failed.FailedAt.Valid || failed.ErrorStage.String != "build" || failed.ErrorMessage.String != "exit status 1" {
		t.Fatalf("MarkDeploymentFailed = %+v", failed)
	}

	scoped, err := q.GetDeploymentsByProjectIDAndUserID(ctx, dbpkg.GetDeploymentsByProjectIDAndUserIDParams{ProjectID: project.ID, UserID: bob.ID})
	if err != nil || len(scoped) != 0 {
		t.Fatalf("bob must not list alice's deployments: %v, %v", scoped, err)
	}
}

func TestProjectEnvVars(t *testing.T) {
	q, _ := newQueries(t)
	ctx := context.Background()
	user := createUser(t, q, 1, "alice")
	project := createProject(t, q, user, "shop")

	for _, key := range []string{"ZED", "ALPHA"} {
		if _, err := q.CreateProjectEnvVar(ctx, dbpkg.CreateProjectEnvVarParams{ProjectID: project.ID, Key: key, Value: "v-" + key}); err != nil {
			t.Fatal(err)
		}
	}
	vars, err := q.GetProjectEnvVarsByProject(ctx, project.ID)
	if err != nil || len(vars) != 2 || vars[0].Key != "ALPHA" || vars[1].Key != "ZED" {
		t.Fatalf("vars = %v, %v; want ordered by key", vars, err)
	}

	_, err = q.CreateProjectEnvVar(ctx, dbpkg.CreateProjectEnvVarParams{ProjectID: project.ID, Key: "ALPHA", Value: "again"})
	if !IsUniqueViolation(err) {
		t.Fatalf("a repeated key should violate the unique constraint, error = %v", err)
	}

	if err := q.DeleteProjectEnvVarsByProject(ctx, project.ID); err != nil {
		t.Fatal(err)
	}
	if vars, _ := q.GetProjectEnvVarsByProject(ctx, project.ID); len(vars) != 0 {
		t.Fatalf("vars after delete = %v", vars)
	}
}

func TestDeploymentEnvVarSnapshot(t *testing.T) {
	q, _ := newQueries(t)
	ctx := context.Background()
	user := createUser(t, q, 1, "alice")
	deployment := createDeployment(t, q, createProject(t, q, user, "shop"))

	if _, err := q.CreateEnvVar(ctx, dbpkg.CreateEnvVarParams{DeploymentID: deployment.ID, Key: "API_URL", SecretArn: str("arn:secret")}); err != nil {
		t.Fatal(err)
	}
	vars, err := q.GetEnvVarsByDeployment(ctx, deployment.ID)
	if err != nil || len(vars) != 1 || vars[0].Key != "API_URL" || vars[0].SecretArn.String != "arn:secret" {
		t.Fatalf("snapshot = %v, %v", vars, err)
	}
}

func TestActivityLogIsNewestFirstAndLimited(t *testing.T) {
	q, _ := newQueries(t)
	ctx := context.Background()
	user := createUser(t, q, 1, "alice")

	for i := 0; i < 55; i++ {
		if _, err := q.CreateActivityLog(ctx, dbpkg.CreateActivityLogParams{UserID: user.ID, Type: "DEPLOY", Message: "event"}); err != nil {
			t.Fatal(err)
		}
	}
	logs, err := q.GetActivityLogsByUserID(ctx, user.ID)
	if err != nil || len(logs) != 50 {
		t.Fatalf("got %d logs, %v; want the newest 50", len(logs), err)
	}
	for i := 1; i < len(logs); i++ {
		if logs[i].CreatedAt.After(logs[i-1].CreatedAt) {
			t.Fatal("activity logs are not newest first")
		}
	}
}

func TestConnectRejectsAnUnreachableDatabase(t *testing.T) {
	if _, err := Connect("postgres://nobody@127.0.0.1:1/none?sslmode=disable&connect_timeout=1"); err == nil {
		t.Fatal("expected an error")
	}
}
