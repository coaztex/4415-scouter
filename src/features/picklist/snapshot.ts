import { z } from "zod";
import {
  observedRoles,
  reliabilityStatuses,
} from "@/games/2026-rebuilt/match-schema";
import { scoringMechanismSchema } from "@/games/2026-rebuilt/pit-schema";
import {
  metricIds,
  profileIds,
  scoreTeams,
  type PicklistState,
  type PickTeam,
} from "./model";

export function teamEvidence(team: PickTeam) {
  return {
    teamNumber: team.teamNumber,
    nickname: team.nickname,
    mechanism: team.mechanism,
    pitReported: team.pitReported,
    sampleSize: team.scouting.sampleSize,
    roles: team.scouting.roles.counts,
    roleSamples: team.scouting.roles.sampleSize,
    fuelUsable: team.scouting.fuel.total.sampleSize,
    fuelUncertain: team.scouting.fuel.veryUncertainSampleSize,
    recentConcern: team.recentConcern,
    recentUncertain: team.recentUncertain,
    records: team.records,
  };
}
export const evidenceTeamSchema = z.object({
  teamNumber: z.number(),
  nickname: z.string().nullable(),
  mechanism: scoringMechanismSchema.default("unknown"),
  pitReported: z.boolean().default(false),
  sampleSize: z.number(),
  roles: z.record(z.enum(observedRoles), z.number()),
  roleSamples: z.number(),
  fuelUsable: z.number(),
  fuelUncertain: z.number(),
  recentConcern: z.boolean(),
  recentUncertain: z.number(),
  records: z.array(
    z.object({
      id: z.string(),
      matchKey: z.string(),
      role: z.enum(observedRoles),
      reliability: z.enum(reliabilityStatuses),
      confidence: z.enum(["good", "rough", "very_uncertain"]),
    }),
  ),
});
export type EvidenceTeam = z.infer<typeof evidenceTeamSchema>;
const contributionSchema = z.object({
  id: z.enum(metricIds),
  label: z.string(),
  source: z.enum(["Our scouting", "TBA", "Statbotics"]),
  unit: z.enum(["FUEL", "%", "points"]),
  raw: z.number().nullable(),
  sample: z.number().nullable(),
  peers: z.number(),
  normalized: z.number().nullable(),
  weight: z.number(),
  effectiveWeight: z.number(),
  points: z.number().nullable(),
  treatment: z.string(),
});
const scoreSchema = z.object({
  teamNumber: z.number(),
  score: z.number().nullable(),
  coverage: z.number(),
  reason: z.string().nullable(),
  contributions: z.array(contributionSchema),
});
export const snapshotSchema = z.object({
  formulaVersion: z.literal(1),
  capturedAt: z.string(),
  selectedProfile: z.enum(profileIds),
  ownTeamNumber: z.number().nullable(),
  teams: z.array(evidenceTeamSchema),
  scores: z.record(z.enum(profileIds), z.array(scoreSchema)),
});
export type SnapshotEvidence = z.infer<typeof snapshotSchema>;
export function snapshotEvidence(
  teams: readonly PickTeam[],
  state: PicklistState,
  ownTeamNumber: number | null,
  selectedProfile: SnapshotEvidence["selectedProfile"],
): SnapshotEvidence {
  const candidates = teams.filter((t) => t.teamNumber !== ownTeamNumber);
  return snapshotSchema.parse({
    formulaVersion: 1,
    capturedAt: new Date().toISOString(),
    ownTeamNumber,
    selectedProfile,
    teams: candidates.map(teamEvidence),
    scores: Object.fromEntries(
      profileIds.map((p) => [
        p,
        scoreTeams(
          candidates,
          state.profiles[p],
          p !== "complement" || state.strategy.needs.trim().length > 0,
        ),
      ]),
    ),
  });
}
