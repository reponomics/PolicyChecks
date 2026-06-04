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

  private async getJson<T>(route: string, parameters: Record<string, string | number>): Promise<T> {
    try {
      const response = await this.githubRequest(route, parameters);
      return response.data as T;
    } catch (error) {
      throw toGitHubApiError(error);
    }
  }
}
