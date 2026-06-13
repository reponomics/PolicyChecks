import request from "supertest";
import { Router } from "express";
import { describe, expect, it, vi } from "vitest";

import type { ClaimDefinition, ClaimResult } from "../src/claims/types.js";
import type { ClaimEvaluator } from "../src/server/claim-service.js";
import { createHttpApp } from "../src/server/http-app.js";

describe("badge routes", () => {
  it("returns health status", async () => {
    const app = createHttpApp(serviceReturning("enabled"));

    await request(app)
      .get("/healthz")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ ok: true });
      });
  });

  it("mounts an optional webhook router before badge routes", async () => {
    const webhookRouter = Router();
    webhookRouter.get("/github/webhook-test", (_request, response) => {
      response.json({ ok: true });
    });
    const app = createHttpApp(serviceReturning("enabled"), webhookRouter);

    const response = await request(app).get("/github/webhook-test").expect(200);

    expect(response.body).toEqual({ ok: true });
  });

  it("returns aggregated claim info for a repository", async () => {
    const app = createHttpApp(serviceReturning("enabled"));

    const response = await request(app)
      .get("/github/OWNER/REPO/info.json")
      .expect(200)
      .expect("Cache-Control", /max-age=300/);

    expect(response.body.owner).toBe("OWNER");
    expect(response.body.repo).toBe("REPO");
    expect(Array.isArray(response.body.claims)).toBe(true);
    expect(response.body.claims).toHaveLength(12);
    expect(response.body.claims[0]).toHaveProperty("result", "enabled");
    expect(response.body.claims[0]).not.toHaveProperty("status");
    expect(response.body.claims[0]).not.toHaveProperty("value");
    expect(response.body.claims.map((claim: { claim: string }) => claim.claim).sort()).toEqual([
      "community-health",
      "default-branch-deletion-blocked",
      "default-branch-force-pushes-blocked",
      "default-branch-linear-history-required",
      "default-branch-pull-request-required",
      "default-branch-signed-commits-required",
      "default-branch-status-checks-required",
      "immutable-releases",
      "secret-push-protection-enabled",
      "secret-scanning-enabled",
      "sha-pinning-required",
      "web-commit-signoff-required"
    ]);
  });

  it("returns Shields JSON for a supported claim", async () => {
    const app = createHttpApp(serviceReturning("enabled"));

    const response = await request(app)
      .get("/github/OWNER/REPO/sha-pinning-required.json")
      .expect(200)
      .expect("Cache-Control", /max-age=300/);

    expect(response.body).toEqual({
      schemaVersion: 1,
      label: "SHA pinning",
      message: "enabled",
      color: "brightgreen"
    });
  });

  it("returns proof JSON for a supported claim", async () => {
    const app = createHttpApp(serviceReturning("disabled"));

    const response = await request(app)
      .get("/github/OWNER/REPO/immutable-releases/proof.json")
      .expect(200);

    expect(response.body).toMatchObject({
      claim: "immutable-releases",
      owner: "OWNER",
      repo: "REPO",
      repository: {
        owner: "OWNER",
        repo: "REPO",
        full_name: "OWNER/REPO"
      },
      result: "disabled"
    });
    expect(response.body).not.toHaveProperty("status");
    expect(response.body).not.toHaveProperty("value");
  });

  it("returns SVG for a supported claim", async () => {
    const app = createHttpApp(serviceReturning("unknown"));

    const response = await request(app)
      .get("/github/OWNER/REPO/immutable-releases.svg")
      .expect(200)
      .expect("Content-Type", /image\/svg\+xml/);

    const svg = response.text ?? response.body.toString("utf8");
    expect(svg).toContain("immutable releases");
    expect(svg).toContain("unknown");
  });

  it("returns 404 for unsupported claims", async () => {
    const app = createHttpApp(serviceReturning("enabled"));

    const response = await request(app).get("/github/OWNER/REPO/not-a-claim.json").expect(404);

    expect(response.body).toEqual({
      error: "unsupported_claim",
      claim: "not-a-claim"
    });

    await request(app).get("/github/OWNER/REPO/dependency-graph-enabled.json").expect(404);
    await request(app).get("/github/OWNER/REPO/dependabot-alerts-enabled.json").expect(404);
  });

  it("falls back to individual evaluation when evaluateMany is unavailable", async () => {
    const calls: string[] = [];
    const app = createHttpApp({
      async evaluate(
        definition: ClaimDefinition,
        owner: string,
        repo: string
      ): Promise<ClaimResult> {
        calls.push(definition.id);
        return resultFor(definition, owner, repo, "enabled");
      }
    });

    const response = await request(app).get("/github/OWNER/REPO/info.json").expect(200);

    expect(response.body.claims).toHaveLength(12);
    expect(calls).toEqual([
      "immutable-releases",
      "sha-pinning-required",
      "web-commit-signoff-required",
      "community-health",
      "secret-scanning-enabled",
      "secret-push-protection-enabled",
      "default-branch-force-pushes-blocked",
      "default-branch-signed-commits-required",
      "default-branch-linear-history-required",
      "default-branch-deletion-blocked",
      "default-branch-pull-request-required",
      "default-branch-status-checks-required"
    ]);
  });

  it("returns the app-level 404 for unmatched routes", async () => {
    const app = createHttpApp(serviceReturning("enabled"));

    const response = await request(app).get("/not-found").expect(404);

    expect(response.body).toEqual({ error: "not_found" });
  });

  it("maps asynchronous route errors to a public 500 response", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = createHttpApp({
      evaluateMany: async () => {
        throw new Error("private failure");
      },
      evaluate: async (definition, owner, repo) => resultFor(definition, owner, repo, "enabled")
    });

    try {
      const response = await request(app).get("/github/OWNER/REPO/info.json").expect(500);

      expect(response.body).toEqual({
        error: "internal_error",
        message: "The request failed before the claim could be verified."
      });
      expect(consoleError).toHaveBeenCalledOnce();
    } finally {
      consoleError.mockRestore();
    }
  });
});

function serviceReturning(result: ClaimResult["result"]): ClaimEvaluator {
  return {
    async evaluate(definition: ClaimDefinition, owner: string, repo: string): Promise<ClaimResult> {
      return resultFor(definition, owner, repo, result);
    }
  };
}

function resultFor(
  definition: ClaimDefinition,
  owner: string,
  repo: string,
  result: ClaimResult["result"]
): ClaimResult {
  return {
    claim: definition.id,
    owner,
    repo,
    repository: {
      owner,
      repo,
      full_name: `${owner}/${repo}`
    },
    result,
    source: definition.source,
    evidence: definition.evidence ?? { scope: "unknown", source: "unavailable" },
    checked_at: "2026-05-30T00:00:00.000Z",
    details: {}
  };
}
