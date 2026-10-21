// Prints the SHA-pinning badge SVG for each result state as a JSON object:
//   { "enabled": "<svg…>", "disabled": "<svg…>", "unknown": "<svg…>" }
//
// The README graphic generators (common.py -> render_badges) call this via
// `npx tsx docs/assets/generators/render-badges.ts` so the pictures always use
// the project's real badge renderer rather than a hand-copied SVG.
//
// Pass `--label "Some text"` to render a badge with a different label (the
// brand generator uses "BEST PRACTICES"); everything else stays the same.
import { renderBadgeSvg } from "../../../src/badges/svg.js";
import { shaPinningRequiredBadge } from "../../../src/badges/sha-pinning-required.js";
import { makeBadgeResult, makeUnknownResult } from "../../../src/badges/result.js";

const input = { owner: "OWNER", repo: "REPO" };
const labelFlag = process.argv.indexOf("--label");
const badge =
  labelFlag === -1
    ? shaPinningRequiredBadge
    : {
        ...shaPinningRequiredBadge,
        label: process.argv[labelFlag + 1] ?? shaPinningRequiredBadge.label
      };

const output = {
  enabled: renderBadgeSvg(badge, makeBadgeResult(badge, input, "enabled", {})),
  disabled: renderBadgeSvg(badge, makeBadgeResult(badge, input, "disabled", {})),
  unknown: renderBadgeSvg(
    badge,
    makeUnknownResult(badge, input, {
      kind: "not_installed",
      message: "GitHub App installation was not found for this repository."
    })
  )
};

console.log(JSON.stringify(output));
