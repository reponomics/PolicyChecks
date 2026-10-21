# PolicyChecks logo

`policychecks-mark.svg` is the master vector: an enamel-pin shield with a brass rim, two-tone green cells and a cream check, on a transparent background. It is drawn by hand; everything else in this folder and the banners next door are generated from it.

- `policychecks-mark-512.png` / `policychecks-mark-200.png` are exports for places that need a raster. GitHub Marketplace and the GitHub App listing want a square PNG under 1 MB and at least 200 px; use the 512 one.
- `../banner-light.*` and `../banner-dark.*` are the README banners, and `../social-preview-*.png` the 1280x640 image for the repository's social preview (Settings > General > Social preview; GitHub stores it outside the repo).
- The badge in those graphics is the service's real badge, rendered by `src/badges/svg.ts` with the label "BEST PRACTICES", so it tracks the renderer.

After editing the mark, regenerate the derived files from the repository root:

    python3 docs/assets/generators/brand.py

It renders in a headless Chromium (`pip install playwright && playwright install chromium`) because the paper grain is an SVG filter that `rsvg-convert` does not support.
