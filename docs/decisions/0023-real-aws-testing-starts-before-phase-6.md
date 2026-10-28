# 0023. Real AWS testing starts before Phase 6, in a capped account

- Status: Accepted
- Date: 2026-10-29

## Context

Until now no AWS account was available, so every rule assumed none would exist
until Phase 6: no command or test may create cloud resources, all AWS code sits
behind interfaces and is tested with fakes ([0004](0004-pluggable-providers-local-first.md)).

The maintainer now has an AWS account that works. Phase 2 is built but has never
touched AWS: the `hatch-connect` template has never been created, the STS and
CloudFormation calls have never run, and the `hatch-control` policy has been read
only by the coding assistant. Phase 3 would stack CodeBuild and ECS code on top
of that. Finding the mistakes in Phase 2 now is cheaper than finding them after
Phase 3.

## Decision

Real-AWS testing is allowed from now on, in the maintainer's account, under these
conditions:

- **Fakes stay.** Unit tests, CI and `make check` never use AWS. A test that
  needs a real account is opt-in (an environment variable, like
  `HATCH_TEST_DOCKER=1`), is not run in CI, and says what it creates.
- **A spending alert exists first.** The maintainer sets an AWS Budget with email
  alerts in the account before the first stack is created, separate from the
  budget in our own template, since that one is part of what is being tested.
- **Credentials stay out of the repository and the conversation.** Hatch's own
  credentials come from a named profile or `.env` (never committed, never pasted
  into a chat or logged). They belong to an IAM or Identity Center identity, not
  the root user.
- **The maintainer creates and deletes.** A coding agent does not create, modify
  or delete cloud resources on its own. The maintainer runs the console steps and
  the teardown, or approves each command by name. Anything that creates
  resources is written down first with what it costs per hour and how to remove
  it.
- **Every session ends with a teardown**, and a check that nothing tagged
  `hatch:managed=true` (or named `hatch-*`) is left, since the stack's ALB bills
  by the hour while idle.
- **What a real run found goes in the docs.** A claim the docs make about AWS
  stays marked as untried until a real run has shown it; after one, the docs say
  what was run and what happened.

Phase 6 keeps its other work (CI end-to-end suite, observability, security
review, control-plane hosting). Its "verify end to end on a real account" item
becomes the full-flow check at the end, not the first contact.

## Consequences

- `CLAUDE.md`, the roadmap and `docs/README.md` no longer say no AWS access
  exists. The rule that code is built behind interfaces and tested with fakes is
  unchanged.
- The single-account setup is a test of the connection logic, not of every
  trust case: the control plane and the "user's" account are the same account,
  so a trust problem between two accounts is not exercised. The role-assumption
  code is the same either way ([0020](0020-the-connection-role-trusts-a-configured-principal.md)).
- Publishing the template for the quick-create link
  ([0022](0022-the-connect-template-is-published-to-a-public-bucket.md)) is
  needed for a real test, so the first run may use a bucket the maintainer owns
  and `HATCH_CONNECT_TEMPLATE_URL`.
- The account's billing state is the maintainer's to confirm. Nothing in the
  repository can know it.
- [0004](0004-pluggable-providers-local-first.md) said real AWS behaviour is only
  verified in Phase 6; that part is superseded. Fakes still have to model the
  failure modes a real run showed.
