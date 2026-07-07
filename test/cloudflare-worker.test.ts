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
});
