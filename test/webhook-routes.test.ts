import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";

import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { InMemoryClaimCache } from "../src/cache/cache.js";
import { shaPinningRequiredClaim } from "../src/claims/sha-pinning-required.js";
import { InMemoryRepositoryStore } from "../src/github/installations.js";
import { createWebhookRouter } from "../src/routes/webhook-routes.js";

const webhookSecret = "test-webhook-secret";

function signatureFor(body: string): string {
  const digest = createHmac("sha256", webhookSecret).update(body).digest("hex");
  return `sha256=${digest}`;
}

function buildApp(store: InMemoryRepositoryStore) {
  const app = express();
  app.use(createWebhookRouter({ repositoryStore: store, webhookSecret }));
  return app;
}

function buildAppWithCache(store: InMemoryRepositoryStore, claimCache: InMemoryClaimCache) {
  const app = express();
  app.use(createWebhookRouter({ repositoryStore: store, claimCache, webhookSecret }));
  return app;
}

describe("webhook routes", () => {
  it("rejects webhook requests without a valid signature", async () => {
    const body = JSON.stringify({ installation: { id: 1 }, action: "created", repositories: [] });
    const app = buildApp(new InMemoryRepositoryStore());

    const response = await request(app)
      .post("/github/webhook")
      .set("Content-Type", "application/json")
      .set("X-GitHub-Event", "installation")
      .set("X-GitHub-Delivery", "delivery-1")
      .send(body)
      .expect(401);

    expect(response.body).toEqual({
      ok: false,
      error: "invalid_signature"
    });
  });

  it("rejects webhook requests with malformed signature hex", async () => {
    const body = JSON.stringify({ zen: "keep it logically minimal" });
    const app = buildApp(new InMemoryRepositoryStore());

    const response = await request(app)
      .post("/github/webhook")
      .set("Content-Type", "application/json")
      .set("X-GitHub-Event", "ping")
      .set("X-GitHub-Delivery", "delivery-bad-hex")
      .set("X-Hub-Signature-256", "sha256=not-hex")
      .send(body)
      .expect(401);

    expect(response.body).toEqual({
      ok: false,
      error: "invalid_signature"
    });
  });

  it("rejects webhook requests with invalid JSON", async () => {
    const body = "{";
    const app = buildApp(new InMemoryRepositoryStore());

    const response = await request(app)
      .post("/github/webhook")
      .set("Content-Type", "application/json")
      .set("X-GitHub-Event", "installation")
      .set("X-GitHub-Delivery", "delivery-invalid-json")
      .set("X-Hub-Signature-256", signatureFor(body))
      .send(body)
      .expect(400);

    expect(response.body).toEqual({
      ok: false,
      error: "invalid_json"
    });
  });

  it("rejects webhook requests when JSON is not an object", async () => {
    const body = JSON.stringify([]);
    const app = buildApp(new InMemoryRepositoryStore());

    const response = await request(app)
      .post("/github/webhook")
      .set("Content-Type", "application/json")
      .set("X-GitHub-Event", "installation")
      .set("X-GitHub-Delivery", "delivery-invalid-payload")
      .set("X-Hub-Signature-256", signatureFor(body))
      .send(body)
      .expect(400);

    expect(response.body).toEqual({
      ok: false,
      error: "invalid_payload"
    });
  });

  it("rejects webhook requests without an event name", async () => {
    const body = JSON.stringify({ installation: { id: 1 }, action: "created" });
    const app = buildApp(new InMemoryRepositoryStore());

    const response = await request(app)
      .post("/github/webhook")
      .set("Content-Type", "application/json")
      .set("X-GitHub-Delivery", "delivery-missing-event")
      .set("X-Hub-Signature-256", signatureFor(body))
      .send(body)
      .expect(400);

    expect(response.body).toEqual({
      ok: false,
      error: "missing_event"
    });
  });

  it("accepts ping events", async () => {
    const body = JSON.stringify({ zen: "keep it logically minimal" });
    const app = buildApp(new InMemoryRepositoryStore());

    const response = await request(app)
      .post("/github/webhook")
      .set("Content-Type", "application/json")
      .set("X-GitHub-Event", "ping")
      .set("X-GitHub-Delivery", "delivery-2")
      .set("X-Hub-Signature-256", signatureFor(body))
      .send(body)
      .expect(200);

    expect(response.body).toEqual({
      ok: true,
      event: "ping",
      delivery: "delivery-2"
    });
  });

  it("stores repositories from installation created events", async () => {
    const store = new InMemoryRepositoryStore();
    const app = buildApp(store);
    const body = JSON.stringify({
      action: "created",
      installation: { id: 7 },
      repositories: [
        {
          id: 101,
          full_name: "OWNER/REPO",
          default_branch: "main"
        }
      ]
    });

    const response = await request(app)
      .post("/github/webhook")
      .set("Content-Type", "application/json")
      .set("X-GitHub-Event", "installation")
      .set("X-GitHub-Delivery", "delivery-3")
      .set("X-Hub-Signature-256", signatureFor(body))
      .send(body)
      .expect(202);

    expect(response.body).toMatchObject({
      ok: true,
      event: "installation",
      updated_repositories: 1,
      removed_repositories: 0,
      ignored: false
    });
    expect(store.get("owner", "repo")).toMatchObject({
      owner: "OWNER",
      repo: "REPO",
      repositoryId: 101,
      installationId: 7,
      defaultBranch: "main"
    });
  });

  it("ignores malformed installation events without mutating repository state", async () => {
    const store = new InMemoryRepositoryStore();
    const app = buildApp(store);
    const body = JSON.stringify({
      action: "created",
      installation: {},
      repositories: [
        {
          id: 101,
          full_name: "OWNER/REPO"
        }
      ]
    });

    const response = await request(app)
      .post("/github/webhook")
      .set("Content-Type", "application/json")
      .set("X-GitHub-Event", "installation")
      .set("X-GitHub-Delivery", "delivery-malformed-installation")
      .set("X-Hub-Signature-256", signatureFor(body))
      .send(body)
      .expect(202);

    expect(response.body).toMatchObject({
      updated_repositories: 0,
      removed_repositories: 0,
      invalidated_claims: 0,
      ignored: true
    });
    expect(store.get("OWNER", "REPO")).toBeUndefined();
  });

  it("ignores installation events with a non-object installation payload", async () => {
    const store = new InMemoryRepositoryStore();
    const app = buildApp(store);
    const body = JSON.stringify({
      action: "created",
      installation: null,
      repositories: [
        {
          id: 101,
          full_name: "OWNER/REPO"
        }
      ]
    });

    const response = await request(app)
      .post("/github/webhook")
      .set("Content-Type", "application/json")
      .set("X-GitHub-Event", "installation")
      .set("X-GitHub-Delivery", "delivery-null-installation")
      .set("X-Hub-Signature-256", signatureFor(body))
      .send(body)
      .expect(202);

    expect(response.body).toMatchObject({
      updated_repositories: 0,
      removed_repositories: 0,
      invalidated_claims: 0,
      ignored: true
    });
    expect(store.get("OWNER", "REPO")).toBeUndefined();
  });

  it("does not call the network while processing installation repository lists", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new Error("webhook handling must not call network APIs");
    });
    const store = new InMemoryRepositoryStore();
    const app = buildApp(store);
    const repositories = Array.from({ length: 250 }, (_, index) => ({
      id: 1_000 + index,
      full_name: `OWNER/REPO-${index}`,
      default_branch: "main"
    }));
    const body = JSON.stringify({
      action: "created",
      installation: { id: 7 },
      repositories
    });

    try {
      const response = await request(app)
        .post("/github/webhook")
        .set("Content-Type", "application/json")
        .set("X-GitHub-Event", "installation")
        .set("X-GitHub-Delivery", "delivery-no-network")
        .set("X-Hub-Signature-256", signatureFor(body))
        .send(body)
        .expect(202);

      expect(response.body).toMatchObject({
        updated_repositories: repositories.length,
        ignored: false
      });
      expect(store.get("OWNER", "REPO-249")).toMatchObject({
        installationId: 7,
        repositoryId: 1_249
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("removes repositories when installation is deleted", async () => {
    const store = new InMemoryRepositoryStore();
    store.put({
      owner: "OWNER",
      repo: "REPO",
      repositoryId: 101,
      installationId: 7,
      defaultBranch: "main",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z"
    });
    store.put({
      owner: "OWNER",
      repo: "OTHER",
      repositoryId: 102,
      installationId: 7,
      defaultBranch: "main",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z"
    });
    const app = buildApp(store);
    const body = JSON.stringify({
      action: "deleted",
      installation: { id: 7 }
    });

    const response = await request(app)
      .post("/github/webhook")
      .set("Content-Type", "application/json")
      .set("X-GitHub-Event", "installation")
      .set("X-GitHub-Delivery", "delivery-4")
      .set("X-Hub-Signature-256", signatureFor(body))
      .send(body)
      .expect(202);

    expect(response.body.removed_repositories).toBe(2);
    expect(store.get("OWNER", "REPO")).toBeUndefined();
    expect(store.get("OWNER", "OTHER")).toBeUndefined();
  });

  it("ignores unsupported installation actions", async () => {
    const store = new InMemoryRepositoryStore();
    const app = buildApp(store);
    const body = JSON.stringify({
      action: "suspend",
      installation: { id: 7 },
      repositories: [
        {
          id: 101,
          full_name: "OWNER/REPO"
        }
      ]
    });

    const response = await request(app)
      .post("/github/webhook")
      .set("Content-Type", "application/json")
      .set("X-GitHub-Event", "installation")
      .set("X-GitHub-Delivery", "delivery-unsupported-installation-action")
      .set("X-Hub-Signature-256", signatureFor(body))
      .send(body)
      .expect(202);

    expect(response.body).toMatchObject({
      updated_repositories: 0,
      removed_repositories: 0,
      ignored: true
    });
  });

  it("applies installation_repositories added and removed updates", async () => {
    const store = new InMemoryRepositoryStore();
    store.put({
      owner: "OWNER",
      repo: "REMOVE",
      repositoryId: 103,
      installationId: 8,
      defaultBranch: "main",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z"
    });
    const app = buildApp(store);
    const body = JSON.stringify({
      action: "added",
      installation: { id: 8 },
      repositories_added: [
        {
          id: 104,
          full_name: "OWNER/ADD",
          default_branch: "trunk"
        }
      ],
      repositories_removed: [
        {
          id: 103,
          full_name: "OWNER/REMOVE"
        }
      ]
    });

    const response = await request(app)
      .post("/github/webhook")
      .set("Content-Type", "application/json")
      .set("X-GitHub-Event", "installation_repositories")
      .set("X-GitHub-Delivery", "delivery-5")
      .set("X-Hub-Signature-256", signatureFor(body))
      .send(body)
      .expect(202);

    expect(response.body).toMatchObject({
      updated_repositories: 1,
      removed_repositories: 1,
      ignored: false
    });
    expect(store.get("OWNER", "REMOVE")).toBeUndefined();
    expect(store.get("OWNER", "ADD")).toMatchObject({
      installationId: 8,
      repositoryId: 104,
      defaultBranch: "trunk"
    });
  });

  it("accepts repository coordinates from owner login and repository name", async () => {
    const store = new InMemoryRepositoryStore();
    const app = buildApp(store);
    const body = JSON.stringify({
      action: "renamed",
      installation: { id: 9 },
      repository: {
        id: 201,
        owner: { login: "OWNER" },
        name: "RENAMED",
        default_branch: "main"
      }
    });

    const response = await request(app)
      .post("/github/webhook")
      .set("Content-Type", "application/json")
      .set("X-GitHub-Event", "repository")
      .set("X-GitHub-Delivery", "delivery-repository-renamed")
      .set("X-Hub-Signature-256", signatureFor(body))
      .send(body)
      .expect(202);

    expect(response.body).toMatchObject({
      updated_repositories: 1,
      ignored: false
    });
    expect(store.get("OWNER", "RENAMED")).toMatchObject({
      repositoryId: 201,
      installationId: 9,
      defaultBranch: "main"
    });
  });

  it("marks repository-scoped events without repository coordinates as ignored", async () => {
    const store = new InMemoryRepositoryStore();
    const app = buildApp(store);
    const body = JSON.stringify({
      action: "edited",
      installation: { id: 9 },
      repository: {
        id: 201,
        full_name: "malformed"
      }
    });

    const response = await request(app)
      .post("/github/webhook")
      .set("Content-Type", "application/json")
      .set("X-GitHub-Event", "repository")
      .set("X-GitHub-Delivery", "delivery-repository-ignored")
      .set("X-Hub-Signature-256", signatureFor(body))
      .send(body)
      .expect(202);

    expect(response.body).toMatchObject({
      updated_repositories: 0,
      removed_repositories: 0,
      invalidated_claims: 0,
      ignored: true
    });
  });

  it("accepts unsupported event types without side effects", async () => {
    const store = new InMemoryRepositoryStore();
    const app = buildApp(store);
    const body = JSON.stringify({ action: "anything" });

    const response = await request(app)
      .post("/github/webhook")
      .set("Content-Type", "application/json")
      .set("X-GitHub-Event", "meta")
      .set("X-GitHub-Delivery", "delivery-unsupported-event")
      .set("X-Hub-Signature-256", signatureFor(body))
      .send(body)
      .expect(202);

    expect(response.body).toMatchObject({
      updated_repositories: 0,
      removed_repositories: 0,
      invalidated_claims: 0,
      ignored: true
    });
  });

  it("invalidates cached claims on repository_ruleset updates", async () => {
    const store = new InMemoryRepositoryStore();
    const claimCache = new InMemoryClaimCache();
    claimCache.set(
      {
        claim: shaPinningRequiredClaim.id,
        owner: "OWNER",
        repo: "REPO",
        repository: {
          owner: "OWNER",
          repo: "REPO",
          full_name: "OWNER/REPO"
        },
        result: "enabled",
        source: shaPinningRequiredClaim.source,
        evidence: shaPinningRequiredClaim.evidence ?? { scope: "unknown", source: "unavailable" },
        checked_at: "2026-06-01T00:00:00.000Z",
        details: { sha_pinning_required: true }
      },
      60_000
    );
    const app = buildAppWithCache(store, claimCache);
    const body = JSON.stringify({
      action: "edited",
      installation: { id: 7 },
      repository: {
        id: 101,
        full_name: "OWNER/REPO",
        default_branch: "main"
      },
      repository_ruleset: {
        id: 1
      }
    });

    const response = await request(app)
      .post("/github/webhook")
      .set("Content-Type", "application/json")
      .set("X-GitHub-Event", "repository_ruleset")
      .set("X-GitHub-Delivery", "delivery-6")
      .set("X-Hub-Signature-256", signatureFor(body))
      .send(body)
      .expect(202);

    expect(response.body).toMatchObject({
      invalidated_claims: 1,
      ignored: false
    });
    expect(claimCache.get("OWNER", "REPO", "sha-pinning-required")).toBeUndefined();
  });

  it("keeps webhook handling independent from GitHub API client machinery", async () => {
    const source = await readFile(
      new URL("../src/routes/webhook-routes.ts", import.meta.url),
      "utf8"
    );

    expect(source).not.toMatch(/@octokit/);
    expect(source).not.toMatch(/GitHubInstallationResolver|GitHubAppTokenFactory/);
    expect(source).not.toMatch(/createInstallationClient|createAppRequest/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });
});
