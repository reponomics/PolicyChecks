import type { ClaimError } from "../claims/types.js";
import { GitHubApiError, publicMessage, toGitHubApiError, toPublicClaimError } from "./errors.js";
import type { GitHubClient } from "./client.js";
import type { GitHubAppTokenFactory } from "./app-auth.js";

export interface RepositoryRecord {
  owner: string;
  repo: string;
  repositoryId: number;
  installationId: number;
  defaultBranch: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RepositoryStore {
  get(owner: string, repo: string): RepositoryRecord | undefined;
  put(record: RepositoryRecord): void;
  delete(owner: string, repo: string): boolean;
  deleteByInstallationId(installationId: number): RepositoryRecord[];
}

export class InMemoryRepositoryStore implements RepositoryStore {
  private readonly records = new Map<string, RepositoryRecord>();

  get(owner: string, repo: string): RepositoryRecord | undefined {
    return this.records.get(repositoryKey(owner, repo));
  }

  put(record: RepositoryRecord): void {
    this.records.set(repositoryKey(record.owner, record.repo), record);
  }

  delete(owner: string, repo: string): boolean {
    return this.records.delete(repositoryKey(owner, repo));
  }

  deleteByInstallationId(installationId: number): RepositoryRecord[] {
    const deleted: RepositoryRecord[] = [];

    for (const [key, record] of this.records.entries()) {
      if (record.installationId === installationId) {
        this.records.delete(key);
        deleted.push(record);
      }
    }

    return deleted;
  }
}

export type InstallationResolution =
  | {
      status: "ok";
      github: GitHubClient;
      repository: RepositoryRecord;
    }
  | {
      status: "error";
      error: ClaimError;
    };

export class GitHubInstallationResolver {
  constructor(
    private readonly tokenFactory: GitHubAppTokenFactory,
    private readonly repositories: RepositoryStore
  ) {}

  async resolve(owner: string, repo: string): Promise<InstallationResolution> {
    const cached = this.repositories.get(owner, repo);

    if (cached !== undefined) {
      try {
        return {
          status: "ok",
          github: await this.tokenFactory.createInstallationClient(cached.installationId),
          repository: cached
        };
      } catch (error) {
        return {
          status: "error",
          error: toPublicClaimError(error)
        };
      }
    }

    let installationId: number;

    try {
      installationId = await this.fetchInstallationId(owner, repo);
    } catch (error) {
      return {
        status: "error",
        error: this.toInstallationLookupError(error)
      };
    }

    try {
      const github = await this.tokenFactory.createInstallationClient(installationId);
      const repository = await github.getRepository(owner, repo);
      const now = new Date().toISOString();
      const record: RepositoryRecord = {
        owner,
        repo,
        repositoryId: repository.id,
        installationId,
        defaultBranch: repository.default_branch ?? null,
        createdAt: now,
        updatedAt: now
      };

      this.repositories.put(record);

      return {
        status: "ok",
        github,
        repository: record
      };
    } catch (error) {
      return {
        status: "error",
        error: toPublicClaimError(error)
      };
    }
  }

  private async fetchInstallationId(owner: string, repo: string): Promise<number> {
    const appRequest = await this.tokenFactory.createAppRequest();

    try {
      const response = await appRequest("GET /repos/{owner}/{repo}/installation", {
        owner,
        repo
      });

      const data = response.data;

      if (!isRecord(data) || typeof data.id !== "number") {
        throw new GitHubApiError(publicMessage("unexpected_response"), {
          kind: "unexpected_response"
        });
      }

      return data.id;
    } catch (error) {
      throw toGitHubApiError(error);
    }
  }

  private toInstallationLookupError(error: unknown): ClaimError {
    const githubError = toGitHubApiError(error);

    if (githubError.status === 404) {
      return {
        kind: "not_installed",
        message: publicMessage("not_installed")
      };
    }

    return toPublicClaimError(githubError);
  }
}

function repositoryKey(owner: string, repo: string): string {
  return `${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
