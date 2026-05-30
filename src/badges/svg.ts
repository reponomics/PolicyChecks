import type { ClaimDefinition, ClaimResult } from "../claims/types.js";
import { colorForStatus, messageForStatus } from "./shields-json.js";

const colorHex = {
  brightgreen: "#4c1",
  red: "#e05d44",
  lightgrey: "#9f9f9f"
} as const;

export function renderBadgeSvg(definition: ClaimDefinition, result: ClaimResult): string {
  const label = definition.label;
  const message = messageForStatus(definition, result.status);
  const labelWidth = textWidth(label);
  const messageWidth = textWidth(message);
  const width = labelWidth + messageWidth;
  const messageX = labelWidth + messageWidth / 2;
  const color = colorHex[colorForStatus(result.status)];

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
    <text x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${escapeXml(label)}</text>
    <text x="${labelWidth / 2}" y="14">${escapeXml(label)}</text>
    <text x="${messageX}" y="15" fill="#010101" fill-opacity=".3">${escapeXml(message)}</text>
    <text x="${messageX}" y="14">${escapeXml(message)}</text>
  </g>
</svg>`;
}

function textWidth(text: string): number {
  return Math.max(44, Math.ceil(text.length * 7 + 10));
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
