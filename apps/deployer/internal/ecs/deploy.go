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
	cfg, err := config.LoadDefaultConfig(context.Background(), config.WithRegion(awsRegion))
	if err != nil {
		cfg = aws.Config{Region: awsRegion}
	}

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
	EnvVars      map[string]string
}

func (d *Deployer) Deploy(ctx context.Context, input DeployInput) (string, error) {
	id := input.DeploymentID
	slug := input.Subdomain

	d.streamer.Publish(ctx, id, "Registering task definition...")
	taskArn, err := d.registerTaskDefinition(ctx, input)
	if err != nil {
		return "", fmt.Errorf("failed to register task definition: %w", err)
	}

	d.streamer.Publish(ctx, id, "Configuring target group...")
	tgArn, err := d.upsertTargetGroup(ctx, input)
	if err != nil {
		return "", fmt.Errorf("failed to configure target group: %w", err)
	}

	d.streamer.Publish(ctx, id, "Updating routing rules...")
	url, err := d.upsertListenerRule(ctx, slug, tgArn)
	if err != nil {
		return "", fmt.Errorf("failed to update routing rules: %w", err)
	}

	d.streamer.Publish(ctx, id, "Provisioning Fargate service...")
	if _, err := d.upsertService(ctx, input, taskArn, tgArn); err != nil {
		return "", fmt.Errorf("failed to provision service: %w", err)
	}

	d.streamer.Publish(ctx, id, "Monitoring service stability...")
	if err := d.waitForStability(ctx, id, slug); err != nil {
		return "", fmt.Errorf("service stability check failed: %w", err)
	}

	d.streamer.Publish(ctx, id, fmt.Sprintf("Deployment live at: https://%s", url))
	return url, nil
}

func (d *Deployer) registerTaskDefinition(ctx context.Context, input DeployInput) (string, error) {
	family := fmt.Sprintf("hatch-%s", input.Subdomain)

	var containerEnv []types.KeyValuePair
	for k, v := range input.EnvVars {
		containerEnv = append(containerEnv, types.KeyValuePair{
			Name:  aws.String(k),
			Value: aws.String(v),
		})
	}

	out, err := d.ecsClient.RegisterTaskDefinition(ctx, &ecs.RegisterTaskDefinitionInput{
		Family:                  aws.String(family),
		NetworkMode:             types.NetworkModeAwsvpc,
		RequiresCompatibilities: []types.Compatibility{types.CompatibilityFargate},
		Cpu:                     aws.String(fmt.Sprintf("%d", input.CPU)),
		Memory:                  aws.String(fmt.Sprintf("%d", input.MemoryMB)),
		ExecutionRoleArn:        aws.String(d.taskExecRole),
		ContainerDefinitions: []types.ContainerDefinition{
			{
				Name:        aws.String("app"),
				Image:       aws.String(input.ImageURI),
				Essential:   aws.Bool(true),
				Environment: containerEnv,
				PortMappings: []types.PortMapping{
					{
						ContainerPort: aws.Int32(input.Port),
						Protocol:      types.TransportProtocolTcp,
					},
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
	}

	tgs, err := d.elbClient.DescribeTargetGroups(ctx, &elbv2.DescribeTargetGroupsInput{
		Names: []string{name},
	})
	if err == nil && len(tgs.TargetGroups) > 0 {
		tg := tgs.TargetGroups[0]
		if *tg.Port == input.Port {
			return *tg.TargetGroupArn, nil
		}

		_, err = d.elbClient.DeleteTargetGroup(ctx, &elbv2.DeleteTargetGroupInput{
			TargetGroupArn: tg.TargetGroupArn,
		})
		if err != nil {
			d.streamer.Publish(ctx, input.DeploymentID, fmt.Sprintf("Warning: Failed to delete old target group: %v", err))
		}
		time.Sleep(2 * time.Second)
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

	rules, err := d.elbClient.DescribeRules(ctx, &elbv2.DescribeRulesInput{
		ListenerArn: aws.String(d.albListenerARN),
	})
	if err != nil {
		return "", err
	}

	if rules != nil {
		for _, r := range rules.Rules {
			for _, c := range r.Conditions {
				if c.Field != nil && *c.Field == "host-header" && c.HostHeaderConfig != nil {
					for _, v := range c.HostHeaderConfig.Values {
						if v == host {
							_, err := d.elbClient.ModifyRule(ctx, &elbv2.ModifyRuleInput{
								RuleArn: r.RuleArn,
								Actions: []elbv2types.Action{
									{
										Type:           elbv2types.ActionTypeEnumForward,
										TargetGroupArn: aws.String(tgArn),
									},
								},
							})
							return host, err
						}
					}
				}
			}
		}
	}

	_, err = d.elbClient.CreateRule(ctx, &elbv2.CreateRuleInput{
		ListenerArn: aws.String(d.albListenerARN),
		Priority:    aws.Int32(int32(time.Now().Unix()%49000) + 1000),
		Conditions: []elbv2types.RuleCondition{
			{
				Field: aws.String("host-header"),
				HostHeaderConfig: &elbv2types.HostHeaderConditionConfig{
					Values: []string{host},
				},
			},
		},
		Actions: []elbv2types.Action{
			{
				Type:           elbv2types.ActionTypeEnumForward,
				TargetGroupArn: aws.String(tgArn),
			},
		},
	})

	return host, err
}

func (d *Deployer) upsertService(ctx context.Context, input DeployInput, taskArn, tgArn string) (string, error) {
	name := fmt.Sprintf("hatch-%s", input.Subdomain)

	svcs, err := d.ecsClient.DescribeServices(ctx, &ecs.DescribeServicesInput{
		Cluster:  aws.String(d.clusterName),
		Services: []string{name},
	})

	if err == nil && len(svcs.Services) > 0 && svcs.Services[0].Status != nil && *svcs.Services[0].Status != "INACTIVE" {
		svc := svcs.Services[0]
		portMatch := false
		if len(svc.LoadBalancers) > 0 && svc.LoadBalancers[0].ContainerPort != nil && *svc.LoadBalancers[0].ContainerPort == input.Port {
			portMatch = true
		}

		if portMatch {
			out, err := d.ecsClient.UpdateService(ctx, &ecs.UpdateServiceInput{
				Service:        aws.String(name),
				Cluster:        aws.String(d.clusterName),
				TaskDefinition: aws.String(taskArn),
				DesiredCount:   aws.Int32(1),
			})
			if err != nil {
				return "", err
			}
			return *out.Service.ServiceArn, nil
		}

		d.streamer.Publish(ctx, input.DeploymentID, "Port change detected, recreating service...")
		_, err = d.ecsClient.DeleteService(ctx, &ecs.DeleteServiceInput{
			Cluster: aws.String(d.clusterName),
			Service: aws.String(name),
			Force:   aws.Bool(true),
		})
		if err != nil {
			d.streamer.Publish(ctx, input.DeploymentID, fmt.Sprintf("Warning: Failed to delete old service: %v", err))
		}
		time.Sleep(5 * time.Second)
	}

	out, err := d.ecsClient.CreateService(ctx, &ecs.CreateServiceInput{
		ServiceName:    aws.String(name),
		Cluster:        aws.String(d.clusterName),
		TaskDefinition: aws.String(taskArn),
		DesiredCount:   aws.Int32(1),
		LaunchType:     types.LaunchTypeFargate,
		NetworkConfiguration: &types.NetworkConfiguration{
			AwsvpcConfiguration: &types.AwsVpcConfiguration{
				Subnets:        d.subnets,
				SecurityGroups: []string{d.ecsSgID},
				AssignPublicIp: types.AssignPublicIpEnabled,
			},
		},
		LoadBalancers: []types.LoadBalancer{
			{
				TargetGroupArn: aws.String(tgArn),
				ContainerName:  aws.String("app"),
				ContainerPort:  aws.Int32(input.Port),
			},
		},
	})
	if err != nil {
		return "", err
	}

	return *out.Service.ServiceArn, nil
}

func (d *Deployer) waitForStability(ctx context.Context, deployID, slug string) error {
	name := fmt.Sprintf("hatch-%s", slug)
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	timeout := time.After(8 * time.Minute)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-timeout:
			return fmt.Errorf("stability timeout: service failed to reach healthy state")
		case <-ticker.C:
			out, err := d.ecsClient.DescribeServices(ctx, &ecs.DescribeServicesInput{
				Cluster:  aws.String(d.clusterName),
				Services: []string{name},
			})
			if err != nil || len(out.Services) == 0 {
				continue
			}

			svc := out.Services[0]
			d.streamer.Publish(ctx, deployID, fmt.Sprintf("Task health: %d running, %d pending", svc.RunningCount, svc.PendingCount))

			if svc.RunningCount >= 1 && svc.PendingCount == 0 {
				return nil
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

	host := fmt.Sprintf("%s.%s", slug, d.baseDomain)
	rules, err := d.elbClient.DescribeRules(ctx, &elbv2.DescribeRulesInput{
		ListenerArn: aws.String(d.albListenerARN),
	})
	if err == nil && rules != nil {
		for _, r := range rules.Rules {
			for _, c := range r.Conditions {
				if c.Field != nil && *c.Field == "host-header" && c.HostHeaderConfig != nil {
					for _, v := range c.HostHeaderConfig.Values {
						if v == host {
							_, err = d.elbClient.DeleteRule(ctx, &elbv2.DeleteRuleInput{
								RuleArn: r.RuleArn,
							})
							if err != nil {
								return fmt.Errorf("failed to delete listener rule: %w", err)
							}
						}
					}
				}
			}
		}
	}

	_, err = d.ecsClient.DeleteService(ctx, &ecs.DeleteServiceInput{
		Cluster: aws.String(d.clusterName),
		Service: aws.String(svcName),
		Force:   aws.Bool(true),
	})
	if err != nil {
		return fmt.Errorf("failed to delete ECS service: %w", err)
	}

	time.Sleep(5 * time.Second)

	tgs, err := d.elbClient.DescribeTargetGroups(ctx, &elbv2.DescribeTargetGroupsInput{
		Names: []string{tgName},
	})
	if err == nil && tgs != nil && len(tgs.TargetGroups) > 0 {
		_, err = d.elbClient.DeleteTargetGroup(ctx, &elbv2.DeleteTargetGroupInput{
			TargetGroupArn: tgs.TargetGroups[0].TargetGroupArn,
		})
		if err != nil {
			return fmt.Errorf("failed to delete target group: %w", err)
		}
	}

	return nil
}
