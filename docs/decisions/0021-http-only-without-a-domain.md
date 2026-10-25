# 0021. Apps are reachable over HTTP without a domain

- Status: Accepted
- Date: 2026-10-25

## Context

An ACM certificate needs a domain the user controls (open question Q14). A user
who has just connected an AWS account for the first time often has none, and
requiring one would put a domain purchase before their first deploy.

## Decision

The certificate and domain are **optional at connect time**. Without them the
ALB serves HTTP on its own hostname, and Hatch says so plainly where the address
is shown: this is for trying Hatch and for apps that carry nothing private. A
user who brings a wildcard domain gets an HTTPS listener and the HTTP-to-HTTPS
redirect. Hatch does not require a domain, and does not run DNS for users.

## Consequences

- The `hatch-connect` template takes an optional certificate ARN; the HTTPS
  listener and the redirect exist only when one is given.
- The connection records whether it serves HTTP or HTTPS, and the console shows
  an HTTP-only warning wherever it shows an app's address.
- A Hatch-managed subdomain is not built; it would need Hatch to own a domain
  and delegate DNS, and can be added later without changing this.
- Q14 moves from open to decided. Custom domains with certificates stay in
  Phase 5 (Q4).
