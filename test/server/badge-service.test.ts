import { describe, expect, it, vi } from "vitest";

import { InMemoryBadgeCache } from "../../src/cache/cache.js";
import type { BadgeDefinition, BadgeResult } from "../../src/badges/types.js";
import type { InstallationResolution } from "../../src/github/installations.js";
import type { GitHubClient } from "../../src/github/client.js";
import { BadgeService, type InstallationResolver } from "../../src/server/badge-service.js";

const definition: BadgeDefinition = {
  id: "demo-badge",
  label: "Demo",
  source: { provider: "github", api: "REST", endpoint: "/demo", fields: ["x"] },
  evaluate: vi.fn(async ({ owner, repo }) => passResult(owner, repo))
};

const secondDefinition: BadgeDefinition = {
  ...definition,
  id: "second-badge",
  evaluate: vi.fn(async ({ owner, repo }) => ({
    ...passResult(owner, repo),
    badgeId: "second-badge",
    source: secondDefinition.source
  }))
};

function passResult(owner: string, repo: string): BadgeResult {
  return {
    badgeId: definition.id,
    owner,
    repo,
    repository: {
      owner,
      repo,
      full_name: `${owner}/${repo}`
    },
    result: "enabled",
    source: definition.source,
    checked_at: "2026-05-30T00:00:00.000Z",
    details: {}
  };
}

const stubGitHub = {} as GitHubClient;

function makeResolver(resolution: InstallationResolution): InstallationResolver {
  return { resolve: vi.fn(async () => resolution) };
}

function makeService(
  resolver: InstallationResolver,
  cache = new InMemoryBadgeCache()
): BadgeService {
  return new BadgeService({ cache, installationResolver: resolver, cacheTtlMs: 60_000 });
}

describe("BadgeService.evaluate", () => {
  it("returns a cached result without resolving the installation", async () => {
    vi.clearAllMocks();
    const cache = new InMemoryBadgeCache();
    const cached = passResult("owner", "repo");
    cache.set(cached, 60_000);
    const resolver = makeResolver({ status: "error", error: { kind: "not_found", message: "x" } });

    const result = await makeService(resolver, cache).evaluate(definition, "owner", "repo");

    expect(result).toBe(cached);
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it("evaluates the definition on a cache miss and stores the result", async () => {
    vi.clearAllMocks();
    const cache = new InMemoryBadgeCache();
    const resolver = makeResolver({
      status: "ok",
      github: stubGitHub,
      repository: {
        owner: "owner",
        repo: "repo",
        repositoryId: 1,
        installationId: 2,
        defaultBranch: "main",
        createdAt: "",
        updatedAt: ""
      }
    });

    const service = makeService(resolver, cache);
    const result = await service.evaluate(definition, "owner", "repo");

    expect(result.result).toBe("enabled");
    expect(definition.evaluate).toHaveBeenCalledOnce();
    expect(definition.evaluate).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      github: stubGitHub,
      repositoryAccess: "verified"
    });
    expect(resolver.resolve).toHaveBeenCalledWith("owner", "repo");
    expect(cache.get("owner", "repo", definition.id)).toBe(result);
  });

  it("produces an unknown result when installation resolution fails", async () => {
    vi.clearAllMocks();
    const cache = new InMemoryBadgeCache();
    const resolver = makeResolver({
      status: "error",
      error: { kind: "not_installed", message: "no install" }
    });

    const result = await makeService(resolver, cache).evaluate(definition, "owner", "repo");

    expect(result.result).toBe("unknown");
    expect(result.error).toEqual({ kind: "not_installed", message: "no install" });
    expect(resolver.resolve).toHaveBeenCalledWith("owner", "repo");
    expect(definition.evaluate).not.toHaveBeenCalled();
    expect(cache.get("owner", "repo", definition.id)).toBe(result);
  });

  it("coalesces concurrent evaluations for the same badge", async () => {
    vi.clearAllMocks();
    const resolverReady = deferred<InstallationResolution>();
    const resolver: InstallationResolver = {
      resolve: vi.fn(async () => resolverReady.promise)
    };
    const service = makeService(resolver);

    const first = service.evaluate(definition, "owner", "repo");
    const second = service.evaluate(definition, "owner", "repo");

    resolverReady.resolve({
      status: "ok",
      github: stubGitHub,
      repository: {
        owner: "owner",
        repo: "repo",
        repositoryId: 1,
        installationId: 2,
        defaultBranch: "main",
        createdAt: "",
        updatedAt: ""
      }
    });

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(resolver.resolve).toHaveBeenCalledOnce();
    expect(definition.evaluate).toHaveBeenCalledOnce();
  });

  it("resolves installation once when evaluating many badges for one repository", async () => {
    vi.clearAllMocks();
    const cache = new InMemoryBadgeCache();
    const resolver = makeResolver({
      status: "ok",
      github: stubGitHub,
      repository: {
        owner: "owner",
        repo: "repo",
        repositoryId: 1,
        installationId: 2,
        defaultBranch: "main",
        createdAt: "",
        updatedAt: ""
      }
    });
    const service = makeService(resolver, cache);

    const results = await service.evaluateMany([definition, secondDefinition], "owner", "repo");

    expect(results.map((result) => result.badgeId)).toEqual(["demo-badge", "second-badge"]);
    expect(resolver.resolve).toHaveBeenCalledOnce();
    expect(definition.evaluate).toHaveBeenCalledOnce();
    expect(secondDefinition.evaluate).toHaveBeenCalledOnce();
    expect(cache.get("owner", "repo", "demo-badge")).toBe(results[0]);
    expect(cache.get("owner", "repo", "second-badge")).toBe(results[1]);
  });

  it("returns cached results when evaluating many badges without resolving installation", async () => {
    vi.clearAllMocks();
    const cache = new InMemoryBadgeCache();
    const first = passResult("owner", "repo");
    const second = {
      ...passResult("owner", "repo"),
      badgeId: "second-badge",
      source: secondDefinition.source
    };
    cache.set(first, 60_000);
    cache.set(second, 60_000);
    const resolver = makeResolver({
      status: "error",
      error: { kind: "not_installed", message: "no install" }
    });

    const results = await makeService(resolver, cache).evaluateMany(
      [definition, secondDefinition],
      "owner",
      "repo"
    );

    expect(results).toEqual([first, second]);
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it("produces unknown results for missing badges when evaluateMany cannot resolve installation", async () => {
    vi.clearAllMocks();
    const cache = new InMemoryBadgeCache();
    const cached = passResult("owner", "repo");
    cache.set(cached, 60_000);
    const resolver = makeResolver({
      status: "error",
      error: { kind: "not_installed", message: "no install" }
    });

    const results = await makeService(resolver, cache).evaluateMany(
      [definition, secondDefinition],
      "owner",
      "repo"
    );

    expect(results[0]).toBe(cached);
    expect(results[1]).toMatchObject({
      badgeId: "second-badge",
      result: "unknown",
      error: { kind: "not_installed", message: "no install" }
    });
    expect(resolver.resolve).toHaveBeenCalledOnce();
    expect(cache.get("owner", "repo", "second-badge")).toBe(results[1]);
  });

  it("shares each GitHub endpoint response while evaluating many badges", async () => {
    const getRepository = vi.fn(async () => ({ id: 1, default_branch: "main" }));
    const getImmutableReleases = vi.fn(async () => ({ enabled: true }));
    const getActionsPermissions = vi.fn(async () => ({ sha_pinning_required: true }));
    const getBranchRules = vi.fn(async () => [{ type: "non_fast_forward" }]);
    const getCommunityProfile = vi.fn(async () => ({ health_percentage: 100 }));
    const github = {
      getRepository,
      getImmutableReleases,
      getActionsPermissions,
      getBranchRules,
      getCommunityProfile
    } as unknown as GitHubClient;
    const resolver = makeResolver({
      status: "ok",
      github,
      repository: {
        owner: "owner",
        repo: "repo",
        repositoryId: 1,
        installationId: 2,
        defaultBranch: "main",
        createdAt: "",
        updatedAt: ""
      }
    });
    const firstDefinition: BadgeDefinition = {
      ...definition,
      id: "first-github-badge",
      evaluate: vi.fn(async ({ owner, repo, github: memoizedGitHub }) => {
        await memoizedGitHub.getRepository(owner, repo);
        await memoizedGitHub.getImmutableReleases(owner, repo);
        await memoizedGitHub.getActionsPermissions(owner, repo);
        await memoizedGitHub.getBranchRules(owner, repo, "main");
        await memoizedGitHub.getCommunityProfile(owner, repo);
        return {
          ...passResult(owner, repo),
          badgeId: "first-github-badge"
        };
      })
    };
    const secondSharedDefinition: BadgeDefinition = {
      ...definition,
      id: "second-github-badge",
      evaluate: vi.fn(async ({ owner, repo, github: memoizedGitHub }) => {
        await memoizedGitHub.getRepository(owner, repo);
        await memoizedGitHub.getImmutableReleases(owner, repo);
        await memoizedGitHub.getActionsPermissions(owner, repo);
        await memoizedGitHub.getBranchRules(owner, repo, "main");
        await memoizedGitHub.getCommunityProfile(owner, repo);
        return {
          ...passResult(owner, repo),
          badgeId: "second-github-badge"
        };
      })
    };

    const results = await makeService(resolver).evaluateMany(
      [firstDefinition, secondSharedDefinition],
      "owner",
      "repo"
    );

    expect(results.map((result) => result.badgeId)).toEqual([
      "first-github-badge",
      "second-github-badge"
    ]);
    expect(getRepository).toHaveBeenCalledOnce();
    expect(getImmutableReleases).toHaveBeenCalledOnce();
    expect(getActionsPermissions).toHaveBeenCalledOnce();
    expect(getBranchRules).toHaveBeenCalledOnce();
    expect(getCommunityProfile).toHaveBeenCalledOnce();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}
