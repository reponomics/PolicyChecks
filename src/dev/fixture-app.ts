import { InMemoryBadgeCache } from "../cache/cache.js";
import type { GitHubClient } from "../github/client.js";
import type { InstallationResolution } from "../github/installations.js";
import { BadgeService, type InstallationResolver } from "../server/badge-service.js";
import { createHttpApp } from "../server/http-app.js";

const fixtureGitHub: GitHubClient = {
  async getRepository() {
    return {
      id: 1,
      default_branch: "main",
      web_commit_signoff_required: true,
      security_and_analysis: {
        secret_scanning: { status: "enabled" },
        secret_scanning_push_protection: { status: "disabled" }
      }
    };
  },
  async getImmutableReleases() {
    return {
      enabled: true,
      enforced_by_owner: false
    };
  },
  async getActionsPermissions() {
    return {
      sha_pinning_required: true
    };
  },
  async getBranchRules() {
    return [
      { type: "deletion" },
      { type: "non_fast_forward" },
      { type: "pull_request", parameters: { required_approving_review_count: 1 } },
      { type: "required_linear_history" },
      { type: "required_signatures" },
      {
        type: "required_status_checks",
        parameters: { required_status_checks: [{ context: "test" }] }
      }
    ];
  },
  async getCommunityProfile() {
    return {
      health_percentage: 75,
      files: {
        code_of_conduct: { name: "Contributor Covenant", key: "contributor_covenant" },
        contributing: {},
        license: { name: "MIT License", key: "mit", spdx_id: "MIT" },
        readme: {}
      },
      content_reports_enabled: false,
      updated_at: null
    };
  }
};

const fixtureResolver: InstallationResolver = {
  async resolve(owner: string, repo: string): Promise<InstallationResolution> {
    const now = new Date().toISOString();

    return {
      status: "ok",
      github: fixtureGitHub,
      repository: {
        owner,
        repo,
        repositoryId: 1,
        installationId: 1,
        defaultBranch: "main",
        createdAt: now,
        updatedAt: now
      }
    };
  }
};

export function createFixtureApp(cacheTtlMs: number) {
  const badgeService = new BadgeService({
    cache: new InMemoryBadgeCache(),
    installationResolver: fixtureResolver,
    cacheTtlMs
  });

  return createHttpApp(badgeService);
}
