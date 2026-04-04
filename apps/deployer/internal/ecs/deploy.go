package ecs

import (
	"context"
	"fmt"
	"log"
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
	subnetA        string
	subnetB        string
	ecsSgID        string
	taskExecRole   string
	awsRegion      string
}

func NewDeployer(awsRegion, clusterName, albListenerARN, vpcID, subnetA, subnetB, ecsSgID, taskExecRole string, streamer *logs.Streamer) *Deployer {
	cfg, err := config.LoadDefaultConfig(context.Background(), config.WithRegion(awsRegion))
	if err != nil {
		log.Fatalf("failed to load aws config: %v", err)
	}

	return &Deployer{
		ecsClient:      ecs.NewFromConfig(cfg),
		elbClient:      elbv2.NewFromConfig(cfg),
		streamer:       streamer,
		clusterName:    clusterName,
		albListenerARN: albListenerARN,
		vpcID:          vpcID,
		subnetA:        subnetA,
		subnetB:        subnetB,
		ecsSgID:        ecsSgID,
		taskExecRole:   taskExecRole,
		awsRegion:      awsRegion,
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

type DeployOutput struct {
	ServiceARN string
	URL        string
}

func (d *Deployer) Deploy(ctx context.Context, input DeployInput) (*DeployOutput, error) {
	deploymentID := input.DeploymentID

	d.streamer.Publish(ctx, deploymentID, "→ Registering ECS task definition...")
	taskDefARN, err := d.registerTaskDefinition(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("task definition failed: %w", err)
	}
	d.streamer.Publish(ctx, deploymentID, fmt.Sprintf("✓ Task definition registered: %s", taskDefARN))

	d.streamer.Publish(ctx, deploymentID, "→ Creating ALB target group...")
	tgARN, err := d.createTargetGroup(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("target group failed: %w", err)
	}
	d.streamer.Publish(ctx, deploymentID, "✓ Target group created")

	d.streamer.Publish(ctx, deploymentID, "→ Configuring load balancer routing...")
	albURL, err := d.createListenerRule(ctx, input.DeploymentID[:8], tgARN)
	if err != nil {
		return nil, fmt.Errorf("listener rule failed: %w", err)
	}
	d.streamer.Publish(ctx, deploymentID, "✓ Load balancer routing configured")

	d.streamer.Publish(ctx, deploymentID, "→ Launching ECS Fargate service...")
	serviceARN, err := d.createECSService(ctx, input, taskDefARN, tgARN)
	if err != nil {
		return nil, fmt.Errorf("ecs service failed: %w", err)
	}
	d.streamer.Publish(ctx, deploymentID, "✓ ECS service launched")

	d.streamer.Publish(ctx, deploymentID, "→ Waiting for container health checks...")
	if err := d.waitForService(ctx, deploymentID, input.DeploymentID[:8]); err != nil {
		return nil, fmt.Errorf("service stability failed: %w", err)
	}

	d.streamer.Publish(ctx, deploymentID, fmt.Sprintf("✓ Deployment live at: %s", albURL))

	return &DeployOutput{
		ServiceARN: serviceARN,
		URL:        albURL,
	}, nil
}

func (d *Deployer) registerTaskDefinition(ctx context.Context, input DeployInput) (string, error) {
	family := fmt.Sprintf("hatch-%s", input.DeploymentID[:8])

	output, err := d.ecsClient.RegisterTaskDefinition(ctx, &ecs.RegisterTaskDefinitionInput{
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
						"awslogs-stream-prefix": input.DeploymentID[:8],
						"awslogs-create-group":  "true",
					},
				},
			},
		},
	})
	if err != nil {
		return "", err
	}

	return *output.TaskDefinition.TaskDefinitionArn, nil
}

func (d *Deployer) createTargetGroup(ctx context.Context, input DeployInput) (string, error) {
	name := fmt.Sprintf("hatch-%s", input.DeploymentID[:8])

	output, err := d.elbClient.CreateTargetGroup(ctx, &elbv2.CreateTargetGroupInput{
		Name:                       aws.String(name),
		Protocol:                   elbv2types.ProtocolEnumHttp,
		Port:                       aws.Int32(input.Port),
		VpcId:                      aws.String(d.vpcID),
		TargetType:                 elbv2types.TargetTypeEnumIp,
		HealthCheckPath:            aws.String(input.HealthCheck),
		HealthyThresholdCount:      aws.Int32(2),
		UnhealthyThresholdCount:    aws.Int32(3),
		HealthCheckIntervalSeconds: aws.Int32(30),
	})
	if err != nil {
		return "", err
	}

	return *output.TargetGroups[0].TargetGroupArn, nil
}

func (d *Deployer) createListenerRule(ctx context.Context, subdomain, tgARN string) (string, error) {
	listenerOutput, err := d.elbClient.DescribeListeners(ctx, &elbv2.DescribeListenersInput{
		ListenerArns: []string{d.albListenerARN},
	})
	if err != nil {
		return "", err
	}

	lbARN := *listenerOutput.Listeners[0].LoadBalancerArn
	lbOutput, err := d.elbClient.DescribeLoadBalancers(ctx, &elbv2.DescribeLoadBalancersInput{
		LoadBalancerArns: []string{lbARN},
	})
	if err != nil {
		return "", err
	}

	albDNS := *lbOutput.LoadBalancers[0].DNSName

	_, err = d.elbClient.CreateRule(ctx, &elbv2.CreateRuleInput{
		ListenerArn: aws.String(d.albListenerARN),
		Priority:    aws.Int32(int32(time.Now().Unix() % 50000)),
		Conditions: []elbv2types.RuleCondition{
			{
				Field:  aws.String("path-pattern"),
				Values: []string{fmt.Sprintf("/%s*", subdomain)},
			},
		},
		Actions: []elbv2types.Action{
			{
				Type:           elbv2types.ActionTypeEnumForward,
				TargetGroupArn: aws.String(tgARN),
			},
		},
	})
	if err != nil {
		return "", err
	}

	url := fmt.Sprintf("%s/%s", albDNS, subdomain)
	return url, nil
}

func (d *Deployer) createECSService(ctx context.Context, input DeployInput, taskDefARN, tgARN string) (string, error) {
	serviceName := fmt.Sprintf("hatch-%s", input.DeploymentID[:8])

	existing, err := d.ecsClient.DescribeServices(ctx, &ecs.DescribeServicesInput{
		Cluster:  aws.String(d.clusterName),
		Services: []string{serviceName},
	})
	if err == nil && len(existing.Services) > 0 && existing.Services[0].Status != nil && *existing.Services[0].Status != "INACTIVE" {
		output, err := d.ecsClient.UpdateService(ctx, &ecs.UpdateServiceInput{
			Service:        aws.String(serviceName),
			Cluster:        aws.String(d.clusterName),
			TaskDefinition: aws.String(taskDefARN),
			DesiredCount:   aws.Int32(1),
		})
		if err != nil {
			return "", err
		}
		return *output.Service.ServiceArn, nil
	}

	output, err := d.ecsClient.CreateService(ctx, &ecs.CreateServiceInput{
		ServiceName:    aws.String(serviceName),
		Cluster:        aws.String(d.clusterName),
		TaskDefinition: aws.String(taskDefARN),
		DesiredCount:   aws.Int32(1),
		LaunchType:     types.LaunchTypeFargate,
		NetworkConfiguration: &types.NetworkConfiguration{
			AwsvpcConfiguration: &types.AwsVpcConfiguration{
				Subnets:        []string{d.subnetA, d.subnetB},
				SecurityGroups: []string{d.ecsSgID},
				AssignPublicIp: types.AssignPublicIpEnabled,
			},
		},
		LoadBalancers: []types.LoadBalancer{
			{
				TargetGroupArn: aws.String(tgARN),
				ContainerName:  aws.String("app"),
				ContainerPort:  aws.Int32(input.Port),
			},
		},
	})
	if err != nil {
		return "", err
	}

	return *output.Service.ServiceArn, nil
}

func (d *Deployer) waitForService(ctx context.Context, deploymentID, serviceName string) error {
	fullServiceName := fmt.Sprintf("hatch-%s", serviceName)
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	timeout := time.After(5 * time.Minute)

	for {
		select {
		case <-timeout:
			return fmt.Errorf("timed out waiting for service to be stable")
		case <-ticker.C:
			output, err := d.ecsClient.DescribeServices(ctx, &ecs.DescribeServicesInput{
				Cluster:  aws.String(d.clusterName),
				Services: []string{fullServiceName},
			})
			if err != nil {
				return err
			}
			if len(output.Services) == 0 {
				continue
			}
			svc := output.Services[0]
			d.streamer.Publish(ctx, deploymentID, fmt.Sprintf(
				"→ Running: %d, Pending: %d, Desired: %d",
				svc.RunningCount, svc.PendingCount, svc.DesiredCount,
			))
			if svc.RunningCount >= 1 && svc.PendingCount == 0 {
				return nil
			}
		}
	}
}
