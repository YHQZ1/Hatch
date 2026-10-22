package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func TestShortIDRange(t *testing.T) {
	low, high, ok := shortIDRange("430b592c")
	if !ok || low.String() != "430b592c-0000-0000-0000-000000000000" || high.String() != "430b592c-ffff-ffff-ffff-ffffffffffff" {
		t.Fatalf("430b592c = %v..%v, %v", low, high, ok)
	}
	// Dashes and capitals are fine; the range follows the digits given.
	low, high, ok = shortIDRange(" 430B592C-089e ")
	if !ok || low.String() != "430b592c-089e-0000-0000-000000000000" || high.String() != "430b592c-089e-ffff-ffff-ffffffffffff" {
		t.Fatalf("with dashes = %v..%v, %v", low, high, ok)
	}
	for _, bad := range []string{"", "430b59", "430b592", "430b592g", "430b592c!", "430b592c089e4776a2140cbfcd0de2f4", "zzzzzzzz"} {
		if _, _, ok := shortIDRange(bad); ok {
			t.Errorf("%q was accepted", bad)
		}
	}
}

type shortIDFixture struct {
	rollbackFixture
}

// get asks for a deployment by what the address holds, as the signed-in user.
func (f shortIDFixture) get(t *testing.T, ref string, user uuid.UUID) (int, map[string]any) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	c.Set("user_id", user.String())
	c.Params = gin.Params{{Key: "id", Value: ref}}
	f.handler.GetDeployment(c)
	c.Writer.WriteHeaderNow()
	var body map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	return rec.Code, body
}

// setID gives a deployment a chosen id, so the tests can make short ids collide.
func (f shortIDFixture) setID(t *testing.T, from uuid.UUID, to string) {
	t.Helper()
	ctx := context.Background()
	// The release helper gives each deployment a variable, which refers to its id.
	if _, err := f.pool.Exec(ctx, `DELETE FROM env_vars WHERE deployment_id = $1`, from); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, `UPDATE deployments SET id = $2 WHERE id = $1`, from, to); err != nil {
		t.Fatal(err)
	}
}

func TestADeploymentIsFoundByItsShortIDOrItsWholeID(t *testing.T) {
	f := shortIDFixture{newRollbackFixture(t)}
	d := f.release(t, 5, "x")
	f.setID(t, d.ID, "430b592c-089e-4776-a214-0cbfcd0de2f4")

	for _, ref := range []string{"430b592c", "430B592C", "430b592c-089e", "430b592c089e4776a2140cbfcd0de2f4", "430b592c-089e-4776-a214-0cbfcd0de2f4"} {
		status, body := f.get(t, ref, f.user.ID)
		if status != http.StatusOK || body["id"] != "430b592c-089e-4776-a214-0cbfcd0de2f4" {
			t.Errorf("%q: status %d, body %v", ref, status, body)
		}
	}
}

func TestAShortIDThatFitsTwoDeploymentsAsksForMoreOfTheID(t *testing.T) {
	f := shortIDFixture{newRollbackFixture(t)}
	a, b := f.release(t, 5, "a"), f.release(t, 4, "b")
	f.setID(t, a.ID, "aaaaaaaa-0000-4000-8000-000000000001")
	f.setID(t, b.ID, "aaaaaaaa-0000-4000-8000-000000000002")

	if status, body := f.get(t, "aaaaaaaa", f.user.ID); status != http.StatusConflict {
		t.Fatalf("ambiguous: status %d, body %v", status, body)
	}
	// More of the id settles it.
	if status, body := f.get(t, "aaaaaaaa-0000-4000-8000-000000000002", f.user.ID); status != http.StatusOK || body["id"] != "aaaaaaaa-0000-4000-8000-000000000002" {
		t.Fatalf("whole id: status %d, body %v", status, body)
	}
	if status, _ := f.get(t, "aaaaaaaa-0000-4000-8000", f.user.ID); status != http.StatusConflict {
		t.Errorf("a prefix that still fits both: status %d, want 409", status)
	}
	if status, body := f.get(t, "aaaaaaaa-0000-4000-8000-0000000000", f.user.ID); status != http.StatusConflict {
		t.Errorf("status %d, body %v", status, body)
	}
}

func TestAShortIDNeverReachesAnotherUsersDeployment(t *testing.T) {
	f := shortIDFixture{newRollbackFixture(t)}
	d := f.release(t, 5, "mine")
	f.setID(t, d.ID, "bbbbbbbb-0000-4000-8000-000000000001")
	stranger := uuid.New()

	for _, ref := range []string{"bbbbbbbb", "bbbbbbbb-0000-4000-8000-000000000001"} {
		if status, body := f.get(t, ref, stranger); status != http.StatusNotFound {
			t.Errorf("%q as another user: status %d, body %v", ref, status, body)
		}
	}
}

func TestSomethingThatIsNotAnIDIsRejectedOrNotFound(t *testing.T) {
	f := shortIDFixture{newRollbackFixture(t)}
	f.release(t, 5, "x")
	for ref, want := range map[string]int{
		"nope":     http.StatusBadRequest,
		"abc":      http.StatusBadRequest,
		"1234567":  http.StatusBadRequest, // seven digits is too few to name anything
		"deadbeef": http.StatusNotFound,   // well formed, matches nothing
	} {
		if status, body := f.get(t, ref, f.user.ID); status != want {
			t.Errorf("%q: status %d, want %d (%v)", ref, status, want, body)
		}
	}
}
