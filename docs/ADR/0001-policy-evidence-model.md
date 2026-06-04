# ADR 0001: Policy Evidence Model

## Status

Accepted

## Context

PolicyChecks is a lightweight checker of GitHub administration settings. The product is not trying to infer security facts from repository contents, workflow files, generated artifacts, audit logs, or broad feature availability. It should publish badges only when the claim maps to an intuitive GitHub admin control and a direct GitHub API response.

The MVP should therefore favor a small number of obvious, low-ambiguity badges over a larger catalog that requires product judgment about defaults, bypasses, continuity, or whether a security feature is "really" enforced.

## Decision

The MVP publishes four repository-setting badges:

- `immutable-releases`
- `sha-pinning-required`
- `secret-scanning-enabled`
- `secret-push-protection-enabled`

All four badges are evaluated from repository-scoped GitHub REST endpoints. They support personal or organization-owned repositories, public or private, when the GitHub App is installed on the repository and can read repository administration settings.

The badges report effective repository settings. A setting may be configured directly on the repository or inherited from an organization policy if the repository-scoped endpoint returns the effective value for that repository.

Badge labels stay short:

- `immutable releases`
- `SHA pinning`
- `secret scanning`
- `secret push protection`

Badge result messages use the setting's native vocabulary:

- `immutable-releases`: `enabled`, `disabled`, `unknown`
- `sha-pinning-required`: `enabled`, `disabled`, `unknown`
- `secret-scanning-enabled`: `enabled`, `disabled`, `unknown`
- `secret-push-protection-enabled`: `enabled`, `disabled`, `unknown`

This avoids overloading the word "enforced." Proof JSON carries the exact GitHub fields, such as `enabled`, `enforced_by_owner`, `sha_pinning_required`, and `security_and_analysis`.

PolicyChecks does not claim historical continuity. It does not assert that a setting has always been enabled, that an administrator could not change it, or that no future actor with sufficient authority could temporarily disable and restore it. It is a current-state view into the repository setting returned by GitHub.

This distinction is the reason the product exists. A maintainer may enable a GitHub administrative setting such as full SHA pinning for Actions. Without PolicyChecks, showing that setting publicly often requires a redundant workflow that checks the same condition GitHub already applies during workflow setup.

The proof endpoint is the trust boundary, not the badge image. A public badge can always be copied, linked incorrectly, or misrepresented, as with any README badge. PolicyChecks makes the underlying proof response inspectable and specific about the GitHub API evidence.

## Evidence Sources

| Source | Meaning | Example |
| --- | --- | --- |
| `repository_setting` | GitHub returned a repository-scoped setting or status endpoint. | `GET /repos/{owner}/{repo}/actions/permissions` |
| `unavailable` | PolicyChecks could not obtain interpretable evidence. | Installation, authorization, rate-limit, or unsupported response failures |

## Evidence Scope

| Scope        | Meaning                                            |
| ------------ | -------------------------------------------------- |
| `repository` | The proof comes from a repository-scoped endpoint. |
| `unknown`    | GitHub did not provide a usable scope.             |

## Consequences

- README stays a summary; technical semantics live in ADRs and claim documentation.
- MVP badges are limited to the four direct repository-setting checks.
- The MVP does not call organization APIs.
- Repository `Contents: Read` is not required for the MVP.
- Claims based on repository file inspection, generated artifacts, indirect feature availability, historical continuity, or unclear defaults are out of scope unless a later ADR changes this rule.
- Dependabot, dependency graph, code security configuration, and ruleset badges are post-MVP candidates.

## Claim Design Rules

1. Prefer direct repository settings endpoints over file inspection or artifact generation.
2. Publish a badge only when users can predict the GitHub UI setting it represents.
3. Treat repository-scoped effective settings as sufficient, including settings inherited from organization policy.
4. Put exact GitHub fields in proof JSON.
5. Return `unknown` when GitHub does not expose the setting surface needed for a confident result.
6. Do not publish claims whose badge label requires substantial caveats to avoid misleading users.
