# ADR 0002: HTTP method allowlist and HEAD handling

## Status

Accepted

## Date

2026-08-29

## Context

The Cloudflare worker front door default-denies HTTP methods: GET for the read endpoints (badges, `info.json`, `/healthz`) and POST for the GitHub webhook only. Historically this allowlist had a hand-written HEAD carve-out for `/healthz` alone, so HEAD requests to badge endpoints returned 404 while GET on the same URL returned 200.

That divergence violates RFC 9110, which requires HEAD support wherever GET is supported, and it confuses HEAD-probing consumers such as link checkers, badge caches, and uptime monitors.

Blocking HEAD also provides no information protection. The badge endpoints are public and return full results to any GET request, so a prober gains nothing from HEAD being closed. The service's actual anti-enumeration mechanism is collapsing ambiguous, unauthorized, and failed evaluations into the single `unknown` result.

## Decision

- The worker keeps a strict default-deny method allowlist: GET and HEAD for read endpoints, POST for the webhook route only. All other methods receive 404.
- HEAD mirrors GET everywhere: identical status and headers, no body. This is implemented once in the worker front door (HEAD requests are evaluated as GET and the response body is stripped). The Express app inherits HEAD-for-GET behavior from Express itself.

## Consequences

- Method behavior conforms to RFC 9110; HEAD probes agree with GET.
- The allowlist's rationale is recorded: it is a fail-safe default, not an information-hiding mechanism. Disclosure control is unaffected by HTTP method handling.
- A HEAD request costs the same as a GET internally (the evaluation runs and is cached); only the response body transfer is saved.
