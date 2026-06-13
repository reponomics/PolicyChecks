import type { ClaimDefinition, ClaimResult, ClaimStatus } from "../claims/types.js";

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
  return definition.badgeMessage?.(result) ?? messageForStatus(definition, result.status);
}

export function messageForStatus(definition: ClaimDefinition, status: ClaimStatus): string {
  switch (status) {
    case "pass":
      return definition.passMessage;
    case "fail":
      return definition.failMessage;
    case "unknown":
      return definition.unknownMessage;
  }
}

export function colorForResult(definition: ClaimDefinition, result: ClaimResult): string {
  return definition.badgeColor?.(result) ?? colorForStatus(result.status);
}

export function colorForStatus(status: ClaimStatus): string {
  switch (status) {
    case "pass":
      return "brightgreen";
    case "fail":
      return "red";
    case "unknown":
      return "lightgrey";
  }
}
