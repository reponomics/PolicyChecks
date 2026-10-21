"""
Generate the brand graphics: README banners, the social preview, and PNG
exports of the logo mark.

Outputs (paths relative to the repository root):

    docs/assets/banner-light.svg, banner-light.png      800x200 (PNG at 2x)
    docs/assets/banner-dark.svg,  banner-dark.png
    docs/assets/social-preview-light.png                1280x640 (GitHub's size)
    docs/assets/social-preview-dark.png
    docs/assets/logo/policychecks-mark-512.png          square exports of the mark
    docs/assets/logo/policychecks-mark-200.png

The mark itself (docs/assets/logo/policychecks-mark.svg) is hand-drawn and is
the input here, not an output. Each composition embeds it once and reuses it
with <use>, so editing the mark and re-running this script refreshes every
derived graphic.

The badge in the middle of each graphic is the project's real "enabled" badge,
rendered by `renderBadgeSvg` through render-badges.ts with the label
"BEST PRACTICES", so it tracks the renderer (logo slot, widths, colours).

Rendering happens in a headless Chromium via Playwright rather than
rsvg-convert, because the paper-grain texture is an SVG `feTurbulence` filter
that librsvg does not implement. Prerequisites:

    pip install playwright && playwright install chromium
    npm install                      # tsx, for the badge renderer

Run from the repository root:

    python3 docs/assets/generators/brand.py              # everything
    python3 docs/assets/generators/brand.py --only banner
    python3 docs/assets/generators/brand.py --only social
    python3 docs/assets/generators/brand.py --only logo
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import pathlib
import re
import sys
from typing import Final

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from common import ASSETS_DIR, Theme, render_badges  # noqa: E402

LOGO_DIR: Final = ASSETS_DIR / "logo"
MARK_SVG: Final = LOGO_DIR / "policychecks-mark.svg"

# --------------------------------------------------------------------------- #
# Palette
# --------------------------------------------------------------------------- #

# Warm paper tones rather than GitHub's Primer greys: the banner is the one
# place the README is allowed to look like a thing rather than a UI panel.
BRAND: Final[dict[Theme, dict[str, str]]] = {
    "light": {
        "bg": "#fbf8f1",       # cream paper
        "ink": "#1f2a26",      # wordmark "Policy", tagline body
        "muted": "#5a655f",    # tagline
        "green": "#1f8f72",    # wordmark "Checks", "enforced"
        "brass": "#8a7140",    # pinstripes, matches the mark's rim
        "grain": "#000000",    # paper grain is dark speckle on light paper
        "grain_alpha": "0.05",
    },
    "dark": {
        "bg": "#101418",
        "ink": "#f2f4f6",
        "muted": "#99a2ad",
        "green": "#3fc596",
        "brass": "#b89a5a",
        "grain": "#ffffff",    # ... and light speckle on dark paper
        "grain_alpha": "0.08",
    },
}

FONT: Final = "Inter, 'Helvetica Neue', Arial, sans-serif"

# --------------------------------------------------------------------------- #
# Building blocks
# --------------------------------------------------------------------------- #


def mark_symbol() -> str:
    """
    The logo mark as a <symbol id="mark"> with a 512x512 viewBox, taken from
    the master SVG so the banner can never drift from the file in logo/.
    """
    svg = MARK_SVG.read_text()
    match = re.search(r"<svg[^>]*>(.*)</svg>", svg, re.S)
    assert match is not None, f"{MARK_SVG} does not look like an SVG"
    inner = match.group(1)
    # Drop the master's own <title>/<desc> (the composition has its own) and any
    # <metadata> an export tool may have added (e.g. a C2PA manifest).
    inner = re.sub(r"<title>.*?</title>|<desc>.*?</desc>|<metadata>.*?</metadata>", "", inner, flags=re.S)
    return f'<symbol id="mark" viewBox="0 0 512 512">{inner}</symbol>'


def paper(t: dict[str, str], w: int, h: int) -> str:
    """Background fill plus a faint fractal-noise grain over the whole canvas."""
    return (
        f'<filter id="paper" x="0" y="0" width="100%" height="100%">'
        f'<feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" seed="5"/>'
        f'<feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 {t["grain_alpha"]} 0"/>'
        f'<feComposite in2="SourceGraphic" operator="in"/></filter>'
        f'<rect width="{w}" height="{h}" fill="{t["bg"]}"/>'
        f'<rect width="{w}" height="{h}" fill="{t["grain"]}" filter="url(#paper)"/>'
    )


def pinstripes(t: dict[str, str], w: int, h: int, band: int) -> str:
    """
    Fine 45-degree brass hairlines fading in from the left and right edges,
    `band` px wide on each side. Defined and used in one go.
    """
    return (
        f'<pattern id="stripes" width="8" height="8" patternUnits="userSpaceOnUse" '
        f'patternTransform="rotate(45)"><path d="M0 0v8" stroke="{t["brass"]}" '
        f'stroke-width="1" opacity=".18"/></pattern>'
        f'<linearGradient id="fade-l" x1="0" x2="1"><stop offset="0" stop-color="#fff"/>'
        f'<stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
        f'<linearGradient id="fade-r" x1="1" x2="0"><stop offset="0" stop-color="#fff"/>'
        f'<stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
        f'<mask id="mask-l"><rect width="{band}" height="{h}" fill="url(#fade-l)"/></mask>'
        f'<mask id="mask-r"><rect x="{w - band}" width="{band}" height="{h}" fill="url(#fade-r)"/></mask>'
        f'<rect width="{band}" height="{h}" fill="url(#stripes)" mask="url(#mask-l)"/>'
        f'<rect x="{w - band}" width="{band}" height="{h}" fill="url(#stripes)" mask="url(#mask-r)"/>'
    )


def wordmark(x: float, y: float, size: float, t: dict[str, str], anchor: str = "start") -> str:
    tracking = -size / 30  # Inter ExtraBold wants a touch of negative tracking at display sizes
    return (
        f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-family="{FONT}" font-size="{size}" '
        f'font-weight="800" letter-spacing="{tracking:g}" fill="{t["ink"]}">'
        f'Policy<tspan fill="{t["green"]}">Checks</tspan></text>'
    )


def tagline(x: float, y: float, size: float, t: dict[str, str], anchor: str = "start") -> str:
    return (
        f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-family="{FONT}" font-size="{size}" '
        f'fill="{t["muted"]}">Not just by habit, <tspan fill="{t["green"]}" font-weight="600">'
        f"enforced</tspan> by settings.</text>"
    )


def badge_at(svg: str, x: float, y: float, scale: float) -> str:
    """Place a badge SVG (its own <svg> root, 20 px tall) at (x, y), scaled."""
    return f'<g transform="translate({x} {y}) scale({scale})">{svg}</g>'


def badge_width(svg: str) -> int:
    match = re.search(r'width="(\d+)"', svg)
    assert match is not None
    return int(match.group(1))


# --------------------------------------------------------------------------- #
# Compositions
# --------------------------------------------------------------------------- #

BANNER_W, BANNER_H = 800, 200
SOCIAL_W, SOCIAL_H = 1280, 640


def build_banner(theme: Theme, badge_svg: str) -> str:
    """
    README banner: a shield at each end, the wordmark, the badge and the
    tagline centred between them, on pinstriped paper.
    """
    t = BRAND[theme]
    badge_scale = 1.9
    bw = badge_width(badge_svg) * badge_scale
    mark_px = 512 * 0.29  # ~148 px tall shields
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {BANNER_W} {BANNER_H}" '
        f'width="{BANNER_W}" height="{BANNER_H}" role="img" aria-labelledby="title desc">\n'
        f"<title>PolicyChecks</title>\n"
        f"<desc>PolicyChecks banner: enamel shield logo, the name PolicyChecks, a badge reading "
        f"best practices enabled, and the tagline Not just by habit, enforced by settings.</desc>\n"
        f"<defs>{mark_symbol()}</defs>\n"
        f"{paper(t, BANNER_W, BANNER_H)}\n"
        f"{pinstripes(t, BANNER_W, BANNER_H, band=200)}\n"
        f'<use href="#mark" x="22" y="26" width="{mark_px:g}" height="{mark_px:g}"/>\n'
        f'<use href="#mark" x="{BANNER_W - 22 - mark_px:g}" y="26" width="{mark_px:g}" height="{mark_px:g}"/>\n'
        f"{wordmark(BANNER_W / 2, 78, 50, t, anchor='middle')}\n"
        f"{badge_at(badge_svg, (BANNER_W - bw) / 2, 98, badge_scale)}\n"
        f"{tagline(BANNER_W / 2, 168, 17, t, anchor='middle')}\n"
        f"</svg>\n"
    )


def build_social(theme: Theme, badge_svg: str) -> str:
    """
    GitHub social preview (1280x640): one large shield on the left, the
    wordmark, badge and tagline left-aligned beside it. Everything sits in the
    central band because GitHub crops the preview to roughly 2:1 in timelines.
    """
    t = BRAND[theme]
    badge_scale = 3.1
    mark_px = 512 * 0.82
    text_x = 474
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SOCIAL_W} {SOCIAL_H}" '
        f'width="{SOCIAL_W}" height="{SOCIAL_H}" role="img" aria-labelledby="title desc">\n'
        f"<title>PolicyChecks</title>\n"
        f"<desc>PolicyChecks: enamel shield logo, the name PolicyChecks, a badge reading "
        f"best practices enabled, and the tagline Not just by habit, enforced by settings.</desc>\n"
        f"<defs>{mark_symbol()}</defs>\n"
        f"{paper(t, SOCIAL_W, SOCIAL_H)}\n"
        f"{pinstripes(t, SOCIAL_W, SOCIAL_H, band=420)}\n"
        f'<use href="#mark" x="92" y="110" width="{mark_px:g}" height="{mark_px:g}"/>\n'
        f"{wordmark(text_x, 272, 112, t)}\n"
        f"{badge_at(badge_svg, text_x + 4, 316, badge_scale)}\n"
        f"{tagline(text_x + 4, 438, 36, t)}\n"
        f"</svg>\n"
    )


# --------------------------------------------------------------------------- #
# Rendering
# --------------------------------------------------------------------------- #


async def _render_all(jobs: list[tuple[str, pathlib.Path, int, int, float]]) -> None:
    """jobs: (svg source, output png, width, height, device scale factor)."""
    try:
        from playwright.async_api import async_playwright
    except ImportError:  # pragma: no cover - environment check
        sys.exit(
            "brand.py needs Playwright: pip install playwright && playwright install chromium"
        )

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for svg, out, w, h, zoom in jobs:
            page = await browser.new_page(viewport={"width": w, "height": h}, device_scale_factor=zoom)
            # Open the SVG as a document of its own (not inline HTML) so it is
            # parsed as strict XML, exactly as GitHub and browsers parse the file.
            data = base64.b64encode(svg.encode()).decode()
            await page.goto(f"data:image/svg+xml;base64,{data}", wait_until="load")
            await page.wait_for_timeout(100)
            await page.screenshot(path=str(out), omit_background=True)
            await page.close()
            print(f"wrote {out.relative_to(ASSETS_DIR.parent.parent)}")
        await browser.close()


def render_pngs(jobs: list[tuple[str, pathlib.Path, int, int, float]]) -> None:
    asyncio.run(_render_all(jobs))


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--only", choices=["banner", "social", "logo"], help="generate just one family of outputs"
    )
    args = parser.parse_args()
    want = {args.only} if args.only else {"banner", "social", "logo"}

    jobs: list[tuple[str, pathlib.Path, int, int, float]] = []

    if want & {"banner", "social"}:
        badge_svg = render_badges(label="BEST PRACTICES")["enabled"]

    if "banner" in want:
        for theme in ("light", "dark"):
            svg = build_banner(theme, badge_svg)
            svg_path = ASSETS_DIR / f"banner-{theme}.svg"
            svg_path.write_text(svg)
            print(f"wrote {svg_path.relative_to(ASSETS_DIR.parent.parent)}")
            jobs.append((svg, ASSETS_DIR / f"banner-{theme}.png", BANNER_W, BANNER_H, 2))

    if "social" in want:
        for theme in ("light", "dark"):
            svg = build_social(theme, badge_svg)
            jobs.append((svg, ASSETS_DIR / f"social-preview-{theme}.png", SOCIAL_W, SOCIAL_H, 1))

    if "logo" in want:
        mark = MARK_SVG.read_text()
        for size in (512, 200):
            # The master declares width/height 512; override for the export size.
            sized = re.sub(r'width="512" height="512"', f'width="{size}" height="{size}"', mark, count=1)
            jobs.append((sized, LOGO_DIR / f"policychecks-mark-{size}.png", size, size, 1))

    render_pngs(jobs)


if __name__ == "__main__":
    main()
