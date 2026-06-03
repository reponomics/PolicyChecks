# PolicyChecks

[![Immutable releases](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/immutable-releases.svg)](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/immutable-releases/proof.json) [![SHA pinning](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/sha-pinning-required.svg)](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/sha-pinning-required/proof.json) [![Secret scanning](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/secret-scanning-enabled.svg)](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/secret-scanning-enabled/proof.json) [![Dependabot alerts](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/dependabot-alerts-enabled.svg)](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/dependabot-alerts-enabled/proof.json) [![Dependency graph](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/dependency-graph-enabled.svg)](https://policychecks.reponomics.org/github/reponomics/PolicyChecks/dependency-graph-enabled/proof.json)

PolicyChecks is a GitHub App-backed badge service and validation endpoint for repository settings that ordinary public badge services cannot verify. It exposes badge SVG, Shields-compatible JSON, and proof JSON endpoints for repository administration and security checks. This gives maintainers a convenient way to show that a project not only follows best practices, but that these practices are enforced policies at the repository settings level. This fills a modest gap in the badge ecosystem between excellent services like shields.io (which does not have the permissions to report on these facts) and OSSF Scorecard (which does take into account many of these same conditions, but does not expose individual setting-level endpoints).

| Check              | Claim ID                    | Passing result | Other results               |
| ------------------ | --------------------------- | -------------- | --------------------------- |
| Immutable releases | `immutable-releases`        | `enforced`     | `not enforced` or `unknown` |
| SHA pinning        | `sha-pinning-required`      | `enforced`     | `not enforced` or `unknown` |
| Secret scanning    | `secret-scanning-enabled`   | `enforced`     | `not enforced` or `unknown` |
| Dependabot alerts  | `dependabot-alerts-enabled` | `enforced`     | `not enforced` or `unknown` |
| Dependency graph   | `dependency-graph-enabled`  | `enforced`     | `not enforced` or `unknown` |

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

[![Dependabot alerts](https://policychecks.reponomics.org/github/OWNER/REPO/dependabot-alerts-enabled.svg)](https://policychecks.reponomics.org/github/OWNER/REPO/dependabot-alerts-enabled/proof.json)

[![Dependency graph](https://policychecks.reponomics.org/github/OWNER/REPO/dependency-graph-enabled.svg)](https://policychecks.reponomics.org/github/OWNER/REPO/dependency-graph-enabled/proof.json)
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
> Results are obtained by querying the GitHub API. This is a reliable source - however, results may be cached, temporarily toggled on/off, and as with any badge serivce, the information presented should not be taken as ultimately authoritative, or the basis for any legal claim.

## Permissions

The app requires repository `Administration: Read` permissions for any repository that wants to host a badge. We do not currently support organization-level settings.

## Contributing

Contributor setup and local development commands are documented in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

See [LICENSE](LICENSE)

MIT @ 2026 Reponomics Contributors
