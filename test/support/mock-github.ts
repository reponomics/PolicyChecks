import type { BadgeDefinition, RepositoryAccess } from "../../src/badges/types.js";
import type { GitHubClient } from "../../src/github/client.js";

export const owner = "OWNER";
export const repo = "REPO";
export const checkedAt = "2026-05-30T00:00:00.000Z";

export function mockGitHub(overrides: Partial<GitHubClient>): GitHubClient {
  const unmocked = async () => {
    throw new Error("Unmocked GitHub client method.");
  };

  return {
    getRepository: unmocked,
    getImmutableReleases: unmocked,
    getActionsPermissions: unmocked,
    getBranchRules: unmocked,
    getCommunityProfile: unmocked,
    ...overrides
  };
}

export async function evaluateWithMock(
  definition: BadgeDefinition,
  github: GitHubClient,
  repositoryAccess: RepositoryAccess = "verified"
) {
  return definition.evaluate({
    owner,
    repo,
    github,
    repositoryAccess,
    now: () => new Date(checkedAt)
  });
}
