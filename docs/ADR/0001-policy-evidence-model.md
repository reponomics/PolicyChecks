# ADR 0001: Policy Evidence Model

## Status

Accepted

## Context

PolicyChecks badge labels are intentionally short. They name the security posture a maintainer wants to show, not every GitHub API surface that can prove it.

Some GitHub settings can be reported directly at repository scope. Other settings may be governed by organization or enterprise policy, such as an attached code security configuration. If badge names try to encode every evidence source, they become too qualified to be useful. If proof responses hide the evidence source, users cannot tell why a badge passed, failed, or returned `unknown`.

PolicyChecks also needs to avoid fuzzy claims. It should report GitHub settings and policy surfaces, not infer posture from repository files, generated artifacts, or indirect feature availability.

## Decision

Badge labels remain user-facing and concise:

- `dependency graph`
- `secret scanning`
- `Dependabot alerts`
- `SHA pinning`

Badge result messages use policy language: `enforced`, `not enforced`, or `unknown`. GitHub-native values such as `enabled`, `disabled`, `required`, or `not_set` belong in proof details, not in public badge messages.

Proof JSON carries the qualification. Each proof result records the GitHub evidence source, the scope where the evidence was observed, and whether GitHub reported central enforcement.

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
- Claims based on generated artifacts, repository file inspection, or indirect feature availability are out of scope unless a later ADR changes this rule.
- Organization governance checks may require broader permissions than repository-only checks.

## Claim Design Rules

1. Prefer direct settings/policy endpoints over file inspection or artifact generation.
2. Keep badge names short when the same posture can be proven by repository or organization evidence.
3. Put evidence source, scope, and enforcement in proof JSON.
4. Return `unknown` when GitHub does not expose the policy surface needed for a confident result.
5. Do not publish claims whose badge label would need to be so qualified that users cannot predict what it means.
