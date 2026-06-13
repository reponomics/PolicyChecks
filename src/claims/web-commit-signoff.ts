import { publicMessage, toPublicClaimError } from "../github/errors.js";
import {
  makeClaimResult,
  makeUnknownResult,
  repositorySettingEvidence,
  resultInput
} from "./result.js";
import type { ClaimDefinition, ClaimEvaluationInput } from "./types.js";

export const webCommitSignoffRequiredClaim: ClaimDefinition = {
  id: "web-commit-signoff-required",
  label: "web signoff",
  passMessage: "enabled",
  failMessage: "disabled",
  unknownMessage: "unknown",
  source: {
    provider: "github",
    api: "REST",
    endpoint: "GET /repos/{owner}/{repo}",
    fields: ["web_commit_signoff_required"]
  },
  evidence: repositorySettingEvidence,
  async evaluate(input: ClaimEvaluationInput) {
    try {
      const repository = await input.github.getRepository(input.owner, input.repo);
      const required = repository.web_commit_signoff_required;

      if (typeof required !== "boolean") {
        return makeUnknownResult(
          webCommitSignoffRequiredClaim,
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

      return makeClaimResult(
        webCommitSignoffRequiredClaim,
        resultInput(input),
        required ? "pass" : "fail",
        required,
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
        webCommitSignoffRequiredClaim,
        resultInput(input),
        toPublicClaimError(error)
      );
    }
  }
};
