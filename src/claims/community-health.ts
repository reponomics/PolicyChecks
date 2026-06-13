import { publicMessage, toPublicClaimError } from "../github/errors.js";
import {
  communityProfileEvidence,
  isRecord,
  makeClaimResult,
  makeUnknownResult,
  resultInput
} from "./result.js";
import type { ClaimDefinition, ClaimEvaluationInput, ClaimResult } from "./types.js";

const communityFileFields = [
  "code_of_conduct",
  "code_of_conduct_file",
  "contributing",
  "issue_template",
  "pull_request_template",
  "license",
  "readme"
] as const;

export const communityHealthClaim: ClaimDefinition = {
  id: "community-health",
  label: "community health",
  passMessage: "available",
  failMessage: "unavailable",
  unknownMessage: "unknown",
  source: {
    provider: "github",
    api: "REST",
    endpoint: "GET /repos/{owner}/{repo}/community/profile",
    fields: ["health_percentage", "files"]
  },
  evidence: communityProfileEvidence,
  badgeMessage(result: ClaimResult): string {
    const score = healthScoreFromDetails(result.details);
    return score === undefined ? "unknown" : `${score}/100`;
  },
  badgeColor(result: ClaimResult): string {
    const score = healthScoreFromDetails(result.details);
    return score === undefined ? "lightgrey" : colorForScore(score);
  },
  async evaluate(input: ClaimEvaluationInput) {
    try {
      const profile = await input.github.getCommunityProfile(input.owner, input.repo);
      const score = profile.health_percentage;

      if (!isValidScore(score)) {
        return makeUnknownResult(
          communityHealthClaim,
          resultInput(input),
          {
            kind: "unexpected_response",
            message: publicMessage("unexpected_response")
          },
          {
            health_percentage: score ?? null
          }
        );
      }

      return makeClaimResult(communityHealthClaim, resultInput(input), "pass", true, {
        health_percentage: score,
        score: {
          numerator: score,
          denominator: 100
        },
        badge_color: colorForScore(score),
        files: communityFiles(profile.files),
        detected: detectedCommunityMetadata(profile.files),
        content_reports_enabled: profile.content_reports_enabled ?? null,
        updated_at: profile.updated_at ?? null,
        limitations: {
          public_repository_metric: true,
          file_contents_evaluated: false
        }
      });
    } catch (error) {
      return makeUnknownResult(communityHealthClaim, resultInput(input), toPublicClaimError(error));
    }
  }
};

function isValidScore(score: unknown): score is number {
  return typeof score === "number" && Number.isInteger(score) && score >= 0 && score <= 100;
}

function healthScoreFromDetails(details: Record<string, unknown>): number | undefined {
  const score = details.health_percentage;
  return isValidScore(score) ? score : undefined;
}

function communityFiles(files: unknown) {
  const profileFiles = isRecord(files) ? files : {};

  return Object.fromEntries(
    communityFileFields.map((field) => [
      field,
      profileFiles[field] !== undefined && profileFiles[field] !== null
    ])
  );
}

function detectedCommunityMetadata(files: unknown) {
  if (!isRecord(files)) {
    return {
      code_of_conduct: null,
      license: null
    };
  }

  return {
    code_of_conduct: selectedMetadata(files.code_of_conduct, ["name", "key", "html_url"]),
    license: selectedMetadata(files.license, ["name", "key", "spdx_id", "html_url"])
  };
}

function selectedMetadata(value: unknown, fields: readonly string[]) {
  if (!isRecord(value)) {
    return null;
  }

  return Object.fromEntries(fields.map((field) => [field, value[field] ?? null]));
}

function colorForScore(score: number): string {
  const clamped = Math.max(0, Math.min(100, score));
  const start = { r: 224, g: 93, b: 68 };
  const middle = { r: 223, g: 179, b: 23 };
  const end = { r: 68, g: 204, b: 17 };

  if (clamped <= 50) {
    return interpolateColor(start, middle, clamped / 50);
  }

  return interpolateColor(middle, end, (clamped - 50) / 50);
}

function interpolateColor(
  from: { r: number; g: number; b: number },
  to: { r: number; g: number; b: number },
  ratio: number
): string {
  const red = interpolateChannel(from.r, to.r, ratio);
  const green = interpolateChannel(from.g, to.g, ratio);
  const blue = interpolateChannel(from.b, to.b, ratio);

  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function interpolateChannel(from: number, to: number, ratio: number): number {
  return Math.round(from + (to - from) * ratio);
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, "0");
}
