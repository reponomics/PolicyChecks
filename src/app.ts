import "dotenv/config";

import { InMemoryClaimCache } from "./cache/cache.js";
import { loadConfig } from "./config/env.js";
import { GitHubAppTokenFactory } from "./github/app-auth.js";
import { GitHubInstallationResolver, InMemoryRepositoryStore } from "./github/installations.js";
import { createWebhookRouter } from "./routes/webhook-routes.js";
import { ClaimService } from "./server/claim-service.js";
import { createHttpApp } from "./server/http-app.js";

const config = loadConfig();
const tokenFactory = new GitHubAppTokenFactory(config.github);
const repositoryStore = new InMemoryRepositoryStore();
const claimCache = new InMemoryClaimCache();
const installationResolver = new GitHubInstallationResolver(tokenFactory, repositoryStore);
const claimService = new ClaimService({
  cache: claimCache,
  installationResolver,
  cacheTtlMs: config.cacheTtlMs
});

const app = createHttpApp(
  claimService,
  createWebhookRouter({
    repositoryStore,
    claimCache,
    webhookSecret: config.github.webhookSecret
  })
);

app.listen(config.port, () => {
  console.log(`policychecks listening on http://localhost:${config.port}`);
});
