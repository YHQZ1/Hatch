# 0018. A built-in reverse proxy for the local target; Caddy later

- Status: Accepted
- Date: 2026-10-22

## Context

[0004](0004-pluggable-providers-local-first.md) gives the local target a
reverse proxy that routes `<app>.localhost` to the app's container, and the
architecture doc named Caddy, managed through its admin API. That means
installing Caddy, running a second process next to Hatch, and keeping its routes
in step with the containers.

The local target exists so the whole flow can be developed and shown on a
laptop with nothing to install beyond Docker. Browsers resolve `*.localhost` to
127.0.0.1, so no DNS or TLS is needed for it.

## Decision

- The local target serves apps with a small reverse proxy inside `hatch serve`
  (`internal/proxy`), on its own listener (`LOCAL_PROXY_ADDR`, default
  `127.0.0.1:8081`), so an app is at `http://<subdomain>.localhost:8081`. It
  is a separate listener from the API so that an app's pages are never served
  from the API's origin, and so that long-lived responses are not cut by the
  API's write timeout.
- The proxy keeps no route table. It asks the local `Runtime` where an app
  is (Docker is the source of truth), and caches the answer for a few seconds.
  This keeps routes right across Hatch restarts and across Docker restarting a
  container on a new port.
- Containers publish their port on 127.0.0.1 with a Docker-chosen host port,
  because on macOS the host cannot reach container addresses on a Docker
  network.
- **Caddy is deferred, not rejected.** Use it when a real need appears: HTTPS
  with automatic certificates for the local target on a shared server, custom
  domains, or the control plane's own edge. The `proxy.Resolver` interface is
  the seam: Caddy would be driven from the same lookup instead of replacing it.

## Consequences

- Nothing to install or run beyond Docker; one program serves the console, the
  API and the apps.
- The proxy is plain HTTP, bound to loopback. The local target is single-user by
  design ([0004](0004-pluggable-providers-local-first.md)); exposing it to a
  network needs the Caddy step first.
- A lookup runs `docker` a couple of times per cache miss. That is fine for a
  laptop and is the reason for the short cache; it would not be for heavy
  traffic.
- This changes where the architecture doc's "Local proxy" row points; that row
  is updated with this record.

## Traffic counts (added 2026-10-22)

Because every request to an app passes through the proxy, the proxy counts them:
per app, per minute, for the last hour (requests, 5xx responses, time to first
byte), in memory, in `proxy.Stats`. `GET /api/traffic` serves them to the
console's Overview, limited to the signed-in user's apps. The counts start from
zero when Hatch starts and are not shared between processes, so the API and the
proxy must run in one process (`hatch serve`); on the AWS target nothing counts
and the endpoint says it is unavailable. The time of an app's last request is
kept beyond the hour, as the basis for idle detection in the cost guardrails
(Phase 4).
