import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";

import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createWebhookRouter } from "../src/routes/webhook-routes.js";

const webhookSecret = "test-webhook-secret";

function signatureFor(body: string): string {
  const digest = createHmac("sha256", webhookSecret).update(body).digest("hex");
  return `sha256=${digest}`;
}

function buildApp() {
  const app = express();
  app.use(createWebhookRouter({ webhookSecret }));
  return app;
}

describe("webhook routes", () => {
  it("rejects webhook requests without a valid signature", async () => {
    const body = JSON.stringify({ action: "purchased" });

    const response = await request(buildApp())
      .post("/github/webhook")
      .set("Content-Type", "application/json")
      .set("X-GitHub-Event", "marketplace_purchase")
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

    const response = await request(buildApp())
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

    const response = await request(buildApp())
      .post("/github/webhook")
      .set("Content-Type", "application/json")
      .set("X-GitHub-Event", "marketplace_purchase")
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

    const response = await request(buildApp())
      .post("/github/webhook")
      .set("Content-Type", "application/json")
      .set("X-GitHub-Event", "marketplace_purchase")
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
    const body = JSON.stringify({ action: "purchased" });

    const response = await request(buildApp())
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

    const response = await request(buildApp())
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

  it("acknowledges marketplace purchase events for free listings", async () => {
    const body = JSON.stringify({
      action: "purchased",
      marketplace_purchase: {
        plan: {
          name: "Free"
        }
      }
    });

    const response = await request(buildApp())
      .post("/github/webhook")
      .set("Content-Type", "application/json")
      .set("X-GitHub-Event", "marketplace_purchase")
      .set("X-GitHub-Delivery", "delivery-marketplace-purchased")
      .set("X-Hub-Signature-256", signatureFor(body))
      .send(body)
      .expect(202);

    expect(response.body).toEqual({
      ok: true,
      event: "marketplace_purchase",
      delivery: "delivery-marketplace-purchased",
      action: "purchased",
      ignored: false
    });
  });

  it("acknowledges marketplace cancellation events for free listings", async () => {
    const body = JSON.stringify({
      action: "cancelled",
      marketplace_purchase: {
        plan: {
          name: "Free"
        }
      }
    });

    const response = await request(buildApp())
      .post("/github/webhook")
      .set("Content-Type", "application/json")
      .set("X-GitHub-Event", "marketplace_purchase")
      .set("X-GitHub-Delivery", "delivery-marketplace-cancelled")
      .set("X-Hub-Signature-256", signatureFor(body))
      .send(body)
      .expect(202);

    expect(response.body).toEqual({
      ok: true,
      event: "marketplace_purchase",
      delivery: "delivery-marketplace-cancelled",
      action: "cancelled",
      ignored: false
    });
  });

  it("accepts non-marketplace events without side effects", async () => {
    const body = JSON.stringify({ action: "created", repositories: [] });

    const response = await request(buildApp())
      .post("/github/webhook")
      .set("Content-Type", "application/json")
      .set("X-GitHub-Event", "installation")
      .set("X-GitHub-Delivery", "delivery-unsupported-event")
      .set("X-Hub-Signature-256", signatureFor(body))
      .send(body)
      .expect(202);

    expect(response.body).toEqual({
      ok: true,
      event: "installation",
      delivery: "delivery-unsupported-event",
      action: "created",
      ignored: true
    });
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
