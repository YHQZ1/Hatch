package aws

import (
	"os"
	"regexp"
	"slices"
	"sort"
	"testing"
)

// These tests read the CloudFormation template and keep the Go side and the
// template naming the same things, so a rename in one is caught before a user
// finds it by connecting an account.

const templatePath = "../../../deploy/cloudformation/hatch-connect.yaml"

func readTemplate(t *testing.T) string {
	t.Helper()
	b, err := os.ReadFile(templatePath)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

// keysOf returns the names indented two spaces under a top-level section.
func keysOf(t *testing.T, template, section string) []string {
	t.Helper()
	start := regexp.MustCompile(`(?m)^` + section + `:\s*$`).FindStringIndex(template)
	if start == nil {
		t.Fatalf("no %s section", section)
	}
	rest := template[start[1]:]
	if end := regexp.MustCompile(`(?m)^\S`).FindStringIndex(rest); end != nil {
		rest = rest[:end[0]]
	}
	var keys []string
	for _, m := range regexp.MustCompile(`(?m)^  ([A-Za-z][A-Za-z0-9]*):`).FindAllStringSubmatch(rest, -1) {
		keys = append(keys, m[1])
	}
	sort.Strings(keys)
	return keys
}

func TestTemplateVersionMatchesTheGoSide(t *testing.T) {
	m := regexp.MustCompile(`(?s)Hatch:\s+Template:.*?Version:\s*"([^"]+)"`).FindStringSubmatch(readTemplate(t))
	if m == nil {
		t.Fatal("the template has no Hatch template Version mapping")
	}
	if m[1] != CurrentTemplateVersion {
		t.Errorf("template version %q, Go side %q: change both together", m[1], CurrentTemplateVersion)
	}
}

func TestTemplateOutputsAreExactlyWhatParseOutputsReads(t *testing.T) {
	got := keysOf(t, readTemplate(t), "Outputs")
	want := slices.Clone(requiredOutputs)
	sort.Strings(want)
	if !slices.Equal(got, want) {
		t.Errorf("template outputs\n  %v\nParseOutputs reads\n  %v", got, want)
	}
}

func TestTemplateTakesTheParametersTheLinkFills(t *testing.T) {
	params := keysOf(t, readTemplate(t), "Parameters")
	for _, name := range []string{"HatchPrincipalArn", "ExternalId", "MonthlyBudgetUsd", "BudgetEmail", "CertificateArn"} {
		if !slices.Contains(params, name) {
			t.Errorf("the link fills param_%s but the template has no such parameter (it has %v)", name, params)
		}
	}
	if len(params) != 5 {
		t.Errorf("the template takes %v; a new parameter needs a field in LinkParams", params)
	}
}
