# Claim Semantics

PolicyChecks uses a cautious three-state result model:

- `pass`: GitHub returned a documented response showing that the current policy posture is enforced.
- `fail`: GitHub returned a documented response showing that the current policy posture is not enforced.
- `unknown`: GitHub access, rate limits, response shape, or endpoint semantics prevent a confident current-state `pass` or `fail`.

`unknown` is not a failure assertion. It means PolicyChecks did not have enough reliable evidence to make the claim either way.

PolicyChecks is a current-state view into repository and organization policy surfaces. A `pass` result does not claim historical continuity, audit-log coverage, or that an authorized administrator could never change a setting. It means the referenced GitHub administrative setting, repository policy, active rule, or attached configuration currently supports the claim.

The proof JSON is the meaningful artifact behind the badge. Badge images are conventional public signals and can be copied or misrepresented like any other badge. PolicyChecks therefore focuses on making the linked proof response precise and falsifiable, not on making audit-grade claims from badge presentation alone.

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

Every proof response also includes an `evidence` object. `evidence.source` identifies the GitHub policy surface, `evidence.scope` identifies whether the evidence is repository-, organization-, or enterprise-scoped, and `evidence.enforcement` is included when GitHub reports central enforcement status. The evidence model is defined in [`docs/ADR/0001-policy-evidence-model.md`](ADR/0001-policy-evidence-model.md).

## Documentation References

The tables below use these GitHub documentation references as their audit trail:

| Reference | GitHub docs |
| --- | --- |
| `immutable-releases-doc` | [Check if immutable releases are enabled for a repository](https://docs.github.com/en/rest/repos/repos#check-if-immutable-releases-are-enabled-for-a-repository) |
| `actions-permissions-doc` | [Get GitHub Actions permissions for a repository](https://docs.github.com/en/rest/actions/permissions#get-github-actions-permissions-for-a-repository) |
| `branch-rules-doc` | [Get rules for a branch](https://docs.github.com/en/rest/repos/rules#get-rules-for-a-branch) |
| `repository-doc` | [Get a repository](https://docs.github.com/en/rest/repos/repos#get-a-repository) |
| `vulnerability-alerts-doc` | [Check if vulnerability alerts are enabled for a repository](https://docs.github.com/en/rest/repos/repos#check-if-vulnerability-alerts-are-enabled-for-a-repository) |
| `code-security-config-doc` | [Get the code security configuration associated with a repository](https://docs.github.com/en/rest/code-security/configurations#get-the-code-security-configuration-associated-with-a-repository) |

## Global Error Mapping

These mappings apply before claim-specific logic unless a claim explicitly documents a narrower exception.

| GitHub/API condition | PolicyChecks status | Documentation basis | Reason |
| --- | --- | --- | --- |
| GitHub App is not installed for the repository | `unknown` | Installation resolution happens before claim endpoint interpretation. | The service cannot inspect the setting. |
| GitHub returns `401` or `403` | `unknown` | Endpoint docs list authorization failures separately from setting values. | Authentication or authorization failed; this is not evidence that a setting is disabled. |
| GitHub returns a rate-limit or secondary-rate-limit signal | `unknown` | GitHub rate-limit headers/errors are transport constraints, not setting values. | The service stops rather than spending more quota or guessing. |
| GitHub returns an undocumented response shape | `unknown` | No documented field mapping exists. | The setting may exist, but the service cannot safely interpret it. |
| GitHub returns `5xx` or the request fails before completion | `unknown` | GitHub availability is outside the claim endpoint semantics. | GitHub availability is not a repository setting. |

## `immutable-releases`

Claim: immutable releases are enabled for the repository.

GitHub endpoint:

```http
GET /repos/{owner}/{repo}/immutable-releases
```

| GitHub response or value | PolicyChecks status | Proof details | Documentation basis | Judgment |
| --- | --- | --- | --- | --- |
| `200 OK` with `enabled: true` | `pass` | `enabled: true`, `enforced_by_owner` when present | `immutable-releases-doc` documents `200` as the response when immutable releases are enabled, with example `{ "enabled": true, "enforced_by_owner": false }`. | Direct evidence that the setting is enabled. |
| `404 Not Found` after repository installation/access has already been verified | `fail` | `enabled: false` | `immutable-releases-doc` documents `404` as not enabled for this specific endpoint. | Safe disabled assertion only after repository access has already been verified. |
| `404 Not Found` before repository access is verified | `unknown` | error details | `immutable-releases-doc` documents endpoint-level `404`, but access resolution has not disambiguated repository/access failure. | Could mean not installed, missing repository, missing permission, or not enabled. |
| `200 OK` with missing or non-true `enabled` | `unknown` | error details | `immutable-releases-doc` only gives `enabled: true` as the enabled response shape. | Not enough documented evidence for either enabled or disabled. |

## `sha-pinning-required`

Claim: repository Actions policy requires actions to be pinned to full-length commit SHAs.

GitHub endpoint:

```http
GET /repos/{owner}/{repo}/actions/permissions
```

| GitHub response or value | PolicyChecks status | Proof details | Documentation basis | Judgment |
| --- | --- | --- | --- | --- |
| `200 OK` with `sha_pinning_required: true` | `pass` | `sha_pinning_required: true` | `actions-permissions-doc` documents `sha_pinning_required` as a boolean repository Actions permission field. | Direct evidence that SHA pinning is required. |
| `200 OK` with `sha_pinning_required: false` | `fail` | `sha_pinning_required: false` | `actions-permissions-doc` documents `sha_pinning_required` as the field controlling whether full-length SHA pinning is required. | Direct evidence that SHA pinning is not required. |
| `200 OK` with missing or non-boolean `sha_pinning_required` | `unknown` | error details | `actions-permissions-doc` documents a boolean field; the returned shape does not match. | The service cannot safely interpret the response. |
| `404 Not Found` | `unknown` | error details | `actions-permissions-doc` does not document `404` as a disabled/not-required setting value. | Not safe to assert disabled from this response. |

## `secret-scanning-enabled`

Claim: the repository's security and analysis settings enable secret scanning.

GitHub endpoint:

```http
GET /repos/{owner}/{repo}
```

| GitHub response or value | PolicyChecks status | Proof details | Documentation basis | Judgment |
| --- | --- | --- | --- | --- |
| `200 OK` with `security_and_analysis.secret_scanning.status: enabled` | `pass` | selected `security_and_analysis.secret_scanning` status | `repository-doc` documents repository metadata as the place to check security and analysis feature status. | Direct evidence that secret scanning is enabled. |
| `200 OK` with `security_and_analysis.secret_scanning.status` as a string other than `enabled` | `fail` | selected `security_and_analysis.secret_scanning` status | `repository-doc` documents the feature status as an enablement field. | Direct evidence that secret scanning is not enabled. |
| `200 OK` with missing or non-string `security_and_analysis.secret_scanning.status` | `unknown` | error details | `repository-doc` documents security and analysis feature status, but the returned shape does not match. | The service cannot safely interpret the response. |
| `404 Not Found` | `unknown` | error details | Repository access is resolved before claim evaluation; a repository metadata `404` is an access or repository identity problem, not a setting value. | Not safe to assert disabled from this response. |

## `dependabot-alerts-enabled`

Claim: repository Dependabot vulnerability alerts are enabled.

GitHub endpoint:

```http
GET /repos/{owner}/{repo}/vulnerability-alerts
```

| GitHub response or value | PolicyChecks status | Proof details | Documentation basis | Judgment |
| --- | --- | --- | --- | --- |
| `204 No Content` | `pass` | `vulnerability_alerts: enabled` | `vulnerability-alerts-doc` documents `204` as the response when the repository is enabled with vulnerability alerts. | Direct evidence that Dependabot alerts are enabled. |
| `404 Not Found` after repository installation/access has already been verified | `fail` | `vulnerability_alerts: disabled` | `vulnerability-alerts-doc` documents `404` as not enabled for this specific endpoint. | Safe disabled assertion only after repository access has already been verified. |
| `404 Not Found` before repository access is verified | `unknown` | error details | The endpoint-level `404` must be disambiguated from missing repository, missing installation, or missing permission. | Could mean no access rather than disabled. |
| `401`, `403`, rate limit, or other request failure | `unknown` | error details | Endpoint docs list authorization failures separately from setting values. | Not safe to infer disabled from failed access. |

## Adding A New Claim

Before adding a new public badge, document:

1. The GitHub endpoint and required permissions.
2. The documented HTTP status codes.
3. The exact fields used from successful responses.
4. Which responses produce `pass`, `fail`, and `unknown`.
5. Why any `fail` state is safe to assert.
6. Known caveats, such as bypass actors, inherited settings, organization policy, or unavailable continuity data.

## Current-State Caveats

Some repository settings require qualification before PolicyChecks can assign a clear current-state meaning to `pass` or `fail`. Ruleset-derived checks are the main example: GitHub can report that a rule applies to a branch, while configured bypass actors, administrator policy changes, and continuity history are separate concerns. PolicyChecks may report the active applicable rule as current policy state, but it does not claim historical continuity, impossibility of administrator override, or absence of configured bypass actors unless a proof explicitly adds that evidence.

#### `signed-commits-required`

Status: candidate current-state claim; not in the current public registry.

Claim: active rules for the default branch require signed commits.

GitHub endpoints:

```http
GET /repos/{owner}/{repo}
GET /repos/{owner}/{repo}/rules/branches/{branch}
```

| GitHub response or value | PolicyChecks status | Proof details | Documentation basis | Judgment |
| --- | --- | --- | --- | --- |
| Repository metadata includes a default branch, and branch rules response is an array containing `type: required_signatures` | `pass` | `branch`, `matching_rule_types`, `bypass_visibility: unavailable` | `branch-rules-doc` documents that the endpoint returns all active rules applying to the branch. | Direct evidence that an active signed-commit rule applies to the default branch. |
| Repository metadata includes a default branch, and branch rules response is an array without `type: required_signatures` | `fail` | `branch`, `matching_rule_types`, `bypass_visibility: unavailable` | `branch-rules-doc` documents that all active applicable rules are returned and `evaluate`/`disabled` rulesets are excluded. | Safe to say no active applicable signed-commit rule was returned for the default branch. |
| Repository metadata has no usable default branch | `unknown` | `branch: null`, `matching_rule_types: []`, `bypass_visibility: unavailable` | Repository metadata did not provide the branch needed to call `branch-rules-doc` endpoint. | The service does not know which branch to evaluate. |
| Branch rules response is not an array | `unknown` | error details | `branch-rules-doc` documents an array response. | The service cannot safely interpret the response. |
| Any `404` from repository metadata or branch rules | `unknown` | error details | `branch-rules-doc` does not document `404` as a disabled/not-required setting value. | Not safe to assert disabled from this response. |

Caveat: this claim is ruleset-derived. It says GitHub returned an active applicable `required_signatures` rule for the default branch. It does not prove historical continuity, impossibility of administrator override, or absence of configured bypass actors. The unavailable bypass visibility is a proof qualification, not a reason the active-rule claim cannot be evaluated.

#### `dependency-graph-enabled`

Status: not published.

Dependency graph is important repository security context, and Dependabot alerts depend on dependency graph data. It is not currently a good public badge. GitHub's feature-availability documentation says dependency graph is enabled by default for public repositories, which makes it low-signal for the main public badge audience. For private and internal repositories, PolicyChecks still needs a direct read-only setting surface before it can report dependency graph confidently without an attached code security configuration.

#### `secret-scanning-push-protection-enabled`

Status: candidate current-state claim; not in the current public registry.

Claim: the repository's attached code security configuration enables secret scanning push protection.

This claim is a direct enablement check only. It does not assert that nobody can bypass push protection. GitHub documents delegated bypass controls for push protection, and the code security configuration response can include `secret_scanning_delegated_bypass` and `secret_scanning_delegated_bypass_options`.

GitHub endpoint:

```http
GET /repos/{owner}/{repo}/code-security-configuration
```

This claim uses the same endpoint and top-level response rules as `secret-scanning-enabled`, but reads `configuration.secret_scanning_push_protection`.

| GitHub response or value | PolicyChecks status | Proof details | Documentation basis | Judgment |
| --- | --- | --- | --- | --- |
| `200 OK` with `status: attached` and `configuration.secret_scanning_push_protection: enabled` | `pass` | `status`, selected `configuration` metadata, `secret_scanning_push_protection` | `code-security-config-doc` documents `200 OK` and example fields including `status`, `configuration`, and `secret_scanning_push_protection`. | Direct evidence that push protection is enabled by the attached configuration. |
| `200 OK` with `status: attached` and `configuration.secret_scanning_push_protection` as a string other than `enabled` | `fail` | `status`, selected `configuration` metadata, `secret_scanning_push_protection` | `code-security-config-doc` documents `secret_scanning_push_protection` as an enablement status field. | Direct evidence from an attached configuration that this field is not enabled. |
| `204 No Content` | `unknown` | `status: no_content`, `configuration: null` | `code-security-config-doc` lists `204 No Content` but does not define it as disabled. | Not safe to assert disabled from no content. |
| `200 OK` with missing or non-`attached` `status` | `unknown` | `status`, selected configuration metadata when present | `code-security-config-doc` example shows `status: attached`; other status semantics are not yet mapped. | Not enough documented evidence for enabled or disabled. |
| `200 OK` with attached status but missing/non-string `configuration.secret_scanning_push_protection` | `unknown` | selected configuration metadata | `code-security-config-doc` documents a string enablement status field; the returned shape does not match. | The service cannot safely interpret the field. |
| `404 Not Found` | `unknown` | error details | `code-security-config-doc` documents `404` as resource not found, not as disabled. | Not safe to assert disabled from this response. |

Bypass caveat: a `pass` result would mean push protection is enabled in the attached configuration. It would not establish whether delegated bypass is enabled, whether delegated bypass has been used, or who can use it unless those fields are added to the proof.
