import { publicMessage, toPublicClaimError } from "../github/errors.js";
import { isRecord, makeClaimResult, makeUnknownResult, resultInput } from "./result.js";
import type { ClaimDefinition, ClaimEvaluationInput } from "./types.js";

type CodeSecurityField =
  | "secret_scanning"
  | "secret_scanning_push_protection"
  | "dependabot_alerts"
  | "dependency_graph";

interface CodeSecurityClaimOptions {
  id: string;
  label: string;
  field: CodeSecurityField;
}

const endpoint = "GET /repos/{owner}/{repo}/code-security-configuration";

export const secretScanningEnabledClaim = codeSecurityConfigurationClaim({
  id: "secret-scanning-enabled",
  label: "secret scanning",
  field: "secret_scanning"
});

export const secretScanningPushProtectionEnabledClaim = codeSecurityConfigurationClaim({
  id: "secret-scanning-push-protection-enabled",
  label: "secret push protection",
  field: "secret_scanning_push_protection"
});

export const dependabotAlertsEnabledClaim = codeSecurityConfigurationClaim({
  id: "dependabot-alerts-enabled",
  label: "Dependabot alerts",
  field: "dependabot_alerts"
});

export const dependencyGraphEnabledClaim = codeSecurityConfigurationClaim({
  id: "dependency-graph-enabled",
  label: "dependency graph",
  field: "dependency_graph"
});

function codeSecurityConfigurationClaim(options: CodeSecurityClaimOptions): ClaimDefinition {
  const definition: ClaimDefinition = {
    id: options.id,
    label: options.label,
    passMessage: "enabled",
    failMessage: "disabled",
    unknownMessage: "unknown",
    source: {
      provider: "github",
      api: "REST",
      endpoint,
      fields: ["status", `configuration.${options.field}`, "configuration.enforcement"]
    },
    async evaluate(input: ClaimEvaluationInput) {
      try {
        const data = await input.github.getCodeSecurityConfiguration(input.owner, input.repo);
        return evaluateCodeSecurityConfiguration(definition, input, data, options.field);
      } catch (error) {
        return makeUnknownResult(definition, resultInput(input), toPublicClaimError(error));
      }
    }
  };

  return definition;
}

function evaluateCodeSecurityConfiguration(
  definition: ClaimDefinition,
  input: ClaimEvaluationInput,
  data: unknown,
  field: CodeSecurityField
) {
  if (!isRecord(data)) {
    return unexpected(definition, input);
  }

  const status = data.status;
  const configuration = data.configuration;

  if (status === "no_content") {
    return makeUnknownResult(
      definition,
      resultInput(input),
      {
        kind: "unexpected_response",
        message: "GitHub returned no code security configuration content for this repository."
      },
      {
        status: "no_content",
        configuration: null
      }
    );
  }

  if (status !== "attached") {
    return makeUnknownResult(
      definition,
      resultInput(input),
      {
        kind: "unexpected_response",
        message: publicMessage("unexpected_response")
      },
      {
        status: typeof status === "string" ? status : null,
        configuration: configurationDetails(configuration, field)
      }
    );
  }

  if (!isRecord(configuration)) {
    return unexpected(definition, input, {
      status,
      configuration: null
    });
  }

  const value = configuration[field];

  if (typeof value !== "string") {
    return unexpected(definition, input, {
      status,
      configuration: configurationDetails(configuration, field)
    });
  }

  const enabled = value === "enabled";

  return makeClaimResult(definition, resultInput(input), enabled ? "pass" : "fail", enabled, {
    status,
    configuration: configurationDetails(configuration, field)
  });
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

function configurationDetails(configuration: unknown, field: CodeSecurityField) {
  if (!isRecord(configuration)) {
    return null;
  }

  return {
    id: typeof configuration.id === "number" ? configuration.id : null,
    target_type: typeof configuration.target_type === "string" ? configuration.target_type : null,
    name: typeof configuration.name === "string" ? configuration.name : null,
    enforcement: typeof configuration.enforcement === "string" ? configuration.enforcement : null,
    updated_at: typeof configuration.updated_at === "string" ? configuration.updated_at : null,
    [field]: typeof configuration[field] === "string" ? configuration[field] : null
  };
}
