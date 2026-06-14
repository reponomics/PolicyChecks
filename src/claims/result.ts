import type {
  ClaimDefinition,
  ClaimEvidence,
  ClaimError,
  ClaimEvaluationInput,
  ClaimResult,
  ClaimResultText
} from "./types.js";

interface ResultInput {
  owner: string;
  repo: string;
  now?: () => Date;
}

export function checkedAt(now?: () => Date): string {
  return (now?.() ?? new Date()).toISOString();
}

export function makeClaimResult(
  definition: ClaimDefinition,
  input: ResultInput,
  result: ClaimResultText,
  details: Record<string, unknown>,
  error?: ClaimError,
  evidence: ClaimEvidence = definition.evidence ?? unavailableEvidence
): ClaimResult {
  return {
    claim: definition.id,
    owner: input.owner,
    repo: input.repo,
    repository: repositoryIdentity(input),
    result,
    source: definition.source,
    evidence,
    checked_at: checkedAt(input.now),
    details,
    ...(error ? { error } : {})
  };
}

function repositoryIdentity(input: ResultInput) {
  return {
    owner: input.owner,
    repo: input.repo,
    full_name: `${input.owner}/${input.repo}`
  };
}

export function makeUnknownResult(
  definition: ClaimDefinition,
  input: ResultInput,
  error: ClaimError,
  details: Record<string, unknown> = {},
  evidence: ClaimEvidence = unavailableEvidence
): ClaimResult {
  return makeClaimResult(definition, input, "unknown", details, error, evidence);
}

export function resultInput(input: ClaimEvaluationInput): ResultInput {
  return {
    owner: input.owner,
    repo: input.repo,
    now: input.now
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const repositorySettingEvidence: ClaimEvidence = {
  scope: "repository",
  source: "repository_setting"
};

export const activeBranchRulesEvidence: ClaimEvidence = {
  scope: "repository",
  source: "active_branch_rules"
};

export const communityProfileEvidence: ClaimEvidence = {
  scope: "repository",
  source: "community_profile"
};

export const unavailableEvidence: ClaimEvidence = {
  scope: "unknown",
  source: "unavailable"
};
