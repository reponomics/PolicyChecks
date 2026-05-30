import type { ClaimDefinition, ClaimResult, ClaimStatus } from "../claims/types.js";

export interface ShieldsJson {
  schemaVersion: 1;
  label: string;
  message: string;
  color: "brightgreen" | "red" | "lightgrey";
}

export function toShieldsJson(definition: ClaimDefinition, result: ClaimResult): ShieldsJson {
  return {
    schemaVersion: 1,
    label: definition.label,
    message: messageForStatus(definition, result.status),
    color: colorForStatus(result.status)
  };
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

export function colorForStatus(status: ClaimStatus): ShieldsJson["color"] {
  switch (status) {
    case "pass":
      return "brightgreen";
    case "fail":
      return "red";
    case "unknown":
      return "lightgrey";
  }
}
