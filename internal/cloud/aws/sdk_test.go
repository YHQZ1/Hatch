package aws

import (
	"errors"
	"strings"
	"testing"

	"github.com/aws/smithy-go"
)

func TestClassifyAssumeRole(t *testing.T) {
	if got := classifyAssumeRole(&smithy.GenericAPIError{Code: "AccessDenied", Message: "not authorized"}); !errors.Is(got, ErrCannotAssumeRole) {
		t.Errorf("AccessDenied = %v", got)
	}
	throttle := &smithy.GenericAPIError{Code: "Throttling", Message: "Rate exceeded"}
	got := classifyAssumeRole(throttle)
	if errors.Is(got, ErrCannotAssumeRole) {
		t.Error("a throttle was reported as a wrong role")
	}
	if !errors.Is(got, throttle) {
		t.Error("the original error is lost")
	}
}

// What a user saw when the machine's own AWS keys were invalid: a raw SDK error
// with a request id, for a problem only the operator can fix.
func TestClassifyAssumeRoleSaysWhenHatchsOwnCredentialsAreTheProblem(t *testing.T) {
	for _, code := range []string{
		"InvalidClientTokenId", "UnrecognizedClientException", "ExpiredToken", "ExpiredTokenException",
		"SignatureDoesNotMatch", "InvalidSignatureException", "IncompleteSignature", "MissingAuthenticationToken",
	} {
		got := classifyAssumeRole(&smithy.GenericAPIError{Code: code, Message: "The security token included in the request is invalid."})
		if !errors.Is(got, ErrServerCredentials) {
			t.Errorf("%s = %v", code, got)
		}
		if errors.Is(got, ErrCannotAssumeRole) {
			t.Errorf("%s was blamed on the user's role", code)
		}
	}

	// No credentials at all: the SDK fails before it makes a request.
	for _, msg := range []string{
		"failed to retrieve credentials: no EC2 IMDS role found",
		"operation error STS: AssumeRole, get identity: get credentials: failed to retrieve credentials",
	} {
		if got := classifyAssumeRole(errors.New(msg)); !errors.Is(got, ErrServerCredentials) {
			t.Errorf("%q = %v", msg, got)
		}
	}

	// The message tells the user it is not theirs to fix, and carries no request id.
	msg := ErrServerCredentials.Error()
	if !strings.Contains(msg, "ask whoever runs this Hatch") || strings.Contains(msg, "RequestID") {
		t.Errorf("message = %q", msg)
	}
}

func TestClassifyDescribeStack(t *testing.T) {
	missing := &smithy.GenericAPIError{Code: "ValidationError", Message: "Stack with id hatch-connect does not exist"}
	if got := classifyDescribeStack(missing); !errors.Is(got, ErrStackNotFound) {
		t.Errorf("missing stack = %v", got)
	}
	other := &smithy.GenericAPIError{Code: "ValidationError", Message: "Template format error"}
	if errors.Is(classifyDescribeStack(other), ErrStackNotFound) {
		t.Error("another validation error was reported as a missing stack")
	}
}
