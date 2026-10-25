package jobs

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"

	awsconn "github.com/YHQZ1/hatch/internal/cloud/aws"
	awsfake "github.com/YHQZ1/hatch/internal/cloud/aws/fake"
	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
)

const (
	vcRole     = "arn:aws:iam::123456789012:role/hatch-control"
	vcExternal = "0123456789abcdef0123456789abcdef0123456789abcdef"
	vcRegion   = "ap-south-1"
)

// verifierFunc lets a test stand in for the connector.
type verifierFunc func(ctx context.Context, conn awsconn.Connection) (awsconn.Verification, error)

func (f verifierFunc) Verify(ctx context.Context, conn awsconn.Connection) (awsconn.Verification, error) {
	return f(ctx, conn)
}

// newConnection adds a connection of the project's user that has been given a
// role, as the API leaves one before it is checked.
func (h *harness) newConnection(role string) dbpkg.CloudConnection {
	h.t.Helper()
	ctx := context.Background()
	row, err := h.q.CreateCloudConnection(ctx, dbpkg.CreateCloudConnectionParams{
		UserID: h.project.UserID, Region: vcRegion, StackName: awsconn.DefaultStackName,
		ExternalID: vcExternal + uuid.NewString()[:4], PrincipalArn: "arn:aws:iam::111122223333:role/hatch-server",
		MonthlyBudgetUsd: 10, BudgetEmail: "me@example.com",
	})
	if err != nil {
		h.t.Fatal(err)
	}
	if role != "" {
		account, _ := awsconn.AccountIDOfRole(role)
		row, err = h.q.SetCloudConnectionRole(ctx, dbpkg.SetCloudConnectionRoleParams{ID: row.ID, UserID: row.UserID, RoleArn: &role, AwsAccountID: &account})
		if err != nil {
			h.t.Fatal(err)
		}
	}
	return row
}

func (h *harness) connection(id uuid.UUID) dbpkg.CloudConnection {
	h.t.Helper()
	row, err := h.q.GetCloudConnection(context.Background(), id)
	if err != nil {
		h.t.Fatal(err)
	}
	return row
}

// cloudFor puts a healthy stack for the connection in a fake cloud and makes it
// what the jobs verify with.
func (h *harness) cloudFor(conn dbpkg.CloudConnection) *awsfake.Cloud {
	h.t.Helper()
	cloud := &awsfake.Cloud{}
	cloud.AddAccount(awsfake.Account{RoleARN: vcRole, ExternalID: conn.ExternalID, Region: vcRegion, Stack: awsfake.HealthyStack(vcRole, vcRegion)})
	h.deps.Connections = &awsconn.Connector{STS: cloud, Stacks: cloud}
	return cloud
}

func (h *harness) waitForConnection(id uuid.UUID, want string) dbpkg.CloudConnection {
	h.t.Helper()
	eventually(h.t, func() bool { return h.connection(id).Status == want }, func() string {
		c := h.connection(id)
		msg := ""
		if c.LastError != nil {
			msg = *c.LastError
		}
		return "connection status " + want + " (is " + c.Status + ", error " + msg + ")"
	})
	return h.connection(id)
}

func verifyJob(c dbpkg.CloudConnection) VerifyConnectionArgs {
	return VerifyConnectionArgs{ConnectionID: c.ID, RoleARN: *c.RoleArn}
}

func TestAConnectionIsVerifiedAndWhatTheStackReportedIsKept(t *testing.T) {
	h := newHarness(t)
	conn := h.newConnection(vcRole)
	h.cloudFor(conn)
	client, _ := h.start()

	if _, err := client.Insert(context.Background(), verifyJob(conn), nil); err != nil {
		t.Fatal(err)
	}
	got := h.waitForConnection(conn.ID, "connected")

	if got.LastError != nil || got.LastVerifiedAt == nil || got.TemplateVersion == nil || *got.TemplateVersion != awsconn.CurrentTemplateVersion {
		t.Errorf("connection = %+v", got)
	}
	if got.ServesHttps == nil || *got.ServesHttps || got.AwsAccountID == nil || *got.AwsAccountID != "123456789012" {
		t.Errorf("connection = %+v", got)
	}
	var outputs awsconn.StackOutputs
	if err := json.Unmarshal(got.StackOutputs, &outputs); err != nil {
		t.Fatalf("stored outputs %s: %v", got.StackOutputs, err)
	}
	if outputs.ClusterName != "hatch" || len(outputs.SubnetIDs) != 2 || outputs.RepositoryURI == "" {
		t.Errorf("outputs = %+v", outputs)
	}
	eventually(t, func() bool { return h.jobState("verify_connection") == "completed" }, func() string { return "job state " + h.jobState("verify_connection") })
}

func TestAFailedCheckIsRecordedForTheUserAndNotRetried(t *testing.T) {
	tests := []struct {
		name  string
		setup func(h *harness, conn dbpkg.CloudConnection)
		want  string
	}{
		{"an ExternalId the stack was not made with", func(h *harness, conn dbpkg.CloudConnection) {
			cloud := &awsfake.Cloud{}
			cloud.AddAccount(awsfake.Account{RoleARN: vcRole, ExternalID: "something-else-entirely-0123456789abcdef", Region: vcRegion, Stack: awsfake.HealthyStack(vcRole, vcRegion)})
			h.deps.Connections = &awsconn.Connector{STS: cloud, Stacks: cloud}
		}, "the role could not be assumed"},
		{"no stack yet", func(h *harness, conn dbpkg.CloudConnection) {
			cloud := &awsfake.Cloud{}
			cloud.AddAccount(awsfake.Account{RoleARN: vcRole, ExternalID: conn.ExternalID, Region: vcRegion})
			h.deps.Connections = &awsconn.Connector{STS: cloud, Stacks: cloud}
		}, "the stack was not found"},
		{"a stack still being created", func(h *harness, conn dbpkg.CloudConnection) {
			h.cloudFor(conn).SetStackStatus(vcRole, "CREATE_IN_PROGRESS")
		}, "still being set up"},
		{"no AWS credentials on this server", func(h *harness, conn dbpkg.CloudConnection) {
			h.deps.Connections = nil
		}, "no AWS credentials"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := newHarness(t)
			conn := h.newConnection(vcRole)
			tc.setup(h, conn)
			client, _ := h.start()
			if _, err := client.Insert(context.Background(), verifyJob(conn), nil); err != nil {
				t.Fatal(err)
			}

			got := h.waitForConnection(conn.ID, "error")
			if got.LastError == nil || !strings.Contains(*got.LastError, tc.want) {
				t.Errorf("last error = %v, want it to mention %q", got.LastError, tc.want)
			}
			if got.LastVerifiedAt != nil {
				t.Error("a failed check was recorded as a verification")
			}
			eventually(t, func() bool { return h.jobState("verify_connection") == "cancelled" }, func() string { return "job state " + h.jobState("verify_connection") })
		})
	}
}

func TestCheckingAgainAfterFixingWhatWasWrongConnectsAndClearsTheError(t *testing.T) {
	h := newHarness(t)
	conn := h.newConnection(vcRole)
	cloud := h.cloudFor(conn)
	cloud.SetStackStatus(vcRole, "CREATE_IN_PROGRESS")
	client, _ := h.start()

	if _, err := client.Insert(context.Background(), verifyJob(conn), nil); err != nil {
		t.Fatal(err)
	}
	h.waitForConnection(conn.ID, "error")
	eventually(t, func() bool { return h.jobState("verify_connection") == "cancelled" }, func() string { return "job state " + h.jobState("verify_connection") })

	cloud.SetStackStatus(vcRole, "CREATE_COMPLETE")
	if _, err := client.Insert(context.Background(), verifyJob(conn), nil); err != nil {
		t.Fatal(err)
	}
	got := h.waitForConnection(conn.ID, "connected")
	if got.LastError != nil {
		t.Errorf("the old error is still there: %q", *got.LastError)
	}
}

func TestAResultAboutARoleThatWasReplacedIsNotRecorded(t *testing.T) {
	h := newHarness(t)
	conn := h.newConnection(vcRole)
	h.cloudFor(conn)

	// The user gives another role while the check of the first is still queued.
	newRole := "arn:aws:iam::210987654321:role/hatch-control"
	account := "210987654321"
	if _, err := h.q.SetCloudConnectionRole(context.Background(), dbpkg.SetCloudConnectionRoleParams{ID: conn.ID, UserID: conn.UserID, RoleArn: &newRole, AwsAccountID: &account}); err != nil {
		t.Fatal(err)
	}
	client, _ := h.start()
	if _, err := client.Insert(context.Background(), verifyJob(conn), nil); err != nil {
		t.Fatal(err)
	}

	eventually(t, func() bool { return h.jobState("verify_connection") == "completed" }, func() string { return "job state " + h.jobState("verify_connection") })
	if got := h.connection(conn.ID); got.Status != "pending" || got.TemplateVersion != nil || got.LastError != nil {
		t.Errorf("the old role's check changed the connection: status %q, template version %v, error %v", got.Status, got.TemplateVersion, got.LastError)
	}
}

func TestAConnectionRemovedWhileQueuedIsNotAFailure(t *testing.T) {
	h := newHarness(t)
	conn := h.newConnection(vcRole)
	h.cloudFor(conn)
	if _, err := h.q.DeleteCloudConnection(context.Background(), dbpkg.DeleteCloudConnectionParams{ID: conn.ID, UserID: conn.UserID}); err != nil {
		t.Fatal(err)
	}
	client, _ := h.start()
	if _, err := client.Insert(context.Background(), verifyJob(conn), nil); err != nil {
		t.Fatal(err)
	}
	eventually(t, func() bool { return h.jobState("verify_connection") == "completed" }, func() string { return "job state " + h.jobState("verify_connection") })
}

func TestACheckInterruptedByShutdownRunsAgainOnTheNextStart(t *testing.T) {
	h := newHarness(t)
	conn := h.newConnection(vcRole)
	cloud := h.cloudFor(conn)
	real := h.deps.Connections

	var mu sync.Mutex
	calls := 0
	started := make(chan struct{})
	h.deps.Connections = verifierFunc(func(ctx context.Context, c awsconn.Connection) (awsconn.Verification, error) {
		mu.Lock()
		calls++
		first := calls == 1
		mu.Unlock()
		if first {
			close(started)
			<-ctx.Done()
			return awsconn.Verification{}, ctx.Err()
		}
		return real.Verify(ctx, c)
	})
	_ = cloud

	first, stopFirst := h.start()
	if _, err := first.Insert(context.Background(), verifyJob(conn), nil); err != nil {
		t.Fatal(err)
	}
	<-started
	stopFirst()

	if got := h.connection(conn.ID); got.Status != "pending" || got.LastError != nil {
		t.Fatalf("an interrupted check was recorded as %+v", got)
	}
	if got := h.jobState("verify_connection"); got == "cancelled" || got == "discarded" {
		t.Fatalf("job state after shutdown = %q, want it to run again", got)
	}

	h.start()
	h.waitForConnection(conn.ID, "connected")
}

func TestTwoChecksOfTheSameRoleAreQueuedOnlyOnce(t *testing.T) {
	h := newHarness(t)
	conn := h.newConnection(vcRole)
	// Not started, so nothing runs and both inserts see the first one waiting.
	client, err := NewInserter(h.pool)
	if err != nil {
		t.Fatal(err)
	}
	first, err := client.Insert(context.Background(), verifyJob(conn), nil)
	if err != nil {
		t.Fatal(err)
	}
	second, err := client.Insert(context.Background(), verifyJob(conn), nil)
	if err != nil {
		t.Fatal(err)
	}
	if first.UniqueSkippedAsDuplicate || !second.UniqueSkippedAsDuplicate {
		t.Errorf("first skipped %v, second skipped %v; want the second only", first.UniqueSkippedAsDuplicate, second.UniqueSkippedAsDuplicate)
	}

	// A different role is a different check.
	other := conn
	otherRole := "arn:aws:iam::210987654321:role/hatch-control"
	other.RoleArn = &otherRole
	third, err := client.Insert(context.Background(), verifyJob(other), nil)
	if err != nil || third.UniqueSkippedAsDuplicate {
		t.Errorf("a check of another role was skipped: %v, %v", third, err)
	}
}

func TestVerifyConnectionArgsValidate(t *testing.T) {
	if err := (VerifyConnectionArgs{}).Validate(); err == nil {
		t.Error("empty args accepted")
	}
	if err := (VerifyConnectionArgs{ConnectionID: uuid.New()}).Validate(); err == nil {
		t.Error("args without a role accepted")
	}
	if err := (VerifyConnectionArgs{ConnectionID: uuid.New(), RoleARN: vcRole}).Validate(); err != nil {
		t.Error(err)
	}
}

// The role is swapped after the job has read the connection and while the check
// is in flight, so only the guard in the update stands between the old role's
// result and the new role's row.
func TestAResultArrivingAfterTheRoleWasReplacedIsDropped(t *testing.T) {
	h := newHarness(t)
	conn := h.newConnection(vcRole)
	cloud := h.cloudFor(conn)
	real := h.deps.Connections

	newRole := "arn:aws:iam::210987654321:role/hatch-control"
	h.deps.Connections = verifierFunc(func(ctx context.Context, c awsconn.Connection) (awsconn.Verification, error) {
		account := "210987654321"
		if _, err := h.q.SetCloudConnectionRole(ctx, dbpkg.SetCloudConnectionRoleParams{ID: conn.ID, UserID: conn.UserID, RoleArn: &newRole, AwsAccountID: &account}); err != nil {
			t.Error(err)
		}
		return real.Verify(ctx, c)
	})
	_ = cloud
	client, _ := h.start()
	if _, err := client.Insert(context.Background(), verifyJob(conn), nil); err != nil {
		t.Fatal(err)
	}

	eventually(t, func() bool { return h.jobState("verify_connection") == "completed" }, func() string { return "job state " + h.jobState("verify_connection") })
	got := h.connection(conn.ID)
	if got.Status != "pending" || got.TemplateVersion != nil || got.StackOutputs != nil || got.LastVerifiedAt != nil {
		t.Errorf("the old role's result was recorded on the new role: status %q, template version %v, verified at %v", got.Status, got.TemplateVersion, got.LastVerifiedAt)
	}
	if got.RoleArn == nil || *got.RoleArn != newRole {
		t.Errorf("role = %v", got.RoleArn)
	}
}
