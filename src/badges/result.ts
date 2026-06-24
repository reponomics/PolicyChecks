import type {
  BadgeDefinition,
  BadgeError,
  BadgeEvaluationInput,
  BadgeResult,
  BadgeResultText
} from "./types.js";

interface ResultInput {
  owner: string;
  repo: string;
  now?: () => Date;
}

export function checkedAt(now?: () => Date): string {
  return (now?.() ?? new Date()).toISOString();
}

export function makeBadgeResult(
  definition: BadgeDefinition,
  input: ResultInput,
  result: BadgeResultText,
  details: Record<string, unknown>,
  error?: BadgeError
): BadgeResult {
  return {
    badgeId: definition.id,
    owner: input.owner,
    repo: input.repo,
    repository: repositoryIdentity(input),
    result,
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
  definition: BadgeDefinition,
  input: ResultInput,
  error: BadgeError,
  details: Record<string, unknown> = {}
): BadgeResult {
  return makeBadgeResult(definition, input, "unknown", details, error);
}

export function resultInput(input: BadgeEvaluationInput): ResultInput {
  return {
    owner: input.owner,
    repo: input.repo,
    now: input.now
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
