<picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/banner-dark-1.png">
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/banner-light-1.png">
    <img alt="PolicyChecks Banner" src="docs/assets/banner-light-1.png" width="100%">
</picture>

<!-- prettier-ignore-start -->
[![Immutable releases](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/immutable-releases.svg)](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/immutable-releases/details.json)
[![SHA pinning](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/sha-pinning-required.svg)](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/sha-pinning-required/details.json)
[![Web signoff](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/web-commit-signoff-required.svg)](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/web-commit-signoff-required/details.json)
[![Community health](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/community-health.svg)](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/community-health/details.json)
[![Secret scanning](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/secret-scanning-enabled.svg)](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/secret-scanning-enabled/details.json)
[![Secret push protection](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/secret-push-protection-enabled.svg)](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/secret-push-protection-enabled/details.json)
[![Force pushes blocked](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/default-branch-force-pushes-blocked.svg)](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/default-branch-force-pushes-blocked/details.json)
[![Signed commits](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/default-branch-signed-commits-required.svg)](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/default-branch-signed-commits-required/details.json)
[![Linear history](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/default-branch-linear-history-required.svg)](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/default-branch-linear-history-required/details.json)
[![Deletion blocked](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/default-branch-deletion-blocked.svg)](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/default-branch-deletion-blocked/details.json)
[![Pull request required](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/default-branch-pull-request-required.svg)](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/default-branch-pull-request-required/details.json)
[![Status checks](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/default-branch-status-checks-required.svg)](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/default-branch-status-checks-required/details.json)
<!-- prettier-ignore-end -->

PolicyChecks is a badge service and validation endpoint that checks the current status of a repository's administrative settings, giving maintainers a convenient way to show that OSS best practices are a matter of policy.

## How it Works

PolicyChecks uses a GitHub app that requests repository `Administration: Read` permissions so that it can query the GitHub REST API for information about repo settings that public badge services are otherwise unable to provide.

For example, in its documentation about the [secure use](https://docs.github.com/en/actions/reference/security/secure-use#using-third-party-actions) of GitHub Actions, GitHub recommends pinning actions to a full-length commit SHA. Administrators of repositories and organizations are able to configure repositories so that full-SHA-pinned actions are required (when enabled, workflows with actions that do not satisfy this criterion will fail). By installing PolicyChecks, a repo can display a badge that shows whether that setting is enabled or not.

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/full-sha-pinned-setting-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/full-sha-pinned-setting-light.png">
    <img alt="PolicyChecks Banner" src="docs/assets/full-sha-pinned-setting-light.png" width="100%">
</picture>

<div align="center"><picture><img src="docs/assets/SHA-pinning-enabled.png" /></picture></div>

## PolicyChecks Badges

The following table describes the set of badges that PolicyChecks currently supports. PolicyChecks queries repository-based API endpoints. Some of the settings reported on have their own unique endpoint; some are included in responses returned by a general `repos/OWNER/REPO` endpoint; others are included on the basis of `branch ruleset` endpoints evaluated relative to the default branch; and, for good measure, we also include the response from GitHub's public community profile health score endpoint (`repos/OWNER/REPO/community/profile`). Although we only request _repository_ `Administration: Read` permission, and query repository endpoints, our internal probes indicate that the repository endpoints queried will return positive results for settings that are enabled at the _organization_ level as well, so long as they are configured by the organization to apply to the repository. Note that for any ruleset-based settings, or those that pertain to a specific _ref_, PolicyChecks evaluates the setting with respect to the repository's default branch.

If the GitHub API provides an endpoint that reliably tracks a specific repo setting, and the response from that API contains a field that clearly establishes whether a given setting is enabled or disabled, then when the PolicyChecks service identifies a positive response, the badge will indicate that the setting is `enabled`. If a response clearly indicates that a particular setting is _not_ enabled for that setting and repository, the badge will show `disabled`. If it receives any other response, including authorization failure, general API request failure, rate-limit throttling, or if the response is in any way ambiguous, the badge will instead simply show `unknown`. Similar rules are applied when reporting on the repository's community health profile score, except instead of `enabled`/`disabled`, a non-`unknown` response will be a percentage expressed as a fraction, in the following shape: `NN / 100`.

| Check | Repo Setting Description | API endpoint |
| --- | --- | --- |
| Immutable releases | Disallow assets and tags from being modified once a release is published | `/repos/{owner}/{repo}/immutable-releases` |
| SHA pinning | Require actions to be pinned to a full-length commit SHA | `/repos/{owner}/{repo}/actions/permissions` |
| Web signoff | Require contributors to sign off on web-based commits | `/repos/{owner}/{repo}` |
| Secret scanning | Get notified when a secret is pushed to a repository | `/repos/{owner}/{repo}` |
| Secret push protection | Block commits that contain supported secrets | `/repos/{owner}/{repo}` |
| Force pushes blocked | Prevent users with push access from force pushing to refs | `/repos/{owner}/{repo}/rules/branches/{branch}` |
| Signed commits | Commits pushed to matching refs must have verified signatures | `/repos/{owner}/{repo}/rules/branches/{branch}` |
| Linear history | Prevent merge commits from being pushed to matching refs | `/repos/{owner}/{repo}/rules/branches/{branch}` |
| Deletion blocked | Only allow users with bypass permissions to delete matching refs | `/repos/{owner}/{repo}/rules/branches/{branch}` |
| Pull request required | Require all commits to be made to a non-target branch and submitted via a pull request before they can be merged | `/repos/{owner}/{repo}/rules/branches/{branch}` |
| Status checks | Require status checks to pass before the default branch is updated | `/repos/{owner}/{repo}/rules/branches/{branch}` |
| Community health | A percentage of how many of GitHub's recommended community health files are present | `/repos/{owner}/{repo}/community/profile` |

## Endpoints

Each supported badge has a stable badge ID, such as `sha-pinning-required` or `community-health`, and supports the same endpoint shape:

```text
GET /github/{owner}/{repo}/{badge-id}.svg  # Returns an SVG badge with status `enabled`, `disabled`, or `unknown`
GET /github/{owner}/{repo}/{badge-id}.json  # Returns a Shields-compatible JSON result for use in custom badge tooling
GET /github/{owner}/{repo}/{badge-id}/details.json  # Returns the PolicyChecks evaluation record and selected response-derived details
GET /github/{owner}/{repo}/info.json  # A general JSON response that provides collective information about multiple different settings
```

Use the SVG endpoint for badges, the Shields-compatible JSON endpoint for badge tooling, and the details endpoint for the underlying PolicyChecks evaluation record. Details JSON identifies the badge as `badgeId` and omits internal classification fields. README badges can link directly to their details JSON:

```markdown
[![Immutable releases](https://policychecks.reponomics.org/github/OWNER/REPO/immutable-releases.svg)](https://policychecks.reponomics.org/github/OWNER/REPO/immutable-releases/details.json)
```

<details>
<summary><h3>More examples</h3></summary>

```markdown
[![SHA pinning](https://policychecks.reponomics.org/github/OWNER/REPO/sha-pinning-required.svg)](https://policychecks.reponomics.org/github/OWNER/REPO/sha-pinning-required/details.json)

[![Web signoff](https://policychecks.reponomics.org/github/OWNER/REPO/web-commit-signoff-required.svg)](https://policychecks.reponomics.org/github/OWNER/REPO/web-commit-signoff-required/details.json)

[![Community health](https://policychecks.reponomics.org/github/OWNER/REPO/community-health.svg)](https://policychecks.reponomics.org/github/OWNER/REPO/community-health/details.json)

[![Secret scanning](https://policychecks.reponomics.org/github/OWNER/REPO/secret-scanning-enabled.svg)](https://policychecks.reponomics.org/github/OWNER/REPO/secret-scanning-enabled/details.json)

[![Secret push protection](https://policychecks.reponomics.org/github/OWNER/REPO/secret-push-protection-enabled.svg)](https://policychecks.reponomics.org/github/OWNER/REPO/secret-push-protection-enabled/details.json)

[![Force pushes blocked](https://policychecks.reponomics.org/github/OWNER/REPO/default-branch-force-pushes-blocked.svg)](https://policychecks.reponomics.org/github/OWNER/REPO/default-branch-force-pushes-blocked/details.json)

[![Signed commits](https://policychecks.reponomics.org/github/OWNER/REPO/default-branch-signed-commits-required.svg)](https://policychecks.reponomics.org/github/OWNER/REPO/default-branch-signed-commits-required/details.json)

[![Linear history](https://policychecks.reponomics.org/github/OWNER/REPO/default-branch-linear-history-required.svg)](https://policychecks.reponomics.org/github/OWNER/REPO/default-branch-linear-history-required/details.json)

[![Deletion blocked](https://policychecks.reponomics.org/github/OWNER/REPO/default-branch-deletion-blocked.svg)](https://policychecks.reponomics.org/github/OWNER/REPO/default-branch-deletion-blocked/details.json)

[![Pull request required](https://policychecks.reponomics.org/github/OWNER/REPO/default-branch-pull-request-required.svg)](https://policychecks.reponomics.org/github/OWNER/REPO/default-branch-pull-request-required/details.json)

[![Status checks](https://policychecks.reponomics.org/github/OWNER/REPO/default-branch-status-checks-required.svg)](https://policychecks.reponomics.org/github/OWNER/REPO/default-branch-status-checks-required/details.json)
```

</details>

The aggregate endpoint returns all currently supported badge results for a repository:

```text
https://policychecks.reponomics.org/github/OWNER/REPO/info.json
```

## Why Another Badge Service?

While trusted services, such as [OSSF Scorecard](https://github.com/ossf/scorecard-action), provide reliable ways to verify that a repository is only using full-SHA-pinned actions, and maintainers can proudly display an OSSF Scorecard badge demonstrating their compliance with the high standards set by the [Open Source Security Foundation](https://openssf.org/), they do not provide badges that represent _specific_ best practices, such as the one mentioned above.

At the same time, while other invaluable services like [Shields.io](https://github.com/badges/shields) offer a wide range of badges that report information that is critical to understanding the maintenance health and security posture of a GitHub repository, they are limited to providing GitHub data that is publicly accessible.

By installing the PolicyChecks app, and granting it read-only permissions to repository administration data, PolicyChecks is able to fill a modest gap in the badge ecosystem by querying GitHub API endpoints that require repository `Administration: Read` permissions, and then providing an endpoint that serves badges for specific administrative settings.

## A Window Into the Current State of a Repository's Settings

PolicyChecks can be thought of as nothing more, and nothing less, than a transparent window into the _current_ status of selective repository settings. It does not offer a detailed security audit of any kind; it does not check whether the relevant settings have been applied consistently in the past; it does not even report whether the codebase as a whole currently conforms to the requirements that the settings are meant to enforce. For instance, a repository could include workflow actions that are not pinned to full-length commit SHAs, and still show a PolicyChecks badge showing that the `SHA-pinning` setting is enabled (since the actions could very well have been added while the setting was _not_ enabled) - that's because the badge service does not analyze the codebase, but merely reports on the status of specific settings, as reported by the GitHub API, at the time of evaluation - and those settings themselves provide no information about the codebase either.

Inversely, a repository could follow strict adherence to SHA-pinned actions in their codebase - but unless that checkbox is enabled in the admin settings page, PolicyChecks will report that that policy setting is currently `disabled`. This is a crucial difference between PolicyChecks and a service like OSSF Scorecard - the latter is a far more rigorous and in-depth source of information for things relating to supply-chain security, because it _does_ actually read and report on the workflow files themselves. (The Scorecard API even provides detailed information about each of the criteria that it uses to evaluate a repository when assigning a score - including, for example, whether or not that repository's workflow files use SHA-pinned actions. The difference is: (i) Scorecard does not expose the data that their JSON endpoint reports in an individual-check-level badge-friendly way; (ii) Scorecard reports on the repository's _actual_ codebase and CI/CD practices, regardless of whether those practices are backed by administrative settings.)

## What PolicyChecks _Is_ - And What It Is _Not_

These explanations are only intended to make clear to potential users exactly what PolicyChecks is, and what it does and does not establish. Although Reponomics may refer to some of these settings as enforcing _best practices_, PolicyChecks does not take any strong stance on whether a particular setting is any sort of requirement or expectation for the reliability or trustworthiness of a particular software project.

Nevertheless, maintainers often go to great lengths to ensure that their repositories meet the highest standards of excellence and security. And while enabling a checkbox does not _in itself_ establish that those standards have been followed over the lifetime of a project, they still represent a strong commitment on behalf of repository and organization administrators. So, since making such a commitment is something that a maintainer ought to feel proud of, PolicyChecks is simply a way to provide a public signal of that commitment - nothing more, and nothing less.

## Permissions

The app requires repository `Administration: Read` permissions for each repository that hosts a badge. It supports personal or organization-owned repositories, public or private, as long as the GitHub App is installed on the repository. PolicyChecks does not call organization APIs or fetch repository file contents; the community health badge uses GitHub's community profile metric. If the GitHub API is inconclusive, PolicyChecks does not make any effort to infer whether the setting holds or not via some other indirect means - it simply reports the data as it is provided by the GitHub REST API. This is to emphasize that the primary intention of PolicyChecks is _not_ to make any substantive statement about a repository or its codebase, beyond the current status of its _settings_.

## Documentation References

| Reference | GitHub docs |
| --- | --- |
| `repository-doc` | [Get a repository](https://docs.github.com/en/rest/repos/repos#get-a-repository) |
| `immutable-releases-doc` | [Check if immutable releases are enabled for a repository](https://docs.github.com/en/rest/repos/repos#check-if-immutable-releases-are-enabled-for-a-repository) |
| `actions-permissions-doc` | [Get GitHub Actions permissions for a repository](https://docs.github.com/en/rest/actions/permissions#get-github-actions-permissions-for-a-repository) |
| `branch-rules-doc` | [Get rules for a branch](https://docs.github.com/en/rest/repos/rules#get-rules-for-a-branch) |

## Limitations

As described above, a repository setting is not the same thing as a security audit, or even a guarantee of compliance, historically speaking. Rather, settings enforce compliance with certain policies _so long as that setting is enabled_. This comes with a few caveats worth noting:

(i) Repository and organization administrators who are able to modify these settings may do so at any time without PolicyChecks "knowing" anything about it; we do not attempt to report on historical continuity, so a setting that prohibits force-pushing could simply be temporarily disabled whenever an admin wished to make a force-push to the main branch;

(ii) Even without any such "trickery", ruleset-based settings allow for certain users or roles to be granted bypass permissions (these are known as bypass actors). PolicyChecks does not take bypass actors into account when deciding whether a setting is enabled or disabled; this is for two reasons: (a) confident statements about the presence or absence of bypass actors generally require more elevated permissions than `Administration: Read` (such as `Administration: Write`), and our current policy is to limit ourselves to this particular scope alone; (b) since we do not make any attempt to track the status of settings over time, those who have the required permissions may at any time temporarily add themselves as bypass actors - so, without historical continuity checks, or the ability to access organization audit logs, any attempt to make decisions on the basis of the presence of absence of bypass actors would be extremely misleading and fraught.

in that sense, unless PolicyChecks were granted very broad access to a repository or organization's entire administrative apparatus, such as the ability to monitor the audit log, any attempt to take designated bypass actors into account when reading the API response about a ruleset, would be extremely misleading and fraught.

(iii) We do not make any attempt to evaluate classic branch protection rules. Although this may unfortunately exclude coverage for a certain class of users, this is due to GitHub's recommendations to use rulesets, as opposed to classic branch protection rules, going forward.

## Contributing

Reponomics gladly invites contributors to this project. Contributor setup and local development commands are documented in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

See [LICENSE](LICENSE)

MIT @ 2026 Reponomics Contributors
