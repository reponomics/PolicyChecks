import "dotenv/config";

import { InMemoryBadgeCache } from "./cache/cache.js";
import { loadConfig } from "./config/env.js";
import { GitHubAppTokenFactory } from "./github/app-auth.js";
import { GitHubInstallationResolver, InMemoryRepositoryStore } from "./github/installations.js";
import { createWebhookRouter } from "./routes/webhook-routes.js";
import { BadgeService } from "./server/badge-service.js";
import { createHttpApp } from "./server/http-app.js";

const config = loadConfig();
const tokenFactory = new GitHubAppTokenFactory(config.github);
const repositoryStore = new InMemoryRepositoryStore();
const badgeCache = new InMemoryBadgeCache();
const installationResolver = new GitHubInstallationResolver(tokenFactory, repositoryStore);
const badgeService = new BadgeService({
  cache: badgeCache,
  installationResolver,
  cacheTtlMs: config.cacheTtlMs
});

const app = createHttpApp(
  badgeService,
  createWebhookRouter({
    webhookSecret: config.github.webhookSecret
  })
);

app.listen(config.port, () => {
  console.log(`policychecks listening on http://localhost:${config.port}`);
});
