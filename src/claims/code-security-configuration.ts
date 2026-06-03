import { GitHubApiError, publicMessage, toPublicClaimError } from "../github/errors.js";
import {
  isRecord,
  makeClaimResult,
  makeUnknownResult,
  repositorySettingEvidence,
  resultInput
} from "./result.js";
import type { ClaimDefinition, ClaimEvaluationInput, ClaimEvidence } from "./types.js";

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

const codeSecurityConfigurationEndpoint = "GET /repos/{owner}/{repo}/code-security-configuration";

export const secretScanningEnabledClaim: ClaimDefinition = {
  id: "secret-scanning-enabled",
  label: "secret scanning",
  passMessage: "enforced",
  failMessage: "not enforced",
  unknownMessage: "unknown",
  source: {
    provider: "github",
    api: "REST",
    endpoint: "GET /repos/{owner}/{repo}",
    fields: ["security_and_analysis.secret_scanning.status"]
  },
  evidence: repositorySettingEvidence,
  async evaluate(input: ClaimEvaluationInput) {
    try {
      const repository = await input.github.getRepository(input.owner, input.repo);
      return evaluateRepositorySecurityFeature(
        secretScanningEnabledClaim,
        input,
        repository.security_and_analysis,
        "secret_scanning"
      );
    } catch (error) {
      return makeUnknownResult(
        secretScanningEnabledClaim,
        resultInput(input),
        toPublicClaimError(error)
      );
    }
  }
};

export const secretScanningPushProtectionEnabledClaim = codeSecurityConfigurationClaim({
  id: "secret-scanning-push-protection-enabled",
  label: "secret push protection",
  field: "secret_scanning_push_protection"
});

export const dependabotAlertsEnabledClaim: ClaimDefinition = {
  id: "dependabot-alerts-enabled",
  label: "Dependabot alerts",
  passMessage: "enforced",
  failMessage: "not enforced",
  unknownMessage: "unknown",
  source: {
    provider: "github",
    api: "REST",
    endpoint: "GET /repos/{owner}/{repo}/vulnerability-alerts",
    fields: ["HTTP 204", "HTTP 404"]
  },
  evidence: repositorySettingEvidence,
  async evaluate(input: ClaimEvaluationInput) {
    try {
      const status = await input.github.getVulnerabilityAlertsStatus(input.owner, input.repo);

      return makeClaimResult(dependabotAlertsEnabledClaim, resultInput(input), "pass", true, {
        vulnerability_alerts: status
      });
    } catch (error) {
      if (isEndpointDisabled(error)) {
        return makeClaimResult(dependabotAlertsEnabledClaim, resultInput(input), "fail", false, {
          vulnerability_alerts: "disabled"
        });
      }

      return makeUnknownResult(
        dependabotAlertsEnabledClaim,
        resultInput(input),
        toPublicClaimError(error)
      );
    }
  }
};

export const dependencyGraphEnabledClaim = codeSecurityConfigurationClaim({
  id: "dependency-graph-enabled",
  label: "dependency graph",
  field: "dependency_graph"
});

function codeSecurityConfigurationClaim(options: CodeSecurityClaimOptions): ClaimDefinition {
  const definition: ClaimDefinition = {
    id: options.id,
    label: options.label,
    passMessage: "enforced",
    failMessage: "not enforced",
    unknownMessage: "unknown",
    source: {
      provider: "github",
      api: "REST",
      endpoint: codeSecurityConfigurationEndpoint,
      fields: ["status", `configuration.${options.field}`, "configuration.enforcement"]
    },
    evidence: {
      scope: "unknown",
      source: "attached_code_security_configuration"
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

function evaluateRepositorySecurityFeature(
  definition: ClaimDefinition,
  input: ClaimEvaluationInput,
  securityAndAnalysis: unknown,
  field: "secret_scanning"
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
    security_and_analysis: {
      [field]: {
        status: feature.status
      }
    }
  });
}

function isEndpointDisabled(error: unknown) {
  return error instanceof GitHubApiError && error.status === 404;
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

  return makeClaimResult(
    definition,
    resultInput(input),
    enabled ? "pass" : "fail",
    enabled,
    {
      status,
      configuration: configurationDetails(configuration, field)
    },
    undefined,
    codeSecurityConfigurationEvidence(configuration)
  );
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

function codeSecurityConfigurationEvidence(configuration: Record<string, unknown>): ClaimEvidence {
  const enforcement =
    typeof configuration.enforcement === "string" ? configuration.enforcement : undefined;

  return {
    scope: codeSecurityConfigurationScope(configuration.target_type),
    source: "attached_code_security_configuration",
    ...(enforcement !== undefined ? { enforcement } : {})
  };
}

function codeSecurityConfigurationScope(value: unknown): ClaimEvidence["scope"] {
  if (value === "organization" || value === "enterprise") {
    return value;
  }

  return "unknown";
}
