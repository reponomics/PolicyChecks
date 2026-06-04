import { immutableReleasesClaim } from "./immutable-releases.js";
import {
  secretPushProtectionEnabledClaim,
  secretScanningEnabledClaim
} from "./secret-protection.js";
import { shaPinningRequiredClaim } from "./sha-pinning-required.js";
import type { ClaimDefinition } from "./types.js";

const definitions = [
  immutableReleasesClaim,
  shaPinningRequiredClaim,
  secretScanningEnabledClaim,
  secretPushProtectionEnabledClaim
] satisfies ClaimDefinition[];

export const claimDefinitions: readonly ClaimDefinition[] = definitions;

export function getClaimDefinition(claim: string): ClaimDefinition | undefined {
  return definitions.find((definition) => definition.id === claim);
}
