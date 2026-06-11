package config

import (
	"reflect"
	"testing"
)

func TestParseCSVDedupesAndTrimsOrigins(t *testing.T) {
	got := parseCSV(" http://localhost:3000,https://app.hatchcloud.xyz, http://localhost:3000 ,,")
	want := []string{"http://localhost:3000", "https://app.hatchcloud.xyz"}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parseCSV() = %#v, want %#v", got, want)
	}
}
