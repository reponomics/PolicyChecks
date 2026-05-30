import { describe, expect, it } from "vitest";

import { signedCommitsRequiredClaim } from "../../src/claims/signed-commits-required.js";
import { GitHubApiError } from "../../src/github/errors.js";
import { evaluateWithMock, mockGitHub } from "../support/mock-github.js";

describe("signed commits claim", () => {
  it("passes when active branch rules include required_signatures", async () => {
    const result = await evaluateWithMock(
      signedCommitsRequiredClaim,
      mockGitHub({
        getRepository: async () => ({
          id: 1,
          default_branch: "main"
        }),
        getBranchRules: async () => [
          {
            type: "pull_request"
          },
          {
            type: "required_signatures"
          }
        ]
      })
    );

    expect(result).toMatchObject({
      status: "pass",
      value: true,
      details: {
        branch: "main",
        matching_rule_types: ["pull_request", "required_signatures"]
      }
    });
  });

  it("fails when active branch rules do not include required_signatures", async () => {
    const result = await evaluateWithMock(
      signedCommitsRequiredClaim,
      mockGitHub({
        getRepository: async () => ({
          id: 1,
          default_branch: "main"
        }),
        getBranchRules: async () => [
          {
            type: "pull_request"
          }
        ]
      })
    );

    expect(result).toMatchObject({
      status: "fail",
      value: false,
      details: {
        branch: "main",
        matching_rule_types: ["pull_request"]
      }
    });
  });

  it("returns unknown on authorization failure", async () => {
    const result = await evaluateWithMock(
      signedCommitsRequiredClaim,
      mockGitHub({
        getRepository: async () => ({
          id: 1,
          default_branch: "main"
        }),
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

  it("returns unknown when repository metadata is not found", async () => {
    const result = await evaluateWithMock(
      signedCommitsRequiredClaim,
      mockGitHub({
        getRepository: async () => {
          throw new GitHubApiError("Not found", {
            status: 404,
            kind: "not_found"
          });
        }
      })
    );

    expect(result.status).toBe("unknown");
    expect(result.error).toMatchObject({
      kind: "not_found"
    });
  });

  it("returns unknown when the default branch is missing", async () => {
    const result = await evaluateWithMock(
      signedCommitsRequiredClaim,
      mockGitHub({
        getRepository: async () => ({
          id: 1
        })
      })
    );

    expect(result.status).toBe("unknown");
    expect(result.error).toMatchObject({
      kind: "unexpected_response"
    });
  });
});
