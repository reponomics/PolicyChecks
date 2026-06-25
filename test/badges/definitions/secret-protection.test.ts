import { describe, expect, it } from "vitest";

import {
  secretPushProtectionEnabledBadge,
  secretScanningEnabledBadge
} from "../../../src/badges/secret-protection.js";
import { GitHubApiError } from "../../../src/github/errors.js";
import { evaluateWithMock, mockGitHub } from "../../support/mock-github.js";

describe("secret protection badges", () => {
  it("passes when secret scanning is enabled", async () => {
    const result = await evaluateWithMock(
      secretScanningEnabledBadge,
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
      result: "enabled",
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
      secretScanningEnabledBadge,
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
      result: "disabled",
      details: {
        security_and_analysis: {
          secret_scanning: {
            status: "disabled"
          }
        }
      }
    });
  });

  it("passes when secret scanning push protection is enabled", async () => {
    const result = await evaluateWithMock(
      secretPushProtectionEnabledBadge,
      mockGitHub({
        getRepository: async () => ({
          id: 1,
          security_and_analysis: {
            secret_scanning_push_protection: {
              status: "enabled"
            },
            secret_scanning_delegated_bypass: {
              status: "disabled"
            },
            secret_scanning_delegated_bypass_options: null
          }
        })
      })
    );

    expect(result).toMatchObject({
      result: "enabled",
      details: {
        security_and_analysis: {
          secret_scanning_push_protection: {
            status: "enabled"
          },
          secret_scanning_delegated_bypass: {
            status: "disabled"
          },
          secret_scanning_delegated_bypass_options: null
        }
      }
    });
  });

  it("fails when secret scanning push protection is disabled", async () => {
    const result = await evaluateWithMock(
      secretPushProtectionEnabledBadge,
      mockGitHub({
        getRepository: async () => ({
          id: 1,
          security_and_analysis: {
            secret_scanning_push_protection: {
              status: "disabled"
            }
          }
        })
      })
    );

    expect(result).toMatchObject({
      result: "disabled",
      details: {
        security_and_analysis: {
          secret_scanning_push_protection: {
            status: "disabled"
          }
        }
      }
    });
  });

  it("returns unknown when repository metadata does not include the requested field", async () => {
    const result = await evaluateWithMock(
      secretScanningEnabledBadge,
      mockGitHub({
        getRepository: async () => ({
          id: 1,
          security_and_analysis: {}
        })
      })
    );

    expect(result.result).toBe("unknown");
    expect(result.error).toMatchObject({
      kind: "unexpected_response"
    });
    expect(result.details).toEqual({
      security_and_analysis: {
        secret_scanning: null
      }
    });
  });

  it("returns unknown when security analysis metadata is absent", async () => {
    const result = await evaluateWithMock(
      secretScanningEnabledBadge,
      mockGitHub({
        getRepository: async () => ({
          id: 1
        })
      })
    );

    expect(result.result).toBe("unknown");
    expect(result.error).toMatchObject({
      kind: "unexpected_response"
    });
    expect(result.details).toEqual({
      security_and_analysis: null
    });
  });

  it("returns unknown on authorization failure", async () => {
    const result = await evaluateWithMock(
      secretScanningEnabledBadge,
      mockGitHub({
        getRepository: async () => {
          throw new GitHubApiError("Forbidden", {
            status: 403,
            kind: "forbidden"
          });
        }
      })
    );

    expect(result.result).toBe("unknown");
    expect(result.error).toMatchObject({
      kind: "forbidden"
    });
  });
});
