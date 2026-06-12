import {
  defaultBranchDeletionBlockedClaim,
  defaultBranchForcePushesBlockedClaim,
  defaultBranchLinearHistoryRequiredClaim,
  defaultBranchPullRequestRequiredClaim,
  defaultBranchSignedCommitsRequiredClaim,
  defaultBranchStatusChecksRequiredClaim
} from "./default-branch-rules.js";
import { immutableReleasesClaim } from "./immutable-releases.js";
import {
  secretPushProtectionEnabledClaim,
  secretScanningEnabledClaim
} from "./secret-protection.js";
import { shaPinningRequiredClaim } from "./sha-pinning-required.js";
import type { ClaimDefinition } from "./types.js";
import { webCommitSignoffRequiredClaim } from "./web-commit-signoff.js";

const definitions = [
  immutableReleasesClaim,
  shaPinningRequiredClaim,
  webCommitSignoffRequiredClaim,
  secretScanningEnabledClaim,
  secretPushProtectionEnabledClaim,
  defaultBranchForcePushesBlockedClaim,
  defaultBranchSignedCommitsRequiredClaim,
  defaultBranchLinearHistoryRequiredClaim,
  defaultBranchDeletionBlockedClaim,
  defaultBranchPullRequestRequiredClaim,
  defaultBranchStatusChecksRequiredClaim
] satisfies ClaimDefinition[];

export const claimDefinitions: readonly ClaimDefinition[] = definitions;

export function getClaimDefinition(claim: string): ClaimDefinition | undefined {
  return definitions.find((definition) => definition.id === claim);
}
