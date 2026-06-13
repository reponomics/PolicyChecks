# CI/CD Integration

PolicyChecks is primarily a badge and proof service, and its evaluation target is administrative settings, not source code. It can also be used as part of CI workflows, if so desired, and we demonstrate this usage below - but one should understand what it does and does not establish. If run as a check on a PR, for example, it is evaluated at workflow runtime, and what it checks is the repo settings at that time, and not the PR - a PR may contain unsigned commits, and as long as the signed-commits-required setting is enabled at the time of evaluation, the PolicyChecks endpoint would reflect that, and not assert anything about the PR. If anything, it is the actual signed-commits-required setting itself that would determine whether the PR was eligible to merge or not (although even this might be subject to bypass actor overrides). Maintainers may go to a great deal of trouble to ensure that all commits are signed, and therefore it might be nice for them to have a convenient way to demonstrate this policy, besides the commit history itself - this service aims to facilitate that need, but the scope of its claims must be kept in mind.

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
