# Claim Semantics

PolicyChecks uses a cautious three-state result model:

- `pass`: GitHub returned a documented repository-scoped response showing that the checked setting is on.
- `fail`: GitHub returned a documented repository-scoped response showing that the checked setting is off.
- `unknown`: GitHub access, rate limits, response shape, or endpoint semantics prevent a confident current-state `pass` or `fail`.

`unknown` is not a failure assertion. It means PolicyChecks did not have enough reliable evidence to make the claim either way.

The MVP reports effective repository settings. A setting may be configured directly on the repository or inherited from an organization policy, as long as the repository-scoped GitHub API returns the effective value for the installed repository.

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

Every proof response also includes an `evidence` object. For the MVP badges, `evidence.source` is `repository_setting` because both supported claims are evaluated from repository-scoped GitHub REST endpoints.

## Documentation References

| Reference | GitHub docs |
| --- | --- |
| `immutable-releases-doc` | [Check if immutable releases are enabled for a repository](https://docs.github.com/en/rest/repos/repos#check-if-immutable-releases-are-enabled-for-a-repository) |
| `actions-permissions-doc` | [Get GitHub Actions permissions for a repository](https://docs.github.com/en/rest/actions/permissions#get-github-actions-permissions-for-a-repository) |

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

## Adding A New Claim

Before adding a new public badge, document:

1. The GitHub endpoint and required permissions.
2. The documented HTTP status codes.
3. The exact fields used from successful responses.
4. Which responses produce `pass`, `fail`, and `unknown`.
5. Why any `fail` state is safe to assert.
6. Whether repository-scoped responses include inherited organization policy.

Post-MVP candidates include security feature settings, Dependabot settings, code security configurations, and ruleset-derived branch policy badges. They should remain unpublished until their API evidence maps cleanly to an intuitive admin setting without requiring file inspection, contents access, historical audit logs, or unsupported judgment calls.
