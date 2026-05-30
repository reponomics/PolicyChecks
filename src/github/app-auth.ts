import { createAppAuth } from "@octokit/auth-app";
import { createPrivateKey } from "node:crypto";
import { request } from "@octokit/request";

import { GitHubRestClient, type GitHubRequest } from "./client.js";
import { GitHubRateLimiter } from "./rate-limit.js";

export interface GitHubAppAuthConfig {
  appId: number;
  privateKey: string;
  apiBaseUrl: string;
  apiVersion: string;
}

interface TokenAuthentication {
  token: string;
  expiresAt?: string;
}

interface CachedInstallationClient {
  client: GitHubRestClient;
  expiresAt: number;
}

export class GitHubAppTokenFactory {
  private readonly auth: ReturnType<typeof createAppAuth>;
  private readonly installationClients = new Map<number, CachedInstallationClient>();
  private readonly installationClientRequests = new Map<number, Promise<GitHubRestClient>>();
  private readonly rateLimiter: GitHubRateLimiter;

  constructor(
    private readonly config: GitHubAppAuthConfig,
    rateLimiter = new GitHubRateLimiter()
  ) {
    this.rateLimiter = rateLimiter;
    this.auth = createAppAuth({
      appId: config.appId,
      privateKey: normalizePrivateKeyPem(config.privateKey),
      request: this.createUnauthenticatedRequest("auth")
    });
  }

  async createAppRequest(): Promise<GitHubRequest> {
    const authentication = (await this.auth({
      type: "app"
    })) as TokenAuthentication;

    return this.createRequest(authentication.token, "app");
  }

  async createInstallationClient(installationId: number): Promise<GitHubRestClient> {
    const cached = this.installationClients.get(installationId);
    const now = Date.now();

    if (cached !== undefined && cached.expiresAt - 60_000 > now) {
      return cached.client;
    }

    const pending = this.installationClientRequests.get(installationId);

    if (pending !== undefined) {
      return pending;
    }

    const request = this.createInstallationClientUncached(installationId);
    this.installationClientRequests.set(installationId, request);

    try {
      return await request;
    } finally {
      this.installationClientRequests.delete(installationId);
    }
  }

  private async createInstallationClientUncached(
    installationId: number
  ): Promise<GitHubRestClient> {
    const authentication = (await this.auth({
      type: "installation",
      installationId
    })) as TokenAuthentication;
    const client = new GitHubRestClient(
      this.createRequest(authentication.token, `installation:${installationId}`)
    );

    this.installationClients.set(installationId, {
      client,
      expiresAt: tokenExpiresAt(authentication.expiresAt)
    });

    return client;
  }

  private createUnauthenticatedRequest(bucket: string): GitHubRequest {
    const githubRequest = request.defaults({
      baseUrl: this.config.apiBaseUrl,
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": this.config.apiVersion
      }
    });

    return ((route: string, parameters?: Record<string, unknown>) =>
      this.rateLimiter.run(bucket, () => githubRequest(route, parameters), {
        route
      })) as GitHubRequest;
  }

  private createRequest(token: string, bucket: string): GitHubRequest {
    const githubRequest = request.defaults({
      baseUrl: this.config.apiBaseUrl,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": this.config.apiVersion
      }
    });

    return ((route: string, parameters?: Record<string, unknown>) =>
      this.rateLimiter.run(bucket, () => githubRequest(route, parameters), {
        route
      })) as GitHubRequest;
  }
}

function tokenExpiresAt(expiresAt: string | undefined): number {
  if (expiresAt === undefined) {
    return Date.now() + 55 * 60 * 1000;
  }

  const parsed = Date.parse(expiresAt);
  return Number.isFinite(parsed) ? parsed : Date.now() + 55 * 60 * 1000;
}

export function normalizePrivateKeyPem(privateKey: string): string {
  try {
    return createPrivateKey(privateKey).export({
      format: "pem",
      type: "pkcs8"
    }) as string;
  } catch {
    return privateKey;
  }
}
