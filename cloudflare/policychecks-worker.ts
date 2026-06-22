import { createHmac, timingSafeEqual } from "node:crypto";

import { InMemoryClaimCache } from "../src/cache/cache.js";
import { renderBadgeSvg } from "../src/badges/svg.js";
import { toShieldsJson } from "../src/badges/shields-json.js";
import { claimDefinitions, getClaimDefinition } from "../src/claims/registry.js";
import type { ClaimDefinition } from "../src/claims/types.js";
import { GitHubAppTokenFactory } from "../src/github/app-auth.js";
import {
  GitHubInstallationResolver,
  InMemoryRepositoryStore
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
}

interface RuntimeConfig {
  cacheTtlMs: number;
  github: {
    appId: number;
    privateKey: string;
    apiBaseUrl: string;
    apiVersion: string;
  };
}

const cacheControl = "public, max-age=300, stale-while-revalidate=300";
const maxWebhookBodyBytes = 256 * 1024;
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
        return handleWebhook(request, getWebhookSecret(env));
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

async function handleWebhook(request: Request, webhookSecret: string): Promise<Response> {
  const contentLength = parseContentLength(request.headers.get("content-length"));

  if (contentLength !== undefined && contentLength > maxWebhookBodyBytes) {
    return json(
      {
        ok: false,
        error: "payload_too_large"
      },
      413
    );
  }

  const body = new Uint8Array(await request.arrayBuffer());

  if (body.byteLength > maxWebhookBodyBytes) {
    return json(
      {
        ok: false,
        error: "payload_too_large"
      },
      413
    );
  }

  const signature = request.headers.get("x-hub-signature-256") ?? undefined;

  if (!verifySignature(body, signature, webhookSecret)) {
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

  const action = getString(payload.action);
  const ignored =
    event !== "marketplace_purchase" || (action !== "purchased" && action !== "cancelled");

  return json(
    {
      ok: true,
      event,
      delivery,
      action,
      ignored
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
    claimService
  };
  runtimeKey = key;
  return runtimeCache;
}

function loadWorkerConfig(env: WorkerEnv): RuntimeConfig {
  const appId = parseRequiredInteger(env.GITHUB_APP_ID, "GITHUB_APP_ID");
  const privateKey = readPrivateKey(env);

  return {
    cacheTtlMs: parseOptionalInteger(env.CACHE_TTL_SECONDS, 3600, "CACHE_TTL_SECONDS") * 1000,
    github: {
      appId,
      privateKey,
      apiBaseUrl: env.GITHUB_API_BASE_URL ?? "https://api.github.com",
      apiVersion: env.GITHUB_API_VERSION ?? "2026-03-10"
    }
  };
}

function getWebhookSecret(env: WorkerEnv): string {
  return parseRequiredString(env.GITHUB_WEBHOOK_SECRET, "GITHUB_WEBHOOK_SECRET");
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

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseContentLength(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value)) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
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
