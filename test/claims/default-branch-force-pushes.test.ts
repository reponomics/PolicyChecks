import { describe, expect, it } from "vitest";

import { defaultBranchForcePushesBlockedClaim } from "../../src/claims/default-branch-force-pushes.js";
import { GitHubApiError } from "../../src/github/errors.js";
import { evaluateWithMock, mockGitHub } from "../support/mock-github.js";

describe("default branch force pushes blocked claim", () => {
  it("passes when an active non_fast_forward rule applies to the default branch", async () => {
    const result = await evaluateWithMock(
      defaultBranchForcePushesBlockedClaim,
      mockGitHub({
        getRepository: async () => ({ id: 1, default_branch: "main" }),
        getBranchRules: async () => [
          { type: "required_signatures" },
          { type: "non_fast_forward", parameters: { update_allows_fetch_and_merge: true } }
        ]
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
        required_rule_type: "non_fast_forward",
        active_rule_types: ["non_fast_forward", "required_signatures"],
        matching_rules: [
          {
            type: "non_fast_forward",
            parameters: { update_allows_fetch_and_merge: true }
          }
        ],
        limitations: {
          classic_branch_protection_evaluated: false,
          bypass_actors_evaluated: false
        }
      }
    });
  });

  it("fails when active rules do not include non_fast_forward", async () => {
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
