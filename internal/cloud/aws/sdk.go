package aws

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	awssdk "github.com/aws/aws-sdk-go-v2/aws"
	awshttp "github.com/aws/aws-sdk-go-v2/aws/transport/http"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/cloudformation"
	"github.com/aws/aws-sdk-go-v2/service/sts"
	"github.com/aws/smithy-go"
)

// SDKSTS assumes roles with Hatch's own AWS identity, the one the hatch-control
// role's trust policy names (ADR 0020). It is not covered by tests that reach
// AWS; classifyAssumeRole is, and Phase 6 tries it against a real account.
type SDKSTS struct{ cfg awssdk.Config }

// NewSDKSTS loads Hatch's own credentials from the environment, as the SDK does.
func NewSDKSTS(ctx context.Context) (*SDKSTS, error) {
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("load Hatch's own AWS configuration: %w", err)
	}
	return &SDKSTS{cfg: cfg}, nil
}

func (s *SDKSTS) AssumeRole(ctx context.Context, req AssumeRoleRequest) (Credentials, error) {
	out, err := sts.NewFromConfig(s.cfg).AssumeRole(ctx, &sts.AssumeRoleInput{
		RoleArn:         awssdk.String(req.RoleARN),
		RoleSessionName: awssdk.String(req.SessionName),
		ExternalId:      awssdk.String(req.ExternalID),
		DurationSeconds: awssdk.Int32(900),
	}, func(o *sts.Options) { o.Region = req.Region })
	if err != nil {
		return Credentials{}, classifyAssumeRole(err)
	}
	if out.Credentials == nil {
		return Credentials{}, errors.New("STS returned no credentials")
	}
	c := out.Credentials
	return Credentials{
		AccessKeyID:     awssdk.ToString(c.AccessKeyId),
		SecretAccessKey: awssdk.ToString(c.SecretAccessKey),
		SessionToken:    awssdk.ToString(c.SessionToken),
		Expires:         awssdk.ToTime(c.Expiration),
	}, nil
}

// credentialErrorCodes are what AWS answers when the caller's own credentials
// are the problem: unknown or expired keys, a session token that no longer works,
// or a request that could not be signed.
var credentialErrorCodes = map[string]bool{
	"InvalidClientTokenId":        true,
	"UnrecognizedClientException": true,
	"ExpiredToken":                true,
	"ExpiredTokenException":       true,
	"SignatureDoesNotMatch":       true,
	"InvalidSignatureException":   true,
	"IncompleteSignature":         true,
	"MissingAuthenticationToken":  true,
}

// classifyAssumeRole turns the SDK's error into one a person can act on.
// AccessDenied means "wrong role or ExternalId", which the user can fix; a
// credential error means Hatch's own identity is unusable, which only whoever runs
// Hatch can fix; anything else (throttling, no network) is passed on as it is.
func classifyAssumeRole(err error) error {
	var api smithy.APIError
	if errors.As(err, &api) {
		switch {
		case api.ErrorCode() == "AccessDenied":
			return ErrCannotAssumeRole
		case credentialErrorCodes[api.ErrorCode()]:
			return ErrServerCredentials
		}
	}
	// The SDK could not find any credentials to sign with, so no request was made.
	if strings.Contains(err.Error(), "failed to retrieve credentials") || strings.Contains(err.Error(), "no EC2 IMDS role found") {
		return ErrServerCredentials
	}
	return fmt.Errorf("assume the role: %w", err)
}

// SDKStacks reads stacks with the credentials an assumed role gave.
type SDKStacks struct{}

func (SDKStacks) DescribeStack(ctx context.Context, creds Credentials, region, name string) (Stack, error) {
	client := cloudformation.New(cloudformation.Options{
		Region:      region,
		Credentials: credentials.NewStaticCredentialsProvider(creds.AccessKeyID, creds.SecretAccessKey, creds.SessionToken),
		// A stack read should not hang a job; the job's own context bounds it too.
		HTTPClient: awshttp.NewBuildableClient().WithTimeout(30 * time.Second),
	})
	out, err := client.DescribeStacks(ctx, &cloudformation.DescribeStacksInput{StackName: awssdk.String(name)})
	if err != nil {
		return Stack{}, classifyDescribeStack(err)
	}
	if len(out.Stacks) == 0 {
		return Stack{}, ErrStackNotFound
	}
	s := out.Stacks[0]
	outputs := make(map[string]string, len(s.Outputs))
	for _, o := range s.Outputs {
		outputs[awssdk.ToString(o.OutputKey)] = awssdk.ToString(o.OutputValue)
	}
	return Stack{Name: awssdk.ToString(s.StackName), Status: string(s.StackStatus), Outputs: outputs}, nil
}

// classifyDescribeStack maps CloudFormation's "does not exist" to ErrStackNotFound.
func classifyDescribeStack(err error) error {
	var api smithy.APIError
	if errors.As(err, &api) && api.ErrorCode() == "ValidationError" && strings.Contains(api.ErrorMessage(), "does not exist") {
		return ErrStackNotFound
	}
	return fmt.Errorf("read the stack: %w", err)
}
