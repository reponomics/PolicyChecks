export interface RuntimeConfig {
  port: number;
  cacheTtlMs: number;
  github: {
    appId: number;
    privateKey: string;
    webhookSecret: string;
    apiBaseUrl: string;
    apiVersion: string;
  };
}

export interface ServerConfig {
  port: number;
  cacheTtlMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const server = loadServerConfig(env);
  const appId = parseRequiredInteger(env.GITHUB_APP_ID, "GITHUB_APP_ID");
  const privateKey = readPrivateKey(env);
  const webhookSecret = parseRequiredString(env.GITHUB_WEBHOOK_SECRET, "GITHUB_WEBHOOK_SECRET");

  return {
    ...server,
    github: {
      appId,
      privateKey,
      webhookSecret,
      apiBaseUrl: env.GITHUB_API_BASE_URL ?? "https://api.github.com",
      apiVersion: env.GITHUB_API_VERSION ?? "2026-03-10"
    }
  };
}

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: parseOptionalInteger(env.PORT, 3000, "PORT"),
    cacheTtlMs: parseOptionalInteger(env.CACHE_TTL_SECONDS, 3600, "CACHE_TTL_SECONDS") * 1000
  };
}

function readPrivateKey(env: NodeJS.ProcessEnv): string {
  if (env.GITHUB_PRIVATE_KEY_BASE64 !== undefined && env.GITHUB_PRIVATE_KEY_BASE64.trim() !== "") {
    const decoded = Buffer.from(env.GITHUB_PRIVATE_KEY_BASE64, "base64").toString("utf8");

    if (decoded.trim() === "") {
      throw new Error("GITHUB_PRIVATE_KEY_BASE64 must decode to a non-empty private key.");
    }

    return decoded;
  }

  if (env.GITHUB_PRIVATE_KEY === undefined || env.GITHUB_PRIVATE_KEY.trim() === "") {
    throw new Error(
      "Missing GITHUB_PRIVATE_KEY. Provide the GitHub App private key or GITHUB_PRIVATE_KEY_BASE64."
    );
  }

  return env.GITHUB_PRIVATE_KEY.replace(/\\n/g, "\n");
}

function parseRequiredInteger(value: string | undefined, name: string): number {
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing ${name}.`);
  }

  return parseInteger(value, name);
}

function parseRequiredString(value: string | undefined, name: string): string {
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing ${name}.`);
  }

  return value;
}

function parseOptionalInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  return parseInteger(value, name);
}

function parseInteger(value: string, name: string): number {
  const normalized = value.trim();

  if (!/^[1-9]\d*$/.test(normalized)) {
    throw new Error(`${name} must be a positive integer.`);
  }

  const parsed = Number(normalized);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}
