# Vision

## One line

Connect your AWS account, pick a GitHub repo, click Deploy, and get a live
HTTPS URL. Everything runs in **your** account, on **your** bill, with
guardrails so you never get a surprise invoice.

## The problem

Developers who want to ship a containerized app today choose between two bad
options:

1. **Managed platforms** (Render, Railway, Vercel, Heroku). Easy to use, but
   apps run on the platform's servers. You pay a markup, cannot use AWS
   credits, and do not control where your data lives.
2. **AWS directly.** Cheaper and more powerful, but painful: ECS, load
   balancers, IAM, networking, registries, logging. It is also easy to leave
   resources running and receive a large bill. That happened to Hatch's author
   while building the first version, which is why cost safety is central to
   this product.

## The product

Hatch gives you the managed-platform experience on infrastructure you own.

- **Your account, your bill.** Hatch acts through a limited IAM role the user
  creates. Builds, images, containers, and logs all live in the user's AWS
  account.
- **Dockerfile in, URL out.** Connect a repo with a Dockerfile, set a port and
  environment variables, and deploy. Build logs stream live.
- **Cost guardrails are a core feature, not an add-on.** Cost estimates before
  every deploy, a budget alarm on connect, idle shutdown, expiry dates for test
  apps, and one-click "tear down everything Hatch created." See
  [Cost guardrails](04-cost-guardrails.md).
- **Works without AWS too.** A local Docker target runs the same flow on a
  laptop or a single server. This is how Hatch is developed and tested, and it
  is useful on its own for small self-hosted setups.

## Who it is for

- Students and solo developers with AWS credits.
- Small teams that want apps in their own AWS account for cost, compliance, or
  control.
- Anyone who has been burned by a cloud bill and wants guardrails.

## The user journey

1. **Sign in** with GitHub and install the Hatch GitHub App on the
   repositories Hatch may read (read-only).
2. **Connect AWS.** A link opens AWS's one-click stack creation
   (CloudFormation). The stack creates, in the user's account: a limited role
   Hatch can assume, a network, an ECS cluster, a load balancer, an image
   registry, a build project, a log group, and a **budget alarm**.
3. **Create a project** from a repo with a Dockerfile. Set port, CPU, memory,
   and environment variables. Hatch shows the **estimated monthly cost** before
   anything is created. New users are offered a sample app with a short expiry
   as their first deploy. Self-hosted installs can also deploy to local Docker
   without an AWS account.
4. **Deploy.** The image is built inside the user's account (AWS CodeBuild),
   pushed to their registry, and run on ECS Fargate behind HTTPS. Logs stream
   to the browser.
5. **Operate.** Auto-deploy on push, one-click rollback, runtime logs, pause,
   delete. Idle apps are paused automatically; test apps can expire.
6. **Disconnect.** "Tear down everything" removes every resource Hatch created
   and reports anything left behind.

## What Hatch is not (v1 non-goals)

- Not a hosted platform that runs strangers' code on Hatch's own
  infrastructure.
- Not multi-cloud in v1. AWS and local Docker only; the provider design leaves
  room for others later.
- No Dockerfile-less builds (buildpacks) in v1.
- No teams, roles, or organizations in v1. One user owns their projects and
  connected accounts.
- No databases or managed add-ons in v1. Hatch deploys stateless containers.

## Success criteria for v1

A new user can connect an AWS account in under 10 minutes, deploy a sample app,
roll it back, pause it, and tear everything down, and at every step they can
see what it costs and what Hatch has created in their account. Nothing Hatch
creates keeps running or billing without the user knowing.

## Why this is worth building

- It solves a real gap: the managed-platform experience inside your own cloud
  account, plus cost safety that neither managed platforms nor raw AWS offer.
- It is technically substantial: cross-account IAM, isolated builds,
  container orchestration, live log streaming, a durable job system, and cost
  modelling.
- It has a true origin story: *"I built a deploy platform, left test
  infrastructure running, and got a large AWS bill. So I rebuilt it to deploy
  into the user's own account with cost guardrails built in."*
