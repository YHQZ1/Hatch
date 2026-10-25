package aws

import (
	"fmt"
	"sort"
	"strings"
)

// CurrentTemplateVersion is the version of deploy/cloudformation/hatch-connect.yaml
// this Hatch was built with (its HatchTemplateVersion output). A test keeps the
// two equal.
const CurrentTemplateVersion = "1"

// StackOutputs is what the hatch-connect stack tells Hatch about itself. It is
// stored as JSON on the connection, so the tags are part of what is saved.
type StackOutputs struct {
	TemplateVersion      string   `json:"template_version"`
	ControlRoleARN       string   `json:"control_role_arn"`
	Region               string   `json:"region"`
	ClusterName          string   `json:"cluster_name"`
	VPCID                string   `json:"vpc_id"`
	SubnetIDs            []string `json:"subnet_ids"`
	AppSecurityGroupID   string   `json:"app_security_group_id"`
	LoadBalancerARN      string   `json:"load_balancer_arn"`
	LoadBalancerDNSName  string   `json:"load_balancer_dns_name"`
	AppListenerARN       string   `json:"app_listener_arn"`
	ServesHTTPS          bool     `json:"serves_https"`
	RepositoryURI        string   `json:"repository_uri"`
	BuildProjectName     string   `json:"build_project_name"`
	AppLogGroupName      string   `json:"app_log_group_name"`
	TaskExecutionRoleARN string   `json:"task_execution_role_arn"`
	CodeBuildRoleARN     string   `json:"codebuild_role_arn"`
}

// UpToDate says whether the stack was made from the template version this Hatch
// knows. When it is not, Hatch asks the user to update the stack.
func (o StackOutputs) UpToDate() bool { return o.TemplateVersion == CurrentTemplateVersion }

// requiredOutputs are the output names ParseOutputs reads; a test checks each is
// in the template.
var requiredOutputs = []string{
	"HatchTemplateVersion", "ControlRoleArn", "Region", "ClusterName", "VpcId",
	"SubnetIds", "AppSecurityGroupId", "LoadBalancerArn", "LoadBalancerDnsName",
	"AppListenerArn", "ServesHttps", "RepositoryUri", "BuildProjectName",
	"AppLogGroupName", "TaskExecutionRoleArn", "CodeBuildRoleArn",
}

// ParseOutputs reads a stack's outputs, naming every one that is missing.
func ParseOutputs(raw map[string]string) (StackOutputs, error) {
	var missing []string
	for _, name := range requiredOutputs {
		if strings.TrimSpace(raw[name]) == "" {
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		sort.Strings(missing)
		return StackOutputs{}, &MissingOutputsError{Names: missing}
	}

	var https bool
	switch raw["ServesHttps"] {
	case "true":
		https = true
	case "false":
	default:
		return StackOutputs{}, fmt.Errorf("the stack's ServesHttps output is %q, not true or false", raw["ServesHttps"])
	}

	return StackOutputs{
		TemplateVersion:      raw["HatchTemplateVersion"],
		ControlRoleARN:       raw["ControlRoleArn"],
		Region:               raw["Region"],
		ClusterName:          raw["ClusterName"],
		VPCID:                raw["VpcId"],
		SubnetIDs:            strings.Split(raw["SubnetIds"], ","),
		AppSecurityGroupID:   raw["AppSecurityGroupId"],
		LoadBalancerARN:      raw["LoadBalancerArn"],
		LoadBalancerDNSName:  raw["LoadBalancerDnsName"],
		AppListenerARN:       raw["AppListenerArn"],
		ServesHTTPS:          https,
		RepositoryURI:        raw["RepositoryUri"],
		BuildProjectName:     raw["BuildProjectName"],
		AppLogGroupName:      raw["AppLogGroupName"],
		TaskExecutionRoleARN: raw["TaskExecutionRoleArn"],
		CodeBuildRoleARN:     raw["CodeBuildRoleArn"],
	}, nil
}
