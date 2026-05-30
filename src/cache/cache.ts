import type { ClaimResult } from "../claims/types.js";

interface CacheEntry {
  result: ClaimResult;
  expiresAt: number;
}

export interface ClaimCache {
  get(owner: string, repo: string, claim: string): ClaimResult | undefined;
  set(result: ClaimResult, ttlMs: number): void;
  delete(owner: string, repo: string, claim: string): boolean;
  deleteByRepository(owner: string, repo: string): number;
}

export class InMemoryClaimCache implements ClaimCache {
  private readonly entries = new Map<string, CacheEntry>();

  get(owner: string, repo: string, claim: string): ClaimResult | undefined {
    const key = cacheKey(owner, repo, claim);
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

  set(result: ClaimResult, ttlMs: number): void {
    this.entries.set(cacheKey(result.owner, result.repo, result.claim), {
      result,
      expiresAt: Date.now() + ttlMs
    });
  }

  delete(owner: string, repo: string, claim: string): boolean {
    return this.entries.delete(cacheKey(owner, repo, claim));
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

function cacheKey(owner: string, repo: string, claim: string): string {
  return `${owner.toLowerCase()}/${repo.toLowerCase()}/${claim}`;
}
