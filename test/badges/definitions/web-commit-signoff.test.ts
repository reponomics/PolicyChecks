import { describe, expect, it } from "vitest";

import { webCommitSignoffRequiredBadge } from "../../../src/badges/web-commit-signoff.js";
import { GitHubApiError } from "../../../src/github/errors.js";
import { evaluateWithMock, mockGitHub } from "../../support/mock-github.js";

describe("web commit signoff badge", () => {
  it("passes when web_commit_signoff_required is true", async () => {
    const result = await evaluateWithMock(
      webCommitSignoffRequiredBadge,
      mockGitHub({
        getRepository: async () => ({
          id: 1,
          web_commit_signoff_required: true
        })
      })
    );

    expect(result).toMatchObject({
      result: "enabled",
      details: {
        web_commit_signoff_required: true,
        applies_to: "web_based_commits",
        limitations: {
          command_line_commits_evaluated: false,
          commit_history_evaluated: false
        }
      }
    });
  });

  it("fails when web_commit_signoff_required is false", async () => {
    const result = await evaluateWithMock(
      webCommitSignoffRequiredBadge,
      mockGitHub({
        getRepository: async () => ({
          id: 1,
          web_commit_signoff_required: false
        })
      })
    );

    expect(result).toMatchObject({
      result: "disabled",
      details: {
        web_commit_signoff_required: false,
        applies_to: "web_based_commits"
      }
    });
    expect(result.error).toBeUndefined();
  });

  it("returns unknown when web_commit_signoff_required is missing", async () => {
    const result = await evaluateWithMock(
      webCommitSignoffRequiredBadge,
      mockGitHub({
        getRepository: async () => ({ id: 1 })
      })
    );

    expect(result).toMatchObject({
      result: "unknown",
      details: {
        web_commit_signoff_required: null
      },
      error: {
        kind: "unexpected_response"
      }
    });
  });

  it("returns unknown on authorization failure", async () => {
    const result = await evaluateWithMock(
      webCommitSignoffRequiredBadge,
      mockGitHub({
        getRepository: async () => {
          throw new GitHubApiError("Forbidden", {
            status: 403,
            kind: "forbidden"
          });
        }
      })
    );

    expect(result.result).toBe("unknown");
    expect(result.error).toMatchObject({
      kind: "forbidden"
    });
  });
});
