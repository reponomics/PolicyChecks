import type { BadgeCache } from "../cache/cache.js";
import { makeUnknownResult } from "../badges/result.js";
import type { BadgeDefinition, BadgeResult } from "../badges/types.js";
import type { GitHubClient, GitHubCommunityProfile, GitHubRepository } from "../github/client.js";
import type { InstallationResolution } from "../github/installations.js";

export interface InstallationResolver {
  resolve(owner: string, repo: string): Promise<InstallationResolution>;
}

export interface BadgeServiceOptions {
  cache: BadgeCache;
  installationResolver: InstallationResolver;
  cacheTtlMs: number;
}

export interface BadgeEvaluator {
  evaluate(definition: BadgeDefinition, owner: string, repo: string): Promise<BadgeResult>;
  evaluateMany?(
    definitions: readonly BadgeDefinition[],
    owner: string,
    repo: string
  ): Promise<BadgeResult[]>;
}

export class BadgeService implements BadgeEvaluator {
  private readonly inFlight = new Map<string, Promise<BadgeResult>>();

  constructor(private readonly options: BadgeServiceOptions) {}

  async evaluate(definition: BadgeDefinition, owner: string, repo: string): Promise<BadgeResult> {
    const cached = this.options.cache.get(owner, repo, definition.id);

    if (cached !== undefined) {
      return cached;
    }

    const key = cacheKey(owner, repo, definition.id);
    const existing = this.inFlight.get(key);

    if (existing !== undefined) {
      return existing;
    }

    const pending = this.evaluateUncached(definition, owner, repo);
    this.inFlight.set(key, pending);

    try {
      return await pending;
    } finally {
      this.inFlight.delete(key);
    }
  }

  async evaluateMany(
    definitions: readonly BadgeDefinition[],
    owner: string,
    repo: string
  ): Promise<BadgeResult[]> {
    const results = new Map<string, BadgeResult>();
    const missing = definitions.filter((definition) => {
      const cached = this.options.cache.get(owner, repo, definition.id);

      if (cached !== undefined) {
        results.set(definition.id, cached);
        return false;
      }

      return true;
    });

    if (missing.length > 0) {
      const resolution = await this.options.installationResolver.resolve(owner, repo);
      const github =
        resolution.status === "ok" ? memoizeGitHubClient(resolution.github) : undefined;

      for (const definition of missing) {
        const result =
          resolution.status === "ok"
            ? await definition.evaluate({
                owner,
                repo,
                github: github ?? resolution.github,
                repositoryAccess: "verified"
              })
            : makeUnknownResult(definition, { owner, repo }, resolution.error);

        this.options.cache.set(result, this.options.cacheTtlMs);
        results.set(definition.id, result);
      }
    }

    return definitions.map((definition) => {
      const result = results.get(definition.id);

      if (result === undefined) {
        throw new Error(`Missing badge result for ${definition.id}.`);
      }

      return result;
    });
  }

  private async evaluateUncached(
    definition: BadgeDefinition,
    owner: string,
    repo: string
  ): Promise<BadgeResult> {
    const resolution = await this.options.installationResolver.resolve(owner, repo);

    const result =
      resolution.status === "ok"
        ? await definition.evaluate({
            owner,
            repo,
            github: resolution.github,
            repositoryAccess: "verified"
          })
        : makeUnknownResult(definition, { owner, repo }, resolution.error);

    this.options.cache.set(result, this.options.cacheTtlMs);

    return result;
  }
}

function cacheKey(owner: string, repo: string, badgeId: string): string {
  return `${owner.toLowerCase()}/${repo.toLowerCase()}/${badgeId}`;
}

function memoizeGitHubClient(github: GitHubClient): GitHubClient {
  const repositories = new Map<string, Promise<GitHubRepository>>();
  const immutableReleases = new Map<string, Promise<unknown>>();
  const actionsPermissions = new Map<string, Promise<unknown>>();
  const branchRules = new Map<string, Promise<unknown>>();
  const communityProfiles = new Map<string, Promise<GitHubCommunityProfile>>();

  return {
    getRepository(owner: string, repo: string) {
      return memoize(repositories, repositoryKey(owner, repo), () =>
        github.getRepository(owner, repo)
      );
    },
    getImmutableReleases(owner: string, repo: string) {
      return memoize(immutableReleases, repositoryKey(owner, repo), () =>
        github.getImmutableReleases(owner, repo)
      );
    },
    getActionsPermissions(owner: string, repo: string) {
      return memoize(actionsPermissions, repositoryKey(owner, repo), () =>
        github.getActionsPermissions(owner, repo)
      );
    },
    getBranchRules(owner: string, repo: string, branch: string) {
      return memoize(branchRules, branchKey(owner, repo, branch), () =>
        github.getBranchRules(owner, repo, branch)
      );
    },
    getCommunityProfile(owner: string, repo: string) {
      return memoize(communityProfiles, repositoryKey(owner, repo), () =>
        github.getCommunityProfile(owner, repo)
      );
    }
  };
}

function memoize<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  load: () => Promise<T>
): Promise<T> {
  const cached = cache.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const pending = load();
  cache.set(key, pending);
  return pending;
}

function repositoryKey(owner: string, repo: string): string {
  return `${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

function branchKey(owner: string, repo: string, branch: string): string {
  return `${repositoryKey(owner, repo)}/${branch}`;
}
