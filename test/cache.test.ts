import { describe, expect, it } from "vitest";

import { InMemoryClaimCache } from "../src/cache/cache.js";
import { shaPinningRequiredClaim } from "../src/claims/sha-pinning-required.js";
import type { ClaimResult } from "../src/claims/types.js";

describe("in-memory claim cache", () => {
  it("returns the cached proof with the original checked_at timestamp", () => {
    const cache = new InMemoryClaimCache();
    const result = makeResult("2026-05-30T00:00:00.000Z");

    cache.set(result, 60_000);

    expect(cache.get("owner", "repo", "sha-pinning-required")).toMatchObject({
      checked_at: "2026-05-30T00:00:00.000Z"
    });
  });

  it("expires entries after their ttl", async () => {
    const cache = new InMemoryClaimCache();
    cache.set(makeResult("2026-05-30T00:00:00.000Z"), 1);

    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(cache.get("owner", "repo", "sha-pinning-required")).toBeUndefined();
  });

  it("deletes a specific cached claim", () => {
    const cache = new InMemoryClaimCache();
    cache.set(makeResult("2026-05-30T00:00:00.000Z"), 60_000);

    expect(cache.delete("owner", "repo", "sha-pinning-required")).toBe(true);
    expect(cache.get("owner", "repo", "sha-pinning-required")).toBeUndefined();
  });

  it("deletes all cached claims for a repository", () => {
    const cache = new InMemoryClaimCache();
    cache.set(makeResult("2026-05-30T00:00:00.000Z"), 60_000);
    cache.set(
      {
        ...makeResult("2026-05-30T00:00:00.000Z"),
        claim: "immutable-releases"
      },
      60_000
    );
    cache.set(
      {
        ...makeResult("2026-05-30T00:00:00.000Z"),
        owner: "other",
        repo: "repo"
      },
      60_000
    );

    expect(cache.deleteByRepository("owner", "repo")).toBe(2);
    expect(cache.get("owner", "repo", "sha-pinning-required")).toBeUndefined();
    expect(cache.get("owner", "repo", "immutable-releases")).toBeUndefined();
    expect(cache.get("other", "repo", "sha-pinning-required")).toBeDefined();
  });
});

function makeResult(checkedAt: string): ClaimResult {
  return {
    claim: shaPinningRequiredClaim.id,
    owner: "owner",
    repo: "repo",
    repository: {
      owner: "owner",
      repo: "repo",
      full_name: "owner/repo"
    },
    result: "enabled",
    source: shaPinningRequiredClaim.source,
    evidence: shaPinningRequiredClaim.evidence ?? { scope: "unknown", source: "unavailable" },
    checked_at: checkedAt,
    details: {
      sha_pinning_required: true
    }
  };
}
