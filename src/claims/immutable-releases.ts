import { GitHubApiError, publicMessage, toPublicClaimError } from "../github/errors.js";
import {
  isRecord,
  makeClaimResult,
  makeUnknownResult,
  repositorySettingEvidence,
  resultInput
} from "./result.js";
import type { ClaimDefinition, ClaimEvaluationInput } from "./types.js";

export const immutableReleasesClaim: ClaimDefinition = {
  id: "immutable-releases",
  label: "immutable releases",
  passMessage: "enforced",
  failMessage: "not enforced",
  unknownMessage: "unknown",
  source: {
    provider: "github",
    api: "REST",
    endpoint: "GET /repos/{owner}/{repo}/immutable-releases",
    fields: ["enabled", "enforced_by_owner"]
  },
  evidence: repositorySettingEvidence,
  async evaluate(input: ClaimEvaluationInput) {
    try {
      const data = await input.github.getImmutableReleases(input.owner, input.repo);

      if (!isRecord(data) || data.enabled !== true) {
        return makeUnknownResult(immutableReleasesClaim, resultInput(input), {
          kind: "unexpected_response",
          message: publicMessage("unexpected_response")
        });
      }

      return makeClaimResult(immutableReleasesClaim, resultInput(input), "pass", true, {
        enabled: true,
        enforced_by_owner:
          typeof data.enforced_by_owner === "boolean" ? data.enforced_by_owner : null
      });
    } catch (error) {
      if (
        error instanceof GitHubApiError &&
        error.status === 404 &&
        input.repositoryAccess === "verified"
      ) {
        return makeClaimResult(immutableReleasesClaim, resultInput(input), "fail", false, {
          enabled: false
        });
      }

      return makeUnknownResult(
        immutableReleasesClaim,
        resultInput(input),
        toPublicClaimError(error)
      );
    }
  }
};
