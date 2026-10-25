// Package fake is an in-memory AWS for tests: it assumes roles and describes
// stacks the way the real calls do, including refusing a wrong ExternalId, so
// code that connects an account can be tested without an account.
package fake

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/YHQZ1/hatch/internal/cloud/aws"
)

// Account is one AWS account with a role Hatch may assume and, optionally, a
// stack. A nil Stack means the account has none yet.
type Account struct {
	RoleARN    string
	ExternalID string
	Region     string
	Stack      *aws.Stack
}

// Cloud implements aws.STS and aws.Stacks over accounts it is given.
type Cloud struct {
	// AssumeErr, when set, is returned by every AssumeRole (a throttle, say).
	AssumeErr error

	mu       sync.Mutex
	accounts map[string]*Account // by role ARN
	sessions map[string]string   // session token to role ARN
	assumed  []aws.AssumeRoleRequest
	n        int
}

// AddAccount registers an account. Re-adding a role replaces it.
func (c *Cloud) AddAccount(a Account) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.accounts == nil {
		c.accounts = map[string]*Account{}
		c.sessions = map[string]string{}
	}
	cp := a
	c.accounts[a.RoleARN] = &cp
}

// SetStackStatus changes the status of an account's stack, as if CloudFormation
// had moved it on.
func (c *Cloud) SetStackStatus(roleARN, status string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if a := c.accounts[roleARN]; a != nil && a.Stack != nil {
		a.Stack.Status = status
	}
}

// AssumeCalls returns every AssumeRole request, in order.
func (c *Cloud) AssumeCalls() []aws.AssumeRoleRequest {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]aws.AssumeRoleRequest(nil), c.assumed...)
}

func (c *Cloud) AssumeRole(_ context.Context, req aws.AssumeRoleRequest) (aws.Credentials, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.assumed = append(c.assumed, req)
	if c.AssumeErr != nil {
		return aws.Credentials{}, c.AssumeErr
	}
	a := c.accounts[req.RoleARN]
	// AWS answers a wrong ExternalId and a missing role the same way.
	if a == nil || a.ExternalID != req.ExternalID {
		return aws.Credentials{}, aws.ErrCannotAssumeRole
	}
	c.n++
	token := fmt.Sprintf("session-%d", c.n)
	c.sessions[token] = req.RoleARN
	return aws.Credentials{
		AccessKeyID:     "ASIAFAKE",
		SecretAccessKey: "secret",
		SessionToken:    token,
		Expires:         time.Now().Add(15 * time.Minute),
	}, nil
}

func (c *Cloud) DescribeStack(_ context.Context, creds aws.Credentials, region, name string) (aws.Stack, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	role, ok := c.sessions[creds.SessionToken]
	if !ok {
		return aws.Stack{}, fmt.Errorf("read the stack: the credentials were not issued by this fake")
	}
	a := c.accounts[role]
	if a == nil || a.Stack == nil || a.Region != region || a.Stack.Name != name {
		return aws.Stack{}, aws.ErrStackNotFound
	}
	out := make(map[string]string, len(a.Stack.Outputs))
	for k, v := range a.Stack.Outputs {
		out[k] = v
	}
	return aws.Stack{Name: a.Stack.Name, Status: a.Stack.Status, Outputs: out}, nil
}

// Outputs returns the outputs of a healthy hatch-connect stack for a role in a
// region, as the template defines them.
func Outputs(roleARN, region string) map[string]string {
	account := "123456789012"
	if parts := strings.Split(roleARN, ":"); len(parts) > 4 {
		account = parts[4]
	}
	return map[string]string{
		"HatchTemplateVersion": aws.CurrentTemplateVersion,
		"ControlRoleArn":       roleARN,
		"Region":               region,
		"ClusterName":          "hatch",
		"VpcId":                "vpc-0abc",
		"SubnetIds":            "subnet-0a,subnet-0b",
		"AppSecurityGroupId":   "sg-0abc",
		"LoadBalancerArn":      "arn:aws:elasticloadbalancing:" + region + ":" + account + ":loadbalancer/app/hatch-alb/50dc6c495c0c9188",
		"LoadBalancerDnsName":  "hatch-alb-1.example.elb.amazonaws.com",
		"AppListenerArn":       "arn:aws:elasticloadbalancing:" + region + ":" + account + ":listener/app/hatch-alb/50dc6c495c0c9188/f2f7dc8efc522ab2",
		"ServesHttps":          "false",
		"RepositoryUri":        account + ".dkr.ecr." + region + ".amazonaws.com/hatch-apps",
		"BuildProjectName":     "hatch-build",
		"AppLogGroupName":      "/hatch/apps",
		"TaskExecutionRoleArn": "arn:aws:iam::" + account + ":role/hatch-task-execution",
		"CodeBuildRoleArn":     "arn:aws:iam::" + account + ":role/hatch-codebuild",
	}
}

// HealthyStack is a finished hatch-connect stack with Outputs for the role.
func HealthyStack(roleARN, region string) *aws.Stack {
	return &aws.Stack{Name: aws.DefaultStackName, Status: "CREATE_COMPLETE", Outputs: Outputs(roleARN, region)}
}
