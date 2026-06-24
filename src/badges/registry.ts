import { communityHealthBadge } from "./community-health.js";
import {
  defaultBranchDeletionBlockedBadge,
  defaultBranchForcePushesBlockedBadge,
  defaultBranchLinearHistoryRequiredBadge,
  defaultBranchPullRequestRequiredBadge,
  defaultBranchSignedCommitsRequiredBadge,
  defaultBranchStatusChecksRequiredBadge
} from "./default-branch-rules.js";
import { immutableReleasesBadge } from "./immutable-releases.js";
import {
  secretPushProtectionEnabledBadge,
  secretScanningEnabledBadge
} from "./secret-protection.js";
import { shaPinningRequiredBadge } from "./sha-pinning-required.js";
import type { BadgeDefinition } from "./types.js";
import { webCommitSignoffRequiredBadge } from "./web-commit-signoff.js";

const definitions = [
  immutableReleasesBadge,
  shaPinningRequiredBadge,
  webCommitSignoffRequiredBadge,
  communityHealthBadge,
  secretScanningEnabledBadge,
  secretPushProtectionEnabledBadge,
  defaultBranchForcePushesBlockedBadge,
  defaultBranchSignedCommitsRequiredBadge,
  defaultBranchLinearHistoryRequiredBadge,
  defaultBranchDeletionBlockedBadge,
  defaultBranchPullRequestRequiredBadge,
  defaultBranchStatusChecksRequiredBadge
] satisfies BadgeDefinition[];

export const badgeDefinitions: readonly BadgeDefinition[] = definitions;

export function getBadgeDefinition(badgeId: string): BadgeDefinition | undefined {
  return definitions.find((definition) => definition.id === badgeId);
}
