import type { BadgeError, BadgeRepositoryIdentity, BadgeResult, BadgeSource } from "./types.js";

export interface DetailsJson {
  badgeId: string;
  owner: string;
  repo: string;
  repository: BadgeRepositoryIdentity;
  result: BadgeResult["result"];
  source: BadgeSource;
  checked_at: string;
  details: Record<string, unknown>;
  error?: BadgeError;
}

export function toDetailsJson(result: BadgeResult): DetailsJson {
  return {
    badgeId: result.badgeId,
    owner: result.owner,
    repo: result.repo,
    repository: result.repository,
    result: result.result,
    source: result.source,
    checked_at: result.checked_at,
    details: result.details,
    ...(result.error ? { error: result.error } : {})
  };
}
