"""
Shared helpers for the README graphic generators in this directory.

Both `setting-vs-badge.py` and `how-it-works.py` import from here. Everything
that is *not* specific to one image lives in this module:

  * repository paths
  * the GitHub-flavoured colour themes (light + dark)
  * the Primer Octicon paths used for card icons
  * SVG helper snippets (icons, text)
  * real badge SVGs, produced by the project's own TypeScript renderer
  * `pad_badge`, a workaround for an rsvg limitation (see its docstring)
  * `render_png`, which shells out to `rsvg-convert`

Prerequisites (macOS, Homebrew):

    brew install librsvg        # provides rsvg-convert
    pip install pillow          # only needed by setting-vs-badge.py
    npm install                 # tsx is a dev dependency of the project

Run the generators from the repository root, e.g.

    python3 docs/assets/generators/setting-vs-badge.py
    python3 docs/assets/generators/how-it-works.py
"""

from __future__ import annotations

import json
import pathlib
import re
import subprocess
import tempfile
from typing import Final, Literal

# --------------------------------------------------------------------------- #
# Paths
# --------------------------------------------------------------------------- #

GENERATORS_DIR: Final = pathlib.Path(__file__).resolve().parent
ASSETS_DIR: Final = GENERATORS_DIR.parent          # docs/assets
REPO_ROOT: Final = ASSETS_DIR.parent.parent        # repository root

# --------------------------------------------------------------------------- #
# Typography
# --------------------------------------------------------------------------- #

# rsvg resolves font families through fontconfig. On macOS "Helvetica Neue"
# resolves to the system font, which is visually close to the SF font GitHub
# uses in its own UI. The rest of the stack is what browsers would use if the
# SVG were ever displayed directly.
FONT: Final = (
    "'Helvetica Neue', -apple-system, BlinkMacSystemFont, 'Segoe UI', "
    "Helvetica, Arial, sans-serif"
)

Theme = Literal["light", "dark"]

# Colours are taken from GitHub's Primer palette so the graphics blend into a
# rendered README. "panel" in the dark theme is deliberately #0e1116 rather
# than Primer's #0d1117: it matches the background of the dark Settings
# screenshot exactly, so the sliced screenshot sits invisibly inside its card.
THEMES: Final[dict[Theme, dict[str, str]]] = {
    "light": {
        "panel": "#ffffff",            # card background
        "border": "#d0d7de",           # card outline
        "divider": "#d8dee4",          # header rule inside a card
        "fg": "#1f2328",               # primary text
        "muted": "#59636e",            # secondary text, icons, edge labels
        "accent": "#0969da",           # GitHub blue: happy-path arrows
        "edge_muted": "#8c959f",       # grey arrows for fallback paths
        "pill_bg": "#f6f8fa",          # neutral pill ("Admins only")
        "pill_bg_public": "#dafbe1",   # green pill ("Public")
        "pill_fg_public": "#1a7f37",
        "pill_border_public": "#aceebb",
    },
    "dark": {
        "panel": "#0e1116",
        "border": "#30363d",
        "divider": "#21262d",
        "fg": "#e6edf3",
        "muted": "#8b949e",
        "accent": "#58a6ff",
        "edge_muted": "#6e7681",
        "pill_bg": "#161b22",
        "pill_bg_public": "#12261e",
        "pill_fg_public": "#3fb950",
        "pill_border_public": "#1f5f32",
    },
}

# --------------------------------------------------------------------------- #
# Icons: Primer Octicons, 16px variants, MIT licensed.
# https://github.com/primer/octicons/tree/main/icons
# Each value is the `d` attribute of the icon's single <path>. To add one,
# fetch https://raw.githubusercontent.com/primer/octicons/main/icons/<name>-16.svg
# and copy the path data.
# --------------------------------------------------------------------------- #

OCTICONS: Final[dict[str, str]] = {
    "book": "M0 1.75A.75.75 0 0 1 .75 1h4.253c1.227 0 2.317.59 3 1.501A3.743 3.743 0 0 1 11.006 1h4.245a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-4.507a2.25 2.25 0 0 0-1.591.659l-.622.621a.75.75 0 0 1-1.06 0l-.622-.621A2.25 2.25 0 0 0 5.258 13H.75a.75.75 0 0 1-.75-.75Zm7.251 10.324.004-5.073-.002-2.253A2.25 2.25 0 0 0 5.003 2.5H1.5v9h3.757a3.75 3.75 0 0 1 1.994.574ZM8.755 4.75l-.004 7.322a3.752 3.752 0 0 1 1.992-.572H14.5v-9h-3.495a2.25 2.25 0 0 0-2.25 2.25Z",
    "server": "M1.75 1h12.5c.966 0 1.75.784 1.75 1.75v4c0 .372-.116.717-.314 1 .198.283.314.628.314 1v4a1.75 1.75 0 0 1-1.75 1.75H1.75A1.75 1.75 0 0 1 0 12.75v-4c0-.358.109-.707.314-1a1.739 1.739 0 0 1-.314-1v-4C0 1.784.784 1 1.75 1ZM1.5 2.75v4c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-4a.25.25 0 0 0-.25-.25H1.75a.25.25 0 0 0-.25.25Zm.25 5.75a.25.25 0 0 0-.25.25v4c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-4a.25.25 0 0 0-.25-.25ZM7 4.75A.75.75 0 0 1 7.75 4h4.5a.75.75 0 0 1 0 1.5h-4.5A.75.75 0 0 1 7 4.75ZM7.75 10h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM3 4.75A.75.75 0 0 1 3.75 4h.5a.75.75 0 0 1 0 1.5h-.5A.75.75 0 0 1 3 4.75ZM3.75 10h.5a.75.75 0 0 1 0 1.5h-.5a.75.75 0 0 1 0-1.5Z",
    "key": "M10.5 0a5.499 5.499 0 1 1-1.288 10.848l-.932.932a.749.749 0 0 1-.53.22H7v.75a.749.749 0 0 1-.22.53l-.5.5a.749.749 0 0 1-.53.22H5v.75a.749.749 0 0 1-.22.53l-.5.5a.749.749 0 0 1-.53.22h-2A1.75 1.75 0 0 1 0 14.25v-2c0-.199.079-.389.22-.53l4.932-4.932A5.5 5.5 0 0 1 10.5 0Zm-4 5.5c-.001.431.069.86.205 1.269a.75.75 0 0 1-.181.768L1.5 12.56v1.69c0 .138.112.25.25.25h1.69l.06-.06v-1.19a.75.75 0 0 1 .75-.75h1.19l.06-.06v-1.19a.75.75 0 0 1 .75-.75h1.19l1.023-1.025a.75.75 0 0 1 .768-.18A4 4 0 1 0 6.5 5.5ZM11 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z",
    "plug": "M4 8H2.5a1 1 0 0 0-1 1v5.25a.75.75 0 0 1-1.5 0V9a2.5 2.5 0 0 1 2.5-2.5H4V5.133a1.75 1.75 0 0 1 1.533-1.737l2.831-.353.76-.913c.332-.4.825-.63 1.344-.63h.782c.966 0 1.75.784 1.75 1.75V4h2.25a.75.75 0 0 1 0 1.5H13v4h2.25a.75.75 0 0 1 0 1.5H13v.75a1.75 1.75 0 0 1-1.75 1.75h-.782c-.519 0-1.012-.23-1.344-.63l-.761-.912-2.83-.354A1.75 1.75 0 0 1 4 9.867Zm6.276-4.91-.95 1.14a.753.753 0 0 1-.483.265l-3.124.39a.25.25 0 0 0-.219.248v4.734c0 .126.094.233.219.249l3.124.39a.752.752 0 0 1 .483.264l.95 1.14a.25.25 0 0 0 .192.09h.782a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25h-.782a.25.25 0 0 0-.192.09Z",
    "shield-check": "m8.533.133 5.25 1.68A1.75 1.75 0 0 1 15 3.48V7c0 1.566-.32 3.182-1.303 4.682-.983 1.498-2.585 2.813-5.032 3.855a1.697 1.697 0 0 1-1.33 0c-2.447-1.042-4.049-2.357-5.032-3.855C1.32 10.182 1 8.566 1 7V3.48a1.75 1.75 0 0 1 1.217-1.667l5.25-1.68a1.748 1.748 0 0 1 1.066 0Zm-.61 1.429.001.001-5.25 1.68a.251.251 0 0 0-.174.237V7c0 1.36.275 2.666 1.057 3.859.784 1.194 2.121 2.342 4.366 3.298a.196.196 0 0 0 .154 0c2.245-.957 3.582-2.103 4.366-3.297C13.225 9.666 13.5 8.358 13.5 7V3.48a.25.25 0 0 0-.174-.238l-5.25-1.68a.25.25 0 0 0-.153 0ZM11.28 6.28l-3.5 3.5a.75.75 0 0 1-1.06 0l-1.5-1.5a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215l.97.97 2.97-2.97a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z",
    "eye": "M8 2c1.981 0 3.671.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.45.678-1.367 1.932-2.637 3.023C11.67 13.008 9.981 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.83.88 9.576.43 8.898a1.62 1.62 0 0 1 0-1.798c.45-.677 1.367-1.931 2.637-3.022C4.33 2.992 6.019 2 8 2ZM1.679 7.932a.12.12 0 0 0 0 .136c.411.622 1.241 1.75 2.366 2.717C5.176 11.758 6.527 12.5 8 12.5c1.473 0 2.825-.742 3.955-1.715 1.124-.967 1.954-2.096 2.366-2.717a.12.12 0 0 0 0-.136c-.412-.621-1.242-1.75-2.366-2.717C10.824 4.242 9.473 3.5 8 3.5c-1.473 0-2.825.742-3.955 1.715-1.124.967-1.954 2.096-2.366 2.717ZM8 10a2 2 0 1 1-.001-3.999A2 2 0 0 1 8 10Z",
    "eye-closed": "M.143 2.31a.75.75 0 0 1 1.047-.167l14.5 10.5a.75.75 0 1 1-.88 1.214l-2.248-1.628C11.346 13.19 9.792 14 8 14c-1.981 0-3.67-.992-4.933-2.078C1.797 10.832.88 9.577.43 8.9a1.619 1.619 0 0 1 0-1.797c.353-.533.995-1.42 1.868-2.305L.31 3.357A.75.75 0 0 1 .143 2.31Zm1.536 5.622A.12.12 0 0 0 1.657 8c0 .021.006.045.022.068.412.621 1.242 1.75 2.366 2.717C5.175 11.758 6.527 12.5 8 12.5c1.195 0 2.31-.488 3.29-1.191L9.063 9.695A2 2 0 0 1 6.058 7.52L3.529 5.688a14.207 14.207 0 0 0-1.85 2.244ZM8 3.5c-.516 0-1.017.09-1.499.251a.75.75 0 1 1-.473-1.423A6.207 6.207 0 0 1 8 2c1.981 0 3.67.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.11.166-.248.365-.41.587a.75.75 0 1 1-1.21-.887c.148-.201.272-.382.371-.53a.119.119 0 0 0 0-.137c-.412-.621-1.242-1.75-2.366-2.717C10.825 4.242 9.473 3.5 8 3.5Z",
    "lock": "M4 4a4 4 0 0 1 8 0v2h.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25v-5.5C2 6.784 2.784 6 3.75 6H4Zm8.25 3.5h-8.5a.25.25 0 0 0-.25.25v5.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25ZM10.5 6V4a2.5 2.5 0 1 0-5 0v2Z",
    "globe": "M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM5.78 8.75a9.64 9.64 0 0 0 1.363 4.177c.255.426.542.832.857 1.215.245-.296.551-.705.857-1.215A9.64 9.64 0 0 0 10.22 8.75Zm4.44-1.5a9.64 9.64 0 0 0-1.363-4.177c-.307-.51-.612-.919-.857-1.215a9.927 9.927 0 0 0-.857 1.215A9.64 9.64 0 0 0 5.78 7.25Zm-5.944 1.5H1.543a6.507 6.507 0 0 0 4.666 5.5c-.123-.181-.24-.365-.352-.552-.715-1.192-1.437-2.874-1.581-4.948Zm-2.733-1.5h2.733c.144-2.074.866-3.756 1.58-4.948.12-.197.237-.381.353-.552a6.507 6.507 0 0 0-4.666 5.5Zm10.181 1.5c-.144 2.074-.866 3.756-1.58 4.948-.12.197-.237.381-.353.552a6.507 6.507 0 0 0 4.666-5.5Zm2.733-1.5a6.507 6.507 0 0 0-4.666-5.5c.123.181.24.365.353.552.714 1.192 1.436 2.874 1.58 4.948Z",
}


# --------------------------------------------------------------------------- #
# SVG snippets
# --------------------------------------------------------------------------- #


def icon(name: str, x: float, y: float, fill: str, size: float = 16) -> str:
    """Place an Octicon with its top-left corner at (x, y), scaled to `size` px."""
    s = size / 16
    return (
        f'<g transform="translate({x},{y}) scale({s})">'
        f'<path fill="{fill}" d="{OCTICONS[name]}"/></g>'
    )


def text(
    x: float,
    y: float,
    content: str,
    *,
    size: float,
    fill: str,
    weight: str = "400",
    anchor: str = "start",
    letter_spacing: float | None = None,
) -> str:
    """A <text> element in the shared font. `y` is the baseline."""
    ls = f' letter-spacing="{letter_spacing}"' if letter_spacing is not None else ""
    return (
        f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-family="{FONT}" '
        f'font-size="{size}" font-weight="{weight}" fill="{fill}"{ls}>{content}</text>'
    )


# --------------------------------------------------------------------------- #
# Real badges
# --------------------------------------------------------------------------- #

BadgeState = Literal["enabled", "disabled", "unknown"]


def render_badges() -> dict[BadgeState, str]:
    """
    Return the SHA-pinning badge SVG for each result state, rendered by the
    project's own `renderBadgeSvg` via `render-badges.ts`. Using the real
    renderer means the graphics stay faithful if the badge design changes;
    just rerun the generator.
    """
    completed = subprocess.run(
        ["npx", "tsx", str(GENERATORS_DIR / "render-badges.ts")],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


def badge_width(svg: str) -> int:
    """Total width (in badge units, i.e. 1x px) declared by a badge SVG."""
    match = re.search(r'width="(\d+)"', svg)
    assert match is not None, "badge SVG has no width attribute"
    return int(match.group(1))


def pad_badge(svg: str, *, left: int = 4, right: int = 8) -> str:
    """
    Widen a badge's message segment. rsvg-convert ignores the SVG `textLength`
    attribute that the badge renderer uses to constrain text width, so glyphs
    can run closer to the segment edge than they do in a browser. This adds
    `left` px before the message text and `right` px after it. The graphic is
    the only consumer; the badge the service serves is unaffected.
    """
    total = badge_width(svg)
    label_match = re.search(r'<rect width="(\d+)" height="20" fill="#555"/>', svg)
    assert label_match is not None, "badge SVG has no label segment"
    label_w = int(label_match.group(1))
    msg_w = total - label_w
    msg_cx = label_w + msg_w / 2
    new_total = total + left + right
    new_msg_w = msg_w + left + right
    new_msg_cx = label_w + left + msg_w / 2  # keep text where it was, shifted by `left`

    svg = svg.replace(f'width="{total}"', f'width="{new_total}"')
    svg = svg.replace(
        f'<rect x="{label_w}" width="{msg_w}"', f'<rect x="{label_w}" width="{new_msg_w}"'
    )
    svg = svg.replace(f'x="{msg_cx:g}"', f'x="{new_msg_cx:g}"')
    return svg


# --------------------------------------------------------------------------- #
# Rendering
# --------------------------------------------------------------------------- #


def render_png(svg: str, out: pathlib.Path, *, zoom: float = 2, keep_svg: bool = False) -> None:
    """
    Rasterise `svg` to `out` with rsvg-convert at `zoom`x. With keep_svg the
    SVG source is also written next to the PNG (handy for inspecting layout in
    a browser; do not commit it, the PNG is the deliverable).
    """
    if keep_svg:
        svg_path = out.with_suffix(".svg")
        svg_path.write_text(svg)
    else:
        tmp = tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False)
        tmp.write(svg)
        tmp.close()
        svg_path = pathlib.Path(tmp.name)

    try:
        subprocess.run(
            ["rsvg-convert", "--zoom", str(zoom), "-o", str(out), str(svg_path)],
            check=True,
        )
    finally:
        if not keep_svg:
            svg_path.unlink(missing_ok=True)
