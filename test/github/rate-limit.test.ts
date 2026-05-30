import { describe, expect, it } from "vitest";

import { GitHubApiError } from "../../src/github/errors.js";
import { GitHubRateLimiter, type GitHubRateLimitPolicy } from "../../src/github/rate-limit.js";

function makePolicy() {
  let now = 0;
  const sleeps: number[] = [];
  const logs: unknown[] = [];
  const policy: GitHubRateLimitPolicy = {
    minRequestSpacingMs: 250,
    slowRemainingThreshold: 1_000,
    slowDelayMs: 1_000,
    fallbackRetryMs: 60_000,
    clock: () => now,
    sleep: async (durationMs) => {
      sleeps.push(durationMs);
      now += durationMs;
    },
    logger: (event) => {
      logs.push(event);
    }
  };

  return {
    policy,
    logs,
    sleeps,
    advance: (durationMs: number) => {
      now += durationMs;
    }
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

describe("GitHubRateLimiter", () => {
  it("serializes operations within the same bucket", async () => {
    const { policy } = makePolicy();
    const limiter = new GitHubRateLimiter(policy);
    const first = deferred<{ headers: Record<string, string> }>();
    const events: string[] = [];

    const firstRun = limiter.run("installation:1", async () => {
      events.push("first:start");
      const result = await first.promise;
      events.push("first:end");
      return result;
    });
    const secondRun = limiter.run("installation:1", async () => {
      events.push("second:start");
      return { headers: {} };
    });

    await flushQueue();
    expect(events).toEqual(["first:start"]);

    first.resolve({ headers: {} });
    await Promise.all([firstRun, secondRun]);

    expect(events).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("opens a circuit after a secondary or retry-after rate-limit response", async () => {
    const { policy } = makePolicy();
    const limiter = new GitHubRateLimiter(policy);
    let calledAfterCircuitOpened = false;

    await expect(
      limiter.run("installation:1", async () => {
        throw {
          status: 429,
          message: "secondary rate limit",
          response: { headers: { "retry-after": "30" } }
        };
      })
    ).rejects.toMatchObject({ status: 429 });

    await expect(
      limiter.run("installation:1", async () => {
        calledAfterCircuitOpened = true;
        return { headers: {} };
      })
    ).rejects.toBeInstanceOf(GitHubApiError);
    expect(calledAfterCircuitOpened).toBe(false);
  });

  it("opens a circuit when response header values mention a secondary limit", async () => {
    const { policy } = makePolicy();
    const limiter = new GitHubRateLimiter(policy);

    await expect(
      limiter.run("installation:1", async () => {
        throw {
          status: 403,
          response: { headers: { "x-github-warning": "secondary rate limit active" } }
        };
      })
    ).rejects.toMatchObject({ status: 403 });

    await expect(
      limiter.run("installation:1", async () => ({ headers: {} }))
    ).rejects.toBeInstanceOf(GitHubApiError);
  });

  it("slows subsequent requests when remaining quota is below the soft threshold", async () => {
    const { policy, logs, sleeps } = makePolicy();
    const limiter = new GitHubRateLimiter(policy);

    await limiter.run("installation:1", async () => ({
      headers: { "x-ratelimit-remaining": "999" }
    }));
    await limiter.run("installation:1", async () => ({ headers: {} }));

    expect(sleeps).toEqual([1_000]);
    expect(logs).toContainEqual({
      event: "github_api_response",
      bucket: "installation:1",
      rate_limit: {
        remaining: 999
      }
    });
    expect(logs).toContainEqual({
      event: "github_api_throttled",
      bucket: "installation:1",
      delay_ms: 1_000
    });
  });

  it("applies minimum spacing between successful requests in the same bucket", async () => {
    const { policy, sleeps } = makePolicy();
    const limiter = new GitHubRateLimiter(policy);

    await limiter.run("installation:1", async () => ({ headers: {} }));
    await limiter.run("installation:1", async () => ({ headers: {} }));

    expect(sleeps).toEqual([250]);
  });

  it("does not delay when minimum spacing is disabled", async () => {
    const { policy, sleeps } = makePolicy();
    policy.minRequestSpacingMs = 0;
    const limiter = new GitHubRateLimiter(policy);

    await limiter.run("installation:1", async () => ({ headers: {} }));
    await limiter.run("installation:1", async () => ({ headers: {} }));

    expect(sleeps).toEqual([]);
  });

  it("logs circuit-open events with route context and reset metadata", async () => {
    const { policy, logs } = makePolicy();
    const limiter = new GitHubRateLimiter(policy);

    await expect(
      limiter.run(
        "installation:1",
        async () => ({
          status: 403,
          headers: {
            "x-ratelimit-limit": "5000",
            "x-ratelimit-remaining": "0",
            "x-ratelimit-used": "5000",
            "x-ratelimit-reset": "60",
            "x-ratelimit-resource": "core"
          }
        }),
        { route: "GET /repos/{owner}/{repo}" }
      )
    ).resolves.toBeDefined();

    expect(logs).toContainEqual({
      event: "github_api_circuit_opened",
      bucket: "installation:1",
      route: "GET /repos/{owner}/{repo}",
      reason: "primary_exhausted",
      open_until: "1970-01-01T00:01:00.000Z",
      rate_limit: {
        limit: 5000,
        remaining: 0,
        used: 5000,
        reset_at: "1970-01-01T00:01:00.000Z",
        resource: "core"
      }
    });
  });

  it("uses fallback retry timing when a 429 error has no response headers", async () => {
    const { policy, logs } = makePolicy();
    const limiter = new GitHubRateLimiter(policy);

    await expect(
      limiter.run("installation:1", async () => {
        throw {
          status: 429,
          message: "too many requests"
        };
      })
    ).rejects.toMatchObject({ status: 429 });

    expect(logs).toContainEqual({
      event: "github_api_circuit_opened",
      bucket: "installation:1",
      reason: "rate_limited",
      open_until: "1970-01-01T00:01:00.000Z"
    });
  });

  it("opens a retry-after circuit for non-429 errors carrying retry-after headers", async () => {
    const { policy, logs } = makePolicy();
    const limiter = new GitHubRateLimiter(policy);

    await expect(
      limiter.run("installation:1", async () => {
        throw {
          status: 403,
          response: { headers: { "retry-after": "15" } }
        };
      })
    ).rejects.toMatchObject({ status: 403 });

    expect(logs).toContainEqual({
      event: "github_api_circuit_opened",
      bucket: "installation:1",
      reason: "retry_after",
      open_until: "1970-01-01T00:00:15.000Z",
      rate_limit: {
        retry_after_seconds: 15
      }
    });
  });

  it("opens a primary-exhausted circuit for error responses with zero remaining quota", async () => {
    const { policy, logs } = makePolicy();
    const limiter = new GitHubRateLimiter(policy);

    await expect(
      limiter.run("installation:1", async () => {
        throw {
          status: 403,
          response: { headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "45" } }
        };
      })
    ).rejects.toMatchObject({ status: 403 });

    expect(logs).toContainEqual({
      event: "github_api_circuit_opened",
      bucket: "installation:1",
      reason: "primary_exhausted",
      open_until: "1970-01-01T00:00:45.000Z",
      rate_limit: {
        remaining: 0,
        reset_at: "1970-01-01T00:00:45.000Z"
      }
    });
  });

  it("treats rate-limit wording in 403 messages as a rate-limit signal", async () => {
    const { policy, logs } = makePolicy();
    const limiter = new GitHubRateLimiter(policy);

    await expect(
      limiter.run("installation:1", async () => {
        throw {
          status: 403,
          message: "rate limit exceeded"
        };
      })
    ).rejects.toMatchObject({ status: 403 });

    expect(logs).toContainEqual({
      event: "github_api_circuit_opened",
      bucket: "installation:1",
      reason: "rate_limited",
      open_until: "1970-01-01T00:01:00.000Z"
    });
  });

  it("parses numeric rate-limit headers in responses", async () => {
    const { policy, logs } = makePolicy();
    const limiter = new GitHubRateLimiter(policy);

    await limiter.run("installation:1", async () => ({
      status: 200,
      headers: {
        "x-ratelimit-limit": 5000,
        "x-ratelimit-remaining": 4000,
        "x-ratelimit-used": 1000,
        "x-ratelimit-reset": 60,
        "retry-after": 2
      }
    }));

    expect(logs).toContainEqual({
      event: "github_api_response",
      bucket: "installation:1",
      status: 200,
      rate_limit: {
        limit: 5000,
        remaining: 4000,
        used: 1000,
        reset_at: "1970-01-01T00:01:00.000Z",
        retry_after_seconds: 2
      }
    });
  });

  it("does not log a second circuit-open event when the existing circuit is longer", async () => {
    const { policy, logs } = makePolicy();
    const limiter = new GitHubRateLimiter(policy);

    await expect(
      limiter.run("installation:1", async () => {
        throw {
          status: 429,
          response: { headers: { "retry-after": "60" } }
        };
      })
    ).rejects.toMatchObject({ status: 429 });
    await expect(
      limiter.observeError("installation:1", {
        status: 429,
        response: { headers: { "retry-after": "30" } }
      })
    ).toBeUndefined();

    expect(
      logs.filter(
        (event) =>
          typeof event === "object" &&
          event !== null &&
          "event" in event &&
          event.event === "github_api_circuit_opened"
      )
    ).toHaveLength(1);
  });

  it("keeps separate installation buckets independent", async () => {
    const { policy } = makePolicy();
    const limiter = new GitHubRateLimiter(policy);
    const first = deferred<{ headers: Record<string, string> }>();
    const events: string[] = [];

    const firstRun = limiter.run("installation:1", async () => {
      events.push("first:start");
      return first.promise;
    });
    const secondRun = limiter.run("installation:2", async () => {
      events.push("second:start");
      return { headers: {} };
    });

    await flushQueue();
    expect(events).toEqual(["first:start", "second:start"]);

    first.resolve({ headers: {} });
    await Promise.all([firstRun, secondRun]);
  });
});

async function flushQueue(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
