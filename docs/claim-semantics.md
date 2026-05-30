# Claim Semantics

PolicyChecks uses a cautious three-state result model:

- `pass`: GitHub returned a documented response that directly supports the claim.
- `fail`: GitHub returned a documented response that directly contradicts the claim.
- `unknown`: GitHub access, rate limits, response shape, endpoint semantics, or continuity caveats prevent a confident `pass` or `fail`.

`unknown` is not a failure assertion. It means PolicyChecks did not have enough reliable evidence to make the claim either way.

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

## Documentation References

The tables below use these GitHub documentation references as their audit trail:

| Reference | GitHub docs |
| --- | --- |
| `immutable-releases-doc` | [Check if immutable releases are enabled for a repository](https://docs.github.com/en/rest/repos/repos#check-if-immutable-releases-are-enabled-for-a-repository) |
| `actions-permissions-doc` | [Get GitHub Actions permissions for a repository](https://docs.github.com/en/rest/actions/permissions#get-github-actions-permissions-for-a-repository) |
| `branch-rules-doc` | [Get rules for a branch](https://docs.github.com/en/rest/repos/rules#get-rules-for-a-branch) |
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

Claim: the repository's attached code security configuration enables secret scanning.

GitHub endpoint:

```http
GET /repos/{owner}/{repo}/code-security-configuration
```

| GitHub response or value | PolicyChecks status | Proof details | Documentation basis | Judgment |
| --- | --- | --- | --- | --- |
| `200 OK` with `status: attached` and `configuration.secret_scanning: enabled` | `pass` | `status`, selected `configuration` metadata, `secret_scanning` | `code-security-config-doc` documents `200 OK` and example fields including `status`, `configuration`, and `secret_scanning`. | Direct evidence that secret scanning is enabled by the attached configuration. |
| `200 OK` with `status: attached` and `configuration.secret_scanning` as a string other than `enabled` | `fail` | `status`, selected `configuration` metadata, `secret_scanning` | `code-security-config-doc` documents `secret_scanning` as the enablement status field. | Direct evidence from an attached configuration that this field is not enabled. |
| `204 No Content` | `unknown` | `status: no_content`, `configuration: null` | `code-security-config-doc` lists `204 No Content` but does not define it as disabled. | Not safe to assert disabled from no content. |
| `200 OK` with missing or non-`attached` `status` | `unknown` | `status`, selected configuration metadata when present | `code-security-config-doc` example shows `status: attached`; other status semantics are not yet mapped. | Not enough documented evidence for enabled or disabled. |
| `200 OK` with attached status but missing/non-string `configuration.secret_scanning` | `unknown` | selected configuration metadata | `code-security-config-doc` documents a string enablement status field; the returned shape does not match. | The service cannot safely interpret the field. |
| `404 Not Found` | `unknown` | error details | `code-security-config-doc` documents `404` as resource not found, not as disabled. | Not safe to assert disabled from this response. |

## `dependabot-alerts-enabled`

Claim: the repository's attached code security configuration enables Dependabot alerts.

GitHub endpoint:

```http
GET /repos/{owner}/{repo}/code-security-configuration
```

This claim uses the same endpoint and top-level response rules as `secret-scanning-enabled`, but reads `configuration.dependabot_alerts`.

| GitHub response or value | PolicyChecks status | Proof details | Documentation basis | Judgment |
| --- | --- | --- | --- | --- |
| `200 OK` with `status: attached` and `configuration.dependabot_alerts: enabled` | `pass` | `status`, selected `configuration` metadata, `dependabot_alerts` | `code-security-config-doc` documents `dependabot_alerts` as an enablement status field with `enabled`, `disabled`, or `not_set`. | Direct evidence that Dependabot alerts are enabled by the attached configuration. |
| `200 OK` with `status: attached` and `configuration.dependabot_alerts` as a string other than `enabled` | `fail` | `status`, selected `configuration` metadata, `dependabot_alerts` | `code-security-config-doc` documents `dependabot_alerts` as the enablement status field. | Direct evidence from an attached configuration that this field is not enabled. |
| `204 No Content` | `unknown` | `status: no_content`, `configuration: null` | `code-security-config-doc` lists `204 No Content` but does not define it as disabled. | Not safe to assert disabled from no content. |
| `200 OK` with missing or non-`attached` `status` | `unknown` | `status`, selected configuration metadata when present | `code-security-config-doc` example shows `status: attached`; other status semantics are not yet mapped. | Not enough documented evidence for enabled or disabled. |
| `200 OK` with attached status but missing/non-string `configuration.dependabot_alerts` | `unknown` | selected configuration metadata | `code-security-config-doc` documents a string enablement status field; the returned shape does not match. | The service cannot safely interpret the field. |
| `404 Not Found` | `unknown` | error details | `code-security-config-doc` documents `404` as resource not found, not as disabled. | Not safe to assert disabled from this response. |

## `dependency-graph-enabled`

Claim: the repository's attached code security configuration enables the dependency graph.

GitHub endpoint:

```http
GET /repos/{owner}/{repo}/code-security-configuration
```

This claim uses the same endpoint and top-level response rules as `secret-scanning-enabled`, but reads `configuration.dependency_graph`.

| GitHub response or value | PolicyChecks status | Proof details | Documentation basis | Judgment |
| --- | --- | --- | --- | --- |
| `200 OK` with `status: attached` and `configuration.dependency_graph: enabled` | `pass` | `status`, selected `configuration` metadata, `dependency_graph` | `code-security-config-doc` documents `dependency_graph` as an enablement status field with `enabled`, `disabled`, or `not_set`. | Direct evidence that the dependency graph is enabled by the attached configuration. |
| `200 OK` with `status: attached` and `configuration.dependency_graph` as a string other than `enabled` | `fail` | `status`, selected `configuration` metadata, `dependency_graph` | `code-security-config-doc` documents `dependency_graph` as the enablement status field. | Direct evidence from an attached configuration that this field is not enabled. |
| `204 No Content` | `unknown` | `status: no_content`, `configuration: null` | `code-security-config-doc` lists `204 No Content` but does not define it as disabled. | Not safe to assert disabled from no content. |
| `200 OK` with missing or non-`attached` `status` | `unknown` | `status`, selected configuration metadata when present | `code-security-config-doc` example shows `status: attached`; other status semantics are not yet mapped. | Not enough documented evidence for enabled or disabled. |
| `200 OK` with attached status but missing/non-string `configuration.dependency_graph` | `unknown` | selected configuration metadata | `code-security-config-doc` documents a string enablement status field; the returned shape does not match. | The service cannot safely interpret the field. |
| `404 Not Found` | `unknown` | error details | `code-security-config-doc` documents `404` as resource not found, not as disabled. | Not safe to assert disabled from this response. |

## Adding A New Claim

Before adding a new public badge, document:

1. The GitHub endpoint and required permissions.
2. The documented HTTP status codes.
3. The exact fields used from successful responses.
4. Which responses produce `pass`, `fail`, and `unknown`.
5. Why any `fail` state is safe to assert.
6. Known caveats, such as bypass actors, inherited settings, organization policy, or unavailable continuity data.

## Unsupported Claim Semantics

Some repository settings require additional context before PolicyChecks can assign an unqualified `pass` or `fail` result. Ruleset-derived checks are the main example: GitHub can report that a rule applies to a branch, but bypass actors and exemption paths affect whether that rule is enforceable in practice. PolicyChecks does not publish ruleset-enforcement claims unless the proof can also account for those bypass conditions.

#### `signed-commits-required`

Status: not published because this claim is ruleset-derived and bypass status is not represented in the proof.

Claim: active rules for the default branch require signed commits.

GitHub endpoints:

```http
GET /repos/{owner}/{repo}
GET /repos/{owner}/{repo}/rules/branches/{branch}
```

| GitHub response or value | PolicyChecks status | Proof details | Documentation basis | Judgment |
| --- | --- | --- | --- | --- |
| Repository metadata includes a default branch, and branch rules response is an array containing `type: required_signatures` | `pass` | `branch`, `matching_rule_types` | `branch-rules-doc` documents that the endpoint returns all active rules applying to the branch. | Direct evidence that an active signed-commit rule applies to the default branch. |
| Repository metadata includes a default branch, and branch rules response is an array without `type: required_signatures` | `fail` | `branch`, `matching_rule_types` | `branch-rules-doc` documents that all active applicable rules are returned and `evaluate`/`disabled` rulesets are excluded. | Safe to say no active applicable signed-commit rule was returned for the default branch. |
| Repository metadata has no usable default branch | `unknown` | `branch: null`, `matching_rule_types: []` | Repository metadata did not provide the branch needed to call `branch-rules-doc` endpoint. | The service does not know which branch to evaluate. |
| Branch rules response is not an array | `unknown` | error details | `branch-rules-doc` documents an array response. | The service cannot safely interpret the response. |
| Any `404` from repository metadata or branch rules | `unknown` | error details | `branch-rules-doc` does not document `404` as a disabled/not-required setting value. | Not safe to assert disabled from this response. |

Caveat: this claim is ruleset-derived. It says GitHub returned an active applicable `required_signatures` rule for the default branch. It does not yet prove that no bypass actors or exemption paths exist.

#### `secret-scanning-push-protection-enabled`

Status: not published because delegated bypass status is not represented in the proof.

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

Bypass caveat: a `pass` result for this unpublished claim would mean push protection is enabled in the attached configuration. It would not establish whether delegated bypass is enabled or who can use it. PolicyChecks does not expose this claim while delegated bypass status is absent from the proof.
