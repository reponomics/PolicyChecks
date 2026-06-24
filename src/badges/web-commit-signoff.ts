import { publicMessage, toPublicBadgeError } from "../github/errors.js";
import { makeBadgeResult, makeUnknownResult, resultInput } from "./result.js";
import type { BadgeDefinition, BadgeEvaluationInput } from "./types.js";

export const webCommitSignoffRequiredBadge: BadgeDefinition = {
  id: "web-commit-signoff-required",
  label: "web signoff",
  source: {
    provider: "github",
    api: "REST",
    endpoint: "GET /repos/{owner}/{repo}",
    fields: ["web_commit_signoff_required"]
  },
  async evaluate(input: BadgeEvaluationInput) {
    try {
      const repository = await input.github.getRepository(input.owner, input.repo);
      const required = repository.web_commit_signoff_required;

      if (typeof required !== "boolean") {
        return makeUnknownResult(
          webCommitSignoffRequiredBadge,
          resultInput(input),
          {
            kind: "unexpected_response",
            message: publicMessage("unexpected_response")
          },
          {
            web_commit_signoff_required: required ?? null
          }
        );
      }

      return makeBadgeResult(
        webCommitSignoffRequiredBadge,
        resultInput(input),
        required ? "enabled" : "disabled",
        {
          web_commit_signoff_required: required,
          applies_to: "web_based_commits",
          limitations: {
            command_line_commits_evaluated: false,
            commit_history_evaluated: false
          }
        }
      );
    } catch (error) {
      return makeUnknownResult(
        webCommitSignoffRequiredBadge,
        resultInput(input),
        toPublicBadgeError(error)
      );
    }
  }
};
