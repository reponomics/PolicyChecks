import { describe, expect, it } from "vitest";

import { shaPinningRequiredClaim } from "../../src/claims/sha-pinning-required.js";
import { GitHubApiError } from "../../src/github/errors.js";
import { evaluateWithMock, mockGitHub } from "../support/mock-github.js";

describe("SHA pinning claim", () => {
  it("passes when sha_pinning_required is true", async () => {
    const result = await evaluateWithMock(
      shaPinningRequiredClaim,
      mockGitHub({
        getActionsPermissions: async () => ({
          sha_pinning_required: true
        })
      })
    );

    expect(result).toMatchObject({
      status: "pass",
      value: true,
      details: {
        sha_pinning_required: true
      }
    });
  });

  it("fails when sha_pinning_required is false", async () => {
    const result = await evaluateWithMock(
      shaPinningRequiredClaim,
      mockGitHub({
        getActionsPermissions: async () => ({
          sha_pinning_required: false
        })
      })
    );

    expect(result).toMatchObject({
      status: "fail",
      value: false,
      details: {
        sha_pinning_required: false
      }
    });
  });

  it("returns unknown on authorization failure", async () => {
    const result = await evaluateWithMock(
      shaPinningRequiredClaim,
      mockGitHub({
        getActionsPermissions: async () => {
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

  it("returns unknown on a 404", async () => {
    const result = await evaluateWithMock(
      shaPinningRequiredClaim,
      mockGitHub({
        getActionsPermissions: async () => {
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

  it("returns unknown when sha_pinning_required is missing", async () => {
    const result = await evaluateWithMock(
      shaPinningRequiredClaim,
      mockGitHub({
        getActionsPermissions: async () => ({})
      })
    );

    expect(result.status).toBe("unknown");
    expect(result.error).toMatchObject({
      kind: "unexpected_response"
    });
  });
});
