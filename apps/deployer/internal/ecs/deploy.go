package ecs

import (
	"context"
	"fmt"
	"time"

	"github.com/YHQZ1/hatch/apps/deployer/internal/logs"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ecs"
	"github.com/aws/aws-sdk-go-v2/service/ecs/types"
	elbv2 "github.com/aws/aws-sdk-go-v2/service/elasticloadbalancingv2"
	elbv2types "github.com/aws/aws-sdk-go-v2/service/elasticloadbalancingv2/types"
)

type Deployer struct {
	ecsClient      *ecs.Client
	elbClient      *elbv2.Client
	streamer       *logs.Streamer
	clusterName    string
	albListenerARN string
	vpcID          string
	subnets        []string
	ecsSgID        string
	taskExecRole   string
	awsRegion      string
	baseDomain     string
}

func NewDeployer(awsRegion, cluster, listener, vpc, subA, subB, sg, role, domain string, streamer *logs.Streamer) *Deployer {
	cfg, _ := config.LoadDefaultConfig(context.Background(), config.WithRegion(awsRegion))
	return &Deployer{
		ecsClient:      ecs.NewFromConfig(cfg),
		elbClient:      elbv2.NewFromConfig(cfg),
		streamer:       streamer,
		clusterName:    cluster,
		albListenerARN: listener,
		vpcID:          vpc,
		subnets:        []string{subA, subB},
		ecsSgID:        sg,
		taskExecRole:   role,
		awsRegion:      awsRegion,
		baseDomain:     domain,
	}
}

type DeployInput struct {
	DeploymentID string
	ImageURI     string
	Port         int32
	CPU          int32
	MemoryMB     int32
	HealthCheck  string
	Subdomain    string
}

func (d *Deployer) Deploy(ctx context.Context, input DeployInput) (string, error) {
	id := input.DeploymentID
	slug := input.Subdomain

	d.streamer.Publish(ctx, id, "→ Registering Task Definition...")
	taskArn, err := d.registerTaskDefinition(ctx, input)
	if err != nil {
		return "", err
	}

	d.streamer.Publish(ctx, id, "→ Syncing Target Group...")
	tgArn, err := d.upsertTargetGroup(ctx, input)
	if err != nil {
		return "", err
	}

	d.streamer.Publish(ctx, id, "→ Updating Routing Rules...")
	url, err := d.upsertListenerRule(ctx, slug, tgArn)
	if err != nil {
		return "", err
	}

	d.streamer.Publish(ctx, id, "→ Provisioning Fargate Service...")
	if _, err := d.upsertService(ctx, input, taskArn, tgArn); err != nil {
		return "", err
	}

	d.streamer.Publish(ctx, id, "→ Monitoring stability...")
	if err := d.waitForStability(ctx, id, slug); err != nil {
		return "", err
	}

	return url, nil
}

func (d *Deployer) registerTaskDefinition(ctx context.Context, input DeployInput) (string, error) {
	family := fmt.Sprintf("hatch-%s", input.Subdomain)
	out, err := d.ecsClient.RegisterTaskDefinition(ctx, &ecs.RegisterTaskDefinitionInput{
		Family:                  aws.String(family),
		NetworkMode:             types.NetworkModeAwsvpc,
		RequiresCompatibilities: []types.Compatibility{types.CompatibilityFargate},
		Cpu:                     aws.String(fmt.Sprintf("%d", input.CPU)),
		Memory:                  aws.String(fmt.Sprintf("%d", input.MemoryMB)),
		ExecutionRoleArn:        aws.String(d.taskExecRole),
		ContainerDefinitions: []types.ContainerDefinition{
			{
				Name:      aws.String("app"),
				Image:     aws.String(input.ImageURI),
				Essential: aws.Bool(true),
				PortMappings: []types.PortMapping{
					{ContainerPort: aws.Int32(input.Port), Protocol: types.TransportProtocolTcp},
				},
				LogConfiguration: &types.LogConfiguration{
					LogDriver: types.LogDriverAwslogs,
					Options: map[string]string{
						"awslogs-group":         "/hatch/deployments",
						"awslogs-region":        d.awsRegion,
						"awslogs-stream-prefix": input.Subdomain,
						"awslogs-create-group":  "true",
					},
				},
			},
		},
	})
	if err != nil {
		return "", err
	}
	return *out.TaskDefinition.TaskDefinitionArn, nil
}

func (d *Deployer) upsertTargetGroup(ctx context.Context, input DeployInput) (string, error) {
	name := fmt.Sprintf("h-%s", input.Subdomain)
	if len(name) > 32 {
		name = name[:32]
	} // ALB limit

	tgs, err := d.elbClient.DescribeTargetGroups(ctx, &elbv2.DescribeTargetGroupsInput{Names: []string{name}})
	if err == nil && len(tgs.TargetGroups) > 0 {
		return *tgs.TargetGroups[0].TargetGroupArn, nil
	}

	out, err := d.elbClient.CreateTargetGroup(ctx, &elbv2.CreateTargetGroupInput{
		Name:            aws.String(name),
		Protocol:        elbv2types.ProtocolEnumHttp,
		Port:            aws.Int32(input.Port),
		VpcId:           aws.String(d.vpcID),
		TargetType:      elbv2types.TargetTypeEnumIp,
		HealthCheckPath: aws.String(input.HealthCheck),
	})
	if err != nil {
		return "", err
	}
	return *out.TargetGroups[0].TargetGroupArn, nil
}

func (d *Deployer) upsertListenerRule(ctx context.Context, subdomain, tgArn string) (string, error) {
	host := fmt.Sprintf("%s.%s", subdomain, d.baseDomain)
	rules, _ := d.elbClient.DescribeRules(ctx, &elbv2.DescribeRulesInput{ListenerArn: aws.String(d.albListenerARN)})

	for _, r := range rules.Rules {
		for _, c := range r.Conditions {
			if *c.Field == "host-header" {
				for _, v := range c.HostHeaderConfig.Values {
					if v == host {
						_, err := d.elbClient.ModifyRule(ctx, &elbv2.ModifyRuleInput{
							RuleArn: r.RuleArn,
							Actions: []elbv2types.Action{{Type: elbv2types.ActionTypeEnumForward, TargetGroupArn: aws.String(tgArn)}},
						})
						return host, err
					}
				}
			}
		}
	}

	_, err := d.elbClient.CreateRule(ctx, &elbv2.CreateRuleInput{
		ListenerArn: aws.String(d.albListenerARN),
		Priority:    aws.Int32(int32(time.Now().Unix() % 49000)),
		Conditions: []elbv2types.RuleCondition{
			{Field: aws.String("host-header"), HostHeaderConfig: &elbv2types.HostHeaderConditionConfig{Values: []string{host}}},
		},
		Actions: []elbv2types.Action{{Type: elbv2types.ActionTypeEnumForward, TargetGroupArn: aws.String(tgArn)}},
	})
	return host, err
}

func (d *Deployer) upsertService(ctx context.Context, input DeployInput, taskArn, tgArn string) (string, error) {
	name := fmt.Sprintf("hatch-%s", input.Subdomain)
	svcs, err := d.ecsClient.DescribeServices(ctx, &ecs.DescribeServicesInput{Cluster: aws.String(d.clusterName), Services: []string{name}})

	if err == nil && len(svcs.Services) > 0 && *svcs.Services[0].Status != "INACTIVE" {
		out, err := d.ecsClient.UpdateService(ctx, &ecs.UpdateServiceInput{
			Service: aws.String(name), Cluster: aws.String(d.clusterName), TaskDefinition: aws.String(taskArn), DesiredCount: aws.Int32(1),
		})
		if err != nil {
			return "", err
		}
		return *out.Service.ServiceArn, nil
	}

	out, err := d.ecsClient.CreateService(ctx, &ecs.CreateServiceInput{
		ServiceName:    aws.String(name),
		Cluster:        aws.String(d.clusterName),
		TaskDefinition: aws.String(taskArn),
		DesiredCount:   aws.Int32(1),
		LaunchType:     types.LaunchTypeFargate,
		NetworkConfiguration: &types.NetworkConfiguration{
			AwsvpcConfiguration: &types.AwsVpcConfiguration{
				Subnets: d.subnets, SecurityGroups: []string{d.ecsSgID}, AssignPublicIp: types.AssignPublicIpEnabled,
			},
		},
		LoadBalancers: []types.LoadBalancer{
			{TargetGroupArn: aws.String(tgArn), ContainerName: aws.String("app"), ContainerPort: aws.Int32(input.Port)},
		},
	})
	if err != nil {
		return "", err
	}
	return *out.Service.ServiceArn, nil
}

func (d *Deployer) waitForStability(ctx context.Context, deployID, slug string) error {
	name := fmt.Sprintf("hatch-%s", slug)
	ticker := time.NewTicker(12 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(6 * time.Minute):
			return fmt.Errorf("stability timeout")
		case <-ticker.C:
			out, _ := d.ecsClient.DescribeServices(ctx, &ecs.DescribeServicesInput{Cluster: aws.String(d.clusterName), Services: []string{name}})
			if len(out.Services) > 0 {
				svc := out.Services[0]
				d.streamer.Publish(ctx, deployID, fmt.Sprintf("→ Task Health: %d Running / %d Pending", svc.RunningCount, svc.PendingCount))
				if svc.RunningCount >= 1 && svc.PendingCount == 0 {
					return nil
				}
			}
		}
	}
}

func (d *Deployer) Teardown(ctx context.Context, slug string) error {
	svcName := fmt.Sprintf("hatch-%s", slug)
	tgName := fmt.Sprintf("h-%s", slug)
	if len(tgName) > 32 {
		tgName = tgName[:32]
	}

	// 1. Service
	_, _ = d.ecsClient.DeleteService(ctx, &ecs.DeleteServiceInput{
		Cluster: aws.String(d.clusterName), Service: aws.String(svcName), Force: aws.Bool(true),
	})

	// 2. Target Group
	tgs, _ := d.elbClient.DescribeTargetGroups(ctx, &elbv2.DescribeTargetGroupsInput{Names: []string{tgName}})
	if len(tgs.TargetGroups) > 0 {
		_, _ = d.elbClient.DeleteTargetGroup(ctx, &elbv2.DeleteTargetGroupInput{TargetGroupArn: tgs.TargetGroups[0].TargetGroupArn})
	}

	return nil
}
