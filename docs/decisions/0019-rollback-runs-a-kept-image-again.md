# 0019. Rollback runs a kept image again

- Status: Accepted
- Date: 2026-10-22

## Context

Phase 1 ends with "redeploy, pause, resume, and delete", and the roadmap lists
rollback on the local target. Until now an image was only deleted when its
project was, so every release's image piled up on the host, and a failed deploy
left the image it had just built behind.

## Decision

- **A rollback is a new deployment** (`POST /api/deployments/{id}/rollback`)
  that runs an earlier release again: the image, port, health check and commit
  of that release, and the environment it ran with, copied as stored. No build
  runs; only a deploy job is queued, in the same transaction. The history shows
  the rollback as its own deployment, so what ran, and when, stays honest.
- **Only a release that went live and still has its image can be rolled back
  to.** `deployments.image_uri` is the record: it is set when a deployment goes
  live and cleared when the image is removed. The release that is running now,
  a failed or cancelled deployment, and any deployment while another is in
  progress are refused.
- **Images are kept for the newest five distinct releases of a project**
  (`jobs.KeptReleases`), counted by when each image last went live. When a
  deployment goes live, older images are removed and forgotten. Running an old
  image again makes it recent, so an image in use is never among the old ones.
- **A rollback does not own its image.** It shares it with the release it
  copies, so cancelling or failing a rollback never deletes it
  (`DeployArgs.OwnsImage`).
- **A deployment that fails for good deletes the image it built**, which was
  being left behind.

## Consequences

- Disk use on the local target is bounded by about five images per project.
- Rolling back further than five releases needs a new deploy of that commit.
- The same job and interfaces serve AWS: Phase 3 maps "image removed" onto ECR
  and adds a lifecycle policy, but the rollback itself needs no new code path.
- The environment is restored as it was, not as it is now. To keep today's
  variables, deploy again instead.
