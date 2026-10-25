package aws

import (
	"errors"
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
