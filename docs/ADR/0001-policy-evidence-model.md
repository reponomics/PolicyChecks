# ADR 0001: Policy Evidence Model

## Status

Accepted

## Context

PolicyChecks badge labels are intentionally short. They name the security posture a maintainer wants to show, not every GitHub API surface that can prove it.

Some GitHub settings can be reported directly at repository scope. Other settings may be governed by organization or enterprise policy, such as an attached code security configuration. If badge names try to encode every evidence source, they become too qualified to be useful. If proof responses hide the evidence source, users cannot tell why a badge passed, failed, or returned `unknown`.

PolicyChecks also needs to avoid fuzzy claims. It should report current GitHub settings and policy surfaces, not infer posture from repository files, generated artifacts, indirect feature availability, or historical behavior.

## Decision

Badge labels remain user-facing and concise:

- `secret scanning`
- `Dependabot alerts`
- `SHA pinning`

Badge result messages use policy language: `enforced`, `not enforced`, or `unknown`. In PolicyChecks, `enforced` means GitHub currently reports an administrative setting, repository policy, active rule, or attached configuration that requires or enables the claimed posture. GitHub-native values such as `enabled`, `disabled`, `required`, or `not_set` belong in proof details, not in public badge messages.

PolicyChecks does not claim historical continuity. It does not assert that a setting has always been enabled, that an administrator could not change it, or that no future actor with sufficient authority could temporarily disable and restore it. It is a current-state view into repository and organization policy surfaces.

This distinction is the reason the product exists. A maintainer may enable a GitHub administrative setting such as full SHA pinning for Actions, which improves the repository's security posture and can help external scoring systems. Without PolicyChecks, showing that setting publicly often requires a redundant workflow that checks the same condition GitHub already enforces.

Proof JSON carries the qualification. Each proof result records the GitHub evidence source, the scope where the evidence was observed, and whether GitHub reported central enforcement.

The proof endpoint is the trust boundary, not the badge image. A public badge can always be copied, linked incorrectly, or misrepresented, as with any README badge. PolicyChecks does not try to make badge pixels authoritative. It makes the underlying proof response inspectable, specific about the GitHub API evidence, and narrow enough that a maintainer who misrepresents it is making a visible false claim.

Claims stronger than current observed policy state require a different evidence model. To say that a setting was continuously enforced, that no privileged actor temporarily disabled it, or that no bypass path existed over time, PolicyChecks would need audit-log history or another durable continuity record. Those are audit-grade claims, not badge-level current-state claims.

For personal repositories, checks are evaluated at repository scope.

For organization repositories, checks may be satisfied by repository settings or by organization-managed policy/configuration that applies to the repository. Organization installs should request the permissions needed to inspect those policy surfaces. If an installer cannot approve those permissions, PolicyChecks should report `unknown` rather than making weaker claims under the same badge name.

Example proof evidence:

```json
{
  "evidence": {
    "scope": "organization",
    "source": "attached_code_security_configuration",
    "enforcement": "enforced"
  }
}
```

## Evidence Sources

| Source | Meaning | Example |
| --- | --- | --- |
| `repository_setting` | GitHub returned a repository-level setting or repository-scoped status endpoint. | `GET /repos/{owner}/{repo}/actions/permissions` |
| `active_branch_rules` | GitHub returned active rules that apply to a repository branch. | `GET /repos/{owner}/{repo}/rules/branches/{branch}` |
| `attached_code_security_configuration` | GitHub returned a code security configuration that manages the repository. | `GET /repos/{owner}/{repo}/code-security-configuration` |
| `unavailable` | PolicyChecks could not obtain interpretable evidence. | Installation, authorization, rate-limit, or unsupported response failures |

## Evidence Scope

| Scope          | Meaning                                                            |
| -------------- | ------------------------------------------------------------------ |
| `repository`   | The proof comes from a repository setting/status surface.          |
| `organization` | The proof comes from an organization-managed policy/configuration. |
| `enterprise`   | The proof comes from an enterprise-managed policy/configuration.   |
| `unknown`      | GitHub did not provide a usable scope.                             |

## Enforcement

`enforcement` is only included when GitHub exposes enforcement status for the evidence source.

For repository-local settings, absence of `enforcement` means PolicyChecks verified the setting value but did not verify who can change it.

For attached code security configurations, `enforcement` is copied from GitHub's configuration response when available. A pass result for a centrally managed configuration means GitHub returned the configured value; enforcement status still needs to be read separately from `evidence.enforcement` and `details.configuration.enforcement`.

## Consequences

- README stays a summary; technical semantics live in ADRs and claim documentation.
- Badge names do not need org/repo qualifiers.
- Proof JSON must make the evidence source explicit.
- Claims based on generated artifacts, repository file inspection, indirect feature availability, or historical continuity are out of scope unless a later ADR changes this rule.
- Organization governance checks may require broader permissions than repository-only checks.

## Claim Design Rules

1. Prefer direct settings/policy endpoints over file inspection or artifact generation.
2. Keep badge names short when the same posture can be proven by repository or organization evidence.
3. Put evidence source, scope, and enforcement in proof JSON.
4. Return `unknown` when GitHub does not expose the policy surface needed for a confident result.
5. Do not publish claims whose badge label would need to be so qualified that users cannot predict what it means.
