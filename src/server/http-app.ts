import express, { type ErrorRequestHandler } from "express";
import type { Router } from "express";

import { createBadgeRouter } from "../routes/badge-routes.js";
import type { BadgeEvaluator } from "./badge-service.js";

export function createHttpApp(badgeService: BadgeEvaluator, webhookRouter?: Router) {
  const app = express();
  app.disable("x-powered-by");

  app.use((_request, response, next) => {
    // Raise max-age to 31536000 after a burn-in period on the live service.
    response.setHeader("Strict-Transport-Security", "max-age=86400");
    response.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });

  app.get("/healthz", (_request, response) => {
    response.json({
      ok: true
    });
  });

  if (webhookRouter !== undefined) {
    app.use(webhookRouter);
  }

  app.use(createBadgeRouter(badgeService));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

function notFoundHandler(_request: express.Request, response: express.Response): void {
  response.status(404).json({
    error: "not_found"
  });
}

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({
    error: "internal_error",
    message: "The request failed before the badge could be evaluated."
  });
};
