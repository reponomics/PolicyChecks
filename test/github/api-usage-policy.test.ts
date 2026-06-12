import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const productionSources = [
  "src/github/app-auth.ts",
  "src/github/client.ts",
  "src/github/installations.ts",
  "src/claims/default-branch-rules.ts",
  "src/claims/immutable-releases.ts",
  "src/claims/secret-protection.ts",
  "src/claims/sha-pinning-required.ts",
  "src/claims/web-commit-signoff.ts"
];

const allowedRoutes = new Set([
  "GET /repos/{owner}/{repo}",
  "GET /repos/{owner}/{repo}/actions/permissions",
  "GET /repos/{owner}/{repo}/immutable-releases",
  "GET /repos/{owner}/{repo}/rules/branches/{branch}",
  "GET /repos/{owner}/{repo}/installation"
]);

describe("GitHub API usage policy", () => {
  it("keeps production REST routes on a small audited GET allowlist", async () => {
    const routes = await routeTemplatesFromProductionSources();

    expect(routes).toEqual([...allowedRoutes].sort());
  });

  it("does not introduce high-risk GitHub API patterns", async () => {
    const source = await productionSourceText();

    expect(source).not.toMatch(/\b(?:POST|PUT|PATCH|DELETE) \//);
    expect(source).not.toMatch(/paginate\b|\.iterator\b/);
    expect(source).not.toMatch(/\/user\/repos|\/orgs\/\{org\}\/repos/);
    expect(source).not.toMatch(/\/installation\/repositories/);
    expect(source).not.toMatch(/\/search\//);
    expect(source).not.toMatch(/\/graphql\b|graphql\s*\(/i);
  });
});

async function routeTemplatesFromProductionSources(): Promise<string[]> {
  const source = await productionSourceText();
  const routes = [...source.matchAll(/["'`]((?:GET|POST|PUT|PATCH|DELETE) [^"'`]+)["'`]/g)]
    .map((match) => match[1])
    .filter((route): route is string => route !== undefined);

  return [...new Set(routes)].sort();
}

async function productionSourceText(): Promise<string> {
  const files = await Promise.all(
    productionSources.map(async (path) =>
      readFile(new URL(`../../${path}`, import.meta.url), "utf8")
    )
  );

  return files.join("\n");
}
