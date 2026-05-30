# CI/CD Integration

PolicyChecks is primarily a badge and proof service, but it can also be used in CI.

## Workflow Gate, No Custom Action Required

A repository can use PolicyChecks as a CI gate with ordinary shell steps. This does not require a custom GitHub Action and does not require PolicyChecks to write GitHub Checks.

Example:

```yaml
name: PolicyChecks Gate

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  policychecks:
    runs-on: ubuntu-24.04
    steps:
      - name: Verify PolicyChecks claims
        env:
          POLICYCHECKS_URL: https://policychecks.reponomics.org/github/OWNER/REPO/info.json
        run: |
          set -euo pipefail
          curl -fsSL "$POLICYCHECKS_URL" -o policychecks.json
          node <<'NODE'
          const fs = require('node:fs');
          const data = JSON.parse(fs.readFileSync('policychecks.json', 'utf8'));
          const failures = data.claims.filter((claim) => claim.status !== 'pass');
          if (failures.length > 0) {
            console.error(JSON.stringify(failures, null, 2));
            process.exit(1);
          }
          NODE
```

This treats both `fail` and `unknown` as non-passing. A looser gate could fail only on `fail` and allow `unknown`, but that should be an explicit repository policy decision.
