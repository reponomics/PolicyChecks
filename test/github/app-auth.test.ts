import { createPrivateKey, generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GitHubRateLimiter } from "../../src/github/rate-limit.js";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  createAppAuth: vi.fn(),
  defaultedRequests: [] as Array<{
    options: {
      baseUrl?: string;
      headers?: Record<string, string>;
    };
    request: ReturnType<typeof vi.fn>;
  }>,
  requestDefaults: vi.fn()
}));

vi.mock("@octokit/auth-app", () => ({
  createAppAuth: mocks.createAppAuth
}));

vi.mock("@octokit/request", () => ({
  request: {
    defaults: mocks.requestDefaults
  }
}));

import { GitHubAppTokenFactory, normalizePrivateKeyPem } from "../../src/github/app-auth.js";

const config = {
  appId: 123,
  privateKey: "not-a-real-private-key",
  apiBaseUrl: "https://api.example.test",
  apiVersion: "2022-11-28"
};

interface RateLimiterCall {
  bucket: string;
  context: Record<string, unknown> | undefined;
}

function setupOctokitMocks() {
  mocks.createAppAuth.mockReturnValue(mocks.auth);
  mocks.auth.mockImplementation(async (parameters: { type: string; installationId?: number }) => {
    if (parameters.type === "app") {
      return { token: "app-token" };
    }

    return {
      token: `installation-token-${parameters.installationId}`,
      expiresAt: "2026-06-01T13:00:00.000Z"
    };
  });
  mocks.requestDefaults.mockImplementation(
    (options: { baseUrl?: string; headers?: Record<string, string> }) => {
      const request = vi.fn(async (route: string, parameters?: Record<string, unknown>) => ({
        data: { route, parameters },
        headers: {},
        status: 200
      }));
      mocks.defaultedRequests.push({ options, request });
      return request;
    }
  );
}

function makeRateLimiter(): { calls: RateLimiterCall[]; rateLimiter: GitHubRateLimiter } {
  const calls: RateLimiterCall[] = [];
  const rateLimiter = {
    run: vi.fn(
      async (
        bucket: string,
        operation: () => Promise<unknown>,
        context?: Record<string, unknown>
      ) => {
        calls.push({ bucket, context });
        return operation();
      }
    )
  };

  return { calls, rateLimiter: rateLimiter as unknown as GitHubRateLimiter };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

describe("normalizePrivateKeyPem", () => {
  it("exports a parseable private key as canonical PKCS#8 PEM", () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 1024,
      publicKeyEncoding: { format: "pem", type: "spki" },
      privateKeyEncoding: { format: "pem", type: "pkcs1" }
    });

    const normalized = normalizePrivateKeyPem(privateKey);

    expect(normalized).toContain("-----BEGIN PRIVATE KEY-----");
    expect(normalized).not.toContain("-----BEGIN RSA PRIVATE KEY-----");
    expect(createPrivateKey(normalized).asymmetricKeyType).toBe("rsa");
  });

  it("returns the original value when crypto cannot parse the key", () => {
    expect(normalizePrivateKeyPem("not-a-pem")).toBe("not-a-pem");
  });
});

describe("GitHubAppTokenFactory", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.defaultedRequests.length = 0;
    setupOctokitMocks();
  });

  it("passes normalized config and an unauthenticated rate-limited request to createAppAuth", async () => {
    const { calls, rateLimiter } = makeRateLimiter();

    new GitHubAppTokenFactory(config, rateLimiter);
    const authOptions = mocks.createAppAuth.mock.calls[0]?.[0] as
      | { appId: number; privateKey: string; request: (route: string) => Promise<unknown> }
      | undefined;

    expect(authOptions).toMatchObject({
      appId: 123,
      privateKey: config.privateKey
    });

    await authOptions?.request("POST /app/installations/{installation_id}/access_tokens");

    expect(mocks.requestDefaults).toHaveBeenCalledWith({
      baseUrl: "https://api.example.test",
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28"
      }
    });
    expect(calls).toContainEqual({
      bucket: "auth",
      context: { route: "POST /app/installations/{installation_id}/access_tokens" }
    });
  });

  it("creates an app request with bearer auth and route context", async () => {
    const { calls, rateLimiter } = makeRateLimiter();
    const factory = new GitHubAppTokenFactory(config, rateLimiter);

    const appRequest = await factory.createAppRequest();
    const response = await appRequest("GET /app", { marker: "app" });

    expect(response).toMatchObject({
      data: { route: "GET /app", parameters: { marker: "app" } }
    });
    expect(mocks.auth).toHaveBeenCalledWith({ type: "app" });
    expect(mocks.defaultedRequests.at(-1)?.options).toEqual({
      baseUrl: "https://api.example.test",
      headers: {
        accept: "application/vnd.github+json",
        authorization: "Bearer app-token",
        "x-github-api-version": "2022-11-28"
      }
    });
    expect(calls).toContainEqual({
      bucket: "app",
      context: { route: "GET /app" }
    });
    expect(mocks.defaultedRequests.at(-1)?.request).toHaveBeenCalledWith("GET /app", {
      marker: "app"
    });
  });

  it("caches installation clients until the token is close to expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
    const { rateLimiter } = makeRateLimiter();
    const factory = new GitHubAppTokenFactory(config, rateLimiter);

    const first = await factory.createInstallationClient(42);
    const second = await factory.createInstallationClient(42);

    expect(second).toBe(first);
    expect(mocks.auth).toHaveBeenCalledTimes(1);
    expect(mocks.auth).toHaveBeenCalledWith({ type: "installation", installationId: 42 });

    vi.setSystemTime(new Date("2026-06-01T12:59:00.001Z"));
    const refreshed = await factory.createInstallationClient(42);

    expect(refreshed).not.toBe(first);
    expect(mocks.auth).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent requests for the same installation client", async () => {
    const pendingAuth = deferred<{ token: string; expiresAt: string }>();
    mocks.auth.mockReturnValue(pendingAuth.promise);
    const { rateLimiter } = makeRateLimiter();
    const factory = new GitHubAppTokenFactory(config, rateLimiter);

    const first = factory.createInstallationClient(42);
    const second = factory.createInstallationClient(42);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.auth).toHaveBeenCalledOnce();

    pendingAuth.resolve({
      token: "installation-token-42",
      expiresAt: "2026-06-01T13:00:00.000Z"
    });

    await expect(Promise.all([first, second])).resolves.toSatisfy(([firstClient, secondClient]) =>
      Object.is(firstClient, secondClient)
    );
  });

  it("uses the fallback token lifetime when an installation token omits expiresAt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
    mocks.auth.mockResolvedValue({ token: "installation-token-42" });
    const { rateLimiter } = makeRateLimiter();
    const factory = new GitHubAppTokenFactory(config, rateLimiter);

    const first = await factory.createInstallationClient(42);

    vi.setSystemTime(new Date("2026-06-01T12:53:59.999Z"));
    expect(await factory.createInstallationClient(42)).toBe(first);

    vi.setSystemTime(new Date("2026-06-01T12:54:00.001Z"));
    expect(await factory.createInstallationClient(42)).not.toBe(first);
    expect(mocks.auth).toHaveBeenCalledTimes(2);
  });

  it("uses the fallback token lifetime when expiresAt is malformed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
    mocks.auth.mockResolvedValue({ token: "installation-token-42", expiresAt: "not-a-date" });
    const { rateLimiter } = makeRateLimiter();
    const factory = new GitHubAppTokenFactory(config, rateLimiter);

    const first = await factory.createInstallationClient(42);

    vi.setSystemTime(new Date("2026-06-01T12:54:00.001Z"));
    expect(await factory.createInstallationClient(42)).not.toBe(first);
    expect(mocks.auth).toHaveBeenCalledTimes(2);
  });

  it("builds installation clients whose REST calls use installation buckets and route context", async () => {
    const { calls, rateLimiter } = makeRateLimiter();
    const factory = new GitHubAppTokenFactory(config, rateLimiter);

    const client = await factory.createInstallationClient(99);
    await expect(client.getRepository("OWNER", "REPO")).resolves.toEqual({
      route: "GET /repos/{owner}/{repo}",
      parameters: { owner: "OWNER", repo: "REPO" }
    });

    expect(mocks.defaultedRequests.at(-1)?.options).toEqual({
      baseUrl: "https://api.example.test",
      headers: {
        accept: "application/vnd.github+json",
        authorization: "Bearer installation-token-99",
        "x-github-api-version": "2022-11-28"
      }
    });
    expect(calls).toContainEqual({
      bucket: "installation:99",
      context: { route: "GET /repos/{owner}/{repo}" }
    });
    expect(mocks.defaultedRequests.at(-1)?.request).toHaveBeenCalledWith(
      "GET /repos/{owner}/{repo}",
      {
        owner: "OWNER",
        repo: "REPO"
      }
    );
  });
});
