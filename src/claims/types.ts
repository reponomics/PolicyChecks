import type { GitHubClient } from "../github/client.js";

export type ClaimStatus = "pass" | "fail" | "unknown";

export type ClaimErrorKind =
  | "not_installed"
  | "not_found"
  | "forbidden"
  | "rate_limited"
  | "github_error"
  | "unexpected_response";

export interface ClaimError {
  kind: ClaimErrorKind;
  message: string;
}

export interface ClaimSource {
  provider: "github";
  api: "REST";
  endpoint: string;
  fields: string[];
}

export type ClaimEvidenceScope = "repository" | "organization" | "enterprise" | "unknown";

export type ClaimEvidenceSource =
  | "repository_setting"
  | "active_branch_rules"
  | "community_profile"
  | "attached_code_security_configuration"
  | "unavailable";

export interface ClaimEvidence {
  scope: ClaimEvidenceScope;
  source: ClaimEvidenceSource;
  enforcement?: string;
}

export interface ClaimRepositoryIdentity {
  owner: string;
  repo: string;
  full_name: string;
}

export interface ClaimResult {
  claim: string;
  owner: string;
  repo: string;
  repository: ClaimRepositoryIdentity;
  status: ClaimStatus;
  value: boolean | null;
  source: ClaimSource;
  evidence: ClaimEvidence;
  checked_at: string;
  details: Record<string, unknown>;
  error?: ClaimError;
}

export type RepositoryAccess = "verified" | "unknown";

export interface ClaimEvaluationInput {
  owner: string;
  repo: string;
  github: GitHubClient;
  repositoryAccess: RepositoryAccess;
  now?: () => Date;
}

export interface ClaimDefinition {
  id: string;
  label: string;
  passMessage: string;
  failMessage: string;
  unknownMessage: string;
  source: ClaimSource;
  evidence?: ClaimEvidence;
  badgeMessage?(result: ClaimResult): string;
  badgeColor?(result: ClaimResult): string;
  evaluate(input: ClaimEvaluationInput): Promise<ClaimResult>;
}
