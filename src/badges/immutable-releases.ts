import { GitHubApiError, publicMessage, toPublicBadgeError } from "../github/errors.js";
import { isRecord, makeBadgeResult, makeUnknownResult, resultInput } from "./result.js";
import type { BadgeDefinition, BadgeEvaluationInput } from "./types.js";

export const immutableReleasesBadge: BadgeDefinition = {
  id: "immutable-releases",
  label: "immutable releases",
  source: {
    provider: "github",
    api: "REST",
    endpoint: "GET /repos/{owner}/{repo}/immutable-releases",
    fields: ["enabled", "enforced_by_owner"]
  },
  async evaluate(input: BadgeEvaluationInput) {
    try {
      const data = await input.github.getImmutableReleases(input.owner, input.repo);

      if (!isRecord(data) || typeof data.enabled !== "boolean") {
        return makeUnknownResult(immutableReleasesBadge, resultInput(input), {
          kind: "unexpected_response",
          message: publicMessage("unexpected_response")
        });
      }

      const enabled = data.enabled;

      return makeBadgeResult(
        immutableReleasesBadge,
        resultInput(input),
        enabled ? "enabled" : "disabled",
        {
          enabled,
          enforced_by_owner:
            typeof data.enforced_by_owner === "boolean" ? data.enforced_by_owner : null
        }
      );
    } catch (error) {
      if (
        error instanceof GitHubApiError &&
        error.status === 404 &&
        input.repositoryAccess === "verified"
      ) {
        return makeBadgeResult(immutableReleasesBadge, resultInput(input), "disabled", {
          enabled: false,
          enforced_by_owner: null
        });
      }

      return makeUnknownResult(
        immutableReleasesBadge,
        resultInput(input),
        toPublicBadgeError(error)
      );
    }
  }
};
