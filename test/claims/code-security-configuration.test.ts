import { describe, expect, it } from "vitest";

import {
  dependabotAlertsEnabledClaim,
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
    secret_scanning: "enabled",
    secret_scanning_push_protection: "disabled"
  }
};

describe("code security configuration claims", () => {
  it("passes when secret scanning is enabled", async () => {
    const result = await evaluateWithMock(
      secretScanningEnabledClaim,
      mockGitHub({
        getRepository: async () => ({
          id: 1,
          security_and_analysis: {
            secret_scanning: {
              status: "enabled"
            }
          }
        })
      })
    );

    expect(result).toMatchObject({
      status: "pass",
      value: true,
      details: {
        security_and_analysis: {
          secret_scanning: {
            status: "enabled"
          }
        }
      }
    });
  });

  it("fails when secret scanning is disabled", async () => {
    const result = await evaluateWithMock(
      secretScanningEnabledClaim,
      mockGitHub({
        getRepository: async () => ({
          id: 1,
          security_and_analysis: {
            secret_scanning: {
              status: "disabled"
            }
          }
        })
      })
    );

    expect(result).toMatchObject({
      status: "fail",
      value: false,
      details: {
        security_and_analysis: {
          secret_scanning: {
            status: "disabled"
          }
        }
      }
    });
  });

  it("returns unknown when repository security analysis does not include secret scanning", async () => {
    const result = await evaluateWithMock(
      secretScanningEnabledClaim,
      mockGitHub({
        getRepository: async () => ({
          id: 1,
          security_and_analysis: {}
        })
      })
    );

    expect(result.status).toBe("unknown");
    expect(result.error).toMatchObject({
      kind: "unexpected_response"
    });
    expect(result.details).toEqual({
      security_and_analysis: {
        secret_scanning: null
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
        getVulnerabilityAlertsStatus: async () => "enabled"
      })
    );

    expect(result).toMatchObject({
      status: "pass",
      value: true,
      details: {
        vulnerability_alerts: "enabled"
      }
    });
  });

  it("fails when Dependabot alerts are not enabled", async () => {
    const result = await evaluateWithMock(
      dependabotAlertsEnabledClaim,
      mockGitHub({
        getVulnerabilityAlertsStatus: async () => {
          throw new GitHubApiError("Not Found", {
            status: 404,
            kind: "not_found"
          });
        }
      })
    );

    expect(result).toMatchObject({
      status: "fail",
      value: false,
      details: {
        vulnerability_alerts: "disabled"
      }
    });
  });

  it("returns unknown when a Dependabot alerts 404 is ambiguous", async () => {
    const result = await evaluateWithMock(
      dependabotAlertsEnabledClaim,
      mockGitHub({
        getVulnerabilityAlertsStatus: async () => {
          throw new GitHubApiError("Not Found", {
            status: 404,
            kind: "not_found"
          });
        }
      }),
      "unknown"
    );

    expect(result).toMatchObject({
      status: "unknown",
      value: null,
      error: {
        kind: "not_found"
      }
    });
  });

  it("returns unknown when the repository is not attached to a configuration", async () => {
    const result = await evaluateWithMock(
      secretScanningPushProtectionEnabledClaim,
      mockGitHub({
        getCodeSecurityConfiguration: async () => ({
          status: "detached",
          configuration: {
            secret_scanning_push_protection: "enabled"
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
      secretScanningPushProtectionEnabledClaim,
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
      secretScanningPushProtectionEnabledClaim,
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
      secretScanningPushProtectionEnabledClaim,
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
      secretScanningPushProtectionEnabledClaim,
      mockGitHub({
        getCodeSecurityConfiguration: async () => ({
          status: "attached",
          configuration: {
            id: "not-a-number",
            target_type: 1,
            name: false,
            enforcement: null,
            updated_at: {},
            secret_scanning_push_protection: true
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
        secret_scanning_push_protection: null
      }
    });
  });

  it("returns unknown when GitHub returns no content", async () => {
    const result = await evaluateWithMock(
      secretScanningPushProtectionEnabledClaim,
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
        getRepository: async () => {
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
