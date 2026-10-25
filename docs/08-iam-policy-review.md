# IAM policy review

Reviewed: 2026-10-25. Subject: the `hatch-control` role in
[`deploy/cloudformation/hatch-connect.yaml`](../deploy/cloudformation/hatch-connect.yaml),
which is everything Hatch can do in a user's AWS account
([ADR 0001](decisions/0001-deploy-into-user-cloud-account.md)).

## What this review is, and is not

It is a line-by-line read of the trust policy and every permission statement,
checked against two things: what Hatch's code calls, and what AWS's own published
reference says each action supports.

It is **not** a test against AWS. Nothing here has been run, and no account has
been connected. It was done by the coding assistant, not by a second person, and
the AWS reference was read through a summarising tool, so the handful of facts
the policy leans on (listed under [Check these yourself](#check-these-yourself))
deserve a human look. [Phase 6](05-roadmap.md) tries the whole thing in a real
account with a spending limit, which is the test that counts.

## Sources

- **Hatch's calls:** the AWS clients in `internal/runtime/ecs`, `internal/build/docker`
  and `internal/api/handlers/metrics.go`, and what [Phase 3](05-roadmap.md) says
  will be added (CodeBuild, Secrets Manager, runtime logs, rollback).
- **What IAM supports:** the AWS Service Authorization Reference in its
  machine-readable form, `https://servicereference.us-east-1.amazonaws.com/v1/<service>/<service>.json`,
  for `ecs`, `elasticloadbalancing`, `ecr`, `cloudformation`, `codebuild`,
  `secretsmanager`, `logs`, `cloudwatch` and `iam`, read on the date above. For
  every action it says which resource types it accepts (none means the Resource
  must be `*`) and which condition keys it carries.
- **Mechanics:** `cfn-lint`, and the resolved policy's size (5,170 bytes of the
  10,240 IAM allows for inline policies on a role, so there is room).

## The rule the policy follows

[Architecture principle 2](03-architecture.md#principles) says the role can only
touch what Hatch created: named `hatch-` **and** tagged `hatch:managed=true`. The
policy now enforces both in IAM, not just the name:

1. **Create**: each create action has its own statement, with the tag required in
   the request (`aws:RequestTag/hatch:managed`). They are separate because a
   condition on a key an action does not carry would deny it.
2. **Tag on create**: tagging is itself a call, so it is allowed, but only as part
   of those creates (`CreateAction`), never to retag something that exists.
3. **Change or delete**: only resources named `hatch-*` that carry the tag
   (`aws:ResourceTag/hatch:managed`).

So a service, target group, rule or secret you made yourself, even if you named it
`hatch-something`, cannot be changed by Hatch, and neither can the load balancer's
own listeners and their default action, which the stack made and which carry no tag.

## Trust policy

| Point | Finding |
| --- | --- |
| Who can assume it | The one principal given as a parameter, and only with this connection's ExternalId (`sts:ExternalId`). |
| Account root as principal | Allowed by the parameter's pattern. Then any identity in that account that may call `sts:AssumeRole` can try, still needing the ExternalId. A role ARN is tighter; the setup should say so. Accepted. |
| ExternalId | Not secret by AWS's own definition (it stops a confused deputy, it is not a password), and visible to anyone who can read the stack's parameters. It is long and random per connection. Accepted. |
| Session length | Hatch asks for 15 minutes; the role allows up to an hour. Fine. |

## Permissions, statement by statement

"Called by" says which code needs it: **today** is the existing ECS/ELB/ECR code
(the old hosted prototype's AWS path, reworked in Phase 3); **Phase 3** is named
in the roadmap.

| Statement | Actions | Scope | Condition | Called by | Verdict |
| --- | --- | --- | --- | --- | --- |
| ReadThisStack | `cloudformation:DescribeStacks` | this stack, by its own name | | `aws.Connector.Verify` | Scoped. Uses `${AWS::StackName}` so renaming the stack does not break it. |
| ReadServicesInTheHatchCluster | `ecs:DescribeServices` | services in cluster `hatch` | | today | Scoped. |
| ReadWhatIAMCannotScope | `ecs:ListTaskDefinitions`, `elasticloadbalancing:DescribeRules`, `…DescribeTargetGroups`, `…DescribeTargetHealth`, `cloudwatch:GetMetricData` | `*` | | today | The reference lists no resource for the first four, and only a `dataset` resource for `GetMetricData` that is not what a metric read names. Read-only; the exposure is that Hatch can see these in the whole account. Accepted. |
| ReadImagesInTheHatchRepository | `ecr:DescribeImages` | the repository | | Phase 3 (rollback checks an image is still kept) | Scoped. |
| ReadLogs | `logs:DescribeLogStreams`, `FilterLogEvents`, `GetLogEvents` | the two log groups | | Phase 3 (build and runtime logs) | Scoped, both ARN forms given (group and its streams). |
| BuildsInTheHatchProject | `codebuild:StartBuild`, `StopBuild`, `BatchGetBuilds` | project `hatch-build` | | Phase 3 | Scoped. |
| DeleteImagesInTheHatchRepository | `ecr:BatchDeleteImage` | the repository | | today | Scoped. The action carries no condition keys, so no tag check is possible. |
| CreateServices | `ecs:CreateService` | `service/hatch/hatch-*` | tag required | today | Scoped and tagged. |
| RegisterTaskDefinitions | `ecs:RegisterTaskDefinition` | `*` | tag required | today | The revision does not exist yet, so a name cannot be matched; the tag is what marks it as Hatch's. See the checks below. |
| TagWhatEcsCreates | `ecs:TagResource` | those services and `task-definition/hatch-*:*` | `CreateAction` is `CreateService` or `RegisterTaskDefinition` | needed by the two above | **Was missing** (finding 2). |
| CreateTargetGroups | `elasticloadbalancing:CreateTargetGroup` | `targetgroup/hatch-*/*` | tag required | today | Scoped and tagged. |
| CreateListenerRules | `elasticloadbalancing:CreateRule` | listeners of `hatch-alb` | tag required | today | Scoped and tagged. |
| TagWhatElbCreates | `elasticloadbalancing:AddTags` | those target groups and rules | `CreateAction` is `CreateTargetGroup` or `CreateRule` | needed by the two above | Scoped to creation. |
| CreateAppSecrets | `secretsmanager:CreateSecret` | `secret:hatch/*` | tag required | Phase 3 | Scoped and tagged. |
| TagWhatSecretsManagerCreates | `secretsmanager:TagResource` | `secret:hatch/*` | tag required in the request | needed by the one above | Scoped. |
| ChangeServicesHatchCreated | `ecs:UpdateService`, `DeleteService` | `service/hatch/hatch-*` | resource carries the tag | today | Scoped and tag-checked. |
| ChangeTargetGroupsHatchCreated | `…ModifyTargetGroup`, `DeleteTargetGroup` | `targetgroup/hatch-*/*` | resource carries the tag | today | Scoped and tag-checked. |
| ChangeListenerRulesHatchCreated | `…ModifyRule`, `DeleteRule` | rules of `hatch-alb` | resource carries the tag | today | Scoped and tag-checked; the default actions stay out of reach. |
| ChangeAppSecretsHatchCreated | `secretsmanager:DeleteSecret`, `DescribeSecret`, `PutSecretValue`, `UpdateSecret` | `secret:hatch/*` | resource carries the tag | Phase 3 | Scoped and tag-checked. **`GetSecretValue` is deliberately absent**: Hatch writes secrets and cannot read them back ([Q12](06-open-questions.md)); ECS does, through the task-execution role. |
| DeregisterTaskDefinitions | `ecs:DeregisterTaskDefinition` | `*` | none possible | today | **Was wrongly scoped** (finding 1). IAM gives this action no resource, so it can only be `*`. Hatch only deregisters `hatch-*` families it registered, but IAM cannot enforce that. Accepted, see below. |
| PassTheTaskExecutionRoleToEcs | `iam:PassRole` | the task-execution role | `PassedToService` is `ecs-tasks.amazonaws.com` | needed to register a task definition that names it | The only IAM action. CodeBuild's role is **not** passed any more (finding 4). |

## Findings, and what changed

1. **`DeregisterTaskDefinition` was scoped to an ARN it cannot match.** The
   reference lists no resource type for it, so IAM grants it only on `*`. As
   written it granted nothing and Phase 3 would have been refused. Now `*`, with
   the residual risk below.
2. **Registering a task definition could not have worked.** The policy required the
   tag on `RegisterTaskDefinition` but allowed `ecs:TagResource` only on services,
   and tagging on create is a separate permission on the thing being created. Added,
   limited to the two creates.
3. **The docs promised name *and* tag; the policy checked only the name.** A
   service, target group, rule or secret named `hatch-*` that Hatch did not create
   could have been changed. Creates now require the tag and changes require it on
   the resource.
4. **Grants nothing calls, or that were wider than needed, are removed:**
   `ecr:GetAuthorizationToken` (builds go through CodeBuild in Phase 3, not through
   Hatch pushing), `ecr:BatchGetImage` and `ecr:ListImages`,
   `tag:GetResources` (an account-wide index; add it back with the sweeper if it
   needs it), `cloudwatch:GetMetricStatistics` (Hatch uses `GetMetricData`),
   reads of clusters, tasks, listeners and load balancers that no code reads, and
   `iam:PassRole` for the CodeBuild role (the project, made by the stack, already
   has it, and Hatch never creates a project).
5. **Reads that can be scoped now are:** ECR to the repository, CloudFormation to
   this stack, ECS services to the `hatch` cluster.

The template version stays at 1: no stack has ever been made from it, so none needs
to pick this up. From the first published version, a change to this policy raises it.

## Accepted, on purpose

- **Unscoped reads** (listed above): Hatch can see task definitions, listener rules,
  target groups and metrics anywhere in the account. They change nothing.
- **`RegisterTaskDefinition` and `DeregisterTaskDefinition` on `*`:** Hatch could
  register an untagged-by-name task definition under any family, and deregister any
  revision in the account. Registering is limited by the tag requirement.
  Deregistering is not limited by IAM; its effect is that a revision can no longer
  start new tasks, running ones are unaffected. Hatch's code only touches `hatch-*`
  families, and that is the control.
- **The budget watches the whole account**, because a tag-filtered one shows nothing
  until the tag is activated for cost allocation.
- **The app security group accepts every port from the load balancer's group**,
  because an app's port is the user's to choose. Only the load balancer reaches it.

## What Phase 3 must do for this policy to work

- Pass `hatch:managed=true` in the tags of every `CreateService`,
  `RegisterTaskDefinition`, `CreateTargetGroup`, `CreateRule` and `CreateSecret`.
  The existing AWS runtime code does not tag anything, so under this policy it
  would be refused; reworking it is Phase 3's job anyway.
- Name services `hatch-*` in cluster `hatch`, target groups `hatch-*`, task-definition
  families `hatch-*`, and secrets under `hatch/`. Put rules on the `hatch-alb` listeners.
- Raise the template version and tell users to update the stack when a call it needs
  is not covered here (priority changes need `SetRulePriorities`, for instance). The
  update flow is not built.

## Check these yourself

The review leans on these facts from the AWS reference. They are cheap to confirm
against the [Service Authorization Reference](https://docs.aws.amazon.com/service-authorization/latest/reference/reference.html),
and worth confirming before Phase 6:

1. `ecs:DeregisterTaskDefinition` has **no** resource type (so `*` is required).
2. `ecs:RegisterTaskDefinition` carries `aws:RequestTag/${TagKey}`, and tagging on
   create needs `ecs:TagResource` with the `ecs:CreateAction` key.
3. `elasticloadbalancing:CreateRule` is authorised on the **listener**, and
   `AddTags` carries `elasticloadbalancing:CreateAction`.
4. `secretsmanager:CreateSecret` carries `aws:RequestTag/${TagKey}`.
5. `ecs:UpdateService` and `DeleteService` accept `aws:ResourceTag/${TagKey}`.

Phase 6 should also run the policy through IAM Access Analyzer's policy validation,
and deploy a sample app into a capped account and read CloudTrail for `AccessDenied`:
that finds anything a read of the documentation missed.

## Not covered here

The task-execution and CodeBuild service roles are small and scoped in the
template (read `hatch/*` secrets and pull images; push to one repository and write
its logs), but they were not reviewed with this care, and neither were the
networking resources.
