import type {
  ClaimDefinition,
  ClaimError,
  ClaimEvaluationInput,
  ClaimResult,
  ClaimStatus
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
  status: ClaimStatus,
  value: boolean | null,
  details: Record<string, unknown>,
  error?: ClaimError
): ClaimResult {
  return {
    claim: definition.id,
    owner: input.owner,
    repo: input.repo,
    repository: repositoryIdentity(input),
    status,
    value,
    source: definition.source,
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
  details: Record<string, unknown> = {}
): ClaimResult {
  return makeClaimResult(definition, input, "unknown", null, details, error);
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
