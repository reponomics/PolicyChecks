import { describe, expect, it, vi } from "vitest";

import { GitHubRestClient, type GitHubRequest } from "../../src/github/client.js";
import { GitHubApiError } from "../../src/github/errors.js";

function clientReturning(data: unknown): {
  client: GitHubRestClient;
  request: ReturnType<typeof vi.fn>;
} {
  const request = vi.fn(async () => ({ data, status: 200 }));
  return { client: new GitHubRestClient(request as unknown as GitHubRequest), request };
}

describe("GitHubRestClient", () => {
  it("getRepository requests the repo route and returns data", async () => {
    const { client, request } = clientReturning({ id: 7, default_branch: "main" });

    const repo = await client.getRepository("OWNER", "REPO");

    expect(repo).toEqual({ id: 7, default_branch: "main" });
    expect(request).toHaveBeenCalledWith("GET /repos/{owner}/{repo}", {
      owner: "OWNER",
      repo: "REPO"
    });
  });

  it("getImmutableReleases requests the immutable-releases route", async () => {
    const { client, request } = clientReturning({ enabled: true });

    await expect(client.getImmutableReleases("OWNER", "REPO")).resolves.toEqual({ enabled: true });
    expect(request).toHaveBeenCalledWith("GET /repos/{owner}/{repo}/immutable-releases", {
      owner: "OWNER",
      repo: "REPO"
    });
  });

  it("getActionsPermissions requests the actions permissions route", async () => {
    const { client, request } = clientReturning({ sha_pinning_required: true });

    await expect(client.getActionsPermissions("OWNER", "REPO")).resolves.toEqual({
      sha_pinning_required: true
    });
    expect(request).toHaveBeenCalledWith("GET /repos/{owner}/{repo}/actions/permissions", {
      owner: "OWNER",
      repo: "REPO"
    });
  });

  it("getCodeSecurityConfiguration requests the code security configuration route", async () => {
    const { client, request } = clientReturning({
      status: "attached",
      configuration: { secret_scanning: "enabled" }
    });

    await expect(client.getCodeSecurityConfiguration("OWNER", "REPO")).resolves.toEqual({
      status: "attached",
      configuration: { secret_scanning: "enabled" }
    });
    expect(request).toHaveBeenCalledWith("GET /repos/{owner}/{repo}/code-security-configuration", {
      owner: "OWNER",
      repo: "REPO"
    });
  });

  it("getCodeSecurityConfiguration preserves a 204 no-content response", async () => {
    const request = vi.fn(async () => ({ data: undefined, status: 204 }));
    const client = new GitHubRestClient(request as unknown as GitHubRequest);

    await expect(client.getCodeSecurityConfiguration("OWNER", "REPO")).resolves.toEqual({
      status: "no_content"
    });
  });

  it("getVulnerabilityAlertsStatus treats a successful status response as enabled", async () => {
    const request = vi.fn(async () => ({ data: undefined, status: 204 }));
    const client = new GitHubRestClient(request as unknown as GitHubRequest);

    await expect(client.getVulnerabilityAlertsStatus("OWNER", "REPO")).resolves.toBe("enabled");
    expect(request).toHaveBeenCalledWith("GET /repos/{owner}/{repo}/vulnerability-alerts", {
      owner: "OWNER",
      repo: "REPO"
    });
  });

  it("getBranchRules requests the branch rules route with pagination", async () => {
    const { client, request } = clientReturning([]);

    await expect(client.getBranchRules("OWNER", "REPO", "main")).resolves.toEqual([]);
    expect(request).toHaveBeenCalledWith("GET /repos/{owner}/{repo}/rules/branches/{branch}", {
      owner: "OWNER",
      repo: "REPO",
      branch: "main",
      per_page: 100
    });
  });

  it("translates request failures into a GitHubApiError", async () => {
    const request = vi.fn(async () => {
      throw { status: 404, message: "nope" };
    });
    const client = new GitHubRestClient(request as unknown as GitHubRequest);
    const call = client.getRepository("OWNER", "REPO");

    await expect(call).rejects.toBeInstanceOf(GitHubApiError);
    await expect(call).rejects.toMatchObject({
      status: 404,
      kind: "not_found"
    });
    expect(request).toHaveBeenCalledOnce();
  });
});
