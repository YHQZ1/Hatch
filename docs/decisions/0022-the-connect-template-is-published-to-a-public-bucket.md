# 0022. The hatch-connect template is published to a public bucket

- Status: Accepted
- Date: 2026-10-25

## Context

CloudFormation's quick-create link fetches the template itself, and only from an
S3 address, so Hatch cannot serve `hatch-connect.yaml` from its own URL
(open question Q20). Some bucket has to hold each version, readable by anyone,
because the fetch comes from the user's own AWS session.

## Decision

The maintainers publish each version of the template to a public S3 bucket at
release time, with the template version in the object's path, so a stack's
`HatchTemplateVersion` output names exactly the object it was made from. One
address serves every install, hosted or self-hosted.

The address Hatch builds links from is a setting, not a constant, so an operator
can publish the template to a bucket of their own and point Hatch at it.
`QuickCreateURL` already takes it as an input.

## Consequences

- A release has a step that uploads the template, and that step belongs in the
  release process before Phase 6. Nothing publishes it yet.
- The bucket must allow public reads and nothing else; the template contains no
  secrets (the ExternalId and the principal are parameters the link fills in).
- A template version that has been published is never replaced: a change means a
  new version and a new path, so an existing stack can always be traced to its
  source, and Hatch's "stack is out of date" check stays meaningful.
- The setting itself arrives with the connection API. It must be an S3 address
  over https (a bucket in the host or in the path): the CloudFormation console
  answers "TemplateURL must be a supported URL" to anything else, as seen when a
  placeholder address elsewhere was tried, so Hatch refuses one when it starts.
- Q20 moves from open to decided.
