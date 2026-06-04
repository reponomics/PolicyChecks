import { publicMessage, toPublicClaimError } from "../github/errors.js";
import {
  isRecord,
  makeClaimResult,
  makeUnknownResult,
  repositorySettingEvidence,
  resultInput
} from "./result.js";
import type { ClaimDefinition, ClaimEvaluationInput } from "./types.js";

type SecretProtectionField = "secret_scanning" | "secret_scanning_push_protection";

interface SecretProtectionClaimOptions {
  id: string;
  label: string;
  field: SecretProtectionField;
}

export const secretScanningEnabledClaim = secretProtectionClaim({
  id: "secret-scanning-enabled",
  label: "secret scanning",
  field: "secret_scanning"
});

export const secretPushProtectionEnabledClaim = secretProtectionClaim({
  id: "secret-push-protection-enabled",
  label: "secret push protection",
  field: "secret_scanning_push_protection"
});

function secretProtectionClaim(options: SecretProtectionClaimOptions): ClaimDefinition {
  const definition: ClaimDefinition = {
    id: options.id,
    label: options.label,
    passMessage: "enabled",
    failMessage: "disabled",
    unknownMessage: "unknown",
    source: {
      provider: "github",
      api: "REST",
      endpoint: "GET /repos/{owner}/{repo}",
      fields: [`security_and_analysis.${options.field}.status`]
    },
    evidence: repositorySettingEvidence,
    async evaluate(input: ClaimEvaluationInput) {
      try {
        const repository = await input.github.getRepository(input.owner, input.repo);
        return evaluateSecretProtection(
          definition,
          input,
          repository.security_and_analysis,
          options.field
        );
      } catch (error) {
        return makeUnknownResult(definition, resultInput(input), toPublicClaimError(error));
      }
    }
  };

  return definition;
}

function evaluateSecretProtection(
  definition: ClaimDefinition,
  input: ClaimEvaluationInput,
  securityAndAnalysis: unknown,
  field: SecretProtectionField
) {
  if (!isRecord(securityAndAnalysis)) {
    return unexpected(definition, input, {
      security_and_analysis: null
    });
  }

  const feature = securityAndAnalysis[field];

  if (!isRecord(feature) || typeof feature.status !== "string") {
    return unexpected(definition, input, {
      security_and_analysis: {
        [field]: null
      }
    });
  }

  const enabled = feature.status === "enabled";

  return makeClaimResult(definition, resultInput(input), enabled ? "pass" : "fail", enabled, {
    security_and_analysis: selectedSecurityDetails(securityAndAnalysis, detailFieldsFor(field))
  });
}

function detailFieldsFor(field: SecretProtectionField) {
  return field === "secret_scanning"
    ? ["secret_scanning"]
    : [
        "secret_scanning_push_protection",
        "secret_scanning_delegated_bypass",
        "secret_scanning_delegated_bypass_options"
      ];
}

function selectedSecurityDetails(
  securityAndAnalysis: Record<string, unknown>,
  fields: readonly string[]
) {
  return Object.fromEntries(fields.map((field) => [field, securityAndAnalysis[field] ?? null]));
}

function unexpected(
  definition: ClaimDefinition,
  input: ClaimEvaluationInput,
  details: Record<string, unknown> = {}
) {
  return makeUnknownResult(
    definition,
    resultInput(input),
    {
      kind: "unexpected_response",
      message: publicMessage("unexpected_response")
    },
    details
  );
}
