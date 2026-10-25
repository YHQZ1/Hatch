// Package aws connects Hatch to a user's AWS account: it builds the link that
// starts the hatch-connect stack, assumes the role the stack creates, and reads
// the stack's outputs. Everything that talks to AWS sits behind STS and Stacks,
// so it is tested with the fakes in package fake and never reaches a real
// account.
package aws

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"
)

// Credentials are the temporary credentials of an assumed role. They are never
// stored, and print as a placeholder so a log line or error cannot leak them.
type Credentials struct {
	AccessKeyID     string
	SecretAccessKey string
	SessionToken    string
	Expires         time.Time
}

func (Credentials) String() string   { return "aws.Credentials{redacted}" }
func (Credentials) GoString() string { return "aws.Credentials{redacted}" }

// LogValue keeps slog from printing the fields.
func (Credentials) LogValue() slog.Value { return slog.StringValue("redacted") }

// AssumeRoleRequest asks for temporary credentials for a role in the user's
// account. The ExternalId is what proves the request belongs to this connection.
type AssumeRoleRequest struct {
	RoleARN     string
	ExternalID  string
	SessionName string
	// Region is the connection's region; STS is called there.
	Region string
}

// STS is the one call Hatch makes to get into a user's account.
type STS interface {
	AssumeRole(ctx context.Context, req AssumeRoleRequest) (Credentials, error)
}

// Stack is a CloudFormation stack as Hatch reads it.
type Stack struct {
	Name    string
	Status  string
	Outputs map[string]string
}

// Stacks reads a stack in the user's account with credentials from STS.
type Stacks interface {
	DescribeStack(ctx context.Context, creds Credentials, region, name string) (Stack, error)
}

// Errors a connection can fail with. They are written for the person connecting
// the account, and carry nothing secret.
var (
	// ErrCannotAssumeRole is the usual first mistake: the role ARN is wrong, the
	// stack is not there yet, or it was made with a different ExternalId.
	ErrCannotAssumeRole = errors.New("the role could not be assumed: check the role ARN, and that the stack was created from the link Hatch gave you, which carries this connection's ExternalId")
	// ErrServerCredentials is Hatch's own identity being unusable, which no amount
	// of fixing the role or the stack helps: the server has no AWS credentials, or
	// they have expired or are wrong. It is the operator's to fix, so it says so.
	ErrServerCredentials = errors.New("this Hatch server's own AWS credentials are missing or not valid, so it cannot assume the role; this is not something to fix in your account, ask whoever runs this Hatch")
	// ErrStackNotFound means the role works but the stack is not in this region.
	ErrStackNotFound = errors.New("the stack was not found in this region")
	// ErrRoleMismatch means the stack belongs to another role than the one given.
	ErrRoleMismatch = errors.New("the stack's role is not the role that was given")
)

// StackNotReadyError is returned while a stack is still being created or after
// it failed.
type StackNotReadyError struct{ Status string }

func (e *StackNotReadyError) Error() string {
	if strings.HasSuffix(e.Status, "_IN_PROGRESS") {
		return fmt.Sprintf("the stack is still being set up (%s); try again when it finishes", e.Status)
	}
	return fmt.Sprintf("the stack is not usable (%s): delete it in CloudFormation and create it again from the link", e.Status)
}

// MissingOutputsError means the stack was not made from a hatch-connect template,
// or from one too old to have what Hatch needs.
type MissingOutputsError struct{ Names []string }

func (e *MissingOutputsError) Error() string {
	return fmt.Sprintf("the stack is missing outputs Hatch needs (%s): it was not made from the hatch-connect template, or from an older version", strings.Join(e.Names, ", "))
}
