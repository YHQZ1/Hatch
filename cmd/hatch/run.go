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
	"github.com/YHQZ1/hatch/internal/build"
	"github.com/YHQZ1/hatch/internal/build/docker"
	"github.com/YHQZ1/hatch/internal/config"
	"github.com/YHQZ1/hatch/internal/githubapp"
	"github.com/YHQZ1/hatch/internal/jobs"
	"github.com/YHQZ1/hatch/internal/proxy"
	"github.com/YHQZ1/hatch/internal/runtime"
	localruntime "github.com/YHQZ1/hatch/internal/runtime/docker"
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
	// The proxy and the API share the traffic counts, so they must run in one
	// process; on the AWS target there is no proxy and nothing to count.
	var local *api.LocalTarget
	if cfg.Target == config.TargetLocal {
		local = &api.LocalTarget{
			Stats:    proxy.NewStats(),
			Resolver: localruntime.New(stream.Discard{}, appURL(cfg)),
		}
	}
	components := []component{
		{"api", func(ctx context.Context) error { return api.Run(ctx, cfg, local) }},
		jobsComponent(cfg),
	}
	if local != nil {
		components = append(components, proxyComponent(cfg, local))
	}
	return runTogether(components...)
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

// providers are what the jobs build and run apps with.
type providers struct {
	builder build.Builder
	runtime runtime.Runtime
}

// providersFor returns the build and runtime providers for the configured
// target. Log lines from both go to logs.
func providersFor(ctx context.Context, cfg *config.Config, logs stream.Sink) providers {
	if cfg.Target == config.TargetLocal {
		if err := localruntime.Available(ctx, localruntime.Exec); err != nil {
			// Not fatal: the console is still useful, and a deploy says why it failed.
			slog.Warn("Docker is not available; deployments will fail until it is running", "error", err)
		}
		return providers{
			builder: docker.NewLocalBuilder(logs),
			runtime: localruntime.New(logs, appURL(cfg)),
		}
	}

	deployer := ecsdeploy.NewDeployer(
		cfg.AWSRegion, cfg.ECSClusterName, cfg.ALBListenerARN,
		cfg.VPCID, cfg.SubnetA, cfg.SubnetB, cfg.ECSSecurityGroupID,
		cfg.TaskExecutionRoleARN, cfg.BaseDomain, cfg.DeploymentURLScheme, logs,
	)
	return providers{
		builder: docker.NewBuilder(cfg.ECRRegistry, cfg.ECRRepository, cfg.AWSRegion, logs),
		runtime: ecsdeploy.NewRuntime(deployer),
	}
}

// appURL is where an app is reached on the local target.
func appURL(cfg *config.Config) func(subdomain string) string {
	return func(subdomain string) string {
		return fmt.Sprintf("%s://%s.%s", cfg.DeploymentURLScheme, subdomain, cfg.BaseDomain)
	}
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
		logs := stream.NewPostgres(pool)

		p := providersFor(ctx, cfg, logs)
		slog.Info("component started", "component", "jobs", "target", cfg.Target)
		return jobs.Run(ctx, jobs.Deps{
			Pool:         pool,
			Builder:      p.builder,
			Runtime:      p.runtime,
			Logs:         logs,
			Secrets:      codec,
			CloneTokens:  githubapp.New(cfg.GitHubClientID, cfg.GitHubAppKey),
			BuildTimeout: cfg.BuildTimeout,
		}, jobShutdownGrace)
	}}
}

// proxyComponent serves the apps of the local target at <name>.localhost.
func proxyComponent(cfg *config.Config, local *api.LocalTarget) component {
	return component{"proxy", func(ctx context.Context) error {
		return proxy.Serve(ctx, cfg.LocalProxyAddr, proxy.New(local.Resolver, "localhost", local.Stats))
	}}
}
