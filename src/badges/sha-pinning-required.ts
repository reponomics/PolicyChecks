import { publicMessage, toPublicBadgeError } from "../github/errors.js";
import { isRecord, makeBadgeResult, makeUnknownResult, resultInput } from "./result.js";
import type { BadgeDefinition, BadgeEvaluationInput } from "./types.js";

export const shaPinningRequiredBadge: BadgeDefinition = {
  id: "sha-pinning-required",
  label: "SHA pinning",
  source: {
    provider: "github",
    api: "REST",
    endpoint: "GET /repos/{owner}/{repo}/actions/permissions",
    fields: ["sha_pinning_required"]
  },
  async evaluate(input: BadgeEvaluationInput) {
    try {
      const data = await input.github.getActionsPermissions(input.owner, input.repo);

      if (!isRecord(data) || typeof data.sha_pinning_required !== "boolean") {
        return makeUnknownResult(shaPinningRequiredBadge, resultInput(input), {
          kind: "unexpected_response",
          message: publicMessage("unexpected_response")
        });
      }

      const required = data.sha_pinning_required;

      return makeBadgeResult(
        shaPinningRequiredBadge,
        resultInput(input),
        required ? "enabled" : "disabled",
        {
          sha_pinning_required: required
        }
      );
    } catch (error) {
      return makeUnknownResult(
        shaPinningRequiredBadge,
        resultInput(input),
        toPublicBadgeError(error)
      );
    }
  }
};
