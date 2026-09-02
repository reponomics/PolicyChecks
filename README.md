<picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/banner-dark-1.png">
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/banner-light-1.png">
    <img alt="PolicyChecks Banner" src="docs/assets/banner-light-1.png" width="100%">
</picture>

<!-- prettier-ignore-start -->
[![CI](https://github.com/reponomics/PolicyChecks/actions/workflows/ci.yml/badge.svg)](https://github.com/reponomics/PolicyChecks/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/reponomics/PolicyChecks/badge)](https://scorecard.dev/viewer/?uri=github.com/reponomics/PolicyChecks)
[![Install the GitHub App](https://img.shields.io/badge/GitHub%20App-install-blue?logo=github)](https://github.com/apps/policychecks)
<!-- prettier-ignore-end -->

**Badges for GitHub repository settings that other badge services can't see.**

## What is PolicyChecks?

Public badge services are great - but they can only see what public APIs report. A repo's git history shows whether a project uses signed commits - but there's no public API to check whether signed commits are required by a project's settings. That's why we created PolicyChecks: a badge service backed by a GitHub app that requests permission to read administrative settings; by installing the PolicyChecks app, maintainers can show that their project follows best practices, not only as a matter of habit, but as a matter of policy.

## Quickstart

**1. Install the GitHub App**

Install [PolicyChecks](https://github.com/apps/policychecks) on your account, and grant it access to the repositories where you wish to display a badge. The App asks for one elevated permission: repository `Administration: Read`. This is the minimum access necessary to serve the badges. We recommend you grant it access only to those repos where you wish to show a badge.

**2. Add a badge to your README**

Once you've installed the app, the badge service will be able to query the GitHub API for the data necessary to display a PolicyChecks badge.

Simply select from the list of [Supported checks](#supported-checks) and substitute your own `OWNER` and `REPO`:

```markdown
[![SHA pinning](https://policychecks.reponomics.org/github/OWNER/REPO/sha-pinning-required.svg)](https://policychecks.reponomics.org/github/OWNER/REPO/sha-pinning-required/details.json)
```

The service supports both personal accounts and organizations; as long as the app is installed on the relevant repository, it can report on its policies, whether those are configured at the repo level or the org level.

The URL pattern is the same for every badge:

```text
https://policychecks.reponomics.org/github/OWNER/REPO/BADGE_ID.svg
```

Besides the SVG, the service also exposes an endpoint for each badge that returns a JSON object containing metadata about what GitHub API endpoint was used to derive the status displayed on the badge:

```text
https://policychecks.reponomics.org/github/OWNER/REPO/BADGE_ID/details.json
```

> [!TIP] \
> Viewing the `details.json` endpoint can be useful when trying to understand why a particular badge is displaying a specific status.

The badge service reports that a setting is `enabled` when the GitHub API responds with data that clearly shows the setting is enabled, and displays `disabled` only if the API clearly reports a setting is not enabled - if the API's response is inconclusive, or the API is unreachable, the badge simply reports `unknown`.

## Supported checks

| Check | What it reports | Badge ID | GitHub REST source |
| --- | --- | --- | --- |
| SHA pinning | Actions must be pinned to a full-length commit SHA | `sha-pinning-required` | `/repos/{owner}/{repo}/actions/permissions` |
| Immutable releases | Assets and tags cannot be modified once a release is published | `immutable-releases` | `/repos/{owner}/{repo}/immutable-releases` |
| Secret scanning | Secret scanning is enabled | `secret-scanning-enabled` | `/repos/{owner}/{repo}` |
| Secret push protection | Pushes containing supported secrets are blocked | `secret-push-protection-enabled` | `/repos/{owner}/{repo}` |
| Web signoff | Web-based commits require a sign-off | `web-commit-signoff-required` | `/repos/{owner}/{repo}` |
| Force pushes blocked | Force pushes to the default branch are blocked | `default-branch-force-pushes-blocked` | `/repos/{owner}/{repo}/rules/branches/{branch}` |
| Signed commits | Commits to the default branch need verified signatures | `default-branch-signed-commits-required` | `/repos/{owner}/{repo}/rules/branches/{branch}` |
| Linear history | Merge commits are blocked on the default branch | `default-branch-linear-history-required` | `/repos/{owner}/{repo}/rules/branches/{branch}` |
| Deletion blocked | Only bypass actors may delete the default branch | `default-branch-deletion-blocked` | `/repos/{owner}/{repo}/rules/branches/{branch}` |
| Pull request required | Changes must reach the default branch through a pull request | `default-branch-pull-request-required` | `/repos/{owner}/{repo}/rules/branches/{branch}` |
| Status checks | Status checks must pass before the default branch updates | `default-branch-status-checks-required` | `/repos/{owner}/{repo}/rules/branches/{branch}` |
| Community health | GitHub's community profile score, rendered as `NN/100` | `community-health` | `/repos/{owner}/{repo}/community/profile` |

Rule-based checks are evaluated against the repository's default branch.

## How it works

```mermaid
flowchart LR
    A[README badge request] --> B[PolicyChecks server]
    B -->|cached result| F[SVG or JSON response]
    B --> C[GitHub App installation token]
    C --> D[GitHub repository REST API]
    D --> E["enabled / disabled / unknown"]
    E --> F
```

Each badge maps one GitHub API field to one recognizable repository setting. We don't try to make sophisticated inferences, and we don't audit whether that setting has ever changed. The badge shows the status of a particular setting, as reported by GitHub at the time of evaluation. For example, there is a setting that allows maintainers to enforce that all repo workflows use full-length SHA-pinned actions. In the Settings UI, it looks like this:

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/full-sha-pinned-setting-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/full-sha-pinned-setting-light.png">
    <img alt="The GitHub repository setting that requires Actions to be pinned to a full-length commit SHA" src="docs/assets/full-sha-pinned-setting-light.png" width="100%">
</picture>

Github's `/repo/actions/permissions` endpoint reports whether that checkbox is checked or not. PolicyChecks queries that endpoint (which requires repository `Administration: Read` permissions), and renders a badge based the response.

### Status semantics

| Status     | Meaning                                      |
| ---------- | -------------------------------------------- |
| `enabled`  | The API clearly reported the setting as on.  |
| `disabled` | The API clearly reported the setting as off. |
| `unknown`  | Everything else.                             |

`unknown` covers the App not being installed on the repository, authorization failures, rate limiting, failed requests, and any response that doesn't clearly answer the question. If the answer is ambiguous, the badge says so rather than guessing. Community health works the same way, except that the response is a percentage, instead of `enabled`/`disabled`.

### Caching

Results are cached in memory for up to about an hour, and responses go out with `Cache-Control: public, max-age=300, stale-while-revalidate=300`. It can take a little bit of time for a settings change to be picked up by the GitHub API, so treat badges as cached signals rather than real-time data.

## API

Every badge ID supports the same response shapes:

```text
GET /github/{owner}/{repo}/{badge-id}.svg            # SVG badge
GET /github/{owner}/{repo}/{badge-id}.json           # Shields-compatible JSON, for custom badge tooling
GET /github/{owner}/{repo}/{badge-id}/details.json   # The evaluation record behind the badge
GET /github/{owner}/{repo}/info.json                 # All supported checks for one repository
```

A request for an unrecognized badge ID returns `404` with `{"error": "unsupported_badge"}`.

`details.json` names the endpoint and fields behind the result, so anyone can check a badge against its source:

```console
$ curl https://policychecks.reponomics.org/github/reponomics/PolicyChecks/sha-pinning-required/details.json
{
  "badgeId": "sha-pinning-required",
  "owner": "reponomics",
  "repo": "PolicyChecks",
  "repository": {
    "owner": "reponomics",
    "repo": "PolicyChecks",
    "full_name": "reponomics/PolicyChecks"
  },
  "result": "enabled",
  "source": {
    "provider": "github",
    "api": "REST",
    "endpoint": "GET /repos/{owner}/{repo}/actions/permissions",
    "fields": ["sha_pinning_required"]
  },
  "checked_at": "2026-08-27T17:45:18.237Z",
  "details": {
    "sha_pinning_required": true
  }
}
```

## Permissions and data access

- PolicyChecks asks for repository `Administration: Read`, and no other permission.
- It holds no write permission, so it can't modify anything in your repository.
- It doesn't read repository source code.
- It doesn't call organization APIs (but it can still report whether a policy is enforced by repo settings even if those settings are inherited from organization policies).
- The service makes only `GET` requests to the GitHu API. [`test/github/api-usage-policy.test.ts`](test/github/api-usage-policy.test.ts) pins the list of endpoints that it queries and CI fails if a write verb, GraphQL query, pagination, search, or organization/user repository listing shows up in the source.
- Only the fields listed under [Supported checks](#supported-checks) go into a result. Any additional data in the API response is ignored.
- When a response is inconclusive, the badge says `unknown` instead of working the answer out some other way.

See [PRIVACY.md](PRIVACY.md) for additional details about how the service handles data.

## Scope

A PolicyChecks badge tells you one thing: what the GitHub API reported about a specific setting when the check ran.

It is not a security audit, not a historical compliance record, and not a codebase scanner. Enabling a setting does not establish that a project has followed that policy in the past, and PolicyChecks makes no claim that it has.

The SHA-pinning example cuts both ways:

- A repository can contain unpinned Actions and still show `enabled`, because those workflows may predate the setting.
- A repository can pin every Action meticulously and still show `disabled`, because nobody ticked the box.

That gap is the point. PolicyChecks reports policy, not practice. A maintainer who has turned on the inconvenient settings gets a way to say so publicly — nothing more, and nothing less.

## PolicyChecks vs. Scorecard and Shields

These tools answer different questions, and they're worth using together.

|  | Reports on | Data source | Granularity |
| --- | --- | --- | --- |
| **PolicyChecks** | Selected repository administration settings | Authenticated GitHub REST reads through an installed App | One badge per setting |
| **[OpenSSF Scorecard](https://github.com/ossf/scorecard)** | Actual codebase, workflow, and CI/CD practices, evaluated in depth | Repository contents and metadata analysis | An aggregate score, with per-check results available from its API |
| **[Shields.io](https://github.com/badges/shields)** | A very wide range of project signals | Publicly accessible data | One badge per signal |

Scorecard is the more rigorous supply-chain tool. It reads the workflow files and can tell you whether Actions are genuinely pinned; PolicyChecks doesn't attempt that. PolicyChecks covers the narrower case where the answer sits behind a permission that public badge services don't have.

## Limitations

- Settings can change at any time after a check runs. PolicyChecks doesn't track historical continuity, so a rule could be turned off temporarily without any badge reflecting it.
- Bypass actors are not evaluated. A ruleset that grants bypass permissions still reports as `enabled`.
- Classic branch protection rules are not evaluated — only rulesets, following GitHub's guidance to prefer them going forward.
- Rule-based checks look at the default branch, and nothing else.
- The result cache lives in memory, per Worker isolate. It reduces API pressure, but different isolates can hold different results.

## Documentation

|  |  |
| --- | --- |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Local setup, verification commands, and what makes a good contribution |
| [SECURITY.md](SECURITY.md) | Reporting a vulnerability |
| [PRIVACY.md](PRIVACY.md) | What the service processes and what it stores |
| [SUPPORT.md](SUPPORT.md) | Where to ask about a specific repository's badge |
| [docs/operations.md](docs/operations.md) | Running the service: caching, rate-limit policy, deployment, monitoring |
| [ADR 0001](docs/adr/0001-badge-publication-consent.md) and [its plan](docs/plans/0001-readme-publication-gate.md) | The accepted but unimplemented proposal to let maintainers choose which checks are published |

## Contributing

Contributions are welcome: bug reports, fixes, and new badges. Please open an issue before starting on a feature so we can talk it through. Setup and local development commands are in [CONTRIBUTING.md](CONTRIBUTING.md).

New badges are the most useful contribution. There are two conditions:

1. The check needs no permission beyond repository `Administration: Read`.
2. The result comes from a single GitHub API endpoint, without non-trivial inference.

A setting that can't be read within those constraints isn't a good fit. That boundary is what keeps the App's permission footprint small.

All contributors are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

MIT © 2026 Reponomics Contributors. See [LICENSE](LICENSE).
