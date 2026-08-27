# Contributing

This project welcomes contributions. You may open an issue to request a new feature or report a bug. You may also start a Discussion thread to engage other users on a specific topic.

If you would like to propose a feature change, please open an issue first, so that we can discuss it. If you prefer to create a PR directly, it should be narrowly scoped, well tested, well documented, and conform to all existing conventions.

All contributors are expected to have read and agreed with the [Code of Conduct](./CODE_OF_CONDUCT.md).

Thank you for contributing to this project.

## Types of Contributions

Besides contributing targeted bug fixes and enhancements, PolicyChecks is also open to expanding the set of badges that we provide, on condition that doing so (a) does not require any additional permissions beyond repository `Administration: Read`, and (b) the badge status can be reported on the basis of a deterministic query to one or more (preferably one) GitHub REST API endpoints, and that no non-trivial inference is involved in deriving the status from the API. PolicyChecks _reports_ what the GitHub API tells us objectively, and we do not attempt to make any inferences about any repository's settings.

## Repository Policies

Although we do not claim that the PolicyChecks badges pertain to policies that every good OSS project must uphold, we try to keep our own badges green for good measure. This means:

(a) Commits must be signed. If you submit a PR, make sure that you are signing your commits. For more information about commit signing, see the [GitHub documentation on the topic](https://docs.github.com/en/authentication/managing-commit-signature-verification/signing-commits).

(b) All code changes to `main` must come from a Pull Request.

(c) Pull Request titles must follow [conventional commit style](https://www.conventionalcommits.org/en/v1.0.0/#summary). This is enforced in CI. Additionally, the type of the conventional commit prefix determines the release protocol when that PR is merged (major, minor, patch, or no release). That being said, although we strongly encourage contributors to follow conventional commit practices, the release workflow (in our case, Release Please) is sensitive only to the PR title itself, and does not process the prefixes of any of the commits in the PR.

(d) If you open a PR and notice that checks are failing, please review the failing checks and try to determine the root cause, and then resolve it whenever possible.

(e) We currently have a very strong level of test coverage; if your PR introduces new functionality, make sure that you include tests as appropriate, and you should compare coverage before and after your change.

## Local Development

PolicyChecks is a Node.js project. Use Node.js 24 or newer - or simply refer to the `.nvmrc` file.

Install dependencies from the [lockfile](./package-lock.json):

```bash
npm ci
```

Use `npm install` only when intentionally updating dependencies and committing the resulting lockfile change. (Don't mix dependency updates with feature changes unless otherwise necessary.)

Run the development server:

```bash
npm run dev
```

Run the standard verification commands:

```bash
npm run typecheck
npm test
npm run build
```

The full local check used by CI is:

```bash
npm run check
```

`.env.example` contains non-secret local defaults only. Tests do not require GitHub credentials. If authenticated local development is needed, copy `.env.example` to the ignored `.env` file and populate credentials from your own credentials manager. Do not commit credentials.
