import { describe, expect, it } from "vitest";

import { immutableReleasesClaim } from "../../src/claims/immutable-releases.js";
import { GitHubApiError } from "../../src/github/errors.js";
import { checkedAt, evaluateWithMock, mockGitHub } from "../support/mock-github.js";

describe("immutable releases claim", () => {
  it("passes when GitHub reports immutable releases are enabled", async () => {
    const result = await evaluateWithMock(
      immutableReleasesClaim,
      mockGitHub({
        getImmutableReleases: async () => ({
          enabled: true,
          enforced_by_owner: false
        })
      })
    );

    expect(result).toMatchObject({
      result: "enabled",
      checked_at: checkedAt,
      details: {
        enabled: true,
        enforced_by_owner: false
      }
    });
  });

  it("fails when GitHub reports immutable releases are disabled", async () => {
    const result = await evaluateWithMock(
      immutableReleasesClaim,
      mockGitHub({
        getImmutableReleases: async () => ({
          enabled: false,
          enforced_by_owner: false
        })
      })
    );

    expect(result).toMatchObject({
      result: "disabled",
      details: {
        enabled: false,
        enforced_by_owner: false
      }
    });
    expect(result.error).toBeUndefined();
  });

  it("passes when organization policy enforces immutable releases for the repository", async () => {
    const result = await evaluateWithMock(
      immutableReleasesClaim,
      mockGitHub({
        getImmutableReleases: async () => ({
          enabled: true,
          enforced_by_owner: true
        })
      })
    );

    expect(result).toMatchObject({
      result: "enabled",
      details: {
        enabled: true,
        enforced_by_owner: true
      }
    });
  });

  it("fails on a 404 after repository access has been verified", async () => {
    const result = await evaluateWithMock(
      immutableReleasesClaim,
      mockGitHub({
        getImmutableReleases: async () => {
          throw new GitHubApiError("Not found", {
            status: 404,
            kind: "not_found"
          });
        }
      })
    );

    expect(result).toMatchObject({
      result: "disabled",
      details: {
        enabled: false,
        enforced_by_owner: null
      }
    });
    expect(result.error).toBeUndefined();
  });

  it("returns unknown on authorization failure", async () => {
    const result = await evaluateWithMock(
      immutableReleasesClaim,
      mockGitHub({
        getImmutableReleases: async () => {
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

  it("returns unknown on an ambiguous 404", async () => {
    const result = await evaluateWithMock(
      immutableReleasesClaim,
      mockGitHub({
        getImmutableReleases: async () => {
          throw new GitHubApiError("Not found", {
            status: 404,
            kind: "not_found"
          });
        }
      }),
      "unknown"
    );

    expect(result.result).toBe("unknown");
    expect(result.error).toMatchObject({
      kind: "not_found"
    });
  });

  it("returns unknown when the response shape is unexpected", async () => {
    const result = await evaluateWithMock(
      immutableReleasesClaim,
      mockGitHub({
        getImmutableReleases: async () => ({})
      })
    );

    expect(result.result).toBe("unknown");
    expect(result.error).toMatchObject({
      kind: "unexpected_response"
    });
  });
});
