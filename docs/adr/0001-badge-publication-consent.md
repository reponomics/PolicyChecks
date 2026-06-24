# ADR 0001: Separate app installation from public badge publication

## Status

Proposed

## Date

2026-06-24

## Context

PolicyChecks is intended to be a badge service for maintainers who want to make selected repository administration policies visible. The service currently treats GitHub App installation as sufficient authorization to expose every supported badge endpoint for that installed repository.

That creates a consent mismatch:

- Installing the GitHub App grants PolicyChecks read access to selected repository administration settings.
- Public badge endpoints disclose the result of any supported setting check to anyone who knows or guesses the endpoint URL.
- The aggregate `info.json` endpoint exposes all supported check results together, which makes the service look more like a public audit surface than a maintainer-selected badge service.

This is especially sensitive because these settings are not all publicly available through the unauthenticated GitHub API. A maintainer may want to publish one badge, such as immutable releases, without also making every other supported repository setting easy to query.

Unlike broad repository assessment tools, PolicyChecks is not intended to publish a complete public profile of a repository's security posture. It exists to help maintainers selectively display the policy signals they choose to make public. PolicyChecks asks maintainers to grant privileged read access to repository administration data; in return, the service should keep public disclosure narrow, deliberate, and proportionate to the modest value of a badge.

The product goal remains:

- No repository configuration file.
- No source-code scanning.
- No customer account database if avoidable.
- Minimal setup after GitHub App installation.
- Public badges only for settings the maintainer deliberately chooses to display.
- No heavyweight service infrastructure unless the project demonstrates enough adoption to justify it.

PolicyChecks is not intended to become a private compliance dashboard. The core value is modest: it gives maintainers who have enabled inconvenient or security-conscious repository settings a convenient public signal that they can choose to display.

## Decision Drivers

- Maintainers should control which settings are publicly disclosed.
- Anonymous callers should not be able to enumerate unpublished settings by guessing endpoint names.
- Unpublished settings should not reveal whether the underlying setting is enabled or disabled.
- PolicyChecks should preserve a low-friction badge workflow.
- The privacy posture should distinguish "PolicyChecks can read this setting" from "the maintainer chose to publish this setting."
- The implementation should avoid broad new GitHub permissions unless there is a strong product reason.
- The design should remain proportionate to a small, public badge service rather than assuming product-market fit or enterprise dashboard requirements.

## Proposals Under Consideration

Two launchable proposals are currently under consideration:

1. Restrict PolicyChecks to public repositories and use README presence as publication authority.
2. Keep broader repository support and use tokenized public badge URLs.

Both proposals require removing or disabling the public aggregate `info.json` endpoint.

## Proposal 1: Public repositories with README presence

Restrict PolicyChecks to public repositories and serve a badge only when the canonical badge URL appears in an accepted README file on the repository's default branch.

Under this proposal, publication is controlled by the repository itself. A maintainer publishes a claim by committing the badge URL to the public repository README. If the badge URL is not present, PolicyChecks does not serve the badge or proof endpoint for that claim.

Example publication check:

```text
GET /github/{owner}/{repo}/{claim}.svg
```

PolicyChecks verifies:

1. The repository is public.
2. The GitHub App is installed on the repository.
3. An accepted README file on the default branch contains the canonical badge URL for that claim.
4. The requested claim can be evaluated from GitHub API data.

If any publication check fails, PolicyChecks returns a generic unavailable response, such as `404`. It should not return `disabled`, because `disabled` is the privileged information the publication check is meant to protect.

Accepted README files should be intentionally narrow in the initial version, for example:

```text
README
README.md
README.markdown
README.rst
README.txt
README.* localized variants at the repository root
```

The first version should check only root-level README files on the default branch. It should not search the full repository tree.

README publication checks can be cached aggressively, such as for 24 hours. This means PolicyChecks should stop presenting badges as real-time policy reports. A more accurate framing is that badges are cached public signals of selected repository settings, not real-time audits.

### Consequences

Positive:

- The repository README becomes the owner-controlled publication act.
- Badge URLs remain clean and predictable.
- No token management is required.
- No PolicyChecks customer database is required.
- No snippet-generation dashboard is required.
- Revocation is understandable: remove the badge from the README and wait for cache expiry.
- Restricting the service to public repositories matches the product purpose of showing public recognition for public repository policy choices.
- PolicyChecks can avoid private repository content access by not supporting private repository badges.

Negative:

- Private repositories are no longer supported.
- PolicyChecks must read public README content, even if it does not read source code.
- Badge availability depends on README parsing and GitHub content availability.
- Publication outside the repository README is not supported in the initial model.
- README publication checks introduce another cache layer and weaken strict "current status" messaging.
- Users who remove a badge from the README may still see it served until the publication cache expires.

This proposal is currently attractive because it keeps the project small and keeps the publication act inside the public repository where the badge is displayed.

## Proposal 2: Tokenized public badge URLs

Use tokenized public badge URLs and remove the public aggregate `info.json` endpoint.

Public badge and proof endpoints would require a per-repository, per-claim token. A token authorizes disclosure of exactly one claim for exactly one repository installation. PolicyChecks can derive these tokens deterministically from a private server-side signing secret rather than storing each token in a database.

Example endpoint shapes:

```text
GET /github/{owner}/{repo}/{claim}.svg?token={token}
GET /github/{owner}/{repo}/{claim}.json?token={token}
GET /github/{owner}/{repo}/{claim}/proof.json?token={token}
```

The token should be computed from stable GitHub identifiers and the claim identifier:

```text
token = HMAC(BADGE_TOKEN_SECRET, installation_id + repository_id + claim_id)
```

`BADGE_TOKEN_SECRET` is a private PolicyChecks runtime secret. It is never shown to installers. The public token derived from it is safe to place in README badge Markdown because it authorizes only a single public badge result.

Including `installation_id` means uninstalling and reinstalling the GitHub App revokes old badge URLs. That is probably the safer default, though it means maintainers must update badges after reinstalling the app.

## Publication Model

Under this model, "published" means that a maintainer has chosen to use the tokenized URL for a specific repository and claim. PolicyChecks does not need to detect where the URL is embedded.

Anyone can view a badge once they have the tokenized URL, but they cannot derive other badge URLs from it. For example, a token for `immutable-releases` on repository A cannot be used to query `sha-pinning-required` on repository A or `immutable-releases` on repository B.

Requests without a valid token should return a generic unavailable response, such as `404`, rather than `disabled` or `unknown`. The absence of publication should not disclose the underlying setting state.

## Setup Experience

PolicyChecks can keep setup small by using the GitHub App setup URL as a snippet generator rather than a full dashboard.

After installation, a maintainer lands on a page that lists the repositories available to the installation and shows copyable Markdown snippets for each supported badge. The maintainer chooses which snippets to paste into a README or other public documentation.

This preserves the practical workflow:

1. Install PolicyChecks.
2. Copy the badge snippets you want.
3. Paste them where you want the badges to appear.

No per-claim database state is required for the initial version.

### Consequences

Positive:

- Installation no longer implies public disclosure of every supported setting.
- Maintainers can publish one badge without publishing all supported checks.
- Unpublished settings are not enumerable through predictable URLs.
- The product remains close to "install and paste a badge."
- No repository contents permission is required.
- No committed configuration file is required.
- No durable per-claim publication database is required.
- Tokens can be regenerated for authorized maintainers because they are deterministic.

Negative:

- Badge URLs become longer and less aesthetically simple.
- A copied tokenized badge URL remains usable wherever it is shared.
- Revocation is coarse if no database is added. Revocation requires uninstall/reinstall, rotating `BADGE_TOKEN_SECRET`, or adding a stored revocation/salt model later.
- A snippet generator page is still a setup surface that must be built and maintained.
- If `installation_id` is part of the token input, reinstalling the app breaks existing badges.

## Options Considered

### Option A: Keep the current public endpoint model

Installation continues to expose every supported claim endpoint for an installed repository.

Benefits:

- No implementation work.
- Clean, predictable URLs.
- Simple documentation.

Costs:

- Maintainers cannot publish one badge without exposing all supported settings.
- Public endpoint enumeration is trivial.
- The service behaves more like a passive audit endpoint than a selective badge service.
- `info.json` makes the disclosure issue more obvious by aggregating all supported settings.

This option conflicts with the desired consent model.

### Option B: Remove `info.json` only

Delete or disable the aggregate endpoint, but leave individual claim endpoints public and guessable.

Benefits:

- Removes the most audit-like surface.
- Small implementation change.
- Keeps current badge URLs.

Costs:

- Anyone can still query every individual supported claim for an installed repository.
- Maintainers still cannot selectively publish one claim without exposing the rest.

This is a useful immediate mitigation, but it does not fully solve the disclosure model.

### Option C: Store a per-repository, per-claim publication allowlist

Add a small configuration store that records which claims are publicly enabled for each repository.

Example:

```text
repository_id
installation_id
owner
repo
published_claims
updated_by
updated_at
```

Benefits:

- Strongest publication model.
- Clean public badge URLs can remain possible.
- Supports explicit enable, disable, and revocation.
- Enables a future management UI.

Costs:

- Requires durable storage.
- Requires authenticated setup and authorization checks.
- Introduces customer/repository configuration data.
- Increases operational and privacy scope.
- Moves the product further away from "no setup."

This may be the best mature model, but it is heavier than necessary for launch.

### Option D: Use a repository configuration file

Require maintainers to commit a file such as:

```yaml
published:
  - immutable-releases
  - sha-pinning-required
```

Benefits:

- Publication intent is controlled through normal repository governance.
- Changes are auditable in Git history.
- No separate PolicyChecks configuration database is required.

Costs:

- Requires reading repository contents, which changes the permission story for private repositories.
- Adds setup work for maintainers.
- Exposes non-public configuration choices if the repository is public.
- Makes the app less like a simple badge service.

This option is not recommended unless PolicyChecks intentionally expands into repository-content access.

### Option E: Use tokenized per-badge URLs

Generate unguessable badge URLs for every repository and claim, and require the matching token on public badge and proof endpoints.

Benefits:

- Maintainers choose what to publish by choosing which badge URL to use.
- No durable publication database is required.
- No repository contents permission is required.
- Public callers cannot enumerate unpublished claims.
- Tokens can be regenerated for authorized maintainers.
- Keeps the product close to a no-configuration badge workflow.

Costs:

- Tokenized URLs are less clean.
- Revocation is limited without extra stored state.
- Requires a snippet generator or another way for maintainers to recover badge URLs.

This remains a strong option if PolicyChecks needs to support private repositories or publication locations other than the repository README.

## Endpoint Behavior

The public aggregate endpoint should be removed or disabled:

```text
GET /github/{owner}/{repo}/info.json
```

If an aggregate endpoint is later reintroduced, it should return only claims that the maintainer has explicitly published. It should not act as a public repository policy profile.

Badge, Shields JSON, and proof JSON endpoints should all use the same publication rule. Under the README-presence proposal, the proof endpoint is available only when the corresponding badge URL is present in an accepted README. Under the tokenized URL proposal, the proof endpoint requires the same per-repository, per-claim token as the badge. Proof JSON can disclose more context than a badge, so it should not remain available through an unauthenticated, guessable URL.

For failed publication checks, responses should avoid distinguishing:

- GitHub App not installed.
- Claim not published.
- Token invalid.
- Repository not found.
- Repository is private.
- Badge URL is absent from the accepted README files.

A generic `404` is preferable to a badge that says `disabled`, because `disabled` is the privileged information.

## Authorization for Snippet Generation

If PolicyChecks chooses tokenized URLs, the snippet generator should be available only to someone who can administer the target repository or installation.

Potential verification flow:

1. GitHub redirects the installer to the PolicyChecks setup URL.
2. PolicyChecks authenticates the GitHub user.
3. PolicyChecks verifies that the authenticated user has administrative authority for the repository or installation.
4. PolicyChecks shows tokenized badge snippets for repositories the user can administer.

The exact authorization checks need separate implementation design. The endpoint publication model should not depend on anonymous requests being trustworthy.

The README-presence proposal does not require a snippet generator for authorization. It may still benefit from a documentation page that shows canonical badge URL examples.

## Open Questions

- Should the token appear in the path or query string?
- Should tokens include `installation_id`, accepting badge breakage after reinstall, or omit it to make badges survive reinstall?
- Should PolicyChecks eventually support explicit revocation through stored per-repository salt values?
- Should old non-tokenized badge endpoints return `404`, `410`, or a badge explaining that tokenized URLs are required?
- Should PolicyChecks support private repository badges at all?
- Should README publication checks inspect only GitHub's primary README, or root-level `README*` files?
- What cache duration should README publication checks use?
- Should Marketplace launch wait for a selective-publication model, or should launch be deferred while the product scope is narrowed?
- How should this affect README examples, Marketplace copy, privacy policy language, and operations docs?

## Recommendation Summary

Before launch, remove the public `info.json` endpoint and adopt a selective-publication model for badge, Shields JSON, and proof JSON endpoints.

The current lean is toward the public-repository README-presence model because it keeps PolicyChecks closest to its core value: a small public badge service that gives maintainers recognition for selected public repository policy choices without adding a dashboard, database, token-management system, or private repository content access.

Tokenized badge URLs remain the leading alternative if private repository support or non-README publication becomes important enough to justify the extra setup and authorization surface.

If schedule pressure requires a smaller immediate change, remove `info.json` first. The current all-claims-public posture should not be treated as the intended long-term model.
