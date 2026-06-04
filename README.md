# PolicyChecks

[![Immutable releases](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/immutable-releases.svg)](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/immutable-releases/proof.json) [![SHA pinning](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/sha-pinning-required.svg)](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/sha-pinning-required/proof.json) [![Secret scanning](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/secret-scanning-enabled.svg)](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/secret-scanning-enabled/proof.json) [![Secret push protection](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/secret-push-protection-enabled.svg)](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/secret-push-protection-enabled/proof.json)

PolicyChecks is a GitHub App-backed badge service and validation endpoint for repository settings that ordinary public badge services cannot verify. It exposes badge SVG, Shields-compatible JSON, and proof JSON endpoints for repository administration and security settings that map to clear admin UI controls and direct GitHub REST API responses. This gives maintainers a convenient way to show that a project not only follows best practices, but that these practices are backed by administrative policies at the repository settings level. This fills a modest gap in the badge ecosystem between excellent services like shields.io (which does not have the permissions to report on these facts) and OSSF Scorecard (which does take into account many of these same conditions, but does not expose individual setting-level endpoints).

The current product surface is intentionally narrow, and is constrained by the goals of minimizing requested permissions, and leveraging clear signals provided by the GitHub API: it checks four effective repository settings. A setting may be configured directly at the repository level, or inherited from an organization policy or security configuration.

| Check | Claim ID | Passing result | Other results |
| --- | --- | --- | --- |
| Immutable releases | `immutable-releases` | `enabled` | `disabled` or `unknown` |
| SHA pinning | `sha-pinning-required` | `enabled` | `disabled` or `unknown` |
| Secret scanning | `secret-scanning-enabled` | `enabled` | `disabled` or `unknown` |
| Secret push protection | `secret-push-protection-enabled` | `enabled` | `disabled` or `unknown` |

Unlike OSSF Scorecard, PolicyChecks does not intend to provide any in-depth proof or evaluation regarding a repository's overall stance regarding security or best practices - it simply reports on the current state of an admin setting. It does not claim historical continuity, or prove that a privileged administrator could never change a setting. In that sense, it does not attempt to serve as a security audit - rather, it's more like: Shields.io with minimally elevated (read-only) permissions.

## Endpoints

Each claim supports the same endpoint shape:

```text
GET /github/{owner}/{repo}/{claim}.svg
GET /github/{owner}/{repo}/{claim}.json
GET /github/{owner}/{repo}/{claim}/proof.json
GET /github/{owner}/{repo}/info.json
```

Use the SVG endpoint for badges, the Shields-compatible JSON endpoint for badge tooling, and the proof endpoint for the underlying PolicyChecks result. README badges can link directly to their proof JSON:

```markdown
[![Immutable releases](https://policychecks.reponomics.org/github/OWNER/REPO/immutable-releases.svg)](https://policychecks.reponomics.org/github/OWNER/REPO/immutable-releases/proof.json)

[![SHA pinning](https://policychecks.reponomics.org/github/OWNER/REPO/sha-pinning-required.svg)](https://policychecks.reponomics.org/github/OWNER/REPO/sha-pinning-required/proof.json)

[![Secret scanning](https://policychecks.reponomics.org/github/OWNER/REPO/secret-scanning-enabled.svg)](https://policychecks.reponomics.org/github/OWNER/REPO/secret-scanning-enabled/proof.json)

[![Secret push protection](https://policychecks.reponomics.org/github/OWNER/REPO/secret-push-protection-enabled.svg)](https://policychecks.reponomics.org/github/OWNER/REPO/secret-push-protection-enabled/proof.json)
```

The aggregate endpoint returns all currently supported claims for a repository:

```text
https://policychecks.reponomics.org/github/OWNER/REPO/info.json
```

## Results

Results use only `pass`, `fail`, and `unknown`.

`unknown` is returned when PolicyChecks cannot safely interpret GitHub access, rate limits, availability, response shape, or endpoint semantics as either passing or failing evidence.

Detailed per-claim response mappings are documented in [`docs/claim-semantics.md`](docs/claim-semantics.md).

<!-- prettier-ignore -->
> [!NOTE]
> PolicyChecks badges are public signals backed by proof JSON. Like any README badge, the image can be copied or misrepresented; the useful check is following the proof link and reviewing the current GitHub API evidence.

## Permissions

The app requires repository `Administration: Read` permissions for each repository that wants to host a badge. The MVP supports personal or organization-owned repositories, public or private, when the GitHub App is installed on the repository. The MVP does not call organization APIs or read repository contents; if GitHub withholds a repository metadata field for the installed app, PolicyChecks reports `unknown`.

## Contributing

Contributor setup and local development commands are documented in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

See [LICENSE](LICENSE)

MIT @ 2026 Reponomics Contributors
