package handlers

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
	"github.com/YHQZ1/hatch/internal/stream"
	"github.com/gin-gonic/gin"
)

type sseEvent struct{ ID, Event, Data string }

func (e sseEvent) String() string { return fmt.Sprintf("%s#%s:%q", e.Event, e.ID, e.Data) }

// readEvent reads the next event from a server-sent event stream, skipping
// comments. It returns io.EOF when the stream ends.
func readEvent(r *bufio.Reader) (sseEvent, error) {
	var e sseEvent
	var data []string
	seen := false
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return e, err
		}
		line = strings.TrimRight(line, "\r\n")
		switch {
		case line == "":
			if seen {
				e.Data = strings.Join(data, "\n")
				return e, nil
			}
		case strings.HasPrefix(line, ":"), strings.HasPrefix(line, "retry:"):
		case strings.HasPrefix(line, "id: "):
			e.ID, seen = strings.TrimPrefix(line, "id: "), true
		case strings.HasPrefix(line, "event: "):
			e.Event, seen = strings.TrimPrefix(line, "event: "), true
		case strings.HasPrefix(line, "data: "):
			data, seen = append(data, strings.TrimPrefix(line, "data: ")), true
		}
	}
}

// streamFixture is a project with one deployment, and a running server with the
// log stream route, as the user who owns it.
type streamFixture struct {
	projectFixture
	deployment dbpkg.Deployment
	server     *httptest.Server
	sink       stream.Sink
	stop       chan struct{}
}

func newStreamFixture(t *testing.T, status string, writeTimeout time.Duration) streamFixture {
	t.Helper()
	f := newProjectFixture(t, "active")
	deployment, err := f.q.CreateDeployment(context.Background(), dbpkg.CreateDeploymentParams{
		ProjectID: f.project.ID, Branch: "main", Cpu: 256, MemoryMb: 512, Port: 8080, HealthCheck: "/", Subdomain: f.project.Subdomain,
	})
	if err != nil {
		t.Fatal(err)
	}
	setStatus(t, f.q, deployment, status)

	broker := stream.NewBroker(f.pool)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		_ = broker.Run(ctx)
	}()
	t.Cleanup(func() {
		cancel()
		<-done
	})

	stop := make(chan struct{})
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/api/deployments/:id/logs/stream", func(c *gin.Context) {
		c.Set("user_id", f.user.ID.String())
	}, NewLogStreamHandler(f.pool, broker, stop).Stream)

	server := httptest.NewUnstartedServer(router)
	server.Config.WriteTimeout = writeTimeout
	server.Start()
	t.Cleanup(server.Close)

	return streamFixture{projectFixture: f, deployment: deployment, server: server, sink: stream.NewPostgres(f.pool), stop: stop}
}

func setStatus(t *testing.T, q *dbpkg.Queries, d dbpkg.Deployment, status string) {
	t.Helper()
	if err := q.SetDeploymentStatus(context.Background(), dbpkg.SetDeploymentStatusParams{ID: d.ID, Status: status}); err != nil {
		t.Fatal(err)
	}
}

func (f streamFixture) open(t *testing.T, header http.Header, query string) (*http.Response, *bufio.Reader) {
	t.Helper()
	req, err := http.NewRequest("GET", f.server.URL+"/api/deployments/"+f.deployment.ID.String()+"/logs/stream"+query, nil)
	if err != nil {
		t.Fatal(err)
	}
	for k, v := range header {
		req.Header[k] = v
	}
	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = resp.Body.Close() })
	return resp, bufio.NewReader(resp.Body)
}

func (f streamFixture) say(id string, lines ...string) {
	for _, line := range lines {
		f.sink.Publish(context.Background(), id, line)
	}
}

// expect reads events until they match want, or fails with what arrived.
func expect(t *testing.T, r *bufio.Reader, want ...string) {
	t.Helper()
	var got []string
	for range want {
		e, err := readEvent(r)
		if err != nil {
			t.Fatalf("stream ended after %v, wanted %v (%v)", got, want, err)
		}
		got = append(got, e.String())
	}
	if strings.Join(got, "|") != strings.Join(want, "|") {
		t.Fatalf("events\n got  %v\n want %v", got, want)
	}
}

func TestALogStreamSendsHistoryThenNewLinesThenEnds(t *testing.T) {
	f := newStreamFixture(t, "building", 0)
	id := f.deployment.ID.String()
	f.say(id, "one", "two", "three")

	resp, r := f.open(t, nil, "")
	if resp.StatusCode != 200 || !strings.HasPrefix(resp.Header.Get("Content-Type"), "text/event-stream") {
		t.Fatalf("status %d, Content-Type %q", resp.StatusCode, resp.Header.Get("Content-Type"))
	}
	if resp.Header.Get("X-Accel-Buffering") != "no" {
		t.Error("proxies are not told to stop buffering the stream")
	}
	expect(t, r, `status#:"building"`, `log#1:"one"`, `log#2:"two"`, `log#3:"three"`)

	// New lines arrive as they are written, then the final status ends the stream
	// only after every line before it was sent.
	go func() {
		time.Sleep(100 * time.Millisecond)
		f.say(id, "four", "five")
		setStatus(t, f.q, f.deployment, "live")
	}()
	// The status may be reported before the last lines (it is read first, which
	// is what stops a line being cut off), but the stream ends only after all of them.
	var rest []string
	for {
		e, err := readEvent(r)
		if err != nil {
			t.Fatalf("the stream ended after %v without an end event (%v)", rest, err)
		}
		rest = append(rest, e.String())
		if e.Event == "end" {
			break
		}
	}
	logs := ""
	for _, e := range rest {
		if strings.HasPrefix(e, "log#") {
			logs += e + " "
		}
	}
	if logs != `log#4:"four" log#5:"five" ` || rest[len(rest)-1] != `end#:"live"` || !strings.Contains(strings.Join(rest, "|"), `status#:"live"`) {
		t.Fatalf("after the history: %v", rest)
	}
	if _, err := readEvent(r); err != io.EOF {
		t.Fatalf("the stream did not close after end: %v", err)
	}
}

func TestAReconnectingBrowserGetsOnlyWhatItMissed(t *testing.T) {
	f := newStreamFixture(t, "live", 0)
	f.say(f.deployment.ID.String(), "one", "two", "three", "four")

	_, r := f.open(t, http.Header{"Last-Event-Id": {"2"}}, "")
	expect(t, r, `status#:"live"`, `log#3:"three"`, `log#4:"four"`, `end#:"live"`)

	_, r = f.open(t, nil, "?after=3")
	expect(t, r, `status#:"live"`, `log#4:"four"`, `end#:"live"`)
}

func TestAFinishedDeploymentStreamsItsWholeLogAndCloses(t *testing.T) {
	f := newStreamFixture(t, "failed", 0)
	// More than one batch, to cover the loop that reads the rest.
	total := logBatch*2 + 7
	for i := 1; i <= total; i++ {
		f.say(f.deployment.ID.String(), fmt.Sprintf("line %d", i))
	}
	_, r := f.open(t, nil, "")

	expect(t, r, `status#:"failed"`)
	for i := 1; i <= total; i++ {
		e, err := readEvent(r)
		if err != nil || e.Event != "log" || e.ID != fmt.Sprint(i) || e.Data != fmt.Sprintf("line %d", i) {
			t.Fatalf("event %d = %v, %v", i, e, err)
		}
	}
	expect(t, r, `end#:"failed"`)
}

func TestALogLineWithNewlinesIsOneEvent(t *testing.T) {
	f := newStreamFixture(t, "live", 0)
	f.say(f.deployment.ID.String(), "first\nsecond\r\nthird")
	_, r := f.open(t, nil, "")
	expect(t, r, `status#:"live"`, "log#1:\"first\\nsecond\\nthird\"")
}

func TestALogStreamOutlivesTheServersWriteTimeout(t *testing.T) {
	// The real server gives each response 30 seconds; here 400ms, so a stream
	// that did not lift its own deadline would be cut off almost at once.
	f := newStreamFixture(t, "building", 400*time.Millisecond)
	id := f.deployment.ID.String()
	_, r := f.open(t, nil, "")
	expect(t, r, `status#:"building"`)

	for i := 1; i <= 4; i++ {
		time.Sleep(250 * time.Millisecond)
		f.say(id, fmt.Sprintf("tick %d", i))
		expect(t, r, fmt.Sprintf("log#%d:\"tick %d\"", i, i))
	}
}

func TestALogStreamEndsWhenHatchShutsDown(t *testing.T) {
	f := newStreamFixture(t, "building", 0)
	_, r := f.open(t, nil, "")
	expect(t, r, `status#:"building"`)

	close(f.stop)
	deadline := time.AfterFunc(5*time.Second, func() { t.Error("the stream did not end at shutdown") })
	defer deadline.Stop()
	if _, err := readEvent(r); err != io.EOF {
		t.Fatalf("expected the stream to close, got %v", err)
	}
}

func TestALogStreamRefusesWhatItShould(t *testing.T) {
	f := newStreamFixture(t, "live", 0)

	// A deployment that belongs to someone else.
	other, err := f.q.CreateUser(context.Background(), dbpkg.CreateUserParams{GithubID: 2, GithubUsername: "mallory", AccessToken: "x"})
	if err != nil {
		t.Fatal(err)
	}
	sub := "theirs"
	project, err := f.q.CreateProject(context.Background(), dbpkg.CreateProjectParams{
		UserID: other.ID, RepoName: "theirs", RepoUrl: "https://github.com/mallory/theirs", Branch: "main",
		DockerfilePath: "Dockerfile", Port: 80, Subdomain: &sub, HealthCheck: "/",
	})
	if err != nil {
		t.Fatal(err)
	}
	theirs, err := f.q.CreateDeployment(context.Background(), dbpkg.CreateDeploymentParams{
		ProjectID: project.ID, Branch: "main", Cpu: 256, MemoryMb: 512, Port: 80, HealthCheck: "/", Subdomain: &sub,
	})
	if err != nil {
		t.Fatal(err)
	}

	for name, tc := range map[string]struct {
		path string
		want int
	}{
		"someone else's deployment": {"/api/deployments/" + theirs.ID.String() + "/logs/stream", http.StatusNotFound},
		"an unknown deployment":     {"/api/deployments/00000000-0000-0000-0000-000000000000/logs/stream", http.StatusNotFound},
		"a bad id":                  {"/api/deployments/nope/logs/stream", http.StatusBadRequest},
		"a bad position":            {"/api/deployments/" + f.deployment.ID.String() + "/logs/stream?after=-3", http.StatusBadRequest},
		"a position that is text":   {"/api/deployments/" + f.deployment.ID.String() + "/logs/stream?after=abc", http.StatusBadRequest},
	} {
		resp, err := http.Get(f.server.URL + tc.path)
		if err != nil {
			t.Fatal(err)
		}
		_ = resp.Body.Close()
		if resp.StatusCode != tc.want {
			t.Errorf("%s: status %d, want %d", name, resp.StatusCode, tc.want)
		}
	}
}

func TestWriteEventEscapesNothingButSplitsLines(t *testing.T) {
	rec := httptest.NewRecorder()
	if err := writeEvent(rec, 7, "log", "a\nb"); err != nil {
		t.Fatal(err)
	}
	if got, want := rec.Body.String(), "id: 7\nevent: log\ndata: a\ndata: b\n\n"; got != want {
		t.Errorf("got %q, want %q", got, want)
	}
	rec = httptest.NewRecorder()
	_ = writeEvent(rec, 0, "status", "live")
	if got, want := rec.Body.String(), "event: status\ndata: live\n\n"; got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}
