# Ruleset Branch Badges Milestone

## Purpose

This milestone expands PolicyChecks beyond the initial four repository-setting badges while keeping the product boundary narrow: publish lightweight public badges for clear GitHub settings that map to direct API evidence.

The milestone focuses on active GitHub rulesets that apply to a repository's default branch. It does not attempt to audit branch policy comprehensively, inspect workflow files, evaluate historical continuity, or prove that privileged administrators cannot later change a setting.

## Candidate Badges

The initial targeted ruleset badge set was:

| Product surface | Claim ID | Badge label | Passing result | GitHub rule type |
| --- | --- | --- | --- | --- |
| Force pushes are blocked on the default branch by an active ruleset | `default-branch-force-pushes-blocked` | `force pushes blocked` | `enabled` | `non_fast_forward` |
| Signed commits are required on the default branch by an active ruleset | `default-branch-signed-commits-required` | `signed commits` | `enabled` | `required_signatures` |
| Linear history is required on the default branch by an active ruleset | `default-branch-linear-history-required` | `linear history` | `enabled` | `required_linear_history` |

After validating the first deployed badge against a live repository ruleset, the same rule-type-only pattern was extended to the other simple active rules observed from the repository endpoint:

| Product surface | Claim ID | Badge label | Passing result | GitHub rule type |
| --- | --- | --- | --- | --- |
| Default branch deletion is blocked by an active ruleset | `default-branch-deletion-blocked` | `deletion blocked` | `enabled` | `deletion` |
| Pull requests are required for the default branch by an active ruleset | `default-branch-pull-request-required` | `pull request required` | `enabled` | `pull_request` |
| Status checks are required for the default branch by an active ruleset | `default-branch-status-checks-required` | `status checks` | `enabled` | `required_status_checks` |

All ruleset badges should use the existing result vocabulary:

- `enabled`: GitHub returned an active matching ruleset rule for the repository's default branch.
- `disabled`: GitHub returned active ruleset evidence for the default branch, but no matching rule was present.
- `unknown`: GitHub access, rate limits, missing default-branch metadata, response shape, or endpoint semantics prevent a confident result.

This keeps badge output consistent with the MVP badges. The labels carry the setting noun, while `enabled` means "the corresponding required-or-blocked setting is switched on." For example, `immutable releases | enabled` and `signed commits | enabled` are semantically compact rather than exhaustive, but the proof endpoint supplies the exact GitHub evidence.

## Evidence Source

Use the repository-scoped effective branch-rules endpoint:

```http
GET /repos/{owner}/{repo}/rules/branches/{branch}
```

The implementation should resolve `{branch}` from the repository's `default_branch` returned by:

```http
GET /repos/{owner}/{repo}
```

The rules endpoint is preferable to listing repository or organization rulesets because it returns active rules that currently apply to a specific branch. It can include rules inherited from organization-level rulesets without requiring PolicyChecks to call organization ruleset APIs.

Documented references:

- [Get a repository](https://docs.github.com/en/rest/repos/repos#get-a-repository)
- [Get rules for a branch](https://docs.github.com/en/rest/repos/rules#get-rules-for-a-branch)
- [Repository ruleset rule types](https://docs.github.com/en/rest/repos/rules#create-a-repository-ruleset)

## Permission Boundary

This milestone should not require write permissions.

Expected GitHub App permission posture:

- Repository `Administration: Read` remains sufficient for the existing app posture.
- The rules-for-branch endpoint is repository-scoped and documented as requiring repository metadata read access for fine-grained tokens.
- Organization `Administration: Read` should not be required for these badges, because the repository-scoped endpoint reports the rules that apply to the branch.
- Repository `Contents: Read` should not be required.

If empirical installation testing shows that organization-owned private repositories require additional read permissions to expose inherited organization rules through the repository endpoint, document that as a blocker before expanding app permissions.

## Non-Goals

This milestone intentionally does not evaluate:

- Classic branch protection rules.
- Ruleset bypass actors.
- Disabled or evaluate-mode rulesets.
- Required status checks.
- Whether status checks are up to date before merge.
- Merge queue, deployments, code scanning merge protection, or pull-request review policy.
- Repository contents, workflow files, generated artifacts, or audit logs.

Classic branch protection remains a possible later compatibility surface. If added, it should either be published as separate classic-branch-protection claims or folded into explicitly broader "effective branch policy" claims with proof details for both sources.

Bypass actors should not affect pass or fail. PolicyChecks already reports current settings rather than immutable guarantees; a repository administrator can change most settings regardless of whether a ruleset has explicit bypass actors. Proof JSON may note that bypass actors were not evaluated.

## Claim Semantics

For each claim:

| GitHub response or value | PolicyChecks status | Judgment |
| --- | --- | --- |
| `200 OK` with a matching active rule type | `pass` | Direct evidence that the ruleset setting is enabled for the default branch. |
| `200 OK` with a valid active-rules response but no matching rule type | `fail` | Direct evidence that this ruleset setting is not enabled for the default branch. |
| Missing or empty `default_branch` | `unknown` | The service cannot select the branch whose policy should be checked. |
| Missing, non-array, or undocumented rules response shape | `unknown` | The service cannot safely interpret the response. |
| `401`, `403`, rate-limit, secondary-rate-limit, `5xx`, or request failure | `unknown` | Transport or authorization failure is not evidence that the setting is disabled. |
| `404 Not Found` | `unknown` | Not safe to assert disabled; the branch, repository, installation, endpoint, or permission may be unavailable. |

Proof details should include:

- The default branch evaluated.
- The endpoint template.
- The matching rule type.
- The matching rule objects or a compact selected subset of each matching rule.
- The set of active rule types observed for the branch.
- A limitation that classic branch protection and bypass actors were not evaluated.

## Implementation Plan

1. Extend the GitHub client with `getBranchRules(owner, repo, branch)` for `GET /repos/{owner}/{repo}/rules/branches/{branch}`.
2. Extend the memoized client used by aggregate evaluation so all three ruleset claims share one branch-rules request.
3. Add a ruleset-branch helper that:
   - reads `default_branch` from `getRepository`;
   - returns `unknown` if the default branch is absent or not a usable string;
   - fetches branch rules once;
   - validates the response as an array;
   - extracts rule `type` values.
4. Add three claim definitions with shared evaluation logic and distinct rule types.
5. Register the three claim definitions after the MVP claims.
6. Update the GitHub API allowlist test to include `GET /repos/{owner}/{repo}/rules/branches/{branch}`.
7. Add focused unit tests for pass, fail, unknown default branch, unexpected response shape, GitHub errors, and shared aggregate memoization.
8. Update `docs/claim-semantics.md` with final per-claim semantics once the response shape is confirmed against live GitHub repositories.
9. Update `README.md` only when the badges are implemented and ready to publish.

## Open Validation Items

Before shipping, validate against live repositories:

- A repository-level ruleset requiring each target rule type.
- An organization-level ruleset applying to a selected repository.
- An organization-level ruleset applying to all repositories.
- A disabled or evaluate-mode ruleset, confirming it does not appear as active enforcement.
- A repository that uses only classic branch protection, confirming the ruleset badge remains disabled according to the documented ruleset-only semantics when GitHub returns a valid active-rules response with no matching rule.
