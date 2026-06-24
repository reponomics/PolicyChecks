import { Router, type NextFunction, type Request, type Response } from "express";

import { renderBadgeSvg } from "../badges/svg.js";
import { toShieldsJson } from "../badges/shields-json.js";
import { claimDefinitions, getClaimDefinition } from "../claims/registry.js";
import type { ClaimDefinition, ClaimResult } from "../claims/types.js";
import type { ClaimEvaluator } from "../server/claim-service.js";

const cacheControl = "public, max-age=300, stale-while-revalidate=300";

export function createBadgeRouter(claimService: ClaimEvaluator): Router {
  const router = Router();

  router.get(
    "/github/:owner/:repo/info.json",
    asyncHandler(async (request, response) => {
      const route = parseRepositoryRoute(request);

      const claims = await evaluateClaims(claimService, route.owner, route.repo);

      response.setHeader("Cache-Control", cacheControl);
      response.json({
        owner: route.owner,
        repo: route.repo,
        claims
      });
    })
  );

  router.get(
    "/github/:owner/:repo/:claim.json",
    asyncHandler(async (request, response) => {
      const route = parseClaimRoute(request, response);

      if (route === undefined) {
        return;
      }

      const result = await claimService.evaluate(route.definition, route.owner, route.repo);
      response.setHeader("Cache-Control", cacheControl);
      response.json(toShieldsJson(route.definition, result));
    })
  );

  router.get(
    "/github/:owner/:repo/:claim.svg",
    asyncHandler(async (request, response) => {
      const route = parseClaimRoute(request, response);

      if (route === undefined) {
        return;
      }

      const result = await claimService.evaluate(route.definition, route.owner, route.repo);
      response.setHeader("Cache-Control", cacheControl);
      response.type("image/svg+xml").send(renderBadgeSvg(route.definition, result));
    })
  );

  router.get(
    "/github/:owner/:repo/:claim/details.json",
    asyncHandler(async (request, response) => {
      const route = parseClaimRoute(request, response);

      if (route === undefined) {
        return;
      }

      const result = await claimService.evaluate(route.definition, route.owner, route.repo);
      response.setHeader("Cache-Control", cacheControl);
      response.json(result);
    })
  );

  return router;
}

async function evaluateClaims(
  claimService: ClaimEvaluator,
  owner: string,
  repo: string
): Promise<ClaimResult[]> {
  if (claimService.evaluateMany !== undefined) {
    return claimService.evaluateMany(claimDefinitions, owner, repo);
  }

  const claims: ClaimResult[] = [];

  for (const definition of claimDefinitions) {
    claims.push(await claimService.evaluate(definition, owner, repo));
  }

  return claims;
}

function parseRepositoryRoute(request: Request): {
  owner: string;
  repo: string;
} {
  const owner = routeParam(request, "owner");
  const repo = routeParam(request, "repo");
  return { owner, repo };
}

function parseClaimRoute(
  request: Request,
  response: Response
):
  | {
      owner: string;
      repo: string;
      definition: ClaimDefinition;
    }
  | undefined {
  const repositoryRoute = parseRepositoryRoute(request);

  const owner = repositoryRoute.owner;
  const repo = repositoryRoute.repo;
  const claim = routeParam(request, "claim");
  const definition = getClaimDefinition(claim);

  if (definition === undefined) {
    response.status(404).json({
      error: "unsupported_claim",
      claim
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
