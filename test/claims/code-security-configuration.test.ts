import { describe, expect, it } from "vitest";

import {
  dependabotAlertsEnabledClaim,
  dependencyGraphEnabledClaim,
  secretScanningEnabledClaim,
  secretScanningPushProtectionEnabledClaim
} from "../../src/claims/code-security-configuration.js";
import { GitHubApiError } from "../../src/github/errors.js";
import { evaluateWithMock, mockGitHub } from "../support/mock-github.js";

const attachedConfiguration = {
  status: "attached",
  configuration: {
    id: 1325,
    target_type: "organization",
    name: "recommended settings",
    enforcement: "enforced",
    updated_at: "2026-06-01T00:00:00Z",
    dependabot_alerts: "enabled",
    dependency_graph: "enabled",
    secret_scanning: "enabled",
    secret_scanning_push_protection: "disabled"
  }
};

describe("code security configuration claims", () => {
  it("passes when secret scanning is enabled", async () => {
    const result = await evaluateWithMock(
      secretScanningEnabledClaim,
      mockGitHub({
        getCodeSecurityConfiguration: async () => attachedConfiguration
      })
    );

    expect(result).toMatchObject({
      status: "pass",
      value: true,
      details: {
        status: "attached",
        configuration: {
          id: 1325,
          target_type: "organization",
          name: "recommended settings",
          enforcement: "enforced",
          updated_at: "2026-06-01T00:00:00Z",
          secret_scanning: "enabled"
        }
      }
    });
  });

  it("fails when secret scanning is disabled", async () => {
    const result = await evaluateWithMock(
      secretScanningEnabledClaim,
      mockGitHub({
        getCodeSecurityConfiguration: async () => ({
          status: "attached",
          configuration: {
            secret_scanning: "disabled"
          }
        })
      })
    );

    expect(result).toMatchObject({
      status: "fail",
      value: false,
      details: {
        status: "attached",
        configuration: {
          secret_scanning: "disabled"
        }
      }
    });
  });

  it("passes when secret scanning push protection is enabled", async () => {
    const result = await evaluateWithMock(
      secretScanningPushProtectionEnabledClaim,
      mockGitHub({
        getCodeSecurityConfiguration: async () => ({
          status: "attached",
          configuration: {
            secret_scanning_push_protection: "enabled"
          }
        })
      })
    );

    expect(result).toMatchObject({
      status: "pass",
      value: true,
      details: {
        status: "attached",
        configuration: {
          secret_scanning_push_protection: "enabled"
        }
      }
    });
  });

  it("passes when Dependabot alerts are enabled", async () => {
    const result = await evaluateWithMock(
      dependabotAlertsEnabledClaim,
      mockGitHub({
        getCodeSecurityConfiguration: async () => attachedConfiguration
      })
    );

    expect(result).toMatchObject({
      status: "pass",
      value: true,
      details: {
        status: "attached",
        configuration: {
          dependabot_alerts: "enabled"
        }
      }
    });
  });

  it("fails when Dependabot alerts are not enabled", async () => {
    const result = await evaluateWithMock(
      dependabotAlertsEnabledClaim,
      mockGitHub({
        getCodeSecurityConfiguration: async () => ({
          status: "attached",
          configuration: {
            dependabot_alerts: "disabled"
          }
        })
      })
    );

    expect(result).toMatchObject({
      status: "fail",
      value: false,
      details: {
        status: "attached",
        configuration: {
          dependabot_alerts: "disabled"
        }
      }
    });
  });

  it("passes when the dependency graph is enabled", async () => {
    const result = await evaluateWithMock(
      dependencyGraphEnabledClaim,
      mockGitHub({
        getCodeSecurityConfiguration: async () => attachedConfiguration
      })
    );

    expect(result).toMatchObject({
      status: "pass",
      value: true,
      details: {
        status: "attached",
        configuration: {
          dependency_graph: "enabled"
        }
      }
    });
  });

  it("returns unknown when the repository is not attached to a configuration", async () => {
    const result = await evaluateWithMock(
      secretScanningEnabledClaim,
      mockGitHub({
        getCodeSecurityConfiguration: async () => ({
          status: "detached",
          configuration: {
            secret_scanning: "enabled"
          }
        })
      })
    );

    expect(result.status).toBe("unknown");
    expect(result.error).toMatchObject({
      kind: "unexpected_response"
    });
    expect(result.details).toMatchObject({
      status: "detached"
    });
  });

  it("returns null configuration details when a non-attached response has no object configuration", async () => {
    const result = await evaluateWithMock(
      secretScanningEnabledClaim,
      mockGitHub({
        getCodeSecurityConfiguration: async () => ({
          status: "detached",
          configuration: null
        })
      })
    );

    expect(result.status).toBe("unknown");
    expect(result.details).toEqual({
      status: "detached",
      configuration: null
    });
  });

  it("returns unknown when the code security response is not an object", async () => {
    const result = await evaluateWithMock(
      secretScanningEnabledClaim,
      mockGitHub({
        getCodeSecurityConfiguration: async () => "unexpected"
      })
    );

    expect(result.status).toBe("unknown");
    expect(result.error).toMatchObject({
      kind: "unexpected_response"
    });
    expect(result.details).toEqual({});
  });

  it("returns unknown when the attached configuration is missing", async () => {
    const result = await evaluateWithMock(
      secretScanningEnabledClaim,
      mockGitHub({
        getCodeSecurityConfiguration: async () => ({
          status: "attached"
        })
      })
    );

    expect(result.status).toBe("unknown");
    expect(result.error).toMatchObject({
      kind: "unexpected_response"
    });
    expect(result.details).toEqual({
      status: "attached",
      configuration: null
    });
  });

  it("returns unknown when the configured field is not a string", async () => {
    const result = await evaluateWithMock(
      dependencyGraphEnabledClaim,
      mockGitHub({
        getCodeSecurityConfiguration: async () => ({
          status: "attached",
          configuration: {
            id: "not-a-number",
            target_type: 1,
            name: false,
            enforcement: null,
            updated_at: {},
            dependency_graph: true
          }
        })
      })
    );

    expect(result.status).toBe("unknown");
    expect(result.error).toMatchObject({
      kind: "unexpected_response"
    });
    expect(result.details).toEqual({
      status: "attached",
      configuration: {
        id: null,
        target_type: null,
        name: null,
        enforcement: null,
        updated_at: null,
        dependency_graph: null
      }
    });
  });

  it("returns unknown when GitHub returns no content", async () => {
    const result = await evaluateWithMock(
      secretScanningEnabledClaim,
      mockGitHub({
        getCodeSecurityConfiguration: async () => ({
          status: "no_content"
        })
      })
    );

    expect(result.status).toBe("unknown");
    expect(result.error).toMatchObject({
      kind: "unexpected_response",
      message: "GitHub returned no code security configuration content for this repository."
    });
    expect(result.details).toEqual({
      status: "no_content",
      configuration: null
    });
  });

  it("returns unknown on authorization failure", async () => {
    const result = await evaluateWithMock(
      secretScanningEnabledClaim,
      mockGitHub({
        getCodeSecurityConfiguration: async () => {
          throw new GitHubApiError("Forbidden", {
            status: 403,
            kind: "forbidden"
          });
        }
      })
    );

    expect(result.status).toBe("unknown");
    expect(result.error).toMatchObject({
      kind: "forbidden"
    });
  });
});
