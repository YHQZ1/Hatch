package main

import (
	"context"
	"fmt"
	"log/slog"
	"os/signal"
	"syscall"

	"golang.org/x/sync/errgroup"

	"github.com/YHQZ1/hatch/internal/api"
	buildqueue "github.com/YHQZ1/hatch/internal/build/queue"
	"github.com/YHQZ1/hatch/internal/config"
	runtimequeue "github.com/YHQZ1/hatch/internal/runtime/queue"
	"github.com/YHQZ1/hatch/internal/store"
)

// component is one long-running part of Hatch. It runs until ctx is canceled
// and returns nil after a clean shutdown, or an error if it fails.
type component struct {
	name string
	run  func(ctx context.Context) error
}

// runServe runs the API and web UI together with the workers.
func runServe() error {
	cfg, err := config.Load(config.RoleServe)
	if err != nil {
		return err
	}
	return runTogether(
		component{"api", func(ctx context.Context) error { return api.Run(ctx, cfg) }},
		builderComponent(cfg),
		deployerComponent(cfg),
	)
}

// runWorkers runs only the build and deploy workers.
func runWorkers() error {
	cfg, err := config.Load(config.RoleWorker)
	if err != nil {
		return err
	}
	return runTogether(builderComponent(cfg), deployerComponent(cfg))
}

func runMigrate() error {
	cfg, err := config.Load(config.RoleMigrate)
	if err != nil {
		return err
	}
	version, err := store.Migrate(cfg.DatabaseURL)
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

// worker is what the build and deploy workers have in common: Start blocks
// until the worker stops, and Stop asks it to.
type worker interface {
	Start() error
	Stop()
}

// superviseWorker runs w until ctx is canceled, then stops it and waits.
func superviseWorker(ctx context.Context, name string, w worker) error {
	errCh := make(chan error, 1)
	go func() { errCh <- w.Start() }()

	select {
	case <-ctx.Done():
		slog.Info("component stopping", "component", name)
		w.Stop()
		if err := <-errCh; err != nil {
			slog.Error("component stopped with an error", "component", name, "error", err)
		}
		return nil
	case err := <-errCh:
		return err
	}
}

func builderComponent(cfg *config.Config) component {
	return component{"builder", func(ctx context.Context) error {
		w := buildqueue.NewWorker(
			cfg.RabbitMQURL,
			cfg.RedisURL,
			cfg.ECRRegistry,
			cfg.ECRRepository,
			cfg.AWSRegion,
			cfg.DatabaseURL,
			cfg.DataEncryptionKey,
			cfg.BuildTimeout,
		)
		defer w.Close()
		slog.Info("component started", "component", "builder", "region", cfg.AWSRegion)
		return superviseWorker(ctx, "builder", w)
	}}
}

func deployerComponent(cfg *config.Config) component {
	return component{"deployer", func(ctx context.Context) error {
		w := runtimequeue.NewWorker(runtimequeue.Config{
			RabbitMQURL:          cfg.RabbitMQURL,
			RedisURL:             cfg.RedisURL,
			AWSRegion:            cfg.AWSRegion,
			ECSClusterName:       cfg.ECSClusterName,
			ALBListenerARN:       cfg.ALBListenerARN,
			PublicURLScheme:      cfg.DeploymentURLScheme,
			VPCID:                cfg.VPCID,
			SubnetA:              cfg.SubnetA,
			SubnetB:              cfg.SubnetB,
			ECSSgID:              cfg.ECSSecurityGroupID,
			TaskExecutionRoleARN: cfg.TaskExecutionRoleARN,
			DatabaseURL:          cfg.DatabaseURL,
			BaseDomain:           cfg.BaseDomain,
			DataEncryptionKey:    cfg.DataEncryptionKey,
		})
		defer w.Close()
		slog.Info("component started", "component", "deployer", "region", cfg.AWSRegion, "cluster", cfg.ECSClusterName)
		return superviseWorker(ctx, "deployer", w)
	}}
}
