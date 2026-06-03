import { publicMessage, toPublicClaimError } from "../github/errors.js";
import {
  isRecord,
  makeClaimResult,
  makeUnknownResult,
  repositorySettingEvidence,
  resultInput
} from "./result.js";
import type { ClaimDefinition, ClaimEvaluationInput } from "./types.js";

export const shaPinningRequiredClaim: ClaimDefinition = {
  id: "sha-pinning-required",
  label: "SHA pinning",
  passMessage: "enforced",
  failMessage: "not enforced",
  unknownMessage: "unknown",
  source: {
    provider: "github",
    api: "REST",
    endpoint: "GET /repos/{owner}/{repo}/actions/permissions",
    fields: ["sha_pinning_required"]
  },
  evidence: repositorySettingEvidence,
  async evaluate(input: ClaimEvaluationInput) {
    try {
      const data = await input.github.getActionsPermissions(input.owner, input.repo);

      if (!isRecord(data) || typeof data.sha_pinning_required !== "boolean") {
        return makeUnknownResult(shaPinningRequiredClaim, resultInput(input), {
          kind: "unexpected_response",
          message: publicMessage("unexpected_response")
        });
      }

      const required = data.sha_pinning_required;

      return makeClaimResult(
        shaPinningRequiredClaim,
        resultInput(input),
        required ? "pass" : "fail",
        required,
        {
          sha_pinning_required: required
        }
      );
    } catch (error) {
      return makeUnknownResult(
        shaPinningRequiredClaim,
        resultInput(input),
        toPublicClaimError(error)
      );
    }
  }
};
