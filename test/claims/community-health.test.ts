import { describe, expect, it } from "vitest";

import { communityHealthClaim } from "../../src/claims/community-health.js";
import { GitHubApiError } from "../../src/github/errors.js";
import { evaluateWithMock, mockGitHub } from "../support/mock-github.js";

describe("community health claim", () => {
  it("returns the GitHub community health score", async () => {
    const result = await evaluateWithMock(
      communityHealthClaim,
      mockGitHub({
        getCommunityProfile: async () => ({
          health_percentage: 87,
          files: {
            code_of_conduct: {
              name: "Contributor Covenant",
              key: "contributor_covenant"
            },
            code_of_conduct_file: {
              html_url: "https://github.com/OWNER/REPO/blob/main/CODE_OF_CONDUCT.md"
            },
            contributing: {},
            issue_template: null,
            pull_request_template: null,
            license: {
              name: "MIT License",
              key: "mit",
              spdx_id: "MIT"
            },
            readme: {}
          },
          content_reports_enabled: false,
          updated_at: null
        })
      })
    );

    expect(result).toMatchObject({
      status: "pass",
      value: true,
      evidence: {
        scope: "repository",
        source: "community_profile"
      },
      details: {
        health_percentage: 87,
        score: {
          numerator: 87,
          denominator: 100
        },
        badge_color: "#6cc613",
        files: {
          code_of_conduct: true,
          code_of_conduct_file: true,
          contributing: true,
          issue_template: false,
          pull_request_template: false,
          license: true,
          readme: true
        },
        detected: {
          code_of_conduct: {
            name: "Contributor Covenant",
            key: "contributor_covenant"
          },
          license: {
            name: "MIT License",
            key: "mit",
            spdx_id: "MIT"
          }
        },
        content_reports_enabled: false,
        limitations: {
          public_repository_metric: true,
          file_contents_evaluated: false
        }
      }
    });
  });

  it("returns unknown when health_percentage is missing", async () => {
    const result = await evaluateWithMock(
      communityHealthClaim,
      mockGitHub({
        getCommunityProfile: async () => ({})
      })
    );

    expect(result).toMatchObject({
      status: "unknown",
      value: null,
      details: {
        health_percentage: null
      },
      error: {
        kind: "unexpected_response"
      }
    });
  });

  it("returns unknown when health_percentage is outside the documented range", async () => {
    const result = await evaluateWithMock(
      communityHealthClaim,
      mockGitHub({
        getCommunityProfile: async () => ({
          health_percentage: 101
        })
      })
    );

    expect(result.status).toBe("unknown");
    expect(result.error).toMatchObject({
      kind: "unexpected_response"
    });
  });

  it("returns unknown on authorization failure", async () => {
    const result = await evaluateWithMock(
      communityHealthClaim,
      mockGitHub({
        getCommunityProfile: async () => {
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
