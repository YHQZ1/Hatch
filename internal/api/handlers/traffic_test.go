package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/YHQZ1/hatch/internal/proxy"
	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
)

func decodeTraffic(t *testing.T, body []byte) trafficResponse {
	t.Helper()
	var r trafficResponse
	if err := json.Unmarshal(body, &r); err != nil {
		t.Fatalf("decode %s: %v", body, err)
	}
	return r
}

func TestTrafficListsTheUsersAppsWithTheirRequests(t *testing.T) {
	f := newProjectFixture(t, "active")
	stats := proxy.NewStats()
	stats.Record("shop", 200, 20*time.Millisecond)
	stats.Record("shop", 500, 40*time.Millisecond)

	rec := f.call(t, NewTrafficHandler(f.pool, stats).Get)

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d, body %s", rec.Code, rec.Body)
	}
	r := decodeTraffic(t, rec.Body.Bytes())
	if !r.Available || r.WindowMinutes != proxy.Window {
		t.Errorf("available %v, window %d", r.Available, r.WindowMinutes)
	}
	shop, ok := r.Apps["shop"]
	if !ok || shop.TotalRequests != 2 || shop.TotalErrors != 1 || len(shop.Requests) != proxy.Window {
		t.Errorf("shop = %+v", shop)
	}
}

func TestTrafficOmitsAppsTheUserDoesNotOwn(t *testing.T) {
	f := newProjectFixture(t, "active")
	other, err := f.q.CreateUser(context.Background(), dbpkg.CreateUserParams{GithubID: 2, GithubUsername: "intruder", AccessToken: "x"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.q.CreateProject(context.Background(), dbpkg.CreateProjectParams{
		UserID: other.ID, RepoName: "intruder/secret", RepoUrl: "https://github.com/intruder/secret",
		Branch: "main", DockerfilePath: "Dockerfile", Port: 8080, Subdomain: ptr("secret"),
	}); err != nil {
		t.Fatal(err)
	}
	stats := proxy.NewStats()
	stats.Record("secret", 200, time.Millisecond)

	rec := f.call(t, NewTrafficHandler(f.pool, stats).Get)

	r := decodeTraffic(t, rec.Body.Bytes())
	if _, leaked := r.Apps["secret"]; leaked {
		t.Fatal("another user's app is in the response")
	}
	if _, ok := r.Apps["shop"]; !ok {
		t.Error("the user's own app is missing, even with no requests")
	}
}

func TestTrafficSaysWhenNothingCountsIt(t *testing.T) {
	f := newProjectFixture(t, "active")

	rec := f.call(t, NewTrafficHandler(f.pool, nil).Get)

	r := decodeTraffic(t, rec.Body.Bytes())
	if r.Available || len(r.Apps) != 0 {
		t.Fatalf("response = %+v, want unavailable and empty", r)
	}
}

func TestParseLogTail(t *testing.T) {
	if n, err := parseLogTail(""); err != nil || n != maxDeploymentLogLines {
		t.Errorf("empty = %d, %v; want every line", n, err)
	}
	if n, err := parseLogTail("1"); err != nil || n != 1 {
		t.Errorf("1 = %d, %v", n, err)
	}
	for _, bad := range []string{"0", "-1", "abc", "5001", "1.5"} {
		if _, err := parseLogTail(bad); err == nil {
			t.Errorf("%q was accepted", bad)
		}
	}
}
