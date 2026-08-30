import "dotenv/config";

import { loadServerConfig } from "./config/env.js";
import { createFixtureApp } from "./dev/fixture-app.js";

const config = loadServerConfig();
const app = createFixtureApp(config.cacheTtlMs);

app.listen(config.port, () => {
  console.log(`policychecks fixture server listening on http://localhost:${config.port}`);
  console.log("GitHub API calls and webhook handling are disabled in fixture mode.");
});
