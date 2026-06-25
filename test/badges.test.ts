import { describe, expect, it } from "vitest";

import { renderBadgeSvg } from "../src/badges/svg.js";
import {
  colorForResult,
  colorForResultText,
  messageForResult,
  toShieldsJson
} from "../src/badges/shields-json.js";
import { communityHealthBadge } from "../src/badges/community-health.js";
import { shaPinningRequiredBadge } from "../src/badges/sha-pinning-required.js";
import type { BadgeResult } from "../src/badges/types.js";

describe("badge renderers", () => {
  it("renders Shields-compatible JSON", () => {
    expect(toShieldsJson(shaPinningRequiredBadge, result("enabled"))).toEqual({
      schemaVersion: 1,
      label: "SHA pinning",
      message: "enabled",
      color: "brightgreen"
    });

    expect(toShieldsJson(shaPinningRequiredBadge, result("unknown"))).toMatchObject({
      message: "unknown",
      color: "lightgrey"
    });
  });

  it("maps default Shields colors from badge results", () => {
    expect(colorForResultText("enabled")).toBe("brightgreen");
    expect(colorForResultText("disabled")).toBe("red");
    expect(colorForResultText("unknown")).toBe("lightgrey");
    expect(colorForResultText("custom")).toBe("brightgreen");
  });

  it("uses default badge message and color when badges do not customize them", () => {
    const disabledResult = result("disabled");

    expect(messageForResult(shaPinningRequiredBadge, disabledResult)).toBe("disabled");
    expect(colorForResult(shaPinningRequiredBadge, disabledResult)).toBe("red");
  });

  it("renders custom metric badge message and color", () => {
    const communityResult: BadgeResult = {
      ...result("enabled"),
      badgeId: communityHealthBadge.id,
      source: communityHealthBadge.source,
      details: {
        health_percentage: 87
      }
    };

    expect(toShieldsJson(communityHealthBadge, communityResult)).toEqual({
      schemaVersion: 1,
      label: "community health",
      message: "87/100",
      color: "#6cc613"
    });

    expect(renderBadgeSvg(communityHealthBadge, communityResult)).toContain("#6cc613");
  });

  it("renders unknown community health when no valid score is available", () => {
    expect(toShieldsJson(communityHealthBadge, result("unknown"))).toMatchObject({
      message: "unknown",
      color: "lightgrey"
    });
  });

  it("escapes SVG label and message text", () => {
    const definition = {
      ...shaPinningRequiredBadge,
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

function result(result: BadgeResult["result"]): BadgeResult {
  return {
    badgeId: shaPinningRequiredBadge.id,
    owner: "OWNER",
    repo: "REPO",
    repository: {
      owner: "OWNER",
      repo: "REPO",
      full_name: "OWNER/REPO"
    },
    result,
    source: shaPinningRequiredBadge.source,
    checked_at: "2026-05-30T00:00:00.000Z",
    details: {}
  };
}
