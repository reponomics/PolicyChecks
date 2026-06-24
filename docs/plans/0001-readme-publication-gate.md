# Implementation Plan: README-Based Badge Publication Gate

## Status

Planned

## Context

ADR 0001 accepts a narrower product model for PolicyChecks: public badges for public repositories, authorized by the maintainer's decision to place the badge URL in a public README. This keeps PolicyChecks aligned with its intended role as a small badge service rather than a private dashboard, public audit product, or customer-account system.

GitHub documents three repository README locations that it recognizes and surfaces to repository visitors: `.github`, the repository root, and `docs`. If multiple README files exist, GitHub chooses the displayed README in that order. The REST API also exposes `GET /repos/{owner}/{repo}/readme`, which returns the repository's preferred README and defaults to the repository's default branch. PolicyChecks should use that endpoint as the publication source instead of reimplementing README precedence.

## Goals

- Remove or disable the public aggregate `info.json` endpoint.
- Serve a per-claim badge only when the repository is public and its preferred README contains the canonical badge URL for that claim.
- Apply the same publication rule to SVG badge, Shields JSON, and proof JSON endpoints.
- Couple live badge service responses to maintainer-controlled placement in the target repository's preferred README, reducing casual badge misrepresentation without claiming cryptographic anti-forgery.
- Avoid durable customer configuration, setup dashboards, tokenized badge URLs, and private repository content access.
- Keep caching conservative enough for a quiet side project, while leaving clear escalation points if traffic grows.

## Non-Goals

- Do not support private repository badges in the initial model.
- Do not read repository source code outside the preferred README.
- Do not manually search arbitrary documentation folders or nested README files.
- Do not add a publication database or per-repository allowlist.
- Do not add tokenized badge URLs unless the README model proves insufficient.
- Do not keep `info.json` as a public all-claims endpoint.

## Publication Rule

A claim is published for a repository if all of the following are true:

1. The requested claim is supported.
2. The GitHub App is installed on the repository.
3. The repository is public.
4. The repository's preferred README on the default branch contains a canonical public PolicyChecks URL for that repository and claim.

PolicyChecks should resolve the preferred README by calling:

```text
GET /repos/{owner}/{repo}/readme
```

Do not pass a `ref` parameter in the publication check unless a future use case requires branch-specific behavior. The default branch is the intended publication authority.

## Canonical URL Matching

PolicyChecks should derive canonical URLs from the configured public service origin, repository owner/name, and claim id.

For claim publication, a README match should be accepted if it contains either of these canonical URLs for the same claim:

```text
https://policychecks.reponomics.org/github/{owner}/{repo}/{claim}.svg
https://policychecks.reponomics.org/github/{owner}/{repo}/{claim}.json
```

The proof endpoint should not have its own independent publication rule. It should be available only when the corresponding badge or Shields JSON URL is present in the preferred README.

Matching should operate on raw README text, not rendered HTML. This keeps the implementation simple and avoids depending on GitHub's Markdown rendering details. The initial implementation should use exact canonical URL containment after normalizing the repository owner/name casing from GitHub's repository response. If case-insensitive owner/repo matching becomes necessary, add it deliberately with tests.

## Endpoint Behavior

`info.json` should be removed or disabled:

```text
GET /github/{owner}/{repo}/info.json
```

Per-claim endpoints remain:

```text
GET /github/{owner}/{repo}/{claim}.svg
GET /github/{owner}/{repo}/{claim}.json
GET /github/{owner}/{repo}/{claim}/proof.json
```

For any failed publication check, return a generic `404`. Do not distinguish:

- Repository not found.
- GitHub App not installed.
- Repository is private.
- README not found.
- Badge URL not present.
- Claim not published.

Do not return an `unknown` or `disabled` badge for unpublished claims. Those values disclose information the publication gate is meant to protect.

## GitHub API Approach

The implementation should first use the existing repository lookup to resolve:

- repository id
- canonical owner/name
- default branch
- whether the repository is private

For README lookup, prefer a small publication client that fetches only the preferred README. The implementation should avoid requesting repository `Contents: Read` permission unless a spike proves it is unavoidable.

Candidate implementation sequence:

1. Call `GET /repos/{owner}/{repo}/readme` without a `ref` parameter.
2. Request raw README content where possible, using the raw media type.
3. If the endpoint returns metadata instead of raw content, decode the returned Base64 `content` field or fetch the returned `download_url`.
4. Check the preferred README text for the canonical URL for the requested claim.

GitHub documents that repository contents endpoints can be used without authentication for public resources, even though authenticated GitHub App access to the same endpoint requires `Contents: Read`. The first implementation should include a short spike or test fixture to confirm the preferred README request path. If unauthenticated public README lookup is insufficient, pause and reassess before expanding permissions.

## Cache Strategy

Use a separate publication cache from the existing claim-result cache. Publication and claim results answer different questions:

- Publication cache: "Has the maintainer publicly embedded this badge URL?"
- Claim cache: "What did the GitHub API report for this repository setting?"

### Cache Keys

Publication cache keys should include:

```text
repository_id
default_branch
claim_id
service_origin
```

Including `default_branch` avoids reusing publication checks after a default branch change. Including `service_origin` avoids stale authorization if production and preview origins differ.

### Initial TTLs

Use conservative, environment-configurable defaults:

```text
PUBLICATION_CACHE_TTL_SECONDS=21600
PUBLICATION_NEGATIVE_CACHE_TTL_SECONDS=900
PUBLICATION_ERROR_CACHE_TTL_SECONDS=300
```

Rationale:

- Positive publication checks can tolerate a default of 6 hours because README badge publication is low-volatility.
- Negative publication checks should be shorter, initially 15 minutes, so a maintainer who adds a badge does not wait all day for it to appear.
- Transient GitHub/API errors should be cached briefly, initially 5 minutes, to avoid repeated failing calls without making recovery feel broken.

Do not start with a 24-hour default. Keep 24 hours as an operational ceiling for known hot badges if usage grows.

### Demand Scaling

Do not add durable caching or adaptive TTLs in the initial implementation. Start with in-memory caching because current expected traffic is low and the project should avoid unnecessary infrastructure.

If traffic creates GitHub API pressure, escalate in this order:

1. Increase positive publication TTL toward 24 hours through configuration.
2. Increase claim-result TTL for low-volatility settings.
3. Add Cloudflare Cache API caching for public README publication decisions.
4. Add durable shared cache storage, such as KV, only if the Cache API is insufficient.

This keeps the quiet-path implementation small while preserving a clear path for higher-demand operation.

## Implementation Steps

1. Update ADR 0001 to mark the README-presence proposal accepted.
2. Add a publication gate abstraction, for example `PublicationGate`, with a method like:

   ```ts
   isPublished(owner: string, repo: string, claim: string): Promise<PublicationDecision>
   ```

3. Add an in-memory publication cache with separate positive, negative, and error TTL handling.
4. Extend the GitHub repository model to include `private`, repository id, canonical owner/name, and default branch if any of those are missing.
5. Add preferred README raw-content fetching for the default branch.
6. Gate `.svg`, `.json`, and `/proof.json` routes before evaluating claims.
7. Remove or disable `/github/{owner}/{repo}/info.json`.
8. Update README examples and endpoint documentation.
9. Update privacy and operations documentation to describe public README checks and revised caching.
10. Revisit Marketplace copy only after the technical and product scope are stable.

## Test Plan

Add focused tests for:

- `info.json` returns `404` or is otherwise unavailable.
- Unsupported claim routes still return `404`.
- Private repositories do not serve badges.
- Public repositories without a matching README URL do not serve badges.
- A matching SVG URL in the preferred README authorizes the claim.
- A matching Shields JSON URL authorizes the claim.
- A proof JSON request is authorized only when the corresponding badge or Shields JSON URL is present.
- Non-preferred README files do not authorize badges.
- Negative publication decisions use the shorter negative TTL.
- Positive publication decisions use the longer positive TTL and avoid repeated README fetches.
- Transient README lookup failures use the error TTL.

## Documentation Updates

The README should stop presenting PolicyChecks as a current-state endpoint for any installed repository. It should instead describe it as a cached badge service for public repositories where maintainers publish selected badges by placing the badge URL in the repository's preferred README.

The operations guide should document:

- Publication cache TTLs.
- The removal of public `info.json`.
- The fact that README publication checks are intentionally cached.
- The escalation path for higher traffic.

The privacy policy should document:

- PolicyChecks reads the repository's public preferred README to determine whether a badge has been published.
- PolicyChecks does not support private repository badges in the initial model.
- PolicyChecks still does not read repository source code generally.

## Open Questions for Implementation

- Should the initial route return a JSON `404` for all unpublished outputs, or should SVG requests return an empty 404 body?
- Should publication matching accept both `https://policychecks.reponomics.org` and any configured custom service origin?
- Should preview deployments disable publication checks against production URLs, or allow a configured origin override for testing?
- Should README lookup use the raw media type response, decoded `content`, or the returned `download_url`?
- Should operations expose a diagnostic endpoint for maintainers, or would that recreate the unwanted audit surface?
