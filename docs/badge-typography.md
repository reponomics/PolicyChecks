# Badge Typography

PolicyChecks badges use proportional text measurement so labels with wide and narrow characters receive consistent horizontal spacing. Badge widths should come from the rendered text, not from character count and not from per-badge adjustments.

## Rendering Rule

The SVG renderer measures text with 11 px `Verdana` metrics and renders it with the existing Verdana-first font stack. It calculates each label and message segment independently:

```text
text width = ceil(sum of glyph advance widths)
segment width = max(44 px, text width + 10 px)
```

The additional 10 px provides a 5 px inset on each side. Very short strings may receive more space because every segment remains at least 44 px wide.

Each `<text>` element is centered within its segment and includes both `textLength` and `lengthAdjust="spacing"`. Those attributes preserve the intended text width when a browser uses a fallback font.

The implementation is in [`src/badges/svg.ts`](../src/badges/svg.ts).

## Adding Another Badge

New PolicyChecks badges inherit this typography automatically. Define the badge's `label` and optional `badgeMessage`, then add its definition to [`src/badges/registry.ts`](../src/badges/registry.ts). Do not pad labels with spaces, choose a fixed image width, or introduce per-badge padding.

To reproduce the same treatment in another SVG renderer:

1. Measure text using the same font family and size used in the SVG.
2. Add 10 px to the measured width and retain a sensible minimum segment width.
3. Center the text at the midpoint of its segment.
4. Set `textLength` to the measured width and use `lengthAdjust="spacing"`.

The current embedded metrics cover printable ASCII. A badge that displays other characters should add measurements for those glyphs or use a font-measurement library; otherwise, the renderer uses a conservative fallback width.

## Verification

Run the complete project check:

```bash
npm run check
```

For visual inspection, start the deterministic fixture server with `npm run dev:fixtures`, then open a badge such as:

```text
http://localhost:3000/github/example/project/sha-pinning-required.svg
```

Regression coverage in [`test/badges.test.ts`](../test/badges.test.ts) verifies the 5 px inset and confirms that equal-length strings containing different glyphs receive different widths.
