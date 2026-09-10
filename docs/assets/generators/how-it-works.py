#!/usr/bin/env python3
"""
Generate docs/assets/how-it-works-{light,dark}.png for the README.

WHAT THE IMAGE IS
=================

A vertical flowchart of one badge request, matching the code in
src/server/badge-service.ts, src/github/installations.ts and the badge
evaluators:

    [README]  loads the badge URL
       |
    [PolicyChecks]  checks its cache ---- cache hit ------------------+
       | miss                                                         |
    [GitHub App auth]  installation lookup + token                    |
       | installed        \\ not installed / auth rejected / rate limited
    [GitHub API]  one REST endpoint per badge                         |
       | enabled / disabled  \\ inconclusive                           |
       v                      v   (always unknown)                    v
    [Badge]  [SHA pinning|enabled] [SHA pinning|disabled] [SHA pinning|unknown]

Main flow runs top to bottom on the left. The cache-hit bypass is a dashed
accent line down the far right. Every failure path is a grey line into the
"unknown" badge. The three badges at the bottom are the project's real
renderer output (see render-badges.ts).

The layout is vertical on purpose: it keeps the image narrow, so the text is
a large fraction of the image width and stays legible when the GitHub mobile
app scales the image to ~360 px. The README embeds it at width="600" (its
natural size) so it does not balloon on desktop.

HOW TO RUN
==========

From the repository root:

    python3 docs/assets/generators/how-it-works.py [--keep-svg] [--theme light|dark]

Prerequisites: `brew install librsvg`, `npm install`. See common.py.

KNOBS
=====

  Type scale   TITLE_PX, SUB_PX, LABEL_PX, ICON_PX, BADGE_SCALE
  Layout       W, CARD_W/CARD_H, STEP (vertical pitch), lane x positions
  Content      the `card(...)` calls in build() hold the titles/subtitles;
               the `label(...)`/`stacked(...)` calls hold the edge labels
  Colours      common.THEMES

If you add a step, bump STEP-based Y_* constants and H; everything else is
positioned relative to those. If the badge renderer changes widths, the chip
row re-centres itself automatically.
"""

from __future__ import annotations

import argparse
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from common import (  # noqa: E402
    ASSETS_DIR,
    THEMES,
    BadgeState,
    Theme,
    badge_width,
    icon,
    pad_badge,
    render_badges,
    render_png,
    text,
)

# =========================================================================== #
# Type scale (1x units)
# =========================================================================== #

TITLE_PX = 19        # card titles
SUB_PX = 15          # card subtitles
LABEL_PX = 18        # edge labels ("miss", "cache hit", ...)
ICON_PX = 20         # card icons
BADGE_SCALE = 1.22   # badges are 20 px tall natively

# =========================================================================== #
# Layout (1x units)
# =========================================================================== #

W = 600                          # image width; README embeds at this width
CARD_W, CARD_H = 300, 64         # main-flow cards
CARD_X = 0
CARD_CX = CARD_X + CARD_W / 2    # x of the vertical main-flow arrows
STEP = 112                       # vertical pitch between main-flow cards
Y_README, Y_SERVER, Y_AUTH, Y_API = 0, STEP, 2 * STEP, 3 * STEP
Y_BADGE = 4 * STEP + 8           # top of the full-width badge card
BADGE_H = 104
H = Y_BADGE + BADGE_H

LANE_CACHE_X = 578               # x of the dashed cache-hit lane (far right)
LABEL_X = CARD_X + CARD_W + 14   # left edge of labels beside the fallback lanes
CHIP_GAP = 14                    # space between the three badges
RENDER_ZOOM = 2


# =========================================================================== #
# SVG pieces
# =========================================================================== #


def card(y: float, t: dict[str, str], ico: str, title: str, sub: str) -> str:
    x = CARD_X
    return (
        f'<rect x="{x + 0.5}" y="{y + 0.5}" width="{CARD_W - 1}" height="{CARD_H - 1}" rx="10" '
        f'fill="{t["panel"]}" stroke="{t["border"]}"/>'
        + icon(ico, x + 18, y + 14, t["muted"], ICON_PX)
        + text(x + 48, y + 29, title, size=TITLE_PX, fill=t["fg"], weight="600")
        + text(x + 18, y + 52, sub, size=SUB_PX, fill=t["muted"])
    )


def label(x: float, y: float, content: str, t: dict[str, str], color: str | None = None,
          anchor: str = "start", weight: str = "500") -> str:
    return text(x, y, content, size=LABEL_PX, fill=color or t["muted"], weight=weight, anchor=anchor)


def stacked(x: float, bottom_y: float, lines: list[str], t: dict[str, str]) -> str:
    """Stack short phrases upward from bottom_y with a short hairline between each."""
    pitch = LABEL_PX + 9
    parts: list[str] = []
    for i, content in enumerate(reversed(lines)):
        y = bottom_y - i * pitch
        parts.append(label(x, y, content, t))
        if i < len(lines) - 1:
            sy = y - LABEL_PX - 1
            parts.append(
                f'<line x1="{x}" y1="{sy}" x2="{x + 22}" y2="{sy}" stroke="{t["border"]}" stroke-width="1.5"/>'
            )
    return "".join(parts)


def edge(points: list[tuple[float, float]], color: str, marker: str, dashed: bool = False,
         width: float = 2.25) -> str:
    d = "M" + " L".join(f"{x},{y}" for x, y in points)
    dash = ' stroke-dasharray="6 5"' if dashed else ""
    return (
        f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" '
        f'stroke-linecap="round" stroke-linejoin="round"{dash} marker-end="url(#{marker})"/>'
    )


def chip(svg: str, x: float, cy: float) -> str:
    return f'<g transform="translate({x},{cy - 10 * BADGE_SCALE}) scale({BADGE_SCALE})">{svg}</g>'


def build(theme: Theme, badges: dict[BadgeState, str]) -> str:
    t = THEMES[theme]
    accent, grey = t["accent"], t["edge_muted"]

    defs = "".join(
        f'<marker id="{mid}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" '
        f'orient="auto-start-reverse"><path d="M1,1 L9,5 L1,9" fill="none" stroke="{color}" '
        f'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></marker>'
        for mid, color in (("arrow-accent", accent), ("arrow-grey", grey))
    )

    cards = (
        card(Y_README, t, "book", "README", "loads the badge URL")
        + card(Y_SERVER, t, "server", "PolicyChecks", "checks its cache (≈1 h)")
        + card(Y_AUTH, t, "key", "GitHub App auth", "installation lookup + token")
        + card(Y_API, t, "plug", "GitHub API", "one REST endpoint per badge")
    )

    # Badge card: full width, the three real badges centred in a row.
    order: tuple[BadgeState, ...] = ("enabled", "disabled", "unknown")
    widths = [badge_width(badges[k]) * BADGE_SCALE for k in order]
    row_w = sum(widths) + CHIP_GAP * (len(order) - 1)
    xs: list[float] = []
    cursor = (W - row_w) / 2
    for w in widths:
        xs.append(cursor)
        cursor += w + CHIP_GAP
    chips_cy = Y_BADGE + 70
    unknown_cx = xs[2] + widths[2] / 2     # the fallback lane lands here
    badge_card = (
        f'<rect x="0.5" y="{Y_BADGE + 0.5}" width="{W - 1}" height="{BADGE_H - 1}" rx="10" '
        f'fill="{t["panel"]}" stroke="{t["border"]}"/>'
        + icon("shield-check", 18, Y_BADGE + 14, t["muted"], ICON_PX)
        + text(48, Y_BADGE + 29, "Badge", size=TITLE_PX, fill=t["fg"], weight="600")
        + "".join(chip(badges[k], x, chips_cy) for k, x in zip(order, xs))
    )

    card_right = CARD_X + CARD_W
    edges = "".join(
        [
            # main flow
            edge([(CARD_CX, Y_README + CARD_H), (CARD_CX, Y_SERVER)], accent, "arrow-accent"),
            edge([(CARD_CX, Y_SERVER + CARD_H), (CARD_CX, Y_AUTH)], accent, "arrow-accent"),
            edge([(CARD_CX, Y_AUTH + CARD_H), (CARD_CX, Y_API)], accent, "arrow-accent"),
            edge([(CARD_CX, Y_API + CARD_H), (CARD_CX, Y_BADGE)], accent, "arrow-accent"),
            # cache hit: out of the server card, down the far-right lane, into the badge card
            edge(
                [(card_right, Y_SERVER + CARD_H / 2), (LANE_CACHE_X, Y_SERVER + CARD_H / 2), (LANE_CACHE_X, Y_BADGE)],
                accent, "arrow-accent", dashed=True,
            ),
            # auth failure: down the unknown lane onto the unknown badge
            edge(
                [(card_right, Y_AUTH + CARD_H / 2), (unknown_cx, Y_AUTH + CARD_H / 2), (unknown_cx, Y_BADGE)],
                grey, "arrow-grey",
            ),
            # inconclusive API response joins the unknown lane
            edge([(card_right, Y_API + CARD_H / 2), (unknown_cx - 2, Y_API + CARD_H / 2)], grey, "arrow-grey", dashed=True),
        ]
    )

    lx = CARD_CX + 12
    labels = (
        label(lx, (Y_SERVER + CARD_H + Y_AUTH) / 2 + 5, "miss", t)
        + label(lx, (Y_AUTH + CARD_H + Y_API) / 2 + 5, "installed", t)
        + label(lx, (Y_API + CARD_H + Y_BADGE) / 2 + 5, "enabled / disabled", t)
        + label((card_right + LANE_CACHE_X) / 2, Y_SERVER + CARD_H / 2 - 9, "cache hit", t, accent, anchor="middle", weight="600")
        + stacked(LABEL_X, Y_AUTH + CARD_H / 2 - 14, ["not installed", "auth rejected", "rate limited"], t)
        + label(LABEL_X, Y_API + CARD_H / 2 - 9, "inconclusive", t)
        + label(unknown_cx - 10, Y_BADGE - 14, "always unknown", t, anchor="end")
    )

    aria = (
        "How a PolicyChecks badge request flows: README, PolicyChecks cache, GitHub App "
        "authentication, GitHub API, then a badge showing enabled, disabled, or unknown"
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
        f'role="img" aria-label="{aria}">\n<defs>{defs}</defs>\n'
        f"{cards}\n{badge_card}\n{edges}\n{labels}\n</svg>\n"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--keep-svg", action="store_true", help="also write the SVG next to each PNG")
    parser.add_argument("--theme", choices=("light", "dark"), help="render only this theme")
    args = parser.parse_args()

    themes: tuple[Theme, ...] = (args.theme,) if args.theme else ("light", "dark")
    badges = {k: pad_badge(v) for k, v in render_badges().items()}

    for theme in themes:
        out = ASSETS_DIR / f"how-it-works-{theme}.png"
        render_png(build(theme, badges), out, zoom=RENDER_ZOOM, keep_svg=args.keep_svg)
        print(f"wrote {out.relative_to(ASSETS_DIR.parent.parent)}")


if __name__ == "__main__":
    main()
