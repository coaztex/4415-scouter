import { z } from "zod";
import { rebuiltMatchSchema, type RebuiltMatchData } from "./match-schema";
import { parseOfficialAlliance2026 } from "./official";
import { matchSchema } from "@/lib/tba/schemas";
export type ReconciliationSubmission = {
  id: string;
  eventKey: string;
  matchKey: string;
  teamNumber: number;
  schemaVersion: 2;
  data: RebuiltMatchData;
};
export function fuelDifference(
  estimate: number | null,
  official: number | null,
) {
  if (estimate === null || official === null)
    return {
      estimate,
      official,
      absoluteDifference: null,
      percentageDifference: null,
    };
  if (
    !Number.isFinite(estimate) ||
    !Number.isFinite(official) ||
    estimate < 0 ||
    official < 0
  )
    throw new Error("Invalid FUEL total.");
  const absoluteDifference = Math.abs(estimate - official);
  return {
    estimate,
    official,
    absoluteDifference,
    percentageDifference:
      official > 0 ? (100 * absoluteDifference) / official : null,
  };
}
/** Review signal only. Exactly one canonical final submission per roster team; never rescales data. */
export function reconcileAlliance2026(
  rawMatch: unknown,
  alliance: "red" | "blue",
  submissions: readonly ReconciliationSubmission[],
) {
  z.enum(["red", "blue"]).parse(alliance);
  const match = matchSchema.parse(rawMatch);
  if (!match.event_key.startsWith("2026"))
    throw new Error("Expected a 2026 match.");
  const roster = match.alliances[alliance];
  const official = parseOfficialAlliance2026(match.score_breakdown?.[alliance]);
  if (roster.score < 0 || !official)
    return {
      status: "unavailable" as const,
      reason: "Official completed-match breakdown is unavailable.",
    };
  const teams = roster.team_keys.map((key) => Number(key.slice(3)));
  if (teams.length !== 3 || new Set(teams).size !== 3)
    return {
      status: "unavailable" as const,
      reason: "A complete three-team official roster is required.",
    };
  const seen = new Set<number>(),
    ids = new Set<string>();
  const data = submissions.map((s) => {
    if (
      s.schemaVersion !== 2 ||
      !s.id ||
      s.eventKey !== match.event_key ||
      s.matchKey !== match.key ||
      !teams.includes(s.teamNumber) ||
      seen.has(s.teamNumber) ||
      ids.has(s.id)
    )
      throw new Error(
        "Choose one version-2 final observation per official alliance team in this match.",
      );
    seen.add(s.teamNumber);
    ids.add(s.id);
    return rebuiltMatchSchema.parse(s.data);
  });
  if (data.length !== 3)
    return {
      status: "incomplete" as const,
      missingTeams: teams.filter((team) => !seen.has(team)),
      contributingSubmissionIds: [...ids],
    };
  const sum = (phase: "auto" | "teleop") => {
    const values = data.map((d) => d[phase].estimated_fuel_scored);
    return values.some((v) => v === null)
      ? null
      : values.reduce<number>((a, b) => a + (b ?? 0), 0);
  };
  const auto = sum("auto"),
    teleop = sum("teleop");
  return {
    status: "ready" as const,
    matchKey: match.key,
    alliance,
    contributingSubmissionIds: [...ids],
    hasVeryUncertainFuel: data.some(
      (d) => d.post_match.fuel_estimate_confidence === "very_uncertain",
    ),
    auto: fuelDifference(auto, official.fuel.auto),
    teleop: fuelDifference(teleop, official.fuel.teleop),
    total: fuelDifference(
      auto === null || teleop === null ? null : auto + teleop,
      official.fuel.total,
    ),
  };
}
