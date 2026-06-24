# Privacy Policy

PolicyChecks is a free, read-only GitHub App that reports selected repository settings as returned by the GitHub API.

## Data We Process

When someone requests a badge, Shields JSON response, details JSON response, or repository `info.json` response, PolicyChecks uses the requested repository owner/name to query GitHub for the supported repository settings. PolicyChecks does not request repository write permissions and does not read repository source code.

PolicyChecks may temporarily cache API-derived badge evaluation results in memory for up to the configured cache TTL, currently one hour by default. This cache is used only to reduce repeated GitHub API requests.

PolicyChecks may receive GitHub Marketplace lifecycle webhooks for Marketplace listing administration. These deliveries are verified and acknowledged, but PolicyChecks does not create customer accounts or store Marketplace webhook payloads.

## Data We Do Not Store

PolicyChecks does not maintain a user database, customer account database, repository-content database, or persistent webhook-payload archive.

## Logs

Operational logs may include route templates, response status codes, rate-limit metadata, and error categories. Logs must not include GitHub tokens, webhook secrets, webhook payloads, repository contents, or private keys.

## Contact

Questions about this policy can be sent to policychecks@reponomics.org.
