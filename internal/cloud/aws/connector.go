package aws

import (
	"context"
	"fmt"
	"regexp"
)

// Connection is what Hatch stores about a user's account: the role it assumes
// and where the stack is. There are no long-lived keys.
type Connection struct {
	RoleARN    string
	ExternalID string
	Region     string
	StackName  string
}

// Verification is what a successful check found.
type Verification struct {
	// AccountID is the AWS account the role is in, read from its ARN.
	AccountID string
	Outputs   StackOutputs
}

// Connector checks that a connection works end to end: Hatch can assume the
// role, the stack is there and finished, and it carries what Hatch needs.
type Connector struct {
	STS    STS
	Stacks Stacks
}

// sessionName shows up in the user's CloudTrail, so it says what Hatch was doing.
const sessionName = "hatch-verify"

var roleARNPattern = regexp.MustCompile(`^arn:aws[a-z-]*:iam::([0-9]{12}):role/[A-Za-z0-9_+=,.@/-]+$`)

// AccountIDOfRole returns the account id in an IAM role ARN.
func AccountIDOfRole(roleARN string) (string, error) {
	m := roleARNPattern.FindStringSubmatch(roleARN)
	if m == nil {
		return "", fmt.Errorf("%q is not the ARN of an IAM role", roleARN)
	}
	return m[1], nil
}

// Verify assumes the connection's role and reads its stack. A stack made from an
// older template still verifies; Verification.Outputs.UpToDate says whether it
// should be updated.
func (c *Connector) Verify(ctx context.Context, conn Connection) (Verification, error) {
	account, err := AccountIDOfRole(conn.RoleARN)
	if err != nil {
		return Verification{}, err
	}

	creds, err := c.STS.AssumeRole(ctx, AssumeRoleRequest{
		RoleARN:     conn.RoleARN,
		ExternalID:  conn.ExternalID,
		SessionName: sessionName,
		Region:      conn.Region,
	})
	if err != nil {
		return Verification{}, err
	}

	stack, err := c.Stacks.DescribeStack(ctx, creds, conn.Region, conn.StackName)
	if err != nil {
		return Verification{}, err
	}
	if stack.Status != "CREATE_COMPLETE" && stack.Status != "UPDATE_COMPLETE" {
		return Verification{}, &StackNotReadyError{Status: stack.Status}
	}

	outputs, err := ParseOutputs(stack.Outputs)
	if err != nil {
		return Verification{}, err
	}
	// Someone can paste the role of a different stack; the stack names its own.
	if outputs.ControlRoleARN != conn.RoleARN {
		return Verification{}, ErrRoleMismatch
	}
	if outputs.Region != conn.Region {
		return Verification{}, fmt.Errorf("the stack is in %s, not %s", outputs.Region, conn.Region)
	}
	return Verification{AccountID: account, Outputs: outputs}, nil
}
