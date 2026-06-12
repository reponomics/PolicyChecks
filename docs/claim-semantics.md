# Claim Semantics

PolicyChecks uses a cautious three-state result model:

- `pass`: GitHub returned a documented repository-scoped response showing that the checked setting is on.
- `fail`: GitHub returned a documented repository-scoped response showing that the checked setting is off.
- `unknown`: GitHub access, rate limits, response shape, or endpoint semantics prevent a confident current-state `pass` or `fail`.

`unknown` is not a failure assertion. It means PolicyChecks did not have enough reliable evidence to make the claim either way.

PolicyChecks reports effective repository settings and selected active ruleset-derived settings. A setting may be configured directly on the repository or inherited from an organization policy, security configuration, or ruleset, as long as the repository-scoped GitHub API returns the effective value for the installed repository.

PolicyChecks does not inspect workflow files, repository contents, generated artifacts, historical audit logs, or organization-wide inventory. It reports the current setting returned by the GitHub endpoint named in the proof response.

Every proof response includes the requested repository identity:

```json
{
  "repository": {
    "owner": "OWNER",
    "repo": "REPO",
    "full_name": "OWNER/REPO"
  }
}
```

Every proof response also includes an `evidence` object. The initial repository-setting badges use `repository_setting`; ruleset-derived branch badges use `active_branch_rules`.

## Documentation References

| Reference | GitHub docs |
| --- | --- |
| `repository-doc` | [Get a repository](https://docs.github.com/en/rest/repos/repos#get-a-repository) |
| `immutable-releases-doc` | [Check if immutable releases are enabled for a repository](https://docs.github.com/en/rest/repos/repos#check-if-immutable-releases-are-enabled-for-a-repository) |
| `actions-permissions-doc` | [Get GitHub Actions permissions for a repository](https://docs.github.com/en/rest/actions/permissions#get-github-actions-permissions-for-a-repository) |
| `branch-rules-doc` | [Get rules for a branch](https://docs.github.com/en/rest/repos/rules#get-rules-for-a-branch) |

## Global Error Mapping

These mappings apply before claim-specific logic unless a claim explicitly documents a narrower exception.

| GitHub/API condition | PolicyChecks status | Reason |
| --- | --- | --- |
| GitHub App is not installed for the repository | `unknown` | The service cannot inspect the setting. |
| GitHub returns `401` or `403` | `unknown` | Authentication or authorization failed; this is not evidence that a setting is disabled. |
| GitHub returns a rate-limit or secondary-rate-limit signal | `unknown` | GitHub rate-limit state is a transport constraint, not a setting value. |
| GitHub returns an undocumented response shape | `unknown` | The setting may exist, but the service cannot safely interpret it. |
| GitHub returns `5xx` or the request fails before completion | `unknown` | GitHub availability is not a repository setting. |

## `immutable-releases`

Claim: immutable releases are enabled for the repository.

GitHub endpoint:

```http
GET /repos/{owner}/{repo}/immutable-releases
```

Observed product behavior: when an organization immutable-releases policy applies to a repository, including selected-repository enforcement, the repository endpoint returns the effective setting with `enforced_by_owner: true`.

| GitHub response or value | PolicyChecks status | Proof details | Judgment |
| --- | --- | --- | --- |
| `200 OK` with `enabled: true` | `pass` | `enabled`, `enforced_by_owner` | Direct evidence that immutable releases are enabled for this repository. |
| `200 OK` with `enabled: false` | `fail` | `enabled`, `enforced_by_owner` | Direct evidence that immutable releases are disabled for this repository. |
| `404 Not Found` after repository installation/access has already been verified | `fail` | `enabled: false`, `enforced_by_owner: null` | Safe disabled assertion only after repository access has already been verified. |
| `404 Not Found` before repository access is verified | `unknown` | error details | Could mean not installed, missing repository, missing permission, or not enabled. |
| `200 OK` with missing or non-boolean `enabled` | `unknown` | error details | The service cannot safely interpret the response. |

## `sha-pinning-required`

Claim: repository Actions policy requires actions to be pinned to full-length commit SHAs.

GitHub endpoint:

```http
GET /repos/{owner}/{repo}/actions/permissions
```

Observed product behavior: when organization-level SHA pinning applies to a repository, the repository endpoint returns the effective setting with `sha_pinning_required: true`. Existing workflow files may still contain tag-pinned actions, but GitHub rejects those action references during workflow setup.

| GitHub response or value | PolicyChecks status | Proof details | Judgment |
| --- | --- | --- | --- |
| `200 OK` with `sha_pinning_required: true` | `pass` | `sha_pinning_required: true` | Direct evidence that GitHub currently requires full-length SHA-pinned actions for this repository. |
| `200 OK` with `sha_pinning_required: false` | `fail` | `sha_pinning_required: false` | Direct evidence that GitHub currently does not require full-length SHA-pinned actions for this repository. |
| `200 OK` with missing or non-boolean `sha_pinning_required` | `unknown` | error details | The service cannot safely interpret the response. |
| `404 Not Found` | `unknown` | error details | Not safe to assert disabled from this response. |

## `secret-scanning-enabled`

Claim: secret scanning is enabled for the repository.

GitHub endpoint:

```http
GET /repos/{owner}/{repo}
```

Observed product behavior: the repository metadata endpoint reports the effective secret scanning state. When a repository-level setting is removed, it reports `disabled`; when an organization code security configuration is enforced for the repository, it reports `enabled`. The code security configuration endpoint may show removed or unenforced configuration state and is not the primary source for this badge.

| GitHub response or value | PolicyChecks status | Proof details | Judgment |
| --- | --- | --- | --- |
| `200 OK` with `security_and_analysis.secret_scanning.status: enabled` | `pass` | selected `security_and_analysis.secret_scanning` status | Direct evidence that GitHub currently reports secret scanning enabled for this repository. |
| `200 OK` with `security_and_analysis.secret_scanning.status` as a string other than `enabled` | `fail` | selected `security_and_analysis.secret_scanning` status | Direct evidence that GitHub currently does not report secret scanning enabled for this repository. |
| `200 OK` with missing or non-string `security_and_analysis.secret_scanning.status` | `unknown` | error details | The service cannot safely interpret the response. |
| `404 Not Found` | `unknown` | error details | Not safe to assert disabled from this response. |

## `secret-push-protection-enabled`

Claim: secret scanning push protection is enabled for the repository.

GitHub endpoint:

```http
GET /repos/{owner}/{repo}
```

Observed product behavior: the repository metadata endpoint reports the effective push protection state, including when an enforced organization code security configuration enables it. Delegated bypass fields may appear in the same response. PolicyChecks includes those fields in proof details when present, but they do not change the badge result.

| GitHub response or value | PolicyChecks status | Proof details | Judgment |
| --- | --- | --- | --- |
| `200 OK` with `security_and_analysis.secret_scanning_push_protection.status: enabled` | `pass` | selected push protection and delegated bypass fields | Direct evidence that GitHub currently reports secret push protection enabled for this repository. |
| `200 OK` with `security_and_analysis.secret_scanning_push_protection.status` as a string other than `enabled` | `fail` | selected push protection and delegated bypass fields | Direct evidence that GitHub currently does not report secret push protection enabled for this repository. |
| `200 OK` with missing or non-string `security_and_analysis.secret_scanning_push_protection.status` | `unknown` | error details | The service cannot safely interpret the response. |
| `404 Not Found` | `unknown` | error details | Not safe to assert disabled from this response. |

## Default Branch Ruleset Claims

Claim: an active GitHub ruleset applies a specific rule to the repository's default branch.

| Claim ID | Claim | GitHub rule type |
| --- | --- | --- |
| `default-branch-force-pushes-blocked` | Active ruleset blocks force pushes on the default branch. | `non_fast_forward` |
| `default-branch-signed-commits-required` | Active ruleset requires signed commits on the default branch. | `required_signatures` |
| `default-branch-linear-history-required` | Active ruleset requires linear history on the default branch. | `required_linear_history` |
| `default-branch-deletion-blocked` | Active ruleset blocks deleting the default branch. | `deletion` |
| `default-branch-pull-request-required` | Active ruleset requires pull requests for the default branch. | `pull_request` |
| `default-branch-status-checks-required` | Active ruleset requires status checks for the default branch. | `required_status_checks` |

GitHub endpoints:

```http
GET /repos/{owner}/{repo}
GET /repos/{owner}/{repo}/rules/branches/{branch}
```

The branch is resolved from `default_branch` in the repository metadata response. The rules endpoint reports active rules that apply to that branch, including rules inherited from organization-level rulesets when GitHub exposes them through the repository-scoped endpoint.

This claim intentionally does not evaluate classic branch protection or ruleset bypass actors. It reports whether the ruleset rule is currently active, not whether a privileged administrator could later change the policy.

| GitHub response or value | PolicyChecks status | Proof details | Judgment |
| --- | --- | --- | --- |
| `200 OK` with an active rule whose `type` matches the claim's rule type | `pass` | `default_branch`, `required_rule_type`, `active_rule_types`, selected `matching_rules`, limitations | Direct evidence that the active ruleset setting is enabled for the default branch. |
| `200 OK` with a valid active-rules array and no matching rule type | `fail` | `default_branch`, `required_rule_type`, `active_rule_types`, empty `matching_rules`, limitations | Direct evidence that this ruleset setting is not enabled for the default branch. |
| Repository metadata has missing or empty `default_branch` | `unknown` | error details | The service cannot select the branch whose policy should be checked. |
| Rules response is not an array, or a rule is missing a string `type` | `unknown` | error details | The service cannot safely interpret the response. |
| `404 Not Found` from either endpoint | `unknown` | error details | Not safe to assert disabled from this response. |

## Adding A New Claim

Before adding a new public badge, document:

1. The GitHub endpoint and required permissions.
2. The documented HTTP status codes.
3. The exact fields used from successful responses.
4. Which responses produce `pass`, `fail`, and `unknown`.
5. Why any `fail` state is safe to assert.
6. Whether repository-scoped responses include inherited organization policy.

Post-MVP candidates include Dependabot settings, dependency graph, code security configuration badges, and ruleset-derived branch policy badges. They should remain unpublished until their API evidence maps cleanly to an intuitive admin setting without requiring file inspection, contents access, historical audit logs, or unsupported judgment calls. The next ruleset badge milestone is outlined in [`ruleset-branch-badges-milestone.md`](ruleset-branch-badges-milestone.md).
