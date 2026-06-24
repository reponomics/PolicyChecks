import type {
  ClaimError,
  ClaimRepositoryIdentity,
  ClaimResult,
  ClaimSource
} from "../claims/types.js";

export interface DetailsJson {
  badgeId: string;
  owner: string;
  repo: string;
  repository: ClaimRepositoryIdentity;
  result: ClaimResult["result"];
  source: ClaimSource;
  checked_at: string;
  details: Record<string, unknown>;
  error?: ClaimError;
}

export function toDetailsJson(result: ClaimResult): DetailsJson {
  return {
    badgeId: result.claim,
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
