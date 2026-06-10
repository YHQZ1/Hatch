package ecs

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
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
	ecsClient       *ecs.Client
	elbClient       *elbv2.Client
	streamer        *logs.Streamer
	clusterName     string
	albListenerARN  string
	vpcID           string
	subnets         []string
	ecsSgID         string
	taskExecRole    string
	awsRegion       string
	baseDomain      string
	publicURLScheme string
	cancelChecker   func(context.Context, string) (bool, error)
}

var ErrCanceled = errors.New("deployment canceled")

func NewDeployer(awsRegion, cluster, listener, vpc, subA, subB, sg, role, domain, publicURLScheme string, streamer *logs.Streamer) *Deployer {
	cfg, err := config.LoadDefaultConfig(context.Background(), config.WithRegion(awsRegion))
	if err != nil {
		cfg = aws.Config{Region: awsRegion}
	}

	if publicURLScheme == "" {
		publicURLScheme = "http"
	}

	return &Deployer{
		ecsClient:       ecs.NewFromConfig(cfg),
		elbClient:       elbv2.NewFromConfig(cfg),
		streamer:        streamer,
		clusterName:     cluster,
		albListenerARN:  listener,
		vpcID:           vpc,
		subnets:         []string{subA, subB},
		ecsSgID:         sg,
		taskExecRole:    role,
		awsRegion:       awsRegion,
		baseDomain:      domain,
		publicURLScheme: publicURLScheme,
	}
}

func (d *Deployer) SetCancelChecker(fn func(context.Context, string) (bool, error)) {
	d.cancelChecker = fn
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

type DeployResult struct {
	PublicURL         string
	TaskDefinitionARN string
	TargetGroupARN    string
	ServiceARN        string
	ServiceName       string
}

func (d *Deployer) Deploy(ctx context.Context, input DeployInput) (DeployResult, error) {
	id := input.DeploymentID
	slug := input.Subdomain

	if err := d.ensureNotCanceled(ctx, id); err != nil {
		return DeployResult{}, err
	}

	d.streamer.Publish(ctx, id, "Registering task definition...")
	taskArn, err := d.registerTaskDefinition(ctx, input)
	if err != nil {
		return DeployResult{}, fmt.Errorf("failed to register task definition: %w", err)
	}

	if err := d.ensureNotCanceled(ctx, id); err != nil {
		return DeployResult{}, err
	}

	d.streamer.Publish(ctx, id, "Configuring target group...")
	tgArn, err := d.upsertTargetGroup(ctx, input)
	if err != nil {
		return DeployResult{}, fmt.Errorf("failed to configure target group: %w", err)
	}

	if err := d.ensureNotCanceled(ctx, id); err != nil {
		return DeployResult{}, err
	}

	d.streamer.Publish(ctx, id, "Updating routing rules...")
	url, err := d.upsertListenerRule(ctx, slug, tgArn)
	if err != nil {
		return DeployResult{}, fmt.Errorf("failed to update routing rules: %w", err)
	}

	if err := d.ensureNotCanceled(ctx, id); err != nil {
		return DeployResult{}, err
	}

	d.streamer.Publish(ctx, id, "Provisioning Fargate service...")
	serviceArn, err := d.upsertService(ctx, input, taskArn, tgArn)
	if err != nil {
		return DeployResult{}, fmt.Errorf("failed to provision service: %w", err)
	}

	d.streamer.Publish(ctx, id, "Monitoring service stability...")
	if err := d.waitForStability(ctx, id, slug, tgArn); err != nil {
		return DeployResult{}, fmt.Errorf("service stability check failed: %w", err)
	}

	publicURL := d.publicURL(url)
	d.streamer.Publish(ctx, id, fmt.Sprintf("Deployment live at: %s", publicURL))
	return DeployResult{
		PublicURL:         publicURL,
		TaskDefinitionARN: taskArn,
		TargetGroupARN:    tgArn,
		ServiceARN:        serviceArn,
		ServiceName:       serviceName(slug),
	}, nil
}

func (d *Deployer) ensureNotCanceled(ctx context.Context, deploymentID string) error {
	if d.cancelChecker == nil {
		return nil
	}
	canceled, err := d.cancelChecker(ctx, deploymentID)
	if err != nil {
		return err
	}
	if canceled {
		return ErrCanceled
	}
	return nil
}

func (d *Deployer) publicURL(host string) string {
	return fmt.Sprintf("%s://%s", d.publicURLScheme, strings.TrimPrefix(strings.TrimPrefix(host, "http://"), "https://"))
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

	priority, err := nextAvailablePriority(rules)
	if err != nil {
		return "", err
	}

	_, err = d.elbClient.CreateRule(ctx, &elbv2.CreateRuleInput{
		ListenerArn: aws.String(d.albListenerARN),
		Priority:    aws.Int32(priority),
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
	name := serviceName(input.Subdomain)

	svcs, err := d.ecsClient.DescribeServices(ctx, &ecs.DescribeServicesInput{
		Cluster:  aws.String(d.clusterName),
		Services: []string{name},
	})

	if err == nil && len(svcs.Services) > 0 && svcs.Services[0].Status != nil && *svcs.Services[0].Status != "INACTIVE" {
		svc := svcs.Services[0]
		wiringMatches := serviceWiringMatches(svc, input.Port, tgArn)

		if wiringMatches {
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

		d.streamer.Publish(ctx, input.DeploymentID, "Service wiring changed, recreating service...")
		_, err = d.ecsClient.DeleteService(ctx, &ecs.DeleteServiceInput{
			Cluster: aws.String(d.clusterName),
			Service: aws.String(name),
			Force:   aws.Bool(true),
		})
		if err != nil {
			d.streamer.Publish(ctx, input.DeploymentID, fmt.Sprintf("Warning: Failed to delete old service: %v", err))
		}
		if err := d.waitForServiceInactive(ctx, name); err != nil {
			return "", err
		}
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

func serviceWiringMatches(svc types.Service, expectedPort int32, expectedTargetGroupArn string) bool {
	if len(svc.LoadBalancers) == 0 {
		return false
	}

	for _, lb := range svc.LoadBalancers {
		portMatches := lb.ContainerPort != nil && *lb.ContainerPort == expectedPort
		targetMatches := lb.TargetGroupArn != nil && *lb.TargetGroupArn == expectedTargetGroupArn
		if portMatches && targetMatches {
			return true
		}
	}

	return false
}

func (d *Deployer) waitForStability(ctx context.Context, deployID, slug, tgArn string) error {
	name := serviceName(slug)
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	timeout := time.After(8 * time.Minute)

	check := func() (bool, error) {
		if err := d.ensureNotCanceled(ctx, deployID); err != nil {
			return false, err
		}

		out, err := d.ecsClient.DescribeServices(ctx, &ecs.DescribeServicesInput{
			Cluster:  aws.String(d.clusterName),
			Services: []string{name},
		})
		if err != nil {
			d.streamer.Publish(ctx, deployID, fmt.Sprintf("Waiting for ECS service details: %v", err))
			return false, nil
		}
		if len(out.Services) == 0 {
			d.streamer.Publish(ctx, deployID, "Waiting for ECS service registration...")
			return false, nil
		}

		svc := out.Services[0]
		targetHealthy, targetState := d.targetGroupHealthy(ctx, tgArn)
		d.streamer.Publish(ctx, deployID, fmt.Sprintf("Task health: %d running, %d pending, target %s", svc.RunningCount, svc.PendingCount, targetState))

		if svc.RunningCount >= 1 && svc.PendingCount == 0 && targetHealthy {
			return true, nil
		}

		return false, nil
	}

	ok, err := check()
	if err != nil {
		return err
	}
	if ok {
		return nil
	}

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-timeout:
			return fmt.Errorf("stability timeout: service failed to reach healthy state")
		case <-ticker.C:
			ok, err := check()
			if err != nil {
				return err
			}
			if ok {
				return nil
			}
		}
	}
}

func (d *Deployer) targetGroupHealthy(ctx context.Context, tgArn string) (bool, string) {
	out, err := d.elbClient.DescribeTargetHealth(ctx, &elbv2.DescribeTargetHealthInput{
		TargetGroupArn: aws.String(tgArn),
	})
	if err != nil {
		return false, "unknown"
	}
	if len(out.TargetHealthDescriptions) == 0 {
		return false, "registering"
	}

	state := "unknown"
	for _, desc := range out.TargetHealthDescriptions {
		if desc.TargetHealth == nil {
			continue
		}
		state = string(desc.TargetHealth.State)
		if desc.TargetHealth.Reason != "" {
			state = fmt.Sprintf("%s (%s)", state, desc.TargetHealth.Reason)
		}
		if desc.TargetHealth.State == elbv2types.TargetHealthStateEnumHealthy {
			return true, "healthy"
		}
	}
	return false, state
}

func (d *Deployer) Teardown(ctx context.Context, slug string) error {
	svcName := serviceName(slug)
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
							if err != nil && !isNotFound(err) {
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
	if err != nil && !isNotFound(err) {
		return fmt.Errorf("failed to delete ECS service: %w", err)
	}

	if err == nil {
		if err := d.waitForServiceInactive(ctx, svcName); err != nil {
			return err
		}
	}

	tgs, err := d.elbClient.DescribeTargetGroups(ctx, &elbv2.DescribeTargetGroupsInput{
		Names: []string{tgName},
	})
	if err == nil && tgs != nil && len(tgs.TargetGroups) > 0 {
		_, err = d.elbClient.DeleteTargetGroup(ctx, &elbv2.DeleteTargetGroupInput{
			TargetGroupArn: tgs.TargetGroups[0].TargetGroupArn,
		})
		if err != nil && !isNotFound(err) {
			return fmt.Errorf("failed to delete target group: %w", err)
		}
	}

	return nil
}

func (d *Deployer) waitForServiceInactive(ctx context.Context, service string) error {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	timeout := time.After(6 * time.Minute)

	check := func() (bool, error) {
		out, err := d.ecsClient.DescribeServices(ctx, &ecs.DescribeServicesInput{
			Cluster:  aws.String(d.clusterName),
			Services: []string{service},
		})
		if err != nil {
			if isNotFound(err) {
				return true, nil
			}
			return false, fmt.Errorf("failed to describe ECS service during deletion: %w", err)
		}
		if len(out.Services) == 0 {
			return true, nil
		}
		svc := out.Services[0]
		if svc.Status == nil || *svc.Status == "INACTIVE" {
			return true, nil
		}
		return false, nil
	}

	ok, err := check()
	if err != nil {
		return err
	}
	if ok {
		return nil
	}

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-timeout:
			return fmt.Errorf("timeout waiting for ECS service %s to become inactive", service)
		case <-ticker.C:
			ok, err := check()
			if err != nil {
				return err
			}
			if ok {
				return nil
			}
		}
	}
}

func (d *Deployer) SetServiceDesiredCount(ctx context.Context, slug string, desiredCount int32) error {
	name := serviceName(slug)
	_, err := d.ecsClient.UpdateService(ctx, &ecs.UpdateServiceInput{
		Cluster:      aws.String(d.clusterName),
		Service:      aws.String(name),
		DesiredCount: aws.Int32(desiredCount),
	})
	if err != nil && !isNotFound(err) {
		return fmt.Errorf("failed to update ECS service desired count: %w", err)
	}
	if err != nil {
		return fmt.Errorf("ECS service not found: %s", name)
	}
	return d.waitForDesiredCount(ctx, name, desiredCount)
}

func (d *Deployer) waitForDesiredCount(ctx context.Context, service string, desiredCount int32) error {
	ticker := time.NewTicker(8 * time.Second)
	defer ticker.Stop()

	timeout := time.After(7 * time.Minute)

	check := func() (bool, error) {
		out, err := d.ecsClient.DescribeServices(ctx, &ecs.DescribeServicesInput{
			Cluster:  aws.String(d.clusterName),
			Services: []string{service},
		})
		if err != nil {
			return false, fmt.Errorf("failed to describe ECS service: %w", err)
		}
		if len(out.Services) == 0 {
			return false, fmt.Errorf("ECS service not found: %s", service)
		}

		svc := out.Services[0]
		if desiredCount == 0 {
			return svc.RunningCount == 0 && svc.PendingCount == 0, nil
		}

		targetHealthy := true
		targetState := "not configured"
		if len(svc.LoadBalancers) > 0 && svc.LoadBalancers[0].TargetGroupArn != nil {
			targetHealthy, targetState = d.targetGroupHealthy(ctx, *svc.LoadBalancers[0].TargetGroupArn)
		}

		if svc.RunningCount >= desiredCount && svc.PendingCount == 0 && targetHealthy {
			return true, nil
		}
		if strings.HasPrefix(targetState, "unhealthy") {
			return false, nil
		}
		return false, nil
	}

	ok, err := check()
	if err != nil {
		return err
	}
	if ok {
		return nil
	}

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-timeout:
			if desiredCount == 0 {
				return fmt.Errorf("suspend timeout: service still has running or pending tasks")
			}
			return fmt.Errorf("resume timeout: service did not become healthy")
		case <-ticker.C:
			ok, err := check()
			if err != nil {
				return err
			}
			if ok {
				return nil
			}
		}
	}
}

func serviceName(slug string) string {
	return fmt.Sprintf("hatch-%s", slug)
}

func nextAvailablePriority(rules *elbv2.DescribeRulesOutput) (int32, error) {
	used := map[int]bool{}
	if rules != nil {
		for _, rule := range rules.Rules {
			if rule.Priority == nil || *rule.Priority == "default" {
				continue
			}
			priority, err := strconv.Atoi(*rule.Priority)
			if err == nil {
				used[priority] = true
			}
		}
	}

	for priority := 1000; priority <= 50000; priority++ {
		if !used[priority] {
			return int32(priority), nil
		}
	}
	return 0, fmt.Errorf("no available listener rule priorities")
}

func isNotFound(err error) bool {
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "notfound") ||
		strings.Contains(message, "not found") ||
		strings.Contains(message, "not exist")
}
