import { publicMessage, toPublicBadgeError } from "../github/errors.js";
import { isRecord, makeBadgeResult, makeUnknownResult, resultInput } from "./result.js";
import type { BadgeDefinition, BadgeEvaluationInput } from "./types.js";

type SecretProtectionField = "secret_scanning" | "secret_scanning_push_protection";

interface SecretProtectionBadgeOptions {
  id: string;
  label: string;
  field: SecretProtectionField;
}

export const secretScanningEnabledBadge = secretProtectionBadge({
  id: "secret-scanning-enabled",
  label: "secret scanning",
  field: "secret_scanning"
});

export const secretPushProtectionEnabledBadge = secretProtectionBadge({
  id: "secret-push-protection-enabled",
  label: "secret push protection",
  field: "secret_scanning_push_protection"
});

function secretProtectionBadge(options: SecretProtectionBadgeOptions): BadgeDefinition {
  const definition: BadgeDefinition = {
    id: options.id,
    label: options.label,
    source: {
      provider: "github",
      api: "REST",
      endpoint: "GET /repos/{owner}/{repo}",
      fields: [`security_and_analysis.${options.field}.status`]
    },
    async evaluate(input: BadgeEvaluationInput) {
      try {
        const repository = await input.github.getRepository(input.owner, input.repo);
        return evaluateSecretProtection(
          definition,
          input,
          repository.security_and_analysis,
          options.field
        );
      } catch (error) {
        return makeUnknownResult(definition, resultInput(input), toPublicBadgeError(error));
      }
    }
  };

  return definition;
}

function evaluateSecretProtection(
  definition: BadgeDefinition,
  input: BadgeEvaluationInput,
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

  return makeBadgeResult(definition, resultInput(input), enabled ? "enabled" : "disabled", {
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
  definition: BadgeDefinition,
  input: BadgeEvaluationInput,
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
