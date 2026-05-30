import { createHmac, timingSafeEqual } from "node:crypto";

import express, { Router, type Request, type Response } from "express";

import type { ClaimCache } from "../cache/cache.js";
import type { RepositoryRecord, RepositoryStore } from "../github/installations.js";

export interface WebhookRouterOptions {
  repositoryStore: RepositoryStore;
  webhookSecret: string;
  claimCache?: ClaimCache;
}

export function createWebhookRouter(options: WebhookRouterOptions): Router {
  const router = Router();

  router.post("/github/webhook", express.raw({ type: "application/json" }), (request, response) => {
    const rawBody = request.body;

    if (!Buffer.isBuffer(rawBody)) {
      response.status(400).json({
        ok: false,
        error: "invalid_payload"
      });
      return;
    }

    if (!verifySignature(rawBody, request.header("x-hub-signature-256"), options.webhookSecret)) {
      response.status(401).json({
        ok: false,
        error: "invalid_signature"
      });
      return;
    }

    const event = request.header("x-github-event");
    const delivery = request.header("x-github-delivery") ?? "unknown";

    if (typeof event !== "string" || event.trim() === "") {
      response.status(400).json({
        ok: false,
        error: "missing_event"
      });
      return;
    }

    const payload = parsePayload(rawBody, response);

    if (payload === undefined) {
      return;
    }

    if (event === "ping") {
      response.status(200).json({
        ok: true,
        event,
        delivery
      });
      return;
    }

    const processed =
      event === "installation"
        ? processInstallationEvent(payload, options.repositoryStore, options.claimCache)
        : event === "installation_repositories"
          ? processInstallationRepositoriesEvent(
              payload,
              options.repositoryStore,
              options.claimCache
            )
          : event === "repository_ruleset" || event === "repository"
            ? processRepositoryScopedUpdateEvent(
                payload,
                options.repositoryStore,
                options.claimCache
              )
            : processUnsupportedEvent(payload);

    response.status(202).json({
      ok: true,
      event,
      delivery,
      ...processed
    });
  });

  return router;
}

interface ProcessedWebhookResult {
  updated_repositories: number;
  removed_repositories: number;
  invalidated_claims: number;
  ignored: boolean;
}

function parsePayload(body: Buffer, response: Response): Record<string, unknown> | undefined {
  let parsed: unknown;

  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    response.status(400).json({
      ok: false,
      error: "invalid_json"
    });
    return undefined;
  }

  if (!isRecord(parsed)) {
    response.status(400).json({
      ok: false,
      error: "invalid_payload"
    });
    return undefined;
  }

  return parsed;
}

function processUnsupportedEvent(_payload: Record<string, unknown>): ProcessedWebhookResult {
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
    return processUnsupportedEvent(payload);
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
    return processUnsupportedEvent(payload);
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
    return processUnsupportedEvent(payload);
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

function verifySignature(body: Buffer, signature: string | undefined, secret: string): boolean {
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
