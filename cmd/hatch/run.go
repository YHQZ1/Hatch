package main

import (
	"context"
	"fmt"
	"log/slog"
	"os/signal"
	"syscall"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/YHQZ1/hatch/internal/api"
	"github.com/YHQZ1/hatch/internal/build/docker"
	"github.com/YHQZ1/hatch/internal/config"
	"github.com/YHQZ1/hatch/internal/githubapp"
	"github.com/YHQZ1/hatch/internal/jobs"
	ecsdeploy "github.com/YHQZ1/hatch/internal/runtime/ecs"
	"github.com/YHQZ1/hatch/internal/secrets"
	"github.com/YHQZ1/hatch/internal/store"
	"github.com/YHQZ1/hatch/internal/stream"
)

// component is one long-running part of Hatch. It runs until ctx is canceled
// and returns nil after a clean shutdown, or an error if it fails.
type component struct {
	name string
	run  func(ctx context.Context) error
}

// runServe runs the API and web UI together with the job runner.
func runServe() error {
	cfg, err := config.Load(config.RoleServe)
	if err != nil {
		return err
	}
	return runTogether(
		component{"api", func(ctx context.Context) error { return api.Run(ctx, cfg) }},
		jobsComponent(cfg),
	)
}

// runWorkers runs only the job runner.
func runWorkers() error {
	cfg, err := config.Load(config.RoleWorker)
	if err != nil {
		return err
	}
	return runTogether(jobsComponent(cfg))
}

func runMigrate() error {
	cfg, err := config.Load(config.RoleMigrate)
	if err != nil {
		return err
	}
	version, err := store.Migrate(context.Background(), cfg.DatabaseURL)
	if err != nil {
		return err
	}
	fmt.Printf("database is at migration %d\n", version)
	return nil
}

// runTogether starts the components and stops them all on SIGINT or SIGTERM,
// or as soon as one of them fails. It returns the first failure.
func runTogether(components ...component) error {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	group, ctx := errgroup.WithContext(ctx)
	for _, c := range components {
		group.Go(func() error {
			if err := c.run(ctx); err != nil {
				return fmt.Errorf("%s: %w", c.name, err)
			}
			return nil
		})
	}
	return group.Wait()
}

// jobShutdownGrace is how long running jobs get to finish when Hatch stops.
// Jobs still running after that are canceled and run again on the next start.
const jobShutdownGrace = 30 * time.Second

// jobsComponent works the background jobs: builds, deploys, pause and resume,
// and project cleanup.
func jobsComponent(cfg *config.Config) component {
	return component{"jobs", func(ctx context.Context) error {
		pool, err := store.Connect(ctx, cfg.DatabaseURL)
		if err != nil {
			return err
		}
		defer pool.Close()

		codec, err := secrets.NewCodec(cfg.DataEncryptionKey)
		if err != nil {
			return fmt.Errorf("initialize secret codec: %w", err)
		}
		logs := stream.NewRedis(cfg.RedisURL)
		defer logs.Close()

		deployer := ecsdeploy.NewDeployer(
			cfg.AWSRegion, cfg.ECSClusterName, cfg.ALBListenerARN,
			cfg.VPCID, cfg.SubnetA, cfg.SubnetB, cfg.ECSSecurityGroupID,
			cfg.TaskExecutionRoleARN, cfg.BaseDomain, cfg.DeploymentURLScheme, logs,
		)
		slog.Info("component started", "component", "jobs", "region", cfg.AWSRegion, "cluster", cfg.ECSClusterName)
		return jobs.Run(ctx, jobs.Deps{
			Pool:         pool,
			Builder:      docker.NewBuilder(cfg.ECRRegistry, cfg.ECRRepository, cfg.AWSRegion, logs),
			Runtime:      ecsdeploy.NewRuntime(deployer),
			Logs:         logs,
			Secrets:      codec,
			CloneTokens:  githubapp.New(cfg.GitHubClientID, cfg.GitHubAppKey),
			BuildTimeout: cfg.BuildTimeout,
		}, jobShutdownGrace)
	}}
}
