import { createHmac, timingSafeEqual } from "node:crypto";

import express, { Router, type Request, type Response } from "express";

export interface WebhookRouterOptions {
  webhookSecret: string;
}

const maxWebhookBodyBytes = "256kb";

export function createWebhookRouter(options: WebhookRouterOptions): Router {
  const router = Router();

  router.post(
    "/github/webhook",
    express.raw({ limit: maxWebhookBodyBytes, type: "application/json" }),
    (request, response) => {
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

      const action = getString(payload.action);
      const ignored =
        event !== "marketplace_purchase" || (action !== "purchased" && action !== "cancelled");

      response.status(202).json({
        ok: true,
        event,
        delivery,
        action,
        ignored
      });
    }
  );

  return router;
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

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
