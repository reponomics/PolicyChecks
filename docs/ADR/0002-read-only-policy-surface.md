# ADR 0002: Read-Only Policy Surface

## Status

Accepted

## Context

PolicyChecks is a public badge service. The app may need privileged read access to observe repository policy surfaces, but it should not request permissions that allow it to change those policies.

GitHub exposes policy state through several API families with different permission costs:

- repository settings endpoints;
- code security configuration endpoints;
- repository metadata;
- repository and branch rules endpoints;
- organization-level policy endpoints.

The product question is whether PolicyChecks remains useful if it refuses write-policy permissions, especially repository or organization `Administration: Write`.

## Decision

PolicyChecks will not request write-policy permissions for badge evaluation.

Specifically, PolicyChecks should not request repository `Administration: Write` or organization `Administration: Write` merely to strengthen a badge claim. Those permissions allow the app to alter rulesets or other policy surfaces, which is a different trust posture from observing policy state.

PolicyChecks may request read permissions that expose settings and policy configuration. Repository `Administration: Read` remains acceptable for repository-scoped settings. Organization `Administration: Read` may be acceptable for organization-managed policy surfaces if a later release supports organization installs and documents that scope clearly. Repository `Metadata: Read` is treated as the implicit GitHub App baseline: it appears in endpoint permission tables, but it is not a separate product permission ask once the app is installed.

Ruleset-derived claims are split into two product categories:

1. **Active applicable rule claims.** These can be based on GitHub returning active rules that apply to a repository or branch. They are viable under read-only permissions.
2. **Configured-bypass claims.** These require visibility into `bypass_actors`, meaning actors explicitly configured as exceptions inside a ruleset. GitHub does not return `bypass_actors` unless the caller has write access to the ruleset. These claims are out of scope unless GitHub later exposes bypass visibility through read-only permissions.

The absence of configured-bypass visibility does not prevent active applicable rule claims. It only prevents stronger claims about the absence of bypass actors. Active rule badges should report the rule GitHub currently says applies, and proof JSON should make any bypass-visibility limitation explicit.

## Permission Matrix

| Product surface | Representative GitHub endpoint | Permission boundary | Lookup shape | Product judgment |
| --- | --- | --- | --- | --- |
| Repository identity and default branch | `GET /repos/{owner}/{repo}` | Implicit repository `Metadata: Read` baseline; public resources may be unauthenticated | One request | Useful support surface, not usually a badge by itself. |
| Repository security metadata, such as `security_and_analysis` | `GET /repos/{owner}/{repo}` | Endpoint is metadata-readable, but GitHub requires repository admin, organization owner, or security manager visibility for the `security_and_analysis` block | One request | Viable for direct security feature checks when the app has sufficient repository visibility. |
| Immutable releases | `GET /repos/{owner}/{repo}/immutable-releases` | Repository `Administration: Read` | One request | Viable. Direct repository setting with documented enabled/not-enabled responses. |
| Actions SHA pinning | `GET /repos/{owner}/{repo}/actions/permissions` | Repository `Administration: Read` | One request | Viable. Direct repository Actions policy field. |
| Dependabot vulnerability alerts | `GET /repos/{owner}/{repo}/vulnerability-alerts` | Repository `Administration: Read` | One request | Viable. Direct repository setting endpoint. |
| Dependabot security updates | `GET /repos/{owner}/{repo}/automated-security-fixes` | Repository `Administration: Read` | One request | Candidate. Direct repository setting endpoint, separate from vulnerability alerts. |
| Code security configuration attached to a repository | `GET /repos/{owner}/{repo}/code-security-configuration` | Repository `Administration: Read`; authenticated caller must be an administrator or security manager for the organization | One request | Viable when a configuration is attached. Gives several code security feature fields and central enforcement status. |
| Code scanning default setup | `GET /repos/{owner}/{repo}/code-scanning/default-setup` | Repository `Administration: Read` | One request | Candidate. Direct default-setup configuration surface; availability depends on code scanning/GHAS eligibility. |
| Active branch rules | `GET /repos/{owner}/{repo}/rules/branches/{branch}` | Implicit repository `Metadata: Read` baseline; public resources may be unauthenticated | One paginated request after default branch is known | Strong candidate. Returns active rules that apply to the branch, including repository- and organization-sourced rules. Does not return disabled or evaluate-mode rules. |
| Repository ruleset summaries | `GET /repos/{owner}/{repo}/rulesets` | Implicit repository `Metadata: Read` baseline; public resources may be unauthenticated | One paginated request | Candidate support surface. Useful for inventory, source scope, and enforcement state; less direct than branch rules for branch-specific claims. |
| Repository ruleset details | `GET /repos/{owner}/{repo}/rulesets/{ruleset_id}` | Implicit repository `Metadata: Read` baseline; public resources may be unauthenticated | One request per ruleset | Candidate when full rule parameters are needed. `bypass_actors` is withheld unless the caller has write access to the ruleset. |
| Organization code security configurations | `GET /orgs/{org}/code-security/configurations/{configuration_id}` and related read endpoints | Organization `Administration: Read`; caller must be organization administrator or security manager | One or paginated org request | Candidate for organization product tier, not required for repository-only badges unless PolicyChecks reports org policy directly. |
| Organization ruleset details with configured bypass actors | `GET /orgs/{org}/rulesets/{ruleset_id}` | Organization `Administration: Write` | One request per ruleset | Out of scope. Write-policy permission is too broad for badge evaluation. |
| Repository ruleset details with configured bypass actors | `GET /repos/{owner}/{repo}/rulesets/{ruleset_id}` plus write access to the ruleset | Repository or org write-policy authority, depending on source ruleset | One request per ruleset | Out of scope for configured-bypass claims unless GitHub adds read-only bypass visibility. |
| Repository file inspection | `GET /repos/{owner}/{repo}/contents/{path}` or git blob/tree APIs | Repository `Contents: Read` for private repositories | One or more repository-content requests | Out of scope for policy badges by default. Contents access supports code/config inference, not direct GitHub policy surfaces. |

## Read-Only Product Surface

If PolicyChecks never accepts write-policy permissions, the useful product surface is still substantial:

- immutable releases;
- Actions SHA pinning;
- Dependabot vulnerability alerts;
- Dependabot security updates;
- secret scanning;
- secret scanning push protection when represented in an attached code security configuration;
- dependency graph automatic submission when represented in an attached code security configuration;
- code scanning default setup;
- active signed-commit rules for a branch;
- active pull-request-required rules for a branch;
- active code owner review rules for a branch;
- active stale-review-dismissal rules for a branch;
- active required-status-check rules for a branch;
- active strict status-check rules for a branch;
- active non-fast-forward rules, meaning force pushes are blocked;
- active deployment-required rules;
- active commit message, author email, committer email, branch/tag name, file path, file extension, and file size rules.

Most of that surface is available through direct settings or policy endpoints. It does not require reading workflow files, package manifests, release artifacts, or repository contents.

## Current-State Boundary

PolicyChecks is a current-state service. It reports what GitHub's policy and administration surfaces say at the time of evaluation. Ruleset webhooks can tell PolicyChecks that rulesets changed and that cached results should be invalidated. They do not provide audit-log continuity.

There are three distinct bypass concepts:

1. **Policy authority.** Repository administrators, organization owners, security managers, or other policy owners may be able to change a setting, perform an action, and change the setting back. PolicyChecks does not make continuity claims about whether that happened.
2. **Configured bypass actors.** Rulesets may include explicit `bypass_actors` that exempt selected actors from the rule. GitHub's repository ruleset documentation says `bypass_actors` is only returned when the caller has write access to the ruleset. Organization ruleset detail reads require organization `Administration: Write`.
3. **Runtime bypass events.** Some features, such as secret scanning push protection, can produce audit or alert events when a user bypasses protection. Those events are operational history, not current policy configuration.

PolicyChecks reports observed current policy state. It does not claim that the policy was continuously enabled over time, that no authorized administrator could disable it, or that no configured bypass actors exist unless the proof explicitly says so.

Therefore PolicyChecks must not publish claims such as "cannot be bypassed," "no bypass actors," or "continuously enforced" under the read-only product boundary. It may publish current-state claims such as "signed commits are enforced for the default branch" when GitHub returns an active applicable rule and the proof records the rule source and bypass-visibility limitation.

For ruleset-backed claims, proof JSON should expose bypass visibility explicitly:

```json
{
  "details": {
    "matching_rule_types": ["required_signatures"],
    "bypass_visibility": "unavailable"
  }
}
```

## Consequences

- `Contents: Read` is not the next permission to request for policy-surface growth. It enables file inspection, not ruleset truth.
- Repository `Administration: Read` supports the current direct-setting product.
- Implicit repository `Metadata: Read` is enough for many future active-rule claims and should not be described as an additional installer-facing permission ask.
- Organization `Administration: Read` may be needed for a future organization policy tier.
- Write-policy permissions remain out of scope even if they would reveal configured bypass actors.
- Dependency graph is not a public badge in the current product. For public repositories, GitHub's feature-availability docs already describe it as enabled by default, which makes it low-signal as a badge. For private and internal repositories, PolicyChecks still needs a direct read-only setting surface before it can report dependency graph confidently without an attached code security configuration.
- Claims that depend on absence of configured bypass actors must remain unpublished or return `unknown` until GitHub exposes bypass visibility through read-only access. Claims that only report active applicable rules may still pass or fail without configured-bypass visibility when the proof makes that limitation explicit.
- Claims that depend on historical continuity must remain unpublished unless PolicyChecks adds an audited continuity model.

## Documentation References

- [Get a repository](https://docs.github.com/en/rest/repos/repos#get-a-repository)
- [Check if immutable releases are enabled for a repository](https://docs.github.com/en/rest/repos/repos#check-if-immutable-releases-are-enabled-for-a-repository)
- [Get GitHub Actions permissions for a repository](https://docs.github.com/en/rest/actions/permissions#get-github-actions-permissions-for-a-repository)
- [Check if vulnerability alerts are enabled for a repository](https://docs.github.com/en/rest/repos/repos#check-if-vulnerability-alerts-are-enabled-for-a-repository)
- [Get the code security configuration associated with a repository](https://docs.github.com/en/rest/code-security/configurations#get-the-code-security-configuration-associated-with-a-repository)
- [Get a code scanning default setup configuration](https://docs.github.com/en/rest/code-scanning/code-scanning#get-a-code-scanning-default-setup-configuration)
- [Get rules for a branch](https://docs.github.com/en/rest/repos/rules#get-rules-for-a-branch)
- [Get all repository rulesets](https://docs.github.com/en/rest/repos/rules#get-all-repository-rulesets)
- [Get a repository ruleset](https://docs.github.com/en/rest/repos/rules#get-a-repository-ruleset)
- [Get an organization repository ruleset](https://docs.github.com/en/rest/orgs/rules#get-an-organization-repository-ruleset)
- [Permissions required for GitHub Apps](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps)
