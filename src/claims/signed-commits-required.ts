import { publicMessage, toPublicClaimError } from "../github/errors.js";
import { isRecord, makeClaimResult, makeUnknownResult, resultInput } from "./result.js";
import type { ClaimDefinition, ClaimEvaluationInput } from "./types.js";

export const signedCommitsRequiredClaim: ClaimDefinition = {
  id: "signed-commits-required",
  label: "signed commits",
  passMessage: "required",
  failMessage: "not required",
  unknownMessage: "unknown",
  source: {
    provider: "github",
    api: "REST",
    endpoint: "GET /repos/{owner}/{repo}/rules/branches/{branch}",
    fields: ["type"]
  },
  async evaluate(input: ClaimEvaluationInput) {
    try {
      const repository = await input.github.getRepository(input.owner, input.repo);
      const branch = repository.default_branch;

      if (typeof branch !== "string" || branch.trim() === "") {
        return makeUnknownResult(
          signedCommitsRequiredClaim,
          resultInput(input),
          {
            kind: "unexpected_response",
            message: "GitHub repository metadata did not include a default branch."
          },
          {
            branch: null,
            matching_rule_types: []
          }
        );
      }

      const rules = await input.github.getBranchRules(input.owner, input.repo, branch);

      if (!Array.isArray(rules)) {
        return makeUnknownResult(
          signedCommitsRequiredClaim,
          resultInput(input),
          {
            kind: "unexpected_response",
            message: publicMessage("unexpected_response")
          },
          {
            branch,
            matching_rule_types: []
          }
        );
      }

      const matchingRuleTypes = rules
        .filter(isRecord)
        .map((rule) => rule.type)
        .filter((type): type is string => typeof type === "string");
      const required = matchingRuleTypes.includes("required_signatures");

      return makeClaimResult(
        signedCommitsRequiredClaim,
        resultInput(input),
        required ? "pass" : "fail",
        required,
        {
          branch,
          matching_rule_types: matchingRuleTypes
        }
      );
    } catch (error) {
      return makeUnknownResult(
        signedCommitsRequiredClaim,
        resultInput(input),
        toPublicClaimError(error)
      );
    }
  }
};
