# ADR 0002: Read-Only Policy Surface

## Status

Accepted

## Context

PolicyChecks is a public badge service. The app may need privileged read access to observe repository administration settings, but it should not request permissions that allow it to change those settings.

The product goal for the MVP is deliberately modest: verify a small set of GitHub admin settings that map to clear UI controls and direct repository-scoped API responses.

## Decision

PolicyChecks will not request write-policy permissions for badge evaluation.

The MVP requires repository `Administration: Read` for installed repositories. It does not call organization APIs or repository contents APIs.

The public MVP surface is:

| Product surface | Representative GitHub endpoint | Permission boundary | Product judgment |
| --- | --- | --- | --- |
| Immutable releases | `GET /repos/{owner}/{repo}/immutable-releases` | Repository `Administration: Read` | In MVP. Direct repository endpoint; org-applied policy is reflected with `enforced_by_owner: true`. |
| Actions SHA pinning | `GET /repos/{owner}/{repo}/actions/permissions` | Repository `Administration: Read` | In MVP. Direct repository Actions policy field; org-applied policy is reflected in `sha_pinning_required`. |
| Secret scanning | `GET /repos/{owner}/{repo}` | Repository metadata; `security_and_analysis` visibility depends on GitHub access rules | In MVP. Direct repository metadata field; enforced org code security configuration is reflected in `security_and_analysis.secret_scanning.status` when the field is visible. |
| Secret scanning push protection | `GET /repos/{owner}/{repo}` | Repository metadata; `security_and_analysis` visibility depends on GitHub access rules | In MVP. Direct repository metadata field; enforced org code security configuration is reflected in `security_and_analysis.secret_scanning_push_protection.status` when the field is visible. |

The MVP supports personal or organization-owned repositories, public or private, when the GitHub App is installed on the repository. Private repository badges are an explicit disclosure by the repository owner because the badge and proof endpoints are public.

## Deferred Surfaces

The following remain post-MVP candidates:

| Product surface | Reason for deferral |
| --- | --- |
| Dependabot alerts and security updates | Useful settings, but not needed for the MVP and entangled with dependency graph behavior. |
| Dependency graph | Documentation and product behavior have enough nuance that it is not worth shipping as a first badge. |
| Code security configuration badges | Potentially useful for org policy explanation, but they introduce configuration attachment and enforcement semantics. They are not the primary source for effective secret protection state. |
| Ruleset-derived branch claims | Good future surface, but bypass visibility and rule semantics require separate product treatment. |
| Repository file or workflow inspection | Out of scope for settings badges; would require repository `Contents: Read` for private repositories and moves the product away from checking GitHub admin controls. |

## Current-State Boundary

PolicyChecks reports what GitHub's repository-scoped administration endpoints return at the time of evaluation. It does not claim that the setting was continuously enabled over time, that no authorized administrator could disable it, or that no bypass path exists.

For SHA pinning, existing workflow files may still contain tag-pinned actions. The badge means GitHub currently reports that action references must be full-length SHAs for workflow execution in that repository. Empirical validation showed a tag-pinned action failing during workflow setup after the organization-level setting was enabled.

For immutable releases, empirical validation showed both organization-wide and selected-repository organization policies surfacing through the repository endpoint as `enabled: true` and `enforced_by_owner: true`.

For secret scanning and secret scanning push protection, empirical validation showed repository metadata reflecting both repository-local changes and enforced organization code security configuration. A removed or unenforced code security configuration may still return fields from the configuration endpoint, so the repository metadata endpoint is the primary source for effective secret protection state.

## Consequences

- The production API allowlist remains small.
- MVP badge evaluation uses repository-scoped endpoints only.
- Organization policy can satisfy an MVP badge when the repository endpoint reports the effective setting.
- Organization `Administration: Read` may be introduced later for org-policy explanation, inventory, configuration-specific badges, or if GitHub App installation testing shows it is needed to expose repository security metadata in some org contexts.
- Write-policy permissions remain out of scope.
- Claims that require historical continuity, configured-bypass inspection, or repository contents remain unpublished unless a later ADR changes the product boundary.

## Documentation References

- [Get a repository](https://docs.github.com/en/rest/repos/repos#get-a-repository)
- [Check if immutable releases are enabled for a repository](https://docs.github.com/en/rest/repos/repos#check-if-immutable-releases-are-enabled-for-a-repository)
- [Get GitHub Actions permissions for a repository](https://docs.github.com/en/rest/actions/permissions#get-github-actions-permissions-for-a-repository)
- [Permissions required for GitHub Apps](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps)
