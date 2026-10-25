package aws_test

import (
	"fmt"
	"net/url"
	"strings"
	"testing"

	"github.com/YHQZ1/hatch/internal/cloud/aws"
)

func fmtSprint(a ...any) string            { return fmt.Sprint(a...) }
func fmtSprintf(f string, a ...any) string { return fmt.Sprintf(f, a...) }

func validLink() aws.LinkParams {
	return aws.LinkParams{
		Region:           region,
		TemplateURL:      "https://hatch-templates.s3.amazonaws.com/hatch-connect.yaml",
		PrincipalARN:     "arn:aws:iam::111122223333:role/hatch-server",
		ExternalID:       externalID,
		MonthlyBudgetUSD: 10,
		BudgetEmail:      "me@example.com",
	}
}

func TestQuickCreateURLCarriesEveryParameter(t *testing.T) {
	link, err := aws.QuickCreateURL(validLink())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(link, "https://ap-south-1.console.aws.amazon.com/cloudformation/home?region=ap-south-1#/stacks/quickcreate?") {
		t.Fatalf("link = %s", link)
	}
	q, err := url.ParseQuery(link[strings.Index(link, "quickcreate?")+len("quickcreate?"):])
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{
		"templateURL":             "https://hatch-templates.s3.amazonaws.com/hatch-connect.yaml",
		"stackName":               "hatch-connect",
		"param_HatchPrincipalArn": "arn:aws:iam::111122223333:role/hatch-server",
		"param_ExternalId":        externalID,
		"param_MonthlyBudgetUsd":  "10",
		"param_BudgetEmail":       "me@example.com",
	}
	for k, v := range want {
		if q.Get(k) != v {
			t.Errorf("%s = %q, want %q", k, q.Get(k), v)
		}
	}
	if q.Has("param_CertificateArn") {
		t.Error("an empty certificate was put in the link")
	}
	if strings.Contains(link, "+") {
		t.Errorf("a + in the fragment would read as a plus, not a space: %s", link)
	}
}

func TestQuickCreateURLWithACertificate(t *testing.T) {
	p := validLink()
	p.CertificateARN = "arn:aws:acm:ap-south-1:123456789012:certificate/abc-123"
	link, err := aws.QuickCreateURL(p)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(link, "param_CertificateArn=arn%3Aaws%3Aacm%3Aap-south-1%3A123456789012%3Acertificate%2Fabc-123") {
		t.Errorf("link = %s", link)
	}
}

func TestQuickCreateURLRefusesWhatCloudFormationWould(t *testing.T) {
	tests := []struct {
		name   string
		change func(*aws.LinkParams)
		want   string
	}{
		{"a made-up region", func(p *aws.LinkParams) { p.Region = "mars-1" }, "not an AWS region"},
		{"a region that could redirect the host", func(p *aws.LinkParams) { p.Region = "x.evil.com/" }, "not an AWS region"},
		{"a stack name with a space", func(p *aws.LinkParams) { p.StackName = "my stack" }, "stack name"},
		{"a principal that is a bucket", func(p *aws.LinkParams) { p.PrincipalARN = "arn:aws:s3:::bucket" }, "principal"},
		{"a short ExternalId", func(p *aws.LinkParams) { p.ExternalID = "short" }, "external id"},
		{"a zero budget", func(p *aws.LinkParams) { p.MonthlyBudgetUSD = 0 }, "at least 1"},
		{"a bad email", func(p *aws.LinkParams) { p.BudgetEmail = "me" }, "email"},
		{"a certificate from another region", func(p *aws.LinkParams) {
			p.CertificateARN = "arn:aws:acm:us-east-1:123456789012:certificate/abc"
		}, "certificate"},
		{"a plain http template", func(p *aws.LinkParams) { p.TemplateURL = "http://example.com/t.yaml" }, "https"},
		{"no template", func(p *aws.LinkParams) { p.TemplateURL = "" }, "https"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			p := validLink()
			tc.change(&p)
			_, err := aws.QuickCreateURL(p)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("err = %v, want it to mention %q", err, tc.want)
			}
		})
	}
}

func TestNewExternalIDIsAcceptedByTheLinkAndDiffers(t *testing.T) {
	a, err := aws.NewExternalID()
	if err != nil {
		t.Fatal(err)
	}
	b, _ := aws.NewExternalID()
	if a == b {
		t.Fatal("two external ids are equal")
	}
	p := validLink()
	p.ExternalID = a
	if _, err := aws.QuickCreateURL(p); err != nil {
		t.Fatalf("a generated external id was refused: %v", err)
	}
}
