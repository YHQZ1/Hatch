package stream

import (
	"strings"
	"testing"
	"unicode/utf8"
)

func TestClean(t *testing.T) {
	if got := clean("plain"); got != "plain" {
		t.Errorf("clean(plain) = %q", got)
	}
	if got := clean("a\x00b"); got != "ab" {
		t.Errorf("NUL bytes are not removed: %q", got)
	}
	if got := clean("a\xffb"); got != "a�b" || !utf8.ValidString(got) {
		t.Errorf("invalid UTF-8 is not replaced: %q", got)
	}

	// A long line is cut, never in the middle of a character.
	long := strings.Repeat("é", MaxLineBytes) // two bytes each
	got := clean(long)
	if len(got) > MaxLineBytes+len("…") || !strings.HasSuffix(got, "…") || !utf8.ValidString(got) {
		t.Errorf("long line cut badly: len %d, valid %v", len(got), utf8.ValidString(got))
	}
	if short := strings.Repeat("x", MaxLineBytes); clean(short) != short {
		t.Error("a line exactly at the limit must be kept whole")
	}
}
