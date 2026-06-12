import { publicMessage, toPublicClaimError } from "../github/errors.js";
import {
  activeBranchRulesEvidence,
  isRecord,
  makeClaimResult,
  makeUnknownResult,
  resultInput
} from "./result.js";
import type { ClaimDefinition, ClaimEvaluationInput } from "./types.js";

interface DefaultBranchRuleClaimOptions {
  id: string;
  label: string;
  ruleType: string;
}

export const defaultBranchForcePushesBlockedClaim = defaultBranchRuleClaim({
  id: "default-branch-force-pushes-blocked",
  label: "force pushes blocked",
  ruleType: "non_fast_forward"
});

export const defaultBranchSignedCommitsRequiredClaim = defaultBranchRuleClaim({
  id: "default-branch-signed-commits-required",
  label: "signed commits",
  ruleType: "required_signatures"
});

export const defaultBranchLinearHistoryRequiredClaim = defaultBranchRuleClaim({
  id: "default-branch-linear-history-required",
  label: "linear history",
  ruleType: "required_linear_history"
});

export const defaultBranchDeletionBlockedClaim = defaultBranchRuleClaim({
  id: "default-branch-deletion-blocked",
  label: "deletion blocked",
  ruleType: "deletion"
});

export const defaultBranchPullRequestRequiredClaim = defaultBranchRuleClaim({
  id: "default-branch-pull-request-required",
  label: "pull request required",
  ruleType: "pull_request"
});

export const defaultBranchStatusChecksRequiredClaim = defaultBranchRuleClaim({
  id: "default-branch-status-checks-required",
  label: "status checks",
  ruleType: "required_status_checks"
});

function defaultBranchRuleClaim(options: DefaultBranchRuleClaimOptions): ClaimDefinition {
  const definition: ClaimDefinition = {
    id: options.id,
    label: options.label,
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
            definition,
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
        return evaluateRules(definition, options.ruleType, input, defaultBranch, rules);
      } catch (error) {
        return makeUnknownResult(definition, resultInput(input), toPublicClaimError(error));
      }
    }
  };

  return definition;
}

function evaluateRules(
  definition: ClaimDefinition,
  requiredRuleType: string,
  input: ClaimEvaluationInput,
  defaultBranch: string,
  rules: unknown
) {
  if (!Array.isArray(rules)) {
    return unexpectedRules(definition, requiredRuleType, input, defaultBranch);
  }

  const ruleTypes = rules.map((rule) => ruleTypeFrom(rule));

  if (ruleTypes.some((type) => type === undefined)) {
    return unexpectedRules(definition, requiredRuleType, input, defaultBranch);
  }

  const activeRuleTypes = [...new Set(ruleTypes)].sort();
  const matchingRules = rules.filter((rule) => ruleTypeFrom(rule) === requiredRuleType);
  const enabled = matchingRules.length > 0;

  return makeClaimResult(definition, resultInput(input), enabled ? "pass" : "fail", enabled, {
    default_branch: defaultBranch,
    required_rule_type: requiredRuleType,
    active_rule_types: activeRuleTypes,
    matching_rules: matchingRules.map(selectedRuleDetails),
    limitations: {
      classic_branch_protection_evaluated: false,
      bypass_actors_evaluated: false
    }
  });
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

function unexpectedRules(
  definition: ClaimDefinition,
  requiredRuleType: string,
  input: ClaimEvaluationInput,
  defaultBranch: string
) {
  return makeUnknownResult(
    definition,
    resultInput(input),
    {
      kind: "unexpected_response",
      message: publicMessage("unexpected_response")
    },
    {
      default_branch: defaultBranch,
      required_rule_type: requiredRuleType
    }
  );
}
