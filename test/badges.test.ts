import { describe, expect, it } from "vitest";

import { renderBadgeSvg } from "../src/badges/svg.js";
import { toShieldsJson } from "../src/badges/shields-json.js";
import { communityHealthClaim } from "../src/claims/community-health.js";
import { shaPinningRequiredClaim } from "../src/claims/sha-pinning-required.js";
import type { ClaimResult } from "../src/claims/types.js";

describe("badge renderers", () => {
  it("renders Shields-compatible JSON", () => {
    expect(toShieldsJson(shaPinningRequiredClaim, result("pass"))).toEqual({
      schemaVersion: 1,
      label: "SHA pinning",
      message: "enabled",
      color: "brightgreen"
    });

    expect(toShieldsJson(shaPinningRequiredClaim, result("unknown"))).toMatchObject({
      message: "unknown",
      color: "lightgrey"
    });
  });

  it("renders custom metric badge message and color", () => {
    const communityResult: ClaimResult = {
      ...result("pass"),
      claim: communityHealthClaim.id,
      source: communityHealthClaim.source,
      evidence: communityHealthClaim.evidence ?? { scope: "unknown", source: "unavailable" },
      details: {
        health_percentage: 87
      }
    };

    expect(toShieldsJson(communityHealthClaim, communityResult)).toEqual({
      schemaVersion: 1,
      label: "community health",
      message: "87/100",
      color: "#6cc613"
    });

    expect(renderBadgeSvg(communityHealthClaim, communityResult)).toContain("#6cc613");
  });

  it("escapes SVG label and message text", () => {
    const definition = {
      ...shaPinningRequiredClaim,
      label: "SHA <actions>",
      failMessage: "not & enforced"
    };
    const svg = renderBadgeSvg(definition, {
      ...result("fail"),
      details: {
        ignored: "<script>"
      }
    });

    expect(svg).toContain("SHA &lt;actions&gt;");
    expect(svg).toContain("not &amp; enforced");
    expect(svg).not.toContain("<script>");
  });
});

function result(status: ClaimResult["status"]): ClaimResult {
  return {
    claim: shaPinningRequiredClaim.id,
    owner: "OWNER",
    repo: "REPO",
    repository: {
      owner: "OWNER",
      repo: "REPO",
      full_name: "OWNER/REPO"
    },
    status,
    value: status === "unknown" ? null : status === "pass",
    source: shaPinningRequiredClaim.source,
    evidence: shaPinningRequiredClaim.evidence ?? { scope: "unknown", source: "unavailable" },
    checked_at: "2026-05-30T00:00:00.000Z",
    details: {}
  };
}
