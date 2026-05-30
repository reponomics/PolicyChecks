import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config/env.js";

const baseEnv = {
  GITHUB_APP_ID: "12345",
  GITHUB_PRIVATE_KEY: "line-1\\nline-2",
  GITHUB_WEBHOOK_SECRET: "test-webhook-secret"
} satisfies NodeJS.ProcessEnv;

describe("loadConfig", () => {
  it("applies defaults when only required values are present", () => {
    const config = loadConfig(baseEnv);

    expect(config).toEqual({
      port: 3000,
      cacheTtlMs: 3_600_000,
      github: {
        appId: 12345,
        privateKey: "line-1\nline-2",
        webhookSecret: "test-webhook-secret",
        apiBaseUrl: "https://api.github.com",
        apiVersion: "2026-03-10"
      }
    });
  });

  it("honours explicit overrides", () => {
    const config = loadConfig({
      ...baseEnv,
      PORT: "8080",
      CACHE_TTL_SECONDS: "60",
      GITHUB_API_BASE_URL: "https://ghe.example.com/api/v3",
      GITHUB_API_VERSION: "2099-01-01"
    });

    expect(config.port).toBe(8080);
    expect(config.cacheTtlMs).toBe(60_000);
    expect(config.github.apiBaseUrl).toBe("https://ghe.example.com/api/v3");
    expect(config.github.apiVersion).toBe("2099-01-01");
  });

  it("decodes a base64 private key in preference to the raw key", () => {
    const decoded = "-----BEGIN KEY-----\nabc\n-----END KEY-----";
    const config = loadConfig({
      GITHUB_APP_ID: "1",
      GITHUB_PRIVATE_KEY: "ignored",
      GITHUB_WEBHOOK_SECRET: "test-webhook-secret",
      GITHUB_PRIVATE_KEY_BASE64: Buffer.from(decoded, "utf8").toString("base64")
    });

    expect(config.github.privateKey).toBe(decoded);
  });

  it("normalizes escaped newlines in the raw private key", () => {
    const config = loadConfig({ ...baseEnv, GITHUB_PRIVATE_KEY: "a\\nb\\nc" });

    expect(config.github.privateKey).toBe("a\nb\nc");
  });

  it.each([
    ["missing", { GITHUB_APP_ID: "1" }],
    ["empty", { GITHUB_APP_ID: "1", GITHUB_PRIVATE_KEY: "   " }]
  ])("throws when the private key is %s", (_label, env) => {
    expect(() => loadConfig(env as NodeJS.ProcessEnv)).toThrow(/GITHUB_PRIVATE_KEY/);
  });

  it("throws when GITHUB_APP_ID is missing", () => {
    expect(() => loadConfig({ GITHUB_PRIVATE_KEY: "k" })).toThrow(/Missing GITHUB_APP_ID/);
  });

  it.each([
    ["missing", { GITHUB_APP_ID: "1", GITHUB_PRIVATE_KEY: "k" }],
    ["empty", { GITHUB_APP_ID: "1", GITHUB_PRIVATE_KEY: "k", GITHUB_WEBHOOK_SECRET: " " }]
  ])("throws when the webhook secret is %s", (_label, env) => {
    expect(() => loadConfig(env as NodeJS.ProcessEnv)).toThrow(/GITHUB_WEBHOOK_SECRET/);
  });

  it.each(["abc", "0", "-5", "123abc", "1.5"])(
    "throws when GITHUB_APP_ID is not a positive integer (%s)",
    (value) => {
      expect(() => loadConfig({ ...baseEnv, GITHUB_APP_ID: value })).toThrow(
        /GITHUB_APP_ID must be a positive integer/
      );
    }
  );

  it.each([
    ["PORT", { PORT: "not-a-port" }],
    ["PORT", { PORT: "12abc" }],
    ["PORT", { PORT: "1.5" }],
    ["CACHE_TTL_SECONDS", { CACHE_TTL_SECONDS: "3s" }],
    ["CACHE_TTL_SECONDS", { CACHE_TTL_SECONDS: "1.5" }]
  ] as const)("throws when optional integer override %s is invalid", (name, override) => {
    expect(() => loadConfig({ ...baseEnv, ...override })).toThrow(
      new RegExp(`${name} must be a positive integer`)
    );
  });
});
