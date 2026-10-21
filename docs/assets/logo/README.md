# PolicyChecks logo

`policychecks-mark.svg` is the master vector: an enamel-pin shield with a brass rim,
two-tone green cells and a cream check, on a transparent background.

- `policychecks-mark-512.png` / `policychecks-mark-200.png` are exports for places
  that need a raster. GitHub Marketplace and the GitHub App listing want a square
  PNG under 1 MB and at least 200 px; use the 512 one.
- The README banners (`../banner-light.svg`, `../banner-dark.svg`) embed the same
  mark at each end. The badge in the middle is drawn from the same geometry as
  `src/badges/svg.ts` (scaled 1.9x), including the shield logo in the label.
- The banner SVGs use `feTurbulence` for the paper grain, which browsers render
  but `rsvg-convert` does not. Re-export the PNGs at 2x (1600x400) with a browser,
  e.g. Playwright/Chromium, after editing.
