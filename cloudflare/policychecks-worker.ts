import { createHmac, timingSafeEqual } from "node:crypto";

import { InMemoryClaimCache, type ClaimCache } from "../src/cache/cache.js";
import { renderBadgeSvg } from "../src/badges/svg.js";
import { toShieldsJson } from "../src/badges/shields-json.js";
import { claimDefinitions, getClaimDefinition } from "../src/claims/registry.js";
import type { ClaimDefinition } from "../src/claims/types.js";
import { GitHubAppTokenFactory } from "../src/github/app-auth.js";
import {
  GitHubInstallationResolver,
  InMemoryRepositoryStore,
  type RepositoryRecord,
  type RepositoryStore
} from "../src/github/installations.js";
import { ClaimService } from "../src/server/claim-service.js";

interface WorkerEnv {
  GITHUB_APP_ID: string;
  GITHUB_PRIVATE_KEY?: string;
  GITHUB_PRIVATE_KEY_BASE64?: string;
  GITHUB_WEBHOOK_SECRET: string;
  CACHE_TTL_SECONDS?: string;
  GITHUB_API_BASE_URL?: string;
  GITHUB_API_VERSION?: string;
}

interface Runtime {
  claimService: ClaimService;
  repositoryStore: InMemoryRepositoryStore;
  claimCache: InMemoryClaimCache;
  webhookSecret: string;
}

interface RuntimeConfig {
  cacheTtlMs: number;
  github: {
    appId: number;
    privateKey: string;
    webhookSecret: string;
    apiBaseUrl: string;
    apiVersion: string;
  };
}

interface ProcessedWebhookResult {
  updated_repositories: number;
  removed_repositories: number;
  invalidated_claims: number;
  ignored: boolean;
}

const cacheControl = "public, max-age=300, stale-while-revalidate=300";
let runtimeCache: Runtime | undefined;
let runtimeKey: string | undefined;

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    try {
      const url = new URL(request.url);
      const { pathname } = url;

      if (request.method === "GET" && pathname === "/healthz") {
        return json({
          ok: true
        });
      }

      if (request.method === "POST" && pathname === "/github/webhook") {
        const runtime = getRuntime(env);
        return handleWebhook(request, runtime);
      }

      if (request.method !== "GET") {
        return json(
          {
            error: "not_found"
          },
          404
        );
      }

      const route = parsePath(pathname);

      if (route.kind === "not_found") {
        return json(
          {
            error: "not_found"
          },
          404
        );
      }

      if (route.kind === "info") {
        const runtime = getRuntime(env);
        const claims = await runtime.claimService.evaluateMany(
          claimDefinitions,
          route.owner,
          route.repo
        );

        return json(
          {
            owner: route.owner,
            repo: route.repo,
            claims
          },
          200,
          {
            "Cache-Control": cacheControl
          }
        );
      }

      const definition = getClaimDefinition(route.claim);

      if (definition === undefined) {
        return json(
          {
            error: "unsupported_claim",
            claim: route.claim
          },
          404
        );
      }

      const runtime = getRuntime(env);
      const result = await runtime.claimService.evaluate(definition, route.owner, route.repo);

      if (route.kind === "json") {
        return json(toShieldsJson(definition, result), 200, {
          "Cache-Control": cacheControl
        });
      }

      if (route.kind === "proof") {
        return json(result, 200, {
          "Cache-Control": cacheControl
        });
      }

      const svg = renderBadgeSvg(definition, result);
      return new Response(svg, {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": cacheControl
        }
      });
    } catch (error) {
      console.error(error);
      return json(
        {
          error: "internal_error",
          message: "The request failed before the claim could be verified."
        },
        500
      );
    }
  }
};

type ParsedPath =
  | {
      kind: "info";
      owner: string;
      repo: string;
    }
  | {
      kind: "json" | "svg" | "proof";
      owner: string;
      repo: string;
      claim: string;
    }
  | {
      kind: "not_found";
    };

function parsePath(pathname: string): ParsedPath {
  const parts = pathname.split("/").filter((part) => part !== "");

  if (parts.length < 4 || parts[0] !== "github") {
    return { kind: "not_found" };
  }

  const owner = decodeURIComponent(parts[1] ?? "");
  const repo = decodeURIComponent(parts[2] ?? "");

  if (owner === "" || repo === "") {
    return { kind: "not_found" };
  }

  if (parts.length === 4 && parts[3] === "info.json") {
    return {
      kind: "info",
      owner,
      repo
    };
  }

  if (parts.length === 4 && parts[3]?.endsWith(".json")) {
    return {
      kind: "json",
      owner,
      repo,
      claim: parts[3].slice(0, -".json".length)
    };
  }

  if (parts.length === 4 && parts[3]?.endsWith(".svg")) {
    return {
      kind: "svg",
      owner,
      repo,
      claim: parts[3].slice(0, -".svg".length)
    };
  }

  if (parts.length === 5 && parts[4] === "proof.json") {
    return {
      kind: "proof",
      owner,
      repo,
      claim: parts[3] ?? ""
    };
  }

  return { kind: "not_found" };
}

async function handleWebhook(request: Request, runtime: Runtime): Promise<Response> {
  const body = new Uint8Array(await request.arrayBuffer());
  const signature = request.headers.get("x-hub-signature-256") ?? undefined;

  if (!verifySignature(body, signature, runtime.webhookSecret)) {
    return json(
      {
        ok: false,
        error: "invalid_signature"
      },
      401
    );
  }

  const event = request.headers.get("x-github-event") ?? undefined;
  const delivery = request.headers.get("x-github-delivery") ?? "unknown";

  if (event === undefined || event.trim() === "") {
    return json(
      {
        ok: false,
        error: "missing_event"
      },
      400
    );
  }

  const payload = parseWebhookPayload(body);

  if (payload === undefined) {
    return json(
      {
        ok: false,
        error: "invalid_json"
      },
      400
    );
  }

  if (event === "ping") {
    return json({
      ok: true,
      event,
      delivery
    });
  }

  const processed =
    event === "installation"
      ? processInstallationEvent(payload, runtime.repositoryStore, runtime.claimCache)
      : event === "installation_repositories"
        ? processInstallationRepositoriesEvent(payload, runtime.repositoryStore, runtime.claimCache)
        : event === "repository_ruleset" || event === "repository"
          ? processRepositoryScopedUpdateEvent(payload, runtime.repositoryStore, runtime.claimCache)
          : processUnsupportedEvent();

  return json(
    {
      ok: true,
      event,
      delivery,
      ...processed
    },
    202
  );
}

function parseWebhookPayload(body: Uint8Array): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(body));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function processUnsupportedEvent(): ProcessedWebhookResult {
  return {
    updated_repositories: 0,
    removed_repositories: 0,
    invalidated_claims: 0,
    ignored: true
  };
}

function processInstallationEvent(
  payload: Record<string, unknown>,
  repositoryStore: RepositoryStore,
  claimCache?: ClaimCache
): ProcessedWebhookResult {
  const action = getString(payload.action);
  const installationId = getInstallationId(payload);

  if (action === undefined || installationId === undefined) {
    return processUnsupportedEvent();
  }

  if (action === "deleted") {
    const deleted = repositoryStore.deleteByInstallationId(installationId);
    let invalidated = 0;

    for (const record of deleted) {
      invalidated += invalidateRepositoryClaims(claimCache, record.owner, record.repo);
    }

    return {
      updated_repositories: 0,
      removed_repositories: deleted.length,
      invalidated_claims: invalidated,
      ignored: false
    };
  }

  if (action !== "created" && action !== "new_permissions_accepted" && action !== "unsuspend") {
    return processUnsupportedEvent();
  }

  const repositories = getArray(payload.repositories);
  const now = new Date().toISOString();
  let updated = 0;
  let invalidated = 0;

  for (const repository of repositories) {
    const record = toRepositoryRecord(repository, installationId, now);

    if (record === undefined) {
      continue;
    }

    repositoryStore.put(record);
    invalidated += invalidateRepositoryClaims(claimCache, record.owner, record.repo);
    updated += 1;
  }

  return {
    updated_repositories: updated,
    removed_repositories: 0,
    invalidated_claims: invalidated,
    ignored: false
  };
}

function processInstallationRepositoriesEvent(
  payload: Record<string, unknown>,
  repositoryStore: RepositoryStore,
  claimCache?: ClaimCache
): ProcessedWebhookResult {
  const installationId = getInstallationId(payload);

  if (installationId === undefined) {
    return processUnsupportedEvent();
  }

  const repositoriesAdded = getArray(payload.repositories_added);
  const repositoriesRemoved = getArray(payload.repositories_removed);
  const now = new Date().toISOString();
  let updated = 0;
  let removed = 0;
  let invalidated = 0;

  for (const repository of repositoriesAdded) {
    const record = toRepositoryRecord(repository, installationId, now);

    if (record === undefined) {
      continue;
    }

    repositoryStore.put(record);
    invalidated += invalidateRepositoryClaims(claimCache, record.owner, record.repo);
    updated += 1;
  }

  for (const repository of repositoriesRemoved) {
    const coordinates = toRepositoryCoordinates(repository);

    if (coordinates === undefined) {
      continue;
    }

    invalidated += invalidateRepositoryClaims(claimCache, coordinates.owner, coordinates.repo);
    removed += repositoryStore.delete(coordinates.owner, coordinates.repo) ? 1 : 0;
  }

  return {
    updated_repositories: updated,
    removed_repositories: removed,
    invalidated_claims: invalidated,
    ignored: false
  };
}

function processRepositoryScopedUpdateEvent(
  payload: Record<string, unknown>,
  repositoryStore: RepositoryStore,
  claimCache?: ClaimCache
): ProcessedWebhookResult {
  const installationId = getInstallationId(payload);
  const repository = isRecord(payload.repository) ? payload.repository : undefined;
  const coordinates = toRepositoryCoordinates(repository);
  let invalidated = 0;
  let updated = 0;

  if (coordinates !== undefined) {
    invalidated = invalidateRepositoryClaims(claimCache, coordinates.owner, coordinates.repo);

    if (installationId !== undefined) {
      const record = toRepositoryRecord(repository, installationId, new Date().toISOString());

      if (record !== undefined) {
        repositoryStore.put(record);
        updated = 1;
      }
    }
  }

  return {
    updated_repositories: updated,
    removed_repositories: 0,
    invalidated_claims: invalidated,
    ignored: coordinates === undefined
  };
}

function getRuntime(env: WorkerEnv): Runtime {
  const config = loadWorkerConfig(env);
  const key = `${config.github.appId}:${config.github.apiBaseUrl}:${config.github.apiVersion}`;

  if (runtimeCache !== undefined && runtimeKey === key) {
    return runtimeCache;
  }

  const repositoryStore = new InMemoryRepositoryStore();
  const claimCache = new InMemoryClaimCache();
  const tokenFactory = new GitHubAppTokenFactory({
    appId: config.github.appId,
    privateKey: config.github.privateKey,
    apiBaseUrl: config.github.apiBaseUrl,
    apiVersion: config.github.apiVersion
  });
  const installationResolver = new GitHubInstallationResolver(tokenFactory, repositoryStore);
  const claimService = new ClaimService({
    cache: claimCache,
    installationResolver,
    cacheTtlMs: config.cacheTtlMs
  });

  runtimeCache = {
    claimService,
    repositoryStore,
    claimCache,
    webhookSecret: config.github.webhookSecret
  };
  runtimeKey = key;
  return runtimeCache;
}

function loadWorkerConfig(env: WorkerEnv): RuntimeConfig {
  const appId = parseRequiredInteger(env.GITHUB_APP_ID, "GITHUB_APP_ID");
  const privateKey = readPrivateKey(env);
  const webhookSecret = parseRequiredString(env.GITHUB_WEBHOOK_SECRET, "GITHUB_WEBHOOK_SECRET");

  return {
    cacheTtlMs: parseOptionalInteger(env.CACHE_TTL_SECONDS, 3600, "CACHE_TTL_SECONDS") * 1000,
    github: {
      appId,
      privateKey,
      webhookSecret,
      apiBaseUrl: env.GITHUB_API_BASE_URL ?? "https://api.github.com",
      apiVersion: env.GITHUB_API_VERSION ?? "2026-03-10"
    }
  };
}

function readPrivateKey(env: WorkerEnv): string {
  if (env.GITHUB_PRIVATE_KEY_BASE64 !== undefined && env.GITHUB_PRIVATE_KEY_BASE64.trim() !== "") {
    const decoded = atob(env.GITHUB_PRIVATE_KEY_BASE64);
    return decoded;
  }

  if (env.GITHUB_PRIVATE_KEY === undefined || env.GITHUB_PRIVATE_KEY.trim() === "") {
    throw new Error(
      "Missing GITHUB_PRIVATE_KEY. Provide the GitHub App private key or GITHUB_PRIVATE_KEY_BASE64."
    );
  }

  return env.GITHUB_PRIVATE_KEY.replace(/\\n/g, "\n");
}

function parseRequiredInteger(value: string | undefined, name: string): number {
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing ${name}.`);
  }

  return parseInteger(value, name);
}

function parseRequiredString(value: string | undefined, name: string): string {
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing ${name}.`);
  }

  return value;
}

function parseOptionalInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  return parseInteger(value, name);
}

function parseInteger(value: string, name: string): number {
  const normalized = value.trim();

  if (!/^[1-9]\d*$/.test(normalized)) {
    throw new Error(`${name} must be a positive integer.`);
  }

  const parsed = Number(normalized);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function verifySignature(body: Uint8Array, signature: string | undefined, secret: string): boolean {
  if (signature === undefined || !signature.startsWith("sha256=")) {
    return false;
  }

  const received = signature.slice("sha256=".length).toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(received)) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(body).digest("hex");

  return timingSafeEqual(Buffer.from(received, "utf8"), Buffer.from(expected, "utf8"));
}

function toRepositoryRecord(
  repository: unknown,
  installationId: number,
  timestamp: string
): RepositoryRecord | undefined {
  const coordinates = toRepositoryCoordinates(repository);

  if (coordinates === undefined) {
    return undefined;
  }

  const id = getNumber((repository as Record<string, unknown>).id);

  if (id === undefined) {
    return undefined;
  }

  const defaultBranch = getString((repository as Record<string, unknown>).default_branch) ?? null;

  return {
    owner: coordinates.owner,
    repo: coordinates.repo,
    repositoryId: id,
    installationId,
    defaultBranch,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function toRepositoryCoordinates(repository: unknown):
  | {
      owner: string;
      repo: string;
    }
  | undefined {
  if (!isRecord(repository)) {
    return undefined;
  }

  const fullName = getString(repository.full_name);

  if (fullName !== undefined) {
    const [owner, repo] = fullName.split("/");

    if (owner !== undefined && owner.trim() !== "" && repo !== undefined && repo.trim() !== "") {
      return { owner, repo };
    }
  }

  const owner = isRecord(repository.owner) ? getString(repository.owner.login) : undefined;
  const repo = getString(repository.name);

  if (owner === undefined || repo === undefined) {
    return undefined;
  }

  return { owner, repo };
}

function getInstallationId(payload: Record<string, unknown>): number | undefined {
  if (!isRecord(payload.installation)) {
    return undefined;
  }

  return getNumber(payload.installation.id);
}

function invalidateRepositoryClaims(
  claimCache: ClaimCache | undefined,
  owner: string,
  repo: string
): number {
  if (claimCache === undefined) {
    return 0;
  }

  return claimCache.deleteByRepository(owner, repo);
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers
    }
  });
}
