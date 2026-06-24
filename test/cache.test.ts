import { describe, expect, it } from "vitest";

import { InMemoryBadgeCache } from "../src/cache/cache.js";
import { shaPinningRequiredBadge } from "../src/badges/sha-pinning-required.js";
import type { BadgeResult } from "../src/badges/types.js";

describe("in-memory badge cache", () => {
  it("returns the cached result with the original checked_at timestamp", () => {
    const cache = new InMemoryBadgeCache();
    const result = makeResult("2026-05-30T00:00:00.000Z");

    cache.set(result, 60_000);

    expect(cache.get("owner", "repo", "sha-pinning-required")).toMatchObject({
      checked_at: "2026-05-30T00:00:00.000Z"
    });
  });

  it("expires entries after their ttl", async () => {
    const cache = new InMemoryBadgeCache();
    cache.set(makeResult("2026-05-30T00:00:00.000Z"), 1);

    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(cache.get("owner", "repo", "sha-pinning-required")).toBeUndefined();
  });

  it("deletes a specific cached badge", () => {
    const cache = new InMemoryBadgeCache();
    cache.set(makeResult("2026-05-30T00:00:00.000Z"), 60_000);

    expect(cache.delete("owner", "repo", "sha-pinning-required")).toBe(true);
    expect(cache.get("owner", "repo", "sha-pinning-required")).toBeUndefined();
  });

  it("deletes all cached badges for a repository", () => {
    const cache = new InMemoryBadgeCache();
    cache.set(makeResult("2026-05-30T00:00:00.000Z"), 60_000);
    cache.set(
      {
        ...makeResult("2026-05-30T00:00:00.000Z"),
        badgeId: "immutable-releases"
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

function makeResult(checkedAt: string): BadgeResult {
  return {
    badgeId: shaPinningRequiredBadge.id,
    owner: "owner",
    repo: "repo",
    repository: {
      owner: "owner",
      repo: "repo",
      full_name: "owner/repo"
    },
    result: "enabled",
    source: shaPinningRequiredBadge.source,
    checked_at: checkedAt,
    details: {
      sha_pinning_required: true
    }
  };
}
