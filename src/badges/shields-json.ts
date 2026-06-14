import type { ClaimDefinition, ClaimResult } from "../claims/types.js";

export interface ShieldsJson {
  schemaVersion: 1;
  label: string;
  message: string;
  color: string;
}

export function toShieldsJson(definition: ClaimDefinition, result: ClaimResult): ShieldsJson {
  return {
    schemaVersion: 1,
    label: definition.label,
    message: messageForResult(definition, result),
    color: colorForResult(definition, result)
  };
}

export function messageForResult(definition: ClaimDefinition, result: ClaimResult): string {
  return definition.badgeMessage?.(result) ?? result.result;
}

export function colorForResult(definition: ClaimDefinition, result: ClaimResult): string {
  return definition.badgeColor?.(result) ?? colorForResultText(result.result);
}

export function colorForResultText(result: string): string {
  switch (result) {
    case "enabled":
      return "brightgreen";
    case "disabled":
      return "red";
    case "unknown":
      return "lightgrey";
    default:
      return "brightgreen";
  }
}
