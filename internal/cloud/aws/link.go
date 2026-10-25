package aws

import (
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

// DefaultStackName is the name the stack is created under.
const DefaultStackName = "hatch-connect"

// LinkParams are what the quick-create link pre-fills. The names of the
// parameters are the template's own (param_<Name> in the link).
type LinkParams struct {
	Region      string
	TemplateURL string
	StackName   string

	PrincipalARN     string
	ExternalID       string
	MonthlyBudgetUSD int
	BudgetEmail      string
	// CertificateARN is optional; empty serves apps over HTTP (ADR 0021).
	CertificateARN string
}

// These repeat the template's AllowedPattern values, so a link never carries a
// value CloudFormation would refuse on the console page. A test reads the
// template and checks both name the same parameters.
var (
	regionPattern    = regexp.MustCompile(`^[a-z]{2}(-[a-z]+)+-[0-9]$`)
	stackNamePattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9-]{0,127}$`)
	principalPattern = regexp.MustCompile(`^arn:aws[a-z-]*:iam::[0-9]{12}:(root|(role|user)/.+)$`)
	externalPattern  = regexp.MustCompile(`^[A-Za-z0-9_+=,.@:/-]{32,128}$`)
	emailPattern     = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)
	certPattern      = regexp.MustCompile(`^arn:aws[a-z-]*:acm:([a-z0-9-]+):[0-9]{12}:certificate/.+$`)
)

// QuickCreateURL builds the CloudFormation console link that opens the
// hatch-connect stack with its parameters filled in, so the user only reviews
// and creates it. CloudFormation fetches the template itself, and only from S3,
// so TemplateURL is where the template has been published.
func QuickCreateURL(p LinkParams) (string, error) {
	if p.StackName == "" {
		p.StackName = DefaultStackName
	}
	switch {
	case !regionPattern.MatchString(p.Region):
		return "", fmt.Errorf("%q is not an AWS region", p.Region)
	case !stackNamePattern.MatchString(p.StackName):
		return "", fmt.Errorf("%q is not a valid stack name", p.StackName)
	case !principalPattern.MatchString(p.PrincipalARN):
		return "", fmt.Errorf("the principal %q is not the ARN of an IAM role, user or account", p.PrincipalARN)
	case !externalPattern.MatchString(p.ExternalID):
		return "", fmt.Errorf("the external id must be 32 to 128 characters of letters, digits and _+=,.@:/-")
	case p.MonthlyBudgetUSD < 1:
		return "", fmt.Errorf("the monthly budget must be at least 1 dollar")
	case !emailPattern.MatchString(p.BudgetEmail):
		return "", fmt.Errorf("%q is not an email address", p.BudgetEmail)
	}
	if m := certPattern.FindStringSubmatch(p.CertificateARN); p.CertificateARN != "" && (m == nil || m[1] != p.Region) {
		return "", fmt.Errorf("the certificate must be an ACM certificate in %s", p.Region)
	}
	tu, err := url.Parse(p.TemplateURL)
	if err != nil || tu.Scheme != "https" || tu.Host == "" {
		return "", fmt.Errorf("the template URL must be an https address")
	}

	q := url.Values{}
	q.Set("templateURL", p.TemplateURL)
	q.Set("stackName", p.StackName)
	q.Set("param_HatchPrincipalArn", p.PrincipalARN)
	q.Set("param_ExternalId", p.ExternalID)
	q.Set("param_MonthlyBudgetUsd", strconv.Itoa(p.MonthlyBudgetUSD))
	q.Set("param_BudgetEmail", p.BudgetEmail)
	if p.CertificateARN != "" {
		q.Set("param_CertificateArn", p.CertificateARN)
	}

	host := p.Region + ".console.aws.amazon.com"
	// The query sits inside the URL's fragment, which is how the console reads it.
	link := "https://" + host + "/cloudformation/home?region=" + url.QueryEscape(p.Region) +
		"#/stacks/quickcreate?" + strings.ReplaceAll(q.Encode(), "+", "%20")
	return link, nil
}
