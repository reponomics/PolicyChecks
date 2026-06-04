# PolicyChecks

[![Immutable releases](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/immutable-releases.svg)](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/immutable-releases/proof.json) [![SHA pinning](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/sha-pinning-required.svg)](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/sha-pinning-required/proof.json) [![Secret scanning](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/secret-scanning-enabled.svg)](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/secret-scanning-enabled/proof.json) [![Secret push protection](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/secret-push-protection-enabled.svg)](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/secret-push-protection-enabled/proof.json)

PolicyChecks is a GitHub App-backed badge service for repository administration settings that ordinary public badge services cannot verify. It exposes badge SVG, Shields-compatible JSON, and proof JSON endpoints for a small set of GitHub settings that map to clear admin UI controls and direct GitHub REST API responses.

The MVP is intentionally narrow: it checks four effective repository settings. A setting may be configured directly on the repository or inherited from an organization policy, as long as the repository-scoped GitHub API reports the effective value for the installed repository.

| Check | Claim ID | Passing result | Other results |
| --- | --- | --- | --- |
| Immutable releases | `immutable-releases` | `enabled` | `disabled` or `unknown` |
| SHA pinning | `sha-pinning-required` | `required` | `not required` or `unknown` |
| Secret scanning | `secret-scanning-enabled` | `enabled` | `disabled` or `unknown` |
| Secret push protection | `secret-push-protection-enabled` | `enabled` | `disabled` or `unknown` |

PolicyChecks is a current-state settings badge, not an audit report. It does not claim historical continuity, scan workflow files, inspect repository contents, or prove that a privileged administrator could never change a setting. For example, `sha-pinning-required` reports whether GitHub currently says workflow runs in the repository require actions to be pinned to full-length commit SHAs.

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
