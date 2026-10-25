package aws_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/YHQZ1/hatch/internal/cloud/aws"
	"github.com/YHQZ1/hatch/internal/cloud/aws/fake"
)

const (
	roleARN    = "arn:aws:iam::123456789012:role/hatch-control"
	externalID = "0123456789abcdef0123456789abcdef0123456789abcdef"
	region     = "ap-south-1"
)

func connection() aws.Connection {
	return aws.Connection{RoleARN: roleARN, ExternalID: externalID, Region: region, StackName: aws.DefaultStackName}
}

func cloudWith(stack *aws.Stack) *fake.Cloud {
	c := &fake.Cloud{}
	c.AddAccount(fake.Account{RoleARN: roleARN, ExternalID: externalID, Region: region, Stack: stack})
	return c
}

func TestVerifyReadsAHealthyStack(t *testing.T) {
	cloud := cloudWith(fake.HealthyStack(roleARN, region))
	got, err := (&aws.Connector{STS: cloud, Stacks: cloud}).Verify(context.Background(), connection())
	if err != nil {
		t.Fatal(err)
	}
	if got.AccountID != "123456789012" {
		t.Errorf("account = %q", got.AccountID)
	}
	o := got.Outputs
	if o.ClusterName != "hatch" || len(o.SubnetIDs) != 2 || o.ServesHTTPS || !o.UpToDate() {
		t.Errorf("outputs = %+v", o)
	}
	calls := cloud.AssumeCalls()
	if len(calls) != 1 || calls[0].ExternalID != externalID || calls[0].Region != region {
		t.Errorf("assume calls = %+v", calls)
	}
}

func TestVerifyFailures(t *testing.T) {
	missingOutput := fake.HealthyStack(roleARN, region)
	delete(missingOutput.Outputs, "ClusterName")
	delete(missingOutput.Outputs, "VpcId")
	otherRole := fake.HealthyStack("arn:aws:iam::123456789012:role/somebody-else", region)
	wrongRegion := fake.HealthyStack(roleARN, "us-east-1")

	tests := []struct {
		name    string
		cloud   func() *fake.Cloud
		conn    func(aws.Connection) aws.Connection
		check   func(error) bool
		wantMsg string
	}{
		{
			name:  "a wrong ExternalId",
			cloud: func() *fake.Cloud { return cloudWith(fake.HealthyStack(roleARN, region)) },
			conn:  func(c aws.Connection) aws.Connection { c.ExternalID = strings.Repeat("x", 40); return c },
			check: func(err error) bool { return errors.Is(err, aws.ErrCannotAssumeRole) },
		},
		{
			name:  "a role that does not exist",
			cloud: func() *fake.Cloud { return cloudWith(fake.HealthyStack(roleARN, region)) },
			conn: func(c aws.Connection) aws.Connection {
				c.RoleARN = "arn:aws:iam::999999999999:role/hatch-control"
				return c
			},
			check: func(err error) bool { return errors.Is(err, aws.ErrCannotAssumeRole) },
		},
		{
			name:  "a role ARN that is not a role",
			cloud: func() *fake.Cloud { return cloudWith(nil) },
			conn:  func(c aws.Connection) aws.Connection { c.RoleARN = "arn:aws:iam::123456789012:user/me"; return c },
			check: func(err error) bool { return err != nil && strings.Contains(err.Error(), "not the ARN of an IAM role") },
		},
		{
			name:  "no stack yet",
			cloud: func() *fake.Cloud { return cloudWith(nil) },
			check: func(err error) bool { return errors.Is(err, aws.ErrStackNotFound) },
		},
		{
			name:  "a stack with another name",
			cloud: func() *fake.Cloud { return cloudWith(fake.HealthyStack(roleARN, region)) },
			conn:  func(c aws.Connection) aws.Connection { c.StackName = "other"; return c },
			check: func(err error) bool { return errors.Is(err, aws.ErrStackNotFound) },
		},
		{
			name: "a stack still being created",
			cloud: func() *fake.Cloud {
				c := cloudWith(fake.HealthyStack(roleARN, region))
				c.SetStackStatus(roleARN, "CREATE_IN_PROGRESS")
				return c
			},
			check: func(err error) bool {
				var nr *aws.StackNotReadyError
				return errors.As(err, &nr) && strings.Contains(err.Error(), "still being set up")
			},
		},
		{
			name: "a stack that rolled back",
			cloud: func() *fake.Cloud {
				c := cloudWith(fake.HealthyStack(roleARN, region))
				c.SetStackStatus(roleARN, "ROLLBACK_COMPLETE")
				return c
			},
			check: func(err error) bool {
				var nr *aws.StackNotReadyError
				return errors.As(err, &nr) && strings.Contains(err.Error(), "create it again")
			},
		},
		{
			name:  "a stack without the outputs Hatch needs",
			cloud: func() *fake.Cloud { return cloudWith(missingOutput) },
			check: func(err error) bool {
				var mo *aws.MissingOutputsError
				return errors.As(err, &mo) && strings.Join(mo.Names, ",") == "ClusterName,VpcId"
			},
		},
		{
			name:  "a stack that names another role",
			cloud: func() *fake.Cloud { return cloudWith(otherRole) },
			check: func(err error) bool { return errors.Is(err, aws.ErrRoleMismatch) },
		},
		{
			name:  "a stack whose outputs name another region",
			cloud: func() *fake.Cloud { return cloudWith(wrongRegion) },
			check: func(err error) bool {
				return err != nil && strings.Contains(err.Error(), "the stack is in us-east-1, not ap-south-1")
			},
		},
		{
			name: "a stack that lives in another region",
			cloud: func() *fake.Cloud {
				c := &fake.Cloud{}
				c.AddAccount(fake.Account{RoleARN: roleARN, ExternalID: externalID, Region: "us-east-1", Stack: fake.HealthyStack(roleARN, "us-east-1")})
				return c
			},
			check: func(err error) bool { return errors.Is(err, aws.ErrStackNotFound) },
		},
		{
			name: "a throttled STS is passed on, not blamed on the role",
			cloud: func() *fake.Cloud {
				c := cloudWith(fake.HealthyStack(roleARN, region))
				c.AssumeErr = errors.New("assume the role: Throttling: Rate exceeded")
				return c
			},
			check: func(err error) bool {
				return err != nil && !errors.Is(err, aws.ErrCannotAssumeRole) && strings.Contains(err.Error(), "Throttling")
			},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cloud := tc.cloud()
			conn := connection()
			if tc.conn != nil {
				conn = tc.conn(conn)
			}
			_, err := (&aws.Connector{STS: cloud, Stacks: cloud}).Verify(context.Background(), conn)
			if err == nil || !tc.check(err) {
				t.Fatalf("err = %v", err)
			}
		})
	}
}

func TestAnOlderTemplateStillVerifiesButIsNotUpToDate(t *testing.T) {
	stack := fake.HealthyStack(roleARN, region)
	stack.Outputs["HatchTemplateVersion"] = "0"
	cloud := cloudWith(stack)
	got, err := (&aws.Connector{STS: cloud, Stacks: cloud}).Verify(context.Background(), connection())
	if err != nil {
		t.Fatal(err)
	}
	if got.Outputs.UpToDate() {
		t.Error("an older stack reported as up to date")
	}
}

func TestParseOutputsRejectsAServesHTTPSThatIsNotABoolean(t *testing.T) {
	raw := fake.Outputs(roleARN, region)
	raw["ServesHttps"] = "yes"
	if _, err := aws.ParseOutputs(raw); err == nil || !strings.Contains(err.Error(), "ServesHttps") {
		t.Fatalf("err = %v", err)
	}
	raw["ServesHttps"] = "true"
	o, err := aws.ParseOutputs(raw)
	if err != nil || !o.ServesHTTPS {
		t.Fatalf("o, err = %+v, %v", o, err)
	}
}

func TestCredentialsNeverPrintTheirSecrets(t *testing.T) {
	c := aws.Credentials{AccessKeyID: "AKIAXYZ", SecretAccessKey: "sup3rsecret", SessionToken: "tok3n"}
	for _, got := range []string{
		strings.TrimSpace(fmtSprint(c)), fmtSprintf("%+v", c), fmtSprintf("%#v", c), fmtSprintf("%v", &c),
	} {
		for _, secret := range []string{"AKIAXYZ", "sup3rsecret", "tok3n"} {
			if strings.Contains(got, secret) {
				t.Errorf("%q contains %q", got, secret)
			}
		}
	}
}

func TestAccountIDOfRole(t *testing.T) {
	for arn, want := range map[string]string{
		"arn:aws:iam::123456789012:role/hatch-control":                "123456789012",
		"arn:aws-us-gov:iam::210987654321:role/path/to/hatch-control": "210987654321",
	} {
		if got, err := aws.AccountIDOfRole(arn); err != nil || got != want {
			t.Errorf("AccountIDOfRole(%q) = %q, %v", arn, got, err)
		}
	}
	for _, bad := range []string{"", "arn:aws:iam::123456789012:user/me", "arn:aws:iam::12345:role/x", "role/hatch-control"} {
		if _, err := aws.AccountIDOfRole(bad); err == nil {
			t.Errorf("AccountIDOfRole(%q) accepted", bad)
		}
	}
}
