# Operations

This document is for PolicyChecks service maintainers and production operators. It is not setup guidance for badge users, and it does not describe credentials that users installing the GitHub App should ever receive.

PolicyChecks is a current-state badge and proof service. Operational safety depends on keeping GitHub API use narrow, cached, observable, and easy to shut down before GitHub imposes primary or secondary rate limits.

## Cache Policy

The internal claim-result cache defaults to `CACHE_TTL_SECONDS=3600`. This is intentionally conservative because the checked settings are low-volatility repository administration/security settings, not fast-changing CI state.

Public badge, Shields JSON, proof JSON, and `info.json` responses use `Cache-Control: public, max-age=300, stale-while-revalidate=300`. This keeps externally visible badge staleness modest while allowing the Worker to serve repeated requests from its longer internal cache when the same isolate remains warm.

Tune cache settings with this policy:

- Increase `CACHE_TTL_SECONDS` before launch traffic grows or before embedding badges in high-traffic READMEs.
- Keep `CACHE_TTL_SECONDS` at least as large as the public `max-age` value, otherwise external clients can revalidate faster than the Worker cache can absorb.
- Use `3600` seconds as the default.
- Consider `21600` seconds for high-traffic public badges if rate-limit logs show repeated cache misses for the same repositories.
- Do not lower below `300` seconds unless actively debugging a claim mapping.

Current limitation: the cache is in-memory per Worker isolate. It is a quota reducer, not durable storage. Cold starts and separate isolates may still call GitHub for the same repository.

## GitHub API Safety Invariants

Webhook handling must not call GitHub. This is covered by tests in `test/webhook-routes.test.ts`.

Production GitHub REST usage is restricted by `test/github/api-usage-policy.test.ts`. The allowed request surface is intentionally small and does not include repository enumeration, search, GraphQL, pagination helpers, or mutating repository routes.

Expected cold-cache request cost for one repository is bounded: installation lookup, installation-token creation, immutable releases, and Actions permissions. Warm-cache badge/proof requests should make zero GitHub API calls.

## Rate-Limit Logs

The rate limiter emits structured JSON logs through `console.log` for GitHub API activity:

| Event | Meaning | Action |
| --- | --- | --- |
| `github_api_response` | A GitHub API response was observed, including available rate-limit headers. | Normal telemetry. Watch `rate_limit.remaining`, `rate_limit.used`, `route`, and `bucket`. |
| `github_api_throttled` | PolicyChecks delayed a request because minimum spacing or low remaining quota required slowing down. | Warning if sustained. Consider raising `CACHE_TTL_SECONDS`. |
| `github_api_error` | A GitHub API request failed. | Investigate if status is `403`, `429`, or repeated `5xx`. |
| `github_api_circuit_opened` | PolicyChecks stopped making calls for a bucket because rate-limit or secondary-limit signals were observed. | Critical. Stop load tests, raise cache TTL, and inspect recent routes. |

Log fields deliberately avoid tokens and repository coordinates where possible. Route templates such as `GET /repos/{owner}/{repo}/actions/permissions` are safe to log.

## Manual Monitoring

During installation testing or operational debugging, run:

```bash
npx wrangler tail -c wrangler.policychecks.jsonc --format pretty
```

For structured filtering, use JSON output if available in the local Wrangler version and filter for `github_api_` events. Example intent:

```bash
npx wrangler tail -c wrangler.policychecks.jsonc --format json | jq 'select(.logs[]?.message[]? | tostring | contains("github_api_"))'
```

Alert manually on these conditions:

| Severity | Condition | Response |
| --- | --- | --- |
| Critical | Any `github_api_circuit_opened` with reason `secondary_rate_limit`, `retry_after`, `rate_limited`, or `primary_exhausted`. | Stop tests/traffic, wait for reset, inspect routes and request source. |
| High | Any `github_api_response.rate_limit.remaining < 500`. | Raise `CACHE_TTL_SECONDS`, avoid smoke loops, and check for repeated `info.json` requests. |
| Medium | Sustained `github_api_throttled` events. | Raise cache TTL or reduce caller frequency. |
| Medium | Repeated `github_api_error` with status `403` or `429`. | Treat as rate-limit pressure even before a circuit opens. |

For unattended monitoring, configure a durable alert path from Cloudflare logs or a log drain for `github_api_circuit_opened`. Until that exists, monitoring is manual.

## Webhook Monitoring

Successful webhook deliveries are visible in Cloudflare request logs and GitHub's webhook delivery UI. Webhooks are installation/cache invalidation hints only; they do not provide continuity guarantees.

If webhook observability becomes operationally important, add a structured summary log containing only event name, action, delivery id, updated/removed repository counts, invalidated claim count, and ignored flag. Do not log payloads, signatures, tokens, installation IDs, or repository names.

## Credential Storage

Production credentials are Cloudflare Worker secrets, backed by the operator's credentials manager and the GitHub App settings UI. Do not put GitHub App credentials or webhook secrets in `.env.example`, committed Markdown files, GitHub Actions variables, or repository files.

Badge users and GitHub App installers do not need access to these credentials. The private key and webhook secret belong to the hosted PolicyChecks GitHub App and are only for the maintainers operating the service.

Required deployed secrets:

```text
GITHUB_APP_ID
GITHUB_PRIVATE_KEY_BASE64
GITHUB_WEBHOOK_SECRET
```

`.env.example` contains non-secret local defaults only. It documents runtime configuration shape; it is not a secret template and should not be filled with production values.

`GITHUB_PRIVATE_KEY` is supported for local development, but `GITHUB_PRIVATE_KEY_BASE64` is preferred for Cloudflare because it avoids newline transport issues. Local `.env` files are ignored and optional. They should only be populated from the operator's credentials manager when a maintainer intentionally needs to exercise authenticated GitHub paths locally. Ordinary tests and contributor setup do not require GitHub credentials.
