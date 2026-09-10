#!/usr/bin/env python3
"""
Generate docs/assets/setting-vs-badge-{light,dark}.png for the README.

WHAT THE IMAGE IS
=================

Two cards side by side, joined by an arrow:

    WHAT YOU DO                                  WHAT THEY SEE
    +----------------------------------+         +-------------------------+
    | (eye-off) Settings › Actions     |         | (eye) README.md         |
    |                    [Admins only] |  ---->  |                [Public] |
    |----------------------------------|         |-------------------------|
    |  [x] Require actions to be pinned| Policy  |                         |
    |      to a full-length commit SHA | Checks  |  [SHA pinning|enabled]  |
    +----------------------------------+         +-------------------------+

The left card contains GitHub's own Settings UI checkbox, taken from a
screenshot. The right card contains the PolicyChecks badge that mirrors that
setting, produced by the project's real badge renderer. The image is meant to
say: "the setting is admin-only; the badge makes it public".

The README embeds the PNGs with a <picture> element that picks the light or
dark variant to match the reader's GitHub theme.

HOW THE IMAGE IS BUILT
======================

1. The screenshot (docs/assets/full-sha-pinned-setting-{theme}.png, 920x80,
   captured at 2x) is *sliced* at a word gap and stacked as two lines. The
   56-character label is far too wide for one line once the type is large
   enough to read in the GitHub mobile app, and slicing the real screenshot
   (rather than re-typesetting the label) keeps GitHub's exact checkbox,
   font, and colours. Each slice is embedded in the SVG as a base64 PNG.

2. The badge SVG comes from `render-badges.ts` (via common.render_badges), so
   it is byte-for-byte what the service would serve, then scaled up.

3. Cards, pills, icons and the connector arrow are drawn as SVG.

4. The SVG is rasterised to PNG with rsvg-convert at 2x for crisp output on
   high-DPI screens.

PREREQUISITES
=============

    brew install librsvg     # rsvg-convert
    pip install pillow       # screenshot slicing
    npm install              # tsx, used by render-badges.ts

HOW TO RUN
==========

From the repository root:

    python3 docs/assets/generators/setting-vs-badge.py

Options:

    --find-gaps    Print the word gaps detected in the screenshot and exit.
                   Use this after replacing the screenshot to pick new values
                   for LINE1_X / LINE2_X / LABEL_START_X (see below).
    --keep-svg     Also write the intermediate SVGs next to the PNGs so you
                   can open them in a browser and inspect the layout. Don't
                   commit them.
    --theme light|dark
                   Render only one theme (default: both).

Then look at the PNGs (both themes!) and commit them. There is no automated
check on the output; eyeball it at desktop width and at ~360 px wide (the
GitHub mobile app), which is what the type sizes are tuned for.

KNOBS
=====

Everything you are likely to want to tweak is a module-level constant with a
comment, grouped under these headings below:

  Screenshot slicing   where the label is split and how big it renders
  Type scale           font sizes for every piece of text
  Layout               paddings, gaps, card widths
  Theme colours        in common.THEMES (shared with how-it-works.py)

The one rule of thumb: on mobile the image is scaled to roughly 360 CSS px
wide, so a piece of text is legible only if its height is a decent fraction
of the *image width*. Making the image wider (bigger gap, more padding) makes
every piece of text smaller on a phone. Prefer wrapping to widening.
"""

from __future__ import annotations

import argparse
import base64
import io
import pathlib
import sys

from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from common import (  # noqa: E402  (import after sys.path tweak)
    ASSETS_DIR,
    THEMES,
    Theme,
    icon,
    pad_badge,
    render_badges,
    render_png,
    text,
)

# =========================================================================== #
# Screenshot slicing
# =========================================================================== #
#
# The source screenshots are docs/assets/full-sha-pinned-setting-{theme}.png.
# Both are 920x80 pixels captured at 2x, i.e. 460x40 CSS px in GitHub's UI.
# All coordinates in this section are in *screenshot pixels* (2x).
#
# Run `--find-gaps` to print the background-only column runs. Word gaps in
# the bold 30 px (2x) label are 8-10 px wide; the gap after the checkbox is
# ~19 px; letter gaps are 1-3 px and are filtered out. From the current
# screenshot:
#
#   checkbox 14-50 | gap 50-69 | Require | actions | to | be | pinned |
#   gap 489-498 | to | a | full-length | commit | SHA | ends 909
#
# LINE1_X / LINE2_X are (start, end) column ranges for the two slices. Split
# at whichever gap gives the most balanced pair of lines; with this label
# that is the gap after "pinned".

SCREENSHOT = "full-sha-pinned-setting-{theme}.png"
LINE1_X: tuple[int, int] = (0, 489)     # checkbox + "Require actions to be pinned"
LINE2_X: tuple[int, int] = (498, 909)   # "to a full-length commit SHA"
LABEL_START_X = 69                      # first ink column of the label text; the
                                        # second line is indented to align with it

# Multiply screenshot pixels by this to get 1x image units. The label is 15 px
# at 1x in GitHub's UI (30 px in the 2x screenshot); at 0.75 it renders at
# 22.5 px in the image, which is what makes it readable on a phone. This is
# the single most important knob for legibility of the left card.
SHOT_SCALE = 0.75

# Vertical space between the two label lines, in 1x units.
LINE_GAP = 6

# =========================================================================== #
# Type scale (1x units)
# =========================================================================== #

EYEBROW_PX = 18          # "WHAT YOU DO" / "WHAT THEY SEE" above the cards
EYEBROW_TRACKING = 1.6   # letter-spacing for the eyebrows
TITLE_PX = 18            # card header: "Settings › Actions", "README.md"
PILL_PX = 15             # "Admins only" / "Public"
CONNECTOR_PX = 19        # "PolicyChecks" above the arrow
CONNECTOR_SUB_PX = 17    # "mirrors it" below the arrow
BADGE_SCALE = 1.8        # badge is 20 px tall natively; 1.8 -> 36 px, text ~20 px

# =========================================================================== #
# Layout (1x units)
# =========================================================================== #

EYEBROW_Y = 20           # baseline of the eyebrow text
PANEL_Y = 36             # top edge of both cards
HEADER_H = 54            # card header height (title row + divider)
PAD = 26                 # inner padding of the left card body
GAP_W = 136              # horizontal space between the cards (holds the arrow
                         # and the "PolicyChecks" label; must fit CONNECTOR_PX text)
RIGHT_W = 300            # right card width (must fit "README.md" + Public pill)
CARD_RADIUS = 10
PILL_H = 28
LEFT_PILL_W = 138        # width of the "Admins only" pill
RIGHT_PILL_W = 98        # width of the "Public" pill
RENDER_ZOOM = 2          # PNG scale factor; 2 = retina

# The left card's width is *derived* from the first slice's width plus
# padding, and the card height from the two slices' heights. The canvas is
# derived from the cards. So changing SHOT_SCALE or the slice ranges resizes
# everything consistently.

# =========================================================================== #
# Screenshot helpers
# =========================================================================== #


def find_gaps(im: Image.Image, min_width: int = 8) -> list[tuple[int, int]]:
    """
    Return (start, end) column ranges that contain only background pixels and
    are at least `min_width` wide. Background is sampled at (0, 0). This is
    what `--find-gaps` prints; it is how LINE1_X / LINE2_X were chosen.
    """
    rgb = im.convert("RGB")
    bg = rgb.getpixel((0, 0))
    px = rgb.load()

    def is_background_column(x: int) -> bool:
        return all(sum(abs(a - b) for a, b in zip(px[x, y], bg)) < 30 for y in range(rgb.height))

    gaps: list[tuple[int, int]] = []
    start: int | None = None
    for x in range(rgb.width):
        if is_background_column(x):
            if start is None:
                start = x
        elif start is not None:
            gaps.append((start, x))
            start = None
    if start is not None:
        gaps.append((start, rgb.width))
    return [(a, b) for a, b in gaps if b - a >= min_width]


def slice_png(im: Image.Image, x0: int, x1: int) -> tuple[str, int, int]:
    """
    Crop columns x0..x1 from the screenshot, trim the crop vertically to its
    ink (plus a few px so antialiasing is not clipped), and return it as
    (base64 PNG, width, height) in screenshot pixels.
    """
    crop = im.crop((x0, 0, x1, im.height)).convert("RGB")
    bg = crop.getpixel((0, 0))
    px = crop.load()
    ink_rows = [
        y
        for y in range(crop.height)
        if any(sum(abs(a - b) for a, b in zip(px[x, y], bg)) > 30 for x in range(crop.width))
    ]
    top = max(ink_rows[0] - 4, 0)
    bottom = min(ink_rows[-1] + 5, crop.height)
    tight = crop.crop((0, top, crop.width, bottom))
    buffer = io.BytesIO()
    tight.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii"), tight.width, tight.height


# =========================================================================== #
# SVG pieces
# =========================================================================== #


def pill(x: float, y: float, w: float, label: str, ico: str, bg: str, fg: str, border: str) -> str:
    """Rounded status pill with a 16 px icon and a short label."""
    return (
        f'<rect x="{x}" y="{y}" width="{w}" height="{PILL_H}" rx="{PILL_H / 2}" '
        f'fill="{bg}" stroke="{border}" stroke-width="1"/>'
        + icon(ico, x + 11, y + 6, fg, 16)
        + text(x + 33, y + 19, label, size=PILL_PX, fill=fg, weight="500")
    )


def build(theme: Theme, badge_svg: str) -> str:
    """Assemble the complete SVG document for one theme."""
    t = THEMES[theme]
    shot = Image.open(ASSETS_DIR / SCREENSHOT.format(theme=theme))

    # -- slices -------------------------------------------------------------
    l1_b64, w1, h1 = slice_png(shot, *LINE1_X)
    l2_b64, w2, h2 = slice_png(shot, *LINE2_X)
    l1_w, l1_h = w1 * SHOT_SCALE, h1 * SHOT_SCALE
    l2_w, l2_h = w2 * SHOT_SCALE, h2 * SHOT_SCALE
    label_indent = LABEL_START_X * SHOT_SCALE

    # -- derived geometry ---------------------------------------------------
    left_w = round(PAD + l1_w + PAD)
    body_h = PAD + l1_h + LINE_GAP + l2_h + PAD
    panel_h = round(HEADER_H + body_h)
    body_cy = PANEL_Y + HEADER_H + body_h / 2   # vertical centre of the body row
    right_x = left_w + GAP_W
    canvas_w = right_x + RIGHT_W
    canvas_h = PANEL_Y + panel_h + 2

    def panel_rect(x: float, w: float) -> str:
        return (
            f'<rect x="{x + 0.5}" y="{PANEL_Y + 0.5}" width="{w - 1}" height="{panel_h - 1}" '
            f'rx="{CARD_RADIUS}" fill="{t["panel"]}" stroke="{t["border"]}" stroke-width="1"/>'
        )

    def header(x: float, w: float, ico: str, title: str, pill_svg: str) -> str:
        base = PANEL_Y + 34
        divider_y = PANEL_Y + HEADER_H
        return (
            icon(ico, x + 20, base - 16, t["muted"], 20)
            + text(x + 50, base, title, size=TITLE_PX, fill=t["fg"], weight="600")
            + pill_svg
            + f'<line x1="{x + 1}" y1="{divider_y}" x2="{x + w - 1}" y2="{divider_y}" '
            f'stroke="{t["divider"]}" stroke-width="1"/>'
        )

    # -- left card: the setting ---------------------------------------------
    l1_x, l1_y = PAD, PANEL_Y + HEADER_H + PAD
    l2_x, l2_y = PAD + label_indent, l1_y + l1_h + LINE_GAP
    left = (
        panel_rect(0, left_w)
        + header(
            0,
            left_w,
            "eye-closed",
            "Settings › Actions",
            pill(
                left_w - 20 - LEFT_PILL_W, PANEL_Y + 13, LEFT_PILL_W,
                "Admins only", "lock", t["pill_bg"], t["muted"], t["border"],
            ),
        )
        + f'<image x="{l1_x}" y="{l1_y}" width="{l1_w}" height="{l1_h}" '
        f'xlink:href="data:image/png;base64,{l1_b64}"/>'
        + f'<image x="{l2_x}" y="{l2_y}" width="{l2_w}" height="{l2_h}" '
        f'xlink:href="data:image/png;base64,{l2_b64}"/>'
    )

    # -- right card: the badge ----------------------------------------------
    badge_w = 132 * BADGE_SCALE  # the SHA-pinning "enabled" badge is 132x20 natively
    badge_h = 20 * BADGE_SCALE
    badge_x = right_x + (RIGHT_W - badge_w) / 2
    badge_y = body_cy - badge_h / 2
    right = (
        panel_rect(right_x, RIGHT_W)
        + header(
            right_x,
            RIGHT_W,
            "eye",
            "README.md",
            pill(
                right_x + RIGHT_W - 20 - RIGHT_PILL_W, PANEL_Y + 13, RIGHT_PILL_W,
                "Public", "globe", t["pill_bg_public"], t["pill_fg_public"], t["pill_border_public"],
            ),
        )
        + f'<g transform="translate({badge_x},{badge_y}) scale({BADGE_SCALE})">{badge_svg}</g>'
    )

    # -- connector ----------------------------------------------------------
    ax1, ax2 = left_w + 16, right_x - 16
    ay = body_cy
    mid = (ax1 + ax2) / 2
    connector = (
        text(mid, ay - 16, "PolicyChecks", size=CONNECTOR_PX, fill=t["accent"], weight="600", anchor="middle")
        + f'<line x1="{ax1}" y1="{ay}" x2="{ax2 - 8}" y2="{ay}" stroke="{t["accent"]}" '
        f'stroke-width="2.5" stroke-linecap="round"/>'
        + f'<path d="M{ax2 - 11},{ay - 7} L{ax2},{ay} L{ax2 - 11},{ay + 7}" fill="none" '
        f'stroke="{t["accent"]}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'
        + text(mid, ay + 26, "mirrors it", size=CONNECTOR_SUB_PX, fill=t["muted"], anchor="middle")
    )

    # -- eyebrows -----------------------------------------------------------
    eyebrows = text(
        left_w / 2, EYEBROW_Y, "WHAT YOU DO",
        size=EYEBROW_PX, fill=t["muted"], weight="700", anchor="middle", letter_spacing=EYEBROW_TRACKING,
    ) + text(
        right_x + RIGHT_W / 2, EYEBROW_Y, "WHAT THEY SEE",
        size=EYEBROW_PX, fill=t["muted"], weight="700", anchor="middle", letter_spacing=EYEBROW_TRACKING,
    )

    aria = (
        "An admin-only GitHub repository setting on the left; "
        "the public PolicyChecks badge that mirrors it on the right"
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{canvas_w}" height="{canvas_h}" viewBox="0 0 {canvas_w} {canvas_h}" '
        f'role="img" aria-label="{aria}">\n'
        f"{left}\n{connector}\n{right}\n{eyebrows}\n</svg>\n"
    )


# =========================================================================== #
# CLI
# =========================================================================== #


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--find-gaps", action="store_true", help="print screenshot word gaps and exit")
    parser.add_argument("--keep-svg", action="store_true", help="also write the SVG next to each PNG")
    parser.add_argument("--theme", choices=("light", "dark"), help="render only this theme")
    args = parser.parse_args()

    themes: tuple[Theme, ...] = (args.theme,) if args.theme else ("light", "dark")

    if args.find_gaps:
        for theme in themes:
            im = Image.open(ASSETS_DIR / SCREENSHOT.format(theme=theme))
            print(f"{theme}: {im.width}x{im.height}")
            for start, end in find_gaps(im):
                print(f"  gap {start:4d}-{end:4d}  ({end - start} px)")
        return

    badge_svg = pad_badge(render_badges()["enabled"])

    for theme in themes:
        out = ASSETS_DIR / f"setting-vs-badge-{theme}.png"
        render_png(build(theme, badge_svg), out, zoom=RENDER_ZOOM, keep_svg=args.keep_svg)
        print(f"wrote {out.relative_to(ASSETS_DIR.parent.parent)}")


if __name__ == "__main__":
    main()
