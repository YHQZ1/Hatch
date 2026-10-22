package docker

import (
	"testing"

	ecrtypes "github.com/aws/aws-sdk-go-v2/service/ecr/types"
)

func TestParseECRImageURI(t *testing.T) {
	ref, ok := parseECRImageURI("123456789012.dkr.ecr.ap-south-1.amazonaws.com/hatch-user-app-builds:tag-1")
	if !ok {
		t.Fatal("parseECRImageURI() ok = false, want true")
	}
	if ref.repository != "hatch-user-app-builds" || ref.tag != "tag-1" {
		t.Fatalf("parseECRImageURI() = %+v", ref)
	}

	ref, ok = parseECRImageURI("123456789012.dkr.ecr.ap-south-1.amazonaws.com/org/repo:tag-2")
	if !ok {
		t.Fatal("parseECRImageURI() nested ok = false, want true")
	}
	if ref.repository != "org/repo" || ref.tag != "tag-2" {
		t.Fatalf("parseECRImageURI() nested = %+v", ref)
	}
}

func TestParseECRImageURIRejectsInvalidRefs(t *testing.T) {
	for _, imageURI := range []string{"", "repo", "registry/repo", "registry/:tag", "registry/repo:"} {
		if _, ok := parseECRImageURI(imageURI); ok {
			t.Fatalf("parseECRImageURI(%q) ok = true, want false", imageURI)
		}
	}
}

func TestCheckECRDeleteFailuresIgnoresMissingImages(t *testing.T) {
	reason := "missing"
	err := checkECRDeleteFailures("repo", []ecrtypes.ImageFailure{
		{FailureCode: ecrtypes.ImageFailureCodeImageNotFound, FailureReason: &reason},
	})
	if err != nil {
		t.Fatalf("checkECRDeleteFailures() error = %v", err)
	}
}

func TestCheckECRDeleteFailuresReturnsRealFailures(t *testing.T) {
	reason := "bad digest"
	err := checkECRDeleteFailures("repo", []ecrtypes.ImageFailure{
		{FailureCode: ecrtypes.ImageFailureCodeInvalidImageDigest, FailureReason: &reason},
	})
	if err == nil {
		t.Fatal("checkECRDeleteFailures() error = nil, want error")
	}
}

func TestSafePathSegment(t *testing.T) {
	tests := map[string]string{
		"abc-123_x.y": "abc-123_x.y",
		"../etc":      "etc",
		"a b/c":       "a-b-c",
	}
	for in, want := range tests {
		if got := safePathSegment(in); got != want {
			t.Errorf("safePathSegment(%q) = %q, want %q", in, got, want)
		}
	}
	if got := safePathSegment("..."); got == "" || got == "..." {
		t.Errorf("safePathSegment(\"...\") = %q, want a generated name", got)
	}
}
