import type { GitHubClient } from "../github/client.js";

export type BadgeResultText = "enabled" | "disabled" | "unknown" | string;

export type BadgeErrorKind =
  | "not_installed"
  | "not_found"
  | "forbidden"
  | "rate_limited"
  | "github_error"
  | "unexpected_response";

export interface BadgeError {
  kind: BadgeErrorKind;
  message: string;
}

export interface BadgeSource {
  provider: "github";
  api: "REST";
  endpoint: string;
  fields: string[];
}

export interface BadgeRepositoryIdentity {
  owner: string;
  repo: string;
  full_name: string;
}

export interface BadgeResult {
  badgeId: string;
  owner: string;
  repo: string;
  repository: BadgeRepositoryIdentity;
  result: BadgeResultText;
  source: BadgeSource;
  checked_at: string;
  details: Record<string, unknown>;
  error?: BadgeError;
}

export type RepositoryAccess = "verified" | "unknown";

export interface BadgeEvaluationInput {
  owner: string;
  repo: string;
  github: GitHubClient;
  repositoryAccess: RepositoryAccess;
  now?: () => Date;
}

export interface BadgeDefinition {
  id: string;
  label: string;
  source: BadgeSource;
  badgeMessage?(result: BadgeResult): string;
  badgeColor?(result: BadgeResult): string;
  evaluate(input: BadgeEvaluationInput): Promise<BadgeResult>;
}
