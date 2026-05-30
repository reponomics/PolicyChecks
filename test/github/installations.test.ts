import { describe, expect, it, vi } from "vitest";

import {
  GitHubInstallationResolver,
  InMemoryRepositoryStore,
  type RepositoryRecord
} from "../../src/github/installations.js";
import type { GitHubAppTokenFactory } from "../../src/github/app-auth.js";
import type { GitHubClient, GitHubRepository } from "../../src/github/client.js";
import { GitHubApiError } from "../../src/github/errors.js";

const record: RepositoryRecord = {
  owner: "OWNER",
  repo: "REPO",
  repositoryId: 1,
  installationId: 42,
  defaultBranch: "main",
  createdAt: "2026-05-30T00:00:00.000Z",
  updatedAt: "2026-05-30T00:00:00.000Z"
};

function fakeGitHub(
  repository: GitHubRepository = { id: 1, default_branch: "main" }
): GitHubClient {
  return {
    getRepository: vi.fn(async () => repository),
    getImmutableReleases: vi.fn(),
    getActionsPermissions: vi.fn(),
    getCodeSecurityConfiguration: vi.fn(),
    getBranchRules: vi.fn()
  };
}

// The token factory's real methods return Octokit RequestInterface / GitHubRestClient
// shapes that are awkward to fully reconstruct in a fake; we only need the call surface
// the resolver actually uses, so accept a loose override map and cast through unknown.
function fakeTokenFactory(overrides: Record<string, unknown>): GitHubAppTokenFactory {
  return overrides as unknown as GitHubAppTokenFactory;
}

describe("InMemoryRepositoryStore", () => {
  it("stores and retrieves records case-insensitively", () => {
    const store = new InMemoryRepositoryStore();
    store.put(record);

    expect(store.get("owner", "repo")).toBe(record);
  });

  it("returns undefined for unknown repositories", () => {
    expect(new InMemoryRepositoryStore().get("nope", "nope")).toBeUndefined();
  });

  it("deletes a repository by owner and repo", () => {
    const store = new InMemoryRepositoryStore();
    store.put(record);

    expect(store.delete("owner", "repo")).toBe(true);
    expect(store.get("OWNER", "REPO")).toBeUndefined();
  });

  it("deletes all repositories for an installation id", () => {
    const store = new InMemoryRepositoryStore();
    store.put(record);
    store.put({
      ...record,
      owner: "SECOND",
      repo: "REPO",
      repositoryId: 2,
      installationId: 42
    });
    store.put({
      ...record,
      owner: "THIRD",
      repo: "REPO",
      repositoryId: 3,
      installationId: 99
    });

    const deleted = store.deleteByInstallationId(42);
    expect(deleted).toHaveLength(2);
    expect(deleted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ owner: "OWNER", repo: "REPO" }),
        expect.objectContaining({ owner: "SECOND", repo: "REPO" })
      ])
    );
    expect(store.get("OWNER", "REPO")).toBeUndefined();
    expect(store.get("SECOND", "REPO")).toBeUndefined();
    expect(store.get("THIRD", "REPO")).toBeDefined();
  });
});

describe("GitHubInstallationResolver.resolve", () => {
  it("uses a cached record to build a client", async () => {
    const store = new InMemoryRepositoryStore();
    store.put(record);
    const github = fakeGitHub();
    const createAppRequest = vi.fn();
    const tokenFactory = fakeTokenFactory({
      createAppRequest,
      createInstallationClient: vi.fn(async () => github)
    });

    const resolution = await new GitHubInstallationResolver(tokenFactory, store).resolve(
      "OWNER",
      "REPO"
    );

    expect(resolution).toEqual({ status: "ok", github, repository: record });
    expect(tokenFactory.createInstallationClient).toHaveBeenCalledWith(42);
    expect(createAppRequest).not.toHaveBeenCalled();
  });

  it("returns an error when the cached installation client fails", async () => {
    const store = new InMemoryRepositoryStore();
    store.put(record);
    const tokenFactory = fakeTokenFactory({
      createInstallationClient: vi.fn(async () => {
        throw new GitHubApiError("forbidden", { status: 403, kind: "forbidden" });
      })
    });

    const resolution = await new GitHubInstallationResolver(tokenFactory, store).resolve(
      "OWNER",
      "REPO"
    );

    expect(resolution).toMatchObject({ status: "error", error: { kind: "forbidden" } });
  });

  it("discovers, persists, and resolves an uncached installation", async () => {
    const store = new InMemoryRepositoryStore();
    const github = fakeGitHub({ id: 99, default_branch: "trunk" });
    const appRequest = vi.fn(async () => ({ data: { id: 7 } }));
    const tokenFactory = fakeTokenFactory({
      createAppRequest: vi.fn(async () => appRequest),
      createInstallationClient: vi.fn(async () => github)
    });

    const resolution = await new GitHubInstallationResolver(tokenFactory, store).resolve(
      "OWNER",
      "REPO"
    );

    expect(resolution.status).toBe("ok");
    expect(tokenFactory.createAppRequest).toHaveBeenCalledOnce();
    expect(appRequest).toHaveBeenCalledWith("GET /repos/{owner}/{repo}/installation", {
      owner: "OWNER",
      repo: "REPO"
    });
    expect(tokenFactory.createInstallationClient).toHaveBeenCalledWith(7);
    const stored = store.get("OWNER", "REPO");
    expect(stored).toMatchObject({ repositoryId: 99, installationId: 7, defaultBranch: "trunk" });
  });

  it("maps a 404 during installation lookup to not_installed", async () => {
    const appRequest = vi.fn(async () => {
      throw { status: 404, message: "no installation" };
    });
    const tokenFactory = fakeTokenFactory({
      createAppRequest: vi.fn(async () => appRequest)
    });

    const resolution = await new GitHubInstallationResolver(
      tokenFactory,
      new InMemoryRepositoryStore()
    ).resolve("OWNER", "REPO");

    expect(tokenFactory.createAppRequest).toHaveBeenCalledOnce();
    expect(appRequest).toHaveBeenCalledWith("GET /repos/{owner}/{repo}/installation", {
      owner: "OWNER",
      repo: "REPO"
    });
    expect(resolution).toMatchObject({ status: "error", error: { kind: "not_installed" } });
  });

  it("treats an installation payload without an id as an unexpected response", async () => {
    const appRequest = vi.fn(async () => ({ data: {} }));
    const tokenFactory = fakeTokenFactory({
      createAppRequest: vi.fn(async () => appRequest)
    });

    const resolution = await new GitHubInstallationResolver(
      tokenFactory,
      new InMemoryRepositoryStore()
    ).resolve("OWNER", "REPO");

    expect(tokenFactory.createAppRequest).toHaveBeenCalledOnce();
    expect(appRequest).toHaveBeenCalledWith("GET /repos/{owner}/{repo}/installation", {
      owner: "OWNER",
      repo: "REPO"
    });
    expect(resolution).toMatchObject({ status: "error", error: { kind: "unexpected_response" } });
  });

  it("returns an error when the post-lookup client build fails", async () => {
    const appRequest = vi.fn(async () => ({ data: { id: 7 } }));
    const tokenFactory = fakeTokenFactory({
      createAppRequest: vi.fn(async () => appRequest),
      createInstallationClient: vi.fn(async () => {
        throw new GitHubApiError("boom", { status: 500, kind: "github_error" });
      })
    });

    const resolution = await new GitHubInstallationResolver(
      tokenFactory,
      new InMemoryRepositoryStore()
    ).resolve("OWNER", "REPO");

    expect(tokenFactory.createAppRequest).toHaveBeenCalledOnce();
    expect(appRequest).toHaveBeenCalledWith("GET /repos/{owner}/{repo}/installation", {
      owner: "OWNER",
      repo: "REPO"
    });
    expect(resolution).toMatchObject({ status: "error", error: { kind: "github_error" } });
  });
});
