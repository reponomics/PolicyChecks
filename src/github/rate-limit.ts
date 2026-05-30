import { GitHubApiError, publicMessage } from "./errors.js";

export interface GitHubRateLimitPolicy {
  minRequestSpacingMs: number;
  slowRemainingThreshold: number;
  slowDelayMs: number;
  fallbackRetryMs: number;
  clock: () => number;
  sleep: (durationMs: number) => Promise<void>;
  logger: GitHubRateLimitLogger;
}

export interface GitHubRateLimitRequestContext {
  route?: string;
}

export type GitHubRateLimitLogger = (event: GitHubRateLimitLogEvent) => void;

export type GitHubRateLimitLogEvent =
  | {
      event: "github_api_response";
      bucket: string;
      route?: string;
      status?: number;
      rate_limit?: GitHubRateLimitSnapshot;
    }
  | {
      event: "github_api_error";
      bucket: string;
      route?: string;
      status?: number;
      rate_limit?: GitHubRateLimitSnapshot;
    }
  | {
      event: "github_api_circuit_opened";
      bucket: string;
      route?: string;
      reason: "primary_exhausted" | "secondary_rate_limit" | "retry_after" | "rate_limited";
      open_until: string;
      rate_limit?: GitHubRateLimitSnapshot;
    }
  | {
      event: "github_api_throttled";
      bucket: string;
      route?: string;
      delay_ms: number;
      rate_limit?: GitHubRateLimitSnapshot;
    };

export interface GitHubRateLimitSnapshot {
  limit?: number;
  remaining?: number;
  used?: number;
  reset_at?: string;
  resource?: string;
  retry_after_seconds?: number;
}

type CircuitOpenReason =
  | "primary_exhausted"
  | "secondary_rate_limit"
  | "retry_after"
  | "rate_limited";

interface BucketState {
  chain: Promise<void>;
  circuitOpenUntil: number;
  nextAvailableAt: number;
}

interface HeadersLike {
  [key: string]: unknown;
}

interface ErrorWithRateLimitShape {
  status?: unknown;
  message?: unknown;
  response?: {
    headers?: HeadersLike;
  };
}

export const defaultRateLimitPolicy: GitHubRateLimitPolicy = {
  minRequestSpacingMs: 250,
  slowRemainingThreshold: 1_000,
  slowDelayMs: 1_000,
  fallbackRetryMs: 60_000,
  clock: Date.now,
  sleep: (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs)),
  logger: (event) => {
    console.log(JSON.stringify(event));
  }
};

export class GitHubRateLimiter {
  private readonly buckets = new Map<string, BucketState>();

  constructor(private readonly policy: GitHubRateLimitPolicy = defaultRateLimitPolicy) {}

  async run<T>(
    bucket: string,
    operation: () => Promise<T>,
    context: GitHubRateLimitRequestContext = {}
  ): Promise<T> {
    const state = this.getBucket(bucket);

    const queued = state.chain
      .catch(() => undefined)
      .then(async () => {
        await this.waitForTurn(bucket, state, context);

        try {
          const result = await operation();
          this.observeResponse(bucket, result, context);
          return result;
        } catch (error) {
          this.observeError(bucket, error, context);
          throw error;
        } finally {
          this.scheduleMinimumSpacing(state);
        }
      });

    state.chain = queued.then(
      () => undefined,
      () => undefined
    );

    return queued;
  }

  observeResponse(
    bucket: string,
    response: unknown,
    context: GitHubRateLimitRequestContext = {}
  ): void {
    const headers = responseHeaders(response);

    this.log({
      event: "github_api_response",
      bucket,
      ...context,
      status: responseStatus(response),
      rate_limit: snapshotFromHeaders(headers)
    });
    this.observeHeaders(bucket, headers, context);
  }

  observeHeaders(
    bucket: string,
    headers: HeadersLike | undefined,
    context: GitHubRateLimitRequestContext = {}
  ): void {
    if (headers === undefined) {
      return;
    }

    const state = this.getBucket(bucket);
    const remaining = parseIntegerHeader(headers, "x-ratelimit-remaining");

    if (headerValuesMentionSecondaryRateLimit(headers)) {
      this.openCircuit(
        bucket,
        undefined,
        "secondary_rate_limit",
        snapshotFromHeaders(headers),
        context
      );
      return;
    }

    if (remaining === undefined) {
      return;
    }

    if (remaining <= 0) {
      this.openCircuit(
        bucket,
        resetTimeFromHeaders(headers),
        "primary_exhausted",
        snapshotFromHeaders(headers),
        context
      );
      return;
    }

    if (remaining < this.policy.slowRemainingThreshold) {
      state.nextAvailableAt = Math.max(
        state.nextAvailableAt,
        this.policy.clock() + this.policy.slowDelayMs
      );
    }
  }

  observeError(bucket: string, error: unknown, context: GitHubRateLimitRequestContext = {}): void {
    const maybeError = error as ErrorWithRateLimitShape;
    const status = typeof maybeError.status === "number" ? maybeError.status : undefined;
    const headers = maybeError.response?.headers;
    const message = typeof maybeError.message === "string" ? maybeError.message : undefined;
    const snapshot = snapshotFromHeaders(headers);

    this.log({
      event: "github_api_error",
      bucket,
      ...context,
      status,
      rate_limit: snapshot
    });

    if (isRateLimitSignal(status, headers, message)) {
      this.openCircuit(
        bucket,
        retryTimeFromError(headers, this.policy.clock(), this.policy.fallbackRetryMs),
        rateLimitReason(status, headers, message),
        snapshot,
        context
      );
    }
  }

  private async waitForTurn(
    bucket: string,
    state: BucketState,
    context: GitHubRateLimitRequestContext
  ): Promise<void> {
    const now = this.policy.clock();

    if (state.circuitOpenUntil > now) {
      throw new GitHubApiError(publicMessage("rate_limited"), {
        kind: "rate_limited",
        status: 429
      });
    }

    if (state.nextAvailableAt > now) {
      const delayMs = state.nextAvailableAt - now;
      this.log({
        event: "github_api_throttled",
        bucket,
        ...context,
        delay_ms: delayMs
      });
      await this.policy.sleep(delayMs);
    }

    const afterWait = this.policy.clock();

    if (state.circuitOpenUntil > afterWait) {
      throw new GitHubApiError(publicMessage("rate_limited"), {
        kind: "rate_limited",
        status: 429
      });
    }

    if (state.nextAvailableAt <= afterWait) {
      state.nextAvailableAt = 0;
    }
  }

  private scheduleMinimumSpacing(state: BucketState): void {
    if (this.policy.minRequestSpacingMs <= 0) {
      return;
    }

    state.nextAvailableAt = Math.max(
      state.nextAvailableAt,
      this.policy.clock() + this.policy.minRequestSpacingMs
    );
  }

  private openCircuit(
    bucket: string,
    retryAt: number | undefined,
    reason: CircuitOpenReason,
    snapshot: GitHubRateLimitSnapshot | undefined,
    context: GitHubRateLimitRequestContext
  ): void {
    const state = this.getBucket(bucket);
    const openUntil = retryAt ?? this.policy.clock() + this.policy.fallbackRetryMs;
    const previous = state.circuitOpenUntil;
    state.circuitOpenUntil = Math.max(state.circuitOpenUntil, openUntil);

    if (state.circuitOpenUntil > previous) {
      this.log({
        event: "github_api_circuit_opened",
        bucket,
        ...context,
        reason,
        open_until: new Date(state.circuitOpenUntil).toISOString(),
        rate_limit: snapshot
      });
    }
  }

  private getBucket(bucket: string): BucketState {
    const existing = this.buckets.get(bucket);

    if (existing !== undefined) {
      return existing;
    }

    const created: BucketState = {
      chain: Promise.resolve(),
      circuitOpenUntil: 0,
      nextAvailableAt: 0
    };
    this.buckets.set(bucket, created);
    return created;
  }

  private log(event: GitHubRateLimitLogEvent): void {
    this.policy.logger(omitUndefined(event) as GitHubRateLimitLogEvent);
  }
}

function responseHeaders(value: unknown): HeadersLike | undefined {
  if (typeof value !== "object" || value === null || !("headers" in value)) {
    return undefined;
  }

  const headers = (value as { headers?: unknown }).headers;
  return typeof headers === "object" && headers !== null ? (headers as HeadersLike) : undefined;
}

function responseStatus(value: unknown): number | undefined {
  if (typeof value !== "object" || value === null || !("status" in value)) {
    return undefined;
  }

  const status = (value as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function isRateLimitSignal(
  status: number | undefined,
  headers: HeadersLike | undefined,
  message: string | undefined
): boolean {
  if (status === 429) {
    return true;
  }

  if (headers !== undefined && parseIntegerHeader(headers, "x-ratelimit-remaining") === 0) {
    return true;
  }

  if (headers !== undefined && getHeader(headers, "retry-after") !== undefined) {
    return true;
  }

  if (headers !== undefined && headerValuesMentionSecondaryRateLimit(headers)) {
    return true;
  }

  return (
    status === 403 &&
    message !== undefined &&
    /secondary rate limit|abuse detection|rate limit exceeded|too many requests/i.test(message)
  );
}

function headerValuesMentionSecondaryRateLimit(headers: HeadersLike): boolean {
  return Object.values(headers).some(
    (value) =>
      typeof value === "string" &&
      /secondary rate limit|abuse detection|too many requests/i.test(value)
  );
}

function rateLimitReason(
  status: number | undefined,
  headers: HeadersLike | undefined,
  message: string | undefined
): CircuitOpenReason {
  if (headers !== undefined && getHeader(headers, "retry-after") !== undefined) {
    return "retry_after";
  }

  if (
    (status === 403 &&
      message !== undefined &&
      /secondary rate limit|abuse detection/i.test(message)) ||
    (headers !== undefined && headerValuesMentionSecondaryRateLimit(headers))
  ) {
    return "secondary_rate_limit";
  }

  if (headers !== undefined && parseIntegerHeader(headers, "x-ratelimit-remaining") === 0) {
    return "primary_exhausted";
  }

  return "rate_limited";
}

function snapshotFromHeaders(
  headers: HeadersLike | undefined
): GitHubRateLimitSnapshot | undefined {
  if (headers === undefined) {
    return undefined;
  }

  const snapshot: GitHubRateLimitSnapshot = {
    limit: parseIntegerHeader(headers, "x-ratelimit-limit"),
    remaining: parseIntegerHeader(headers, "x-ratelimit-remaining"),
    used: parseIntegerHeader(headers, "x-ratelimit-used"),
    reset_at: resetIsoFromHeaders(headers),
    resource: getHeader(headers, "x-ratelimit-resource"),
    retry_after_seconds: parseIntegerHeader(headers, "retry-after")
  };
  const cleaned = omitUndefined(snapshot);
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

function resetIsoFromHeaders(headers: HeadersLike): string | undefined {
  const resetSeconds = parseIntegerHeader(headers, "x-ratelimit-reset");

  if (resetSeconds === undefined) {
    return undefined;
  }

  return new Date(resetSeconds * 1000).toISOString();
}

function retryTimeFromError(
  headers: HeadersLike | undefined,
  now: number,
  fallbackRetryMs: number
): number {
  if (headers === undefined) {
    return now + fallbackRetryMs;
  }

  return retryAfterTime(headers, now) ?? resetTimeFromHeaders(headers) ?? now + fallbackRetryMs;
}

function retryAfterTime(headers: HeadersLike, now: number): number | undefined {
  const retryAfter = parseIntegerHeader(headers, "retry-after");

  if (retryAfter === undefined) {
    return undefined;
  }

  return now + retryAfter * 1000;
}

function resetTimeFromHeaders(headers: HeadersLike): number | undefined {
  const resetSeconds = parseIntegerHeader(headers, "x-ratelimit-reset");

  if (resetSeconds === undefined) {
    return undefined;
  }

  return resetSeconds * 1000;
}

function parseIntegerHeader(headers: HeadersLike, name: string): number | undefined {
  const value = getHeader(headers, name);

  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function getHeader(headers: HeadersLike, name: string): string | undefined {
  const lowerName = name.toLowerCase();

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== lowerName) {
      continue;
    }

    if (typeof value === "string") {
      return value;
    }

    if (typeof value === "number") {
      return String(value);
    }
  }

  return undefined;
}

function omitUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  ) as Partial<T>;
}
