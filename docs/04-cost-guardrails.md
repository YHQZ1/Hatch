# Cost Guardrails

The first version of Hatch produced a large AWS bill because resources were
left running after testing. The rebuilt Hatch treats cost safety as a core
feature: **nothing Hatch creates runs or bills without the user knowing, and
cleanup is one click.**

## Guarantees

1. Before any resource is created, the user sees what it is expected to cost.
2. Every resource Hatch creates is recorded and visible in one place.
3. Anything idle, expired, failed, or orphaned is found and handled
   automatically.
4. One action removes everything Hatch created in an account, and the result is
   verified.

## Features

### 1. Cost estimate before every deploy

- Shown on the new-project screen, before deploy, and when changing CPU,
  memory, or replica count.
- Covers the app's own costs (Fargate vCPU and memory hours, log ingestion
  and storage, image storage, Secrets Manager secrets) and shows the account's
  shared fixed cost (the ALB) separately.
- Shows a monthly figure, assuming 24/7 running, plus the figure with idle
  pause enabled.
- Data source _(open)_: the AWS Price List API, or a bundled price table per
  region refreshed with each release. Estimates are always labelled as
  estimates.

### 2. Budget alarm on connect

- The `hatch-connect` CloudFormation stack creates an AWS Budget with the
  monthly limit the user chooses, alerting by email at 50%, 80%, and 100%.
- AWS Budgets can alert, but its automatic actions cannot stop ECS services, so
  Hatch enforces the cap itself (next item).

### 3. Spend cap enforcement in Hatch

- Each connection has a monthly cap. Hatch tracks estimated month-to-date spend
  for its resources (from its own runtime records, optionally reconciled with
  Cost Explorer _(open)_).
- At 80% of the cap: warning in the UI.
- At 100%: new deploys are blocked, and the user chooses whether running apps
  are paused automatically. The default is to pause them.

### 4. Idle detection and pause

- Hatch tracks each app's last request time (ALB request count metrics on AWS,
  proxy access logs on the local target).
- Default policy: no requests for 7 days → warning; for 14 days → pause (scale
  to 0). Configurable per project, including "never pause."
- Pausing stops compute charges. The shared ALB and stored images remain;
  the UI says so.

### 5. Expiry dates for test apps

- Any project can have an expiry ("delete in 1 hour / 24 hours / 7 days").
- Hatch warns before expiry and then runs the full teardown for that app.
- Suggested by default for projects created from the "Try a sample app"
  flow.

### 6. Resource inventory

- Every cloud resource Hatch creates is written to the `resources` table and
  tagged in AWS with `hatch:managed=true`, `hatch:connection=<id>`, and
  `hatch:project=<id>`.
- The account page lists every resource, what it belongs to, when it was
  created, and its estimated cost.

### 7. Orphan sweeper

A scheduled `sweep` job:

- removes resources left by failed or canceled deploys;
- expires old images beyond the retention count (ECR lifecycle policy as a
  backstop);
- compares the inventory with tagged resources found in AWS and reports
  mismatches (in AWS but not in the inventory, or the reverse);
- applies idle and expiry policies.

### 8. Tear down everything

- Per app: "Delete project" removes all of that app's resources.
- Per account: "Tear down everything" removes every resource in the inventory,
  then lists any `hatch:managed` resources still found in AWS, and finally
  guides the user to delete the `hatch-connect` stack (which removes the ALB,
  cluster, roles, and budget).
- The result screen shows exactly what was deleted and what remains, so the
  user can confirm a zero-cost state.

## Defaults

| Setting | Default |
|---------|---------|
| Monthly budget at connect | User must choose; suggested $10 |
| Spend cap behaviour | Block new deploys and pause running apps |
| Idle warning / pause | 7 / 14 days without requests |
| Image retention | Last 5 images per app |
| Log retention | 14 days |
| Default task size | 0.25 vCPU / 512 MB |
| Replicas | 1 |

These values are starting points; confirm them during the Phase 4 design.

## Acceptance tests (Phase 4)

- Deploying shows a cost estimate, and the estimate changes when CPU or memory
  changes.
- With the spend cap reached, a new deploy is refused with a clear message.
- An app with no traffic past the idle limit is paused, and the user is
  notified.
- An app past its expiry is fully removed, with nothing left in the inventory.
- "Tear down everything" against the fake provider leaves zero inventory rows
  and reports zero remaining resources; against the local provider it removes
  all Hatch containers, images, and networks.
