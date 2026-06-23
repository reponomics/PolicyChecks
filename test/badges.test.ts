import { describe, expect, it } from "vitest";

import { renderBadgeSvg } from "../src/badges/svg.js";
import {
  colorForResult,
  colorForResultText,
  messageForResult,
  toShieldsJson
} from "../src/badges/shields-json.js";
import { communityHealthClaim } from "../src/claims/community-health.js";
import { shaPinningRequiredClaim } from "../src/claims/sha-pinning-required.js";
import type { ClaimResult } from "../src/claims/types.js";

describe("badge renderers", () => {
  it("renders Shields-compatible JSON", () => {
    expect(toShieldsJson(shaPinningRequiredClaim, result("enabled"))).toEqual({
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

  it("maps default Shields colors from claim results", () => {
    expect(colorForResultText("enabled")).toBe("brightgreen");
    expect(colorForResultText("disabled")).toBe("red");
    expect(colorForResultText("unknown")).toBe("lightgrey");
    expect(colorForResultText("custom")).toBe("brightgreen");
  });

  it("uses default badge message and color when claims do not customize them", () => {
    const disabledResult = result("disabled");

    expect(messageForResult(shaPinningRequiredClaim, disabledResult)).toBe("disabled");
    expect(colorForResult(shaPinningRequiredClaim, disabledResult)).toBe("red");
  });

  it("renders custom metric badge message and color", () => {
    const communityResult: ClaimResult = {
      ...result("enabled"),
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

  it("renders unknown community health when no valid score is available", () => {
    expect(toShieldsJson(communityHealthClaim, result("unknown"))).toMatchObject({
      message: "unknown",
      color: "lightgrey"
    });
  });

  it("escapes SVG label and message text", () => {
    const definition = {
      ...shaPinningRequiredClaim,
      label: "SHA <actions>"
    };
    const svg = renderBadgeSvg(definition, {
      ...result("not & enforced"),
      details: {
        ignored: "<script>"
      }
    });

    expect(svg).toContain("SHA &lt;actions&gt;");
    expect(svg).toContain("not &amp; enforced");
    expect(svg).not.toContain("<script>");
  });
});

function result(result: ClaimResult["result"]): ClaimResult {
  return {
    claim: shaPinningRequiredClaim.id,
    owner: "OWNER",
    repo: "REPO",
    repository: {
      owner: "OWNER",
      repo: "REPO",
      full_name: "OWNER/REPO"
    },
    result,
    source: shaPinningRequiredClaim.source,
    evidence: shaPinningRequiredClaim.evidence ?? { scope: "unknown", source: "unavailable" },
    checked_at: "2026-05-30T00:00:00.000Z",
    details: {}
  };
}
