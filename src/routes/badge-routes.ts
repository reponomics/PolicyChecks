import { Router, type NextFunction, type Request, type Response } from "express";

import { toDetailsJson } from "../badges/details-json.js";
import { renderBadgeSvg } from "../badges/svg.js";
import { toShieldsJson } from "../badges/shields-json.js";
import { badgeDefinitions, getBadgeDefinition } from "../badges/registry.js";
import type { BadgeDefinition, BadgeResult } from "../badges/types.js";
import type { BadgeEvaluator } from "../server/badge-service.js";

const cacheControl = "public, max-age=300, stale-while-revalidate=300";

export function createBadgeRouter(badgeService: BadgeEvaluator): Router {
  const router = Router();

  router.get(
    "/github/:owner/:repo/info.json",
    asyncHandler(async (request, response) => {
      const route = parseRepositoryRoute(request);

      const badges = await evaluateBadges(badgeService, route.owner, route.repo);

      response.setHeader("Cache-Control", cacheControl);
      response.json({
        owner: route.owner,
        repo: route.repo,
        badges
      });
    })
  );

  router.get(
    "/github/:owner/:repo/:badgeId.json",
    asyncHandler(async (request, response) => {
      const route = parseBadgeRoute(request, response);

      if (route === undefined) {
        return;
      }

      const result = await badgeService.evaluate(route.definition, route.owner, route.repo);
      response.setHeader("Cache-Control", cacheControl);
      response.json(toShieldsJson(route.definition, result));
    })
  );

  router.get(
    "/github/:owner/:repo/:badgeId.svg",
    asyncHandler(async (request, response) => {
      const route = parseBadgeRoute(request, response);

      if (route === undefined) {
        return;
      }

      const result = await badgeService.evaluate(route.definition, route.owner, route.repo);
      response.setHeader("Cache-Control", cacheControl);
      response.type("image/svg+xml").send(renderBadgeSvg(route.definition, result));
    })
  );

  router.get(
    "/github/:owner/:repo/:badgeId/details.json",
    asyncHandler(async (request, response) => {
      const route = parseBadgeRoute(request, response);

      if (route === undefined) {
        return;
      }

      const result = await badgeService.evaluate(route.definition, route.owner, route.repo);
      response.setHeader("Cache-Control", cacheControl);
      response.json(toDetailsJson(result));
    })
  );

  return router;
}

async function evaluateBadges(
  badgeService: BadgeEvaluator,
  owner: string,
  repo: string
): Promise<BadgeResult[]> {
  if (badgeService.evaluateMany !== undefined) {
    return badgeService.evaluateMany(badgeDefinitions, owner, repo);
  }

  const badges: BadgeResult[] = [];

  for (const definition of badgeDefinitions) {
    badges.push(await badgeService.evaluate(definition, owner, repo));
  }

  return badges;
}

function parseRepositoryRoute(request: Request): {
  owner: string;
  repo: string;
} {
  const owner = routeParam(request, "owner");
  const repo = routeParam(request, "repo");
  return { owner, repo };
}

function parseBadgeRoute(
  request: Request,
  response: Response
):
  | {
      owner: string;
      repo: string;
      definition: BadgeDefinition;
    }
  | undefined {
  const repositoryRoute = parseRepositoryRoute(request);

  const owner = repositoryRoute.owner;
  const repo = repositoryRoute.repo;
  const badgeId = routeParam(request, "badgeId");
  const definition = getBadgeDefinition(badgeId);

  if (definition === undefined) {
    response.status(404).json({
      error: "unsupported_badge",
      badgeId
    });
    return undefined;
  }

  return {
    owner,
    repo,
    definition
  };
}

function routeParam(request: Request, name: string): string {
  return request.params[name] as string;
}

function asyncHandler(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<void>
) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response, next).catch(next);
  };
}
