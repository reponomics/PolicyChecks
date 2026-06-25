import { describe, expect, it } from "vitest";

import {
  GitHubApiError,
  classifyStatus,
  publicMessage,
  toGitHubApiError,
  toPublicBadgeError
} from "../../src/github/errors.js";
import type { BadgeErrorKind } from "../../src/badges/types.js";

describe("classifyStatus", () => {
  it.each([
    [429, undefined, "rate_limited"],
    [403, { "x-ratelimit-remaining": "0" }, "rate_limited"],
    [403, { "x-ratelimit-remaining": 0 }, "rate_limited"],
    [403, { "x-ratelimit-remaining": "57" }, "forbidden"],
    [403, undefined, "forbidden"],
    [401, undefined, "forbidden"],
    [404, undefined, "not_found"],
    [500, undefined, "github_error"],
    [503, undefined, "github_error"],
    [undefined, undefined, "github_error"]
  ])("maps status %s to %s", (status, headers, expected) => {
    expect(classifyStatus(status as number | undefined, headers)).toBe(expected);
  });

  it("treats secondary limit messages as rate limits", () => {
    expect(classifyStatus(403, undefined, "You have exceeded a secondary rate limit")).toBe(
      "rate_limited"
    );
  });

  it("treats secondary limit header values as rate limits", () => {
    expect(classifyStatus(403, { "x-github-warning": "secondary rate limit active" })).toBe(
      "rate_limited"
    );
  });
});

describe("publicMessage", () => {
  it.each<[BadgeErrorKind, number | undefined, RegExp]>([
    ["not_installed", undefined, /installation was not found/],
    ["not_found", undefined, /not found/],
    ["forbidden", 401, /authentication failed/],
    ["forbidden", 403, /authorization failed/],
    ["rate_limited", undefined, /rate limit/],
    ["unexpected_response", undefined, /unexpected response/],
    ["github_error", undefined, /request failed/]
  ])("produces a message for %s", (kind, status, pattern) => {
    expect(publicMessage(kind, status)).toMatch(pattern);
  });

  it("surfaces a credential-specific message for private key/auth failures", () => {
    const message = publicMessage(
      "github_error",
      undefined,
      "secretOrPrivateKey must be an asymmetric key"
    );

    expect(message).toMatch(/credentials appear invalid or mismatched/);
    expect(message).toMatch(/GITHUB_PRIVATE_KEY_BASE64/);
  });

  it("surfaces a network-specific message for connectivity failures", () => {
    const message = publicMessage("github_error", undefined, "connect ETIMEDOUT api.github.com");

    expect(message).toMatch(/could not reach GitHub API/);
  });
});

describe("toGitHubApiError", () => {
  it("returns an existing GitHubApiError unchanged", () => {
    const original = new GitHubApiError("boom", { status: 404, kind: "not_found" });

    expect(toGitHubApiError(original)).toBe(original);
  });

  it("wraps an error carrying a status and rate-limit headers", () => {
    const wrapped = toGitHubApiError({
      status: 403,
      response: { headers: { "x-ratelimit-remaining": "0" } }
    });

    expect(wrapped).toBeInstanceOf(GitHubApiError);
    expect(wrapped.status).toBe(403);
    expect(wrapped.kind).toBe("rate_limited");
  });

  it("wraps an opaque error with no status", () => {
    const wrapped = toGitHubApiError(new Error("network down"));

    expect(wrapped.status).toBeUndefined();
    expect(wrapped.kind).toBe("github_error");
  });
});

describe("toPublicBadgeError", () => {
  it("reduces an error to its public kind and message", () => {
    const publicError = toPublicBadgeError(
      new GitHubApiError("hidden detail", { status: 404, kind: "not_found" })
    );

    expect(publicError).toEqual({ kind: "not_found", message: "hidden detail" });
  });
});
