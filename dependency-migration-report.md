# Dependency migration report

Date: 2026-07-29

## Scope

This change consolidates open Dependabot pull requests #56 through #65 into one dependency update and advances packages to the current compatible versions available at validation time.

## Changes

- Updated `@types/node` from 26.1.0 to 26.1.2.
- Updated `@types/supertest` from 7.2.0 to 7.2.1.
- Updated Prettier from 3.9.4 to 3.9.6.
- Updated TSX from 4.23.0 to 4.23.1.
- Updated TypeScript from 6.0.3 to 7.0.2.
- Updated Wrangler from 4.108.0 to 4.115.0, including Sharp 0.35.2 and the associated Cloudflare toolchain updates.
- Updated the lockfile's PostCSS and Nano ID versions to resolve the remaining high-severity npm audit advisory.
- Updated the full-SHA-pinned GitHub Actions represented by Dependabot PRs #56, #62, #63, and #65.
- Configured weekly Dependabot groups for npm production, npm development, GitHub Actions, and security updates while leaving major upgrades isolated.

## Validation

- `npm ci`
- `npm ls --depth=0`
- `npm run check` (format, typecheck, 19 test files and 176 tests)
- `npm run coverage -- --coverage.reporter=text --coverage.reporter=html --coverage.reporter=lcov --coverage.reporter=json-summary --coverage.reporter=cobertura` (98.74% statements, 97% branches, 97.71% functions, 98.88% lines)
- `npm run build`
- `npx wrangler deploy -c wrangler.policychecks.jsonc --dry-run`
- `npm audit --audit-level=high` (zero vulnerabilities)
- `npm outdated` (no outdated direct dependencies)
- YAML syntax validation for Dependabot and workflow files
- `git diff --check`

## Rollback

Revert the consolidated dependency commit to restore the previous manifests, lockfile, workflow action pins, and Dependabot configuration as one unit.
