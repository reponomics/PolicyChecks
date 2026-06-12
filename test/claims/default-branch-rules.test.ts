import { describe, expect, it } from "vitest";

import {
  defaultBranchDeletionBlockedClaim,
  defaultBranchForcePushesBlockedClaim,
  defaultBranchLinearHistoryRequiredClaim,
  defaultBranchPullRequestRequiredClaim,
  defaultBranchSignedCommitsRequiredClaim,
  defaultBranchStatusChecksRequiredClaim
} from "../../src/claims/default-branch-rules.js";
import type { ClaimDefinition } from "../../src/claims/types.js";
import { GitHubApiError } from "../../src/github/errors.js";
import { evaluateWithMock, mockGitHub } from "../support/mock-github.js";

const activeRules = [
  { type: "deletion" },
  { type: "non_fast_forward" },
  { type: "pull_request", parameters: { required_approving_review_count: 1 } },
  { type: "required_linear_history" },
  { type: "required_signatures" },
  { type: "required_status_checks", parameters: { required_status_checks: [{ context: "ci" }] } }
];

const claimCases = [
  {
    definition: defaultBranchForcePushesBlockedClaim,
    ruleType: "non_fast_forward"
  },
  {
    definition: defaultBranchSignedCommitsRequiredClaim,
    ruleType: "required_signatures"
  },
  {
    definition: defaultBranchLinearHistoryRequiredClaim,
    ruleType: "required_linear_history"
  },
  {
    definition: defaultBranchDeletionBlockedClaim,
    ruleType: "deletion"
  },
  {
    definition: defaultBranchPullRequestRequiredClaim,
    ruleType: "pull_request"
  },
  {
    definition: defaultBranchStatusChecksRequiredClaim,
    ruleType: "required_status_checks"
  }
] satisfies { definition: ClaimDefinition; ruleType: string }[];

describe("default branch ruleset claims", () => {
  it.each(claimCases)("passes for $definition.id when its active rule applies", async (claim) => {
    const result = await evaluateWithMock(
      claim.definition,
      mockGitHub({
        getRepository: async () => ({ id: 1, default_branch: "main" }),
        getBranchRules: async () => activeRules
      })
    );

    expect(result).toMatchObject({
      status: "pass",
      value: true,
      evidence: {
        scope: "repository",
        source: "active_branch_rules"
      },
      details: {
        default_branch: "main",
        required_rule_type: claim.ruleType,
        active_rule_types: [
          "deletion",
          "non_fast_forward",
          "pull_request",
          "required_linear_history",
          "required_signatures",
          "required_status_checks"
        ],
        matching_rules: [expect.objectContaining({ type: claim.ruleType })],
        limitations: {
          classic_branch_protection_evaluated: false,
          bypass_actors_evaluated: false
        }
      }
    });
  });

  it("fails when active rules do not include the required rule type", async () => {
    const result = await evaluateWithMock(
      defaultBranchForcePushesBlockedClaim,
      mockGitHub({
        getRepository: async () => ({ id: 1, default_branch: "main" }),
        getBranchRules: async () => [{ type: "required_linear_history" }]
      })
    );

    expect(result).toMatchObject({
      status: "fail",
      value: false,
      details: {
        default_branch: "main",
        required_rule_type: "non_fast_forward",
        active_rule_types: ["required_linear_history"],
        matching_rules: []
      }
    });
    expect(result.error).toBeUndefined();
  });

  it("fails when no active rules apply to the default branch", async () => {
    const result = await evaluateWithMock(
      defaultBranchForcePushesBlockedClaim,
      mockGitHub({
        getRepository: async () => ({ id: 1, default_branch: "main" }),
        getBranchRules: async () => []
      })
    );

    expect(result).toMatchObject({
      status: "fail",
      value: false,
      details: {
        active_rule_types: [],
        matching_rules: []
      }
    });
  });

  it("returns unknown when the repository does not report a default branch", async () => {
    const result = await evaluateWithMock(
      defaultBranchForcePushesBlockedClaim,
      mockGitHub({
        getRepository: async () => ({ id: 1 })
      })
    );

    expect(result).toMatchObject({
      status: "unknown",
      value: null,
      details: {
        default_branch: null
      },
      error: {
        kind: "unexpected_response"
      }
    });
  });

  it("returns unknown when the rules response is not an array", async () => {
    const result = await evaluateWithMock(
      defaultBranchForcePushesBlockedClaim,
      mockGitHub({
        getRepository: async () => ({ id: 1, default_branch: "main" }),
        getBranchRules: async () => ({ rules: [] })
      })
    );

    expect(result).toMatchObject({
      status: "unknown",
      value: null,
      details: {
        default_branch: "main",
        required_rule_type: "non_fast_forward"
      },
      error: {
        kind: "unexpected_response"
      }
    });
  });

  it("returns unknown when a rule is missing a type", async () => {
    const result = await evaluateWithMock(
      defaultBranchForcePushesBlockedClaim,
      mockGitHub({
        getRepository: async () => ({ id: 1, default_branch: "main" }),
        getBranchRules: async () => [{ parameters: {} }]
      })
    );

    expect(result.status).toBe("unknown");
    expect(result.error).toMatchObject({
      kind: "unexpected_response"
    });
  });

  it("returns unknown on authorization failure", async () => {
    const result = await evaluateWithMock(
      defaultBranchForcePushesBlockedClaim,
      mockGitHub({
        getRepository: async () => ({ id: 1, default_branch: "main" }),
        getBranchRules: async () => {
          throw new GitHubApiError("Forbidden", {
            status: 403,
            kind: "forbidden"
          });
        }
      })
    );

    expect(result.status).toBe("unknown");
    expect(result.error).toMatchObject({
      kind: "forbidden"
    });
  });
});
