# Contributing

This project welcomes contributions. You may open an issue to request a new feature or report a bug. You may also start a Discussion thread to engage other users on a specific topic.

If you would like to propose a feature change, please open an issue first, so that we can discuss it. If you prefer to create a PR directly, it should be narrowly scoped, well tested, well documented, and conform to all existing conventions.

All contributors are expected to have read and agreed with the [Code of Conduct](./CODE_OF_CONDUCT.md).

Thank you for contributing to this project.

## Local Development

PolicyChecks is a Node.js project. Use Node.js 24 or newer.

Install dependencies from the lockfile:

```bash
npm ci
```

Use `npm install` only when intentionally updating dependencies and committing the resulting lockfile change.

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
