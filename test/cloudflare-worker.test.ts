import { describe, expect, it } from "vitest";

import worker from "../cloudflare/policychecks-worker.js";

const env = {
  GITHUB_APP_ID: "1",
  GITHUB_PRIVATE_KEY_BASE64: Buffer.from("test-key", "utf8").toString("base64"),
  GITHUB_WEBHOOK_SECRET: "test-secret"
};

describe("Cloudflare Worker routes", () => {
  it("returns health status for GET /healthz", async () => {
    const response = await worker.fetch(
      new Request("https://policychecks.example.test/healthz"),
      env
    );

    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.status).toBe(200);
  });

  it("returns headers without a body for HEAD /healthz", async () => {
    const response = await worker.fetch(
      new Request("https://policychecks.example.test/healthz", {
        method: "HEAD"
      }),
      env
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(await response.text()).toBe("");
  });

  it("mirrors GET status and headers for HEAD on unknown paths", async () => {
    const [head, get] = await Promise.all([
      worker.fetch(new Request("https://policychecks.example.test/nope", { method: "HEAD" }), env),
      worker.fetch(new Request("https://policychecks.example.test/nope"), env)
    ]);

    expect(head.status).toBe(get.status);
    expect(head.headers.get("content-type")).toBe(get.headers.get("content-type"));
    expect(await head.text()).toBe("");
  });

  it("mirrors GET for HEAD on an unsupported badge id", async () => {
    const response = await worker.fetch(
      new Request("https://policychecks.example.test/github/OWNER/REPO/not-a-real-badge.svg", {
        method: "HEAD"
      }),
      env
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });

  it("rejects methods outside the allowlist", async () => {
    const response = await worker.fetch(
      new Request("https://policychecks.example.test/healthz", { method: "PUT" }),
      env
    );

    expect(response.status).toBe(404);
  });

  it("sets security headers on every response", async () => {
    const response = await worker.fetch(
      new Request("https://policychecks.example.test/healthz"),
      env
    );

    expect(response.headers.get("strict-transport-security")).toBe("max-age=86400");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
