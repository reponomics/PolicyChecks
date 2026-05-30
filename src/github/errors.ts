import type { ClaimError, ClaimErrorKind } from "../claims/types.js";

interface ErrorWithStatus {
  status?: unknown;
  message?: unknown;
  response?: {
    headers?: Record<string, unknown>;
  };
}

export class GitHubApiError extends Error {
  readonly status?: number;
  readonly kind: ClaimErrorKind;

  constructor(message: string, options: { status?: number; kind: ClaimErrorKind }) {
    super(message);
    this.name = "GitHubApiError";
    this.status = options.status;
    this.kind = options.kind;
  }
}

export function toGitHubApiError(error: unknown): GitHubApiError {
  if (error instanceof GitHubApiError) {
    return error;
  }

  const maybeError = error as ErrorWithStatus;
  const status = typeof maybeError.status === "number" ? maybeError.status : undefined;
  const headers = maybeError.response?.headers;
  const rawMessage = typeof maybeError.message === "string" ? maybeError.message : undefined;
  const kind = classifyStatus(status, headers, rawMessage);

  return new GitHubApiError(publicMessage(kind, status, rawMessage), { status, kind });
}

export function toPublicClaimError(error: unknown): ClaimError {
  const githubError = toGitHubApiError(error);

  return {
    kind: githubError.kind,
    message: githubError.message
  };
}

export function classifyStatus(
  status: number | undefined,
  headers?: Record<string, unknown>,
  rawMessage?: string
): ClaimErrorKind {
  if (
    status === 429 ||
    isPrimaryRateLimit(status, headers) ||
    isSecondaryRateLimit(rawMessage) ||
    headersMentionSecondaryRateLimit(headers)
  ) {
    return "rate_limited";
  }

  if (status === 401 || status === 403) {
    return "forbidden";
  }

  if (status === 404) {
    return "not_found";
  }

  if (status !== undefined && status >= 500) {
    return "github_error";
  }

  return "github_error";
}

function headersMentionSecondaryRateLimit(headers: Record<string, unknown> | undefined): boolean {
  if (headers === undefined) {
    return false;
  }

  return Object.values(headers).some(
    (value) =>
      typeof value === "string" &&
      /secondary rate limit|abuse detection|too many requests/i.test(value)
  );
}

function isSecondaryRateLimit(rawMessage: string | undefined): boolean {
  if (rawMessage === undefined || rawMessage.trim() === "") {
    return false;
  }

  return /secondary rate limit|abuse detection|rate limit exceeded|too many requests/i.test(
    rawMessage
  );
}

export function publicMessage(kind: ClaimErrorKind, status?: number, rawMessage?: string): string {
  switch (kind) {
    case "not_installed":
      return "GitHub App installation was not found for this repository.";
    case "not_found":
      return "GitHub reported the repository or endpoint was not found.";
    case "forbidden":
      return status === 401 ? "GitHub authentication failed." : "GitHub authorization failed.";
    case "rate_limited":
      return "GitHub API rate limit prevented verification.";
    case "unexpected_response":
      return "GitHub returned an unexpected response shape.";
    case "github_error":
      if (looksLikeGitHubAppCredentialError(rawMessage)) {
        return "GitHub App credentials appear invalid or mismatched. Check GITHUB_APP_ID and GITHUB_PRIVATE_KEY (or GITHUB_PRIVATE_KEY_BASE64).";
      }

      if (looksLikeNetworkError(rawMessage)) {
        return "The service could not reach GitHub API before the claim could be verified.";
      }

      return "GitHub API request failed before the claim could be verified.";
  }
}

function looksLikeGitHubAppCredentialError(rawMessage: string | undefined): boolean {
  if (rawMessage === undefined || rawMessage.trim() === "") {
    return false;
  }

  return /private key|secretOrPrivateKey|JWT|RS256|PEM|pkcs8|key format|integration/i.test(
    rawMessage
  );
}

function looksLikeNetworkError(rawMessage: string | undefined): boolean {
  if (rawMessage === undefined || rawMessage.trim() === "") {
    return false;
  }

  return /network|ECONN|ENOTFOUND|ETIMEDOUT|fetch failed|socket/i.test(rawMessage);
}

function isPrimaryRateLimit(
  status: number | undefined,
  headers?: Record<string, unknown>
): boolean {
  if (status !== 403 || headers === undefined) {
    return false;
  }

  const remaining = headers["x-ratelimit-remaining"];
  return remaining === "0" || remaining === 0;
}
