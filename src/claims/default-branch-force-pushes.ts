import { publicMessage, toPublicClaimError } from "../github/errors.js";
import {
  activeBranchRulesEvidence,
  isRecord,
  makeClaimResult,
  makeUnknownResult,
  resultInput
} from "./result.js";
import type { ClaimDefinition, ClaimEvaluationInput } from "./types.js";

const ruleType = "non_fast_forward";

export const defaultBranchForcePushesBlockedClaim: ClaimDefinition = {
  id: "default-branch-force-pushes-blocked",
  label: "force pushes blocked",
  passMessage: "enabled",
  failMessage: "disabled",
  unknownMessage: "unknown",
  source: {
    provider: "github",
    api: "REST",
    endpoint: "GET /repos/{owner}/{repo}/rules/branches/{branch}",
    fields: ["type"]
  },
  evidence: activeBranchRulesEvidence,
  async evaluate(input: ClaimEvaluationInput) {
    try {
      const repository = await input.github.getRepository(input.owner, input.repo);
      const defaultBranch = repository.default_branch;

      if (typeof defaultBranch !== "string" || defaultBranch.trim() === "") {
        return makeUnknownResult(
          defaultBranchForcePushesBlockedClaim,
          resultInput(input),
          {
            kind: "unexpected_response",
            message: publicMessage("unexpected_response")
          },
          {
            default_branch: defaultBranch ?? null
          }
        );
      }

      const rules = await input.github.getBranchRules(input.owner, input.repo, defaultBranch);
      return evaluateRules(input, defaultBranch, rules);
    } catch (error) {
      return makeUnknownResult(
        defaultBranchForcePushesBlockedClaim,
        resultInput(input),
        toPublicClaimError(error)
      );
    }
  }
};

function evaluateRules(input: ClaimEvaluationInput, defaultBranch: string, rules: unknown) {
  if (!Array.isArray(rules)) {
    return unexpectedRules(input, defaultBranch);
  }

  const ruleTypes = rules.map((rule) => ruleTypeFrom(rule));

  if (ruleTypes.some((type) => type === undefined)) {
    return unexpectedRules(input, defaultBranch);
  }

  const activeRuleTypes = [...new Set(ruleTypes)].sort();
  const matchingRules = rules.filter((rule) => ruleTypeFrom(rule) === ruleType);
  const enabled = matchingRules.length > 0;

  return makeClaimResult(
    defaultBranchForcePushesBlockedClaim,
    resultInput(input),
    enabled ? "pass" : "fail",
    enabled,
    {
      default_branch: defaultBranch,
      required_rule_type: ruleType,
      active_rule_types: activeRuleTypes,
      matching_rules: matchingRules.map(selectedRuleDetails),
      limitations: {
        classic_branch_protection_evaluated: false,
        bypass_actors_evaluated: false
      }
    }
  );
}

function ruleTypeFrom(rule: unknown): string | undefined {
  if (!isRecord(rule) || typeof rule.type !== "string") {
    return undefined;
  }

  return rule.type;
}

function selectedRuleDetails(rule: unknown) {
  if (!isRecord(rule)) {
    return null;
  }

  return {
    type: rule.type,
    parameters: rule.parameters ?? null
  };
}

function unexpectedRules(input: ClaimEvaluationInput, defaultBranch: string) {
  return makeUnknownResult(
    defaultBranchForcePushesBlockedClaim,
    resultInput(input),
    {
      kind: "unexpected_response",
      message: publicMessage("unexpected_response")
    },
    {
      default_branch: defaultBranch,
      required_rule_type: ruleType
    }
  );
}
