import type { BadgeDefinition, BadgeResult } from "./types.js";
import { colorForResult, messageForResult } from "./shields-json.js";

const colorHex = {
  brightgreen: "#4c1",
  red: "#e05d44",
  lightgrey: "#9f9f9f"
} as const;

const asciiStart = 32;
const fallbackCharacterWidth = 11;
const horizontalPadding = 10;
const minimumSegmentWidth = 44;

// Browser-measured advance widths for printable ASCII in 11 px Verdana. Keeping
// the text length explicit also makes the spacing stable when a fallback font is
// used to display the SVG.
const verdana11AsciiWidths = [
  3.87, 4.33, 5.05, 9, 6.99, 11.84, 7.99, 2.95, 5, 5, 6.99, 9, 4, 5, 4, 5, 6.99, 6.99, 6.99, 6.99,
  6.99, 6.99, 6.99, 6.99, 6.99, 6.99, 5, 5, 9, 9, 9, 6, 11, 7.52, 7.54, 7.68, 8.48, 6.96, 6.32,
  8.53, 8.27, 4.63, 5, 7.62, 6.12, 9.27, 8.23, 8.66, 6.63, 8.66, 7.65, 7.52, 6.78, 8.05, 7.52,
  10.88, 7.54, 6.77, 7.54, 5, 5, 5, 9, 6.99, 6.99, 6.61, 6.85, 5.73, 6.85, 6.55, 3.87, 6.85, 6.96,
  3.02, 3.79, 6.51, 3.02, 10.7, 6.96, 6.68, 6.85, 6.85, 4.69, 5.73, 4.33, 6.96, 6.51, 9, 6.51, 6.51,
  5.78, 6.98, 5, 6.98, 9
] as const;

export function renderBadgeSvg(definition: BadgeDefinition, result: BadgeResult): string {
  const label = definition.label;
  const message = messageForResult(definition, result);
  const labelTextWidth = textWidth(label);
  const messageTextWidth = textWidth(message);
  const labelWidth = segmentWidth(labelTextWidth);
  const messageWidth = segmentWidth(messageTextWidth);
  const width = labelWidth + messageWidth;
  const messageX = labelWidth + messageWidth / 2;
  const color = svgColor(colorForResult(definition, result));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${escapeXml(
    `${label}: ${message}`
  )}">
  <title>${escapeXml(`${label}: ${message}`)}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${messageWidth}" height="20" fill="${color}"/>
    <rect width="${width}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="15" textLength="${labelTextWidth}" lengthAdjust="spacing" fill="#010101" fill-opacity=".3">${escapeXml(label)}</text>
    <text x="${labelWidth / 2}" y="14" textLength="${labelTextWidth}" lengthAdjust="spacing">${escapeXml(label)}</text>
    <text x="${messageX}" y="15" textLength="${messageTextWidth}" lengthAdjust="spacing" fill="#010101" fill-opacity=".3">${escapeXml(message)}</text>
    <text x="${messageX}" y="14" textLength="${messageTextWidth}" lengthAdjust="spacing">${escapeXml(message)}</text>
  </g>
</svg>`;
}

function textWidth(text: string): number {
  const measuredWidth = [...text].reduce((total, character) => {
    const index = character.codePointAt(0)! - asciiStart;
    return total + (verdana11AsciiWidths[index] ?? fallbackCharacterWidth);
  }, 0);

  return Math.ceil(measuredWidth);
}

function segmentWidth(measuredTextWidth: number): number {
  return Math.max(minimumSegmentWidth, measuredTextWidth + horizontalPadding);
}

function svgColor(color: string): string {
  return color in colorHex ? colorHex[color as keyof typeof colorHex] : color;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
