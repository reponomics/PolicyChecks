import { request } from "@octokit/request";

import { toGitHubApiError } from "./errors.js";

export interface GitHubRepository {
  id: number;
  default_branch?: string | null;
}

export interface GitHubClient {
  getRepository(owner: string, repo: string): Promise<GitHubRepository>;
  getImmutableReleases(owner: string, repo: string): Promise<unknown>;
  getActionsPermissions(owner: string, repo: string): Promise<unknown>;
  getCodeSecurityConfiguration(owner: string, repo: string): Promise<unknown>;
  getBranchRules(owner: string, repo: string, branch: string): Promise<unknown>;
}

export type GitHubRequest = ReturnType<typeof request.defaults>;

export class GitHubRestClient implements GitHubClient {
  constructor(private readonly githubRequest: GitHubRequest) {}

  async getRepository(owner: string, repo: string): Promise<GitHubRepository> {
    return this.getJson<GitHubRepository>("GET /repos/{owner}/{repo}", {
      owner,
      repo
    });
  }

  async getImmutableReleases(owner: string, repo: string): Promise<unknown> {
    return this.getJson("GET /repos/{owner}/{repo}/immutable-releases", {
      owner,
      repo
    });
  }

  async getActionsPermissions(owner: string, repo: string): Promise<unknown> {
    return this.getJson("GET /repos/{owner}/{repo}/actions/permissions", {
      owner,
      repo
    });
  }

  async getCodeSecurityConfiguration(owner: string, repo: string): Promise<unknown> {
    try {
      const response = await this.githubRequest(
        "GET /repos/{owner}/{repo}/code-security-configuration",
        {
          owner,
          repo
        }
      );
      const status = (response as { status?: number }).status;

      return status === 204 ? { status: "no_content" } : response.data;
    } catch (error) {
      throw toGitHubApiError(error);
    }
  }

  async getBranchRules(owner: string, repo: string, branch: string): Promise<unknown> {
    return this.getJson("GET /repos/{owner}/{repo}/rules/branches/{branch}", {
      owner,
      repo,
      branch,
      per_page: 100
    });
  }

  private async getJson<T>(route: string, parameters: Record<string, string | number>): Promise<T> {
    try {
      const response = await this.githubRequest(route, parameters);
      return response.data as T;
    } catch (error) {
      throw toGitHubApiError(error);
    }
  }
}
