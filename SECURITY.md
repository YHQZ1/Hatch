# Security Policy

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you've found a security vulnerability in Hatch, please disclose it responsibly by emailing:

**uttkarsh@hatch.dev**

Include as much detail as you can:

- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof of concept
- Which component is affected (api, builder, deployer, infra, etc.)
- Any suggested mitigations if you have them

You'll receive an acknowledgment within **48 hours** and a more detailed response within **7 days** outlining next steps. We'll keep you updated as the issue is investigated and fixed.

We won't take legal action against researchers who follow this policy and act in good faith.

---

## Scope

The following are in scope:

- Authentication and session handling (`apps/api/internal/auth/`)
- GitHub OAuth token storage and usage
- AWS credential handling in the builder and deployer services
- Webhook signature verification (`apps/api/internal/handlers/webhook.go`)
- Secrets/environment variable storage and injection
- Privilege escalation within the Hatch dashboard
- The Terraform infrastructure definitions (`infra/`)

The following are **out of scope**:

- Vulnerabilities in your own AWS account or self-hosted infrastructure
- Denial of service attacks
- Issues in third-party dependencies (report those upstream)
- Findings from automated scanners without a working proof of concept

---

## Supported Versions

Hatch is currently pre-1.0. Security fixes are applied to the latest `main` branch only.

| Version         | Supported |
| --------------- | --------- |
| `main` (latest) | ✅        |
| Older commits   | ❌        |

---

## Security Considerations for Self-Hosters

Hatch provisions real AWS infrastructure and handles sensitive credentials. If you're running Hatch yourself:

- **Never expose the API, builder, or deployer ports publicly** without authentication in front of them.
- **Rotate your AWS credentials regularly** and use IAM roles with least-privilege policies wherever possible. The Terraform modules in `infra/` follow this principle — don't loosen them.
- **Use strong `JWT_SECRET` and `SESSION_SECRET` values** in your `.env` files. Generate them with `openssl rand -hex 32`.
- **Keep RabbitMQ and Redis off public networks.** They should only be reachable within your internal network or VPC.
- **Review webhook secrets.** The GitHub webhook endpoint verifies signatures — make sure `GITHUB_WEBHOOK_SECRET` is set and rotated if ever exposed.
