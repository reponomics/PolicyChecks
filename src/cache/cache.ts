import type { BadgeResult } from "../badges/types.js";

interface CacheEntry {
  result: BadgeResult;
  expiresAt: number;
}

export interface BadgeCache {
  get(owner: string, repo: string, badgeId: string): BadgeResult | undefined;
  set(result: BadgeResult, ttlMs: number): void;
  delete(owner: string, repo: string, badgeId: string): boolean;
  deleteByRepository(owner: string, repo: string): number;
}

export class InMemoryBadgeCache implements BadgeCache {
  private readonly entries = new Map<string, CacheEntry>();

  get(owner: string, repo: string, badgeId: string): BadgeResult | undefined {
    const key = cacheKey(owner, repo, badgeId);
    const entry = this.entries.get(key);

    if (entry === undefined) {
      return undefined;
    }

    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }

    return entry.result;
  }

  set(result: BadgeResult, ttlMs: number): void {
    this.entries.set(cacheKey(result.owner, result.repo, result.badgeId), {
      result,
      expiresAt: Date.now() + ttlMs
    });
  }

  delete(owner: string, repo: string, badgeId: string): boolean {
    return this.entries.delete(cacheKey(owner, repo, badgeId));
  }

  deleteByRepository(owner: string, repo: string): number {
    const prefix = `${owner.toLowerCase()}/${repo.toLowerCase()}/`;
    let deleted = 0;

    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
        deleted += 1;
      }
    }

    return deleted;
  }
}

function cacheKey(owner: string, repo: string, badgeId: string): string {
  return `${owner.toLowerCase()}/${repo.toLowerCase()}/${badgeId}`;
}
