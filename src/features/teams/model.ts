import {
  aggregateEvent,
  aggregateTeam,
  type RebuiltAggregate,
} from "@/games/2026-rebuilt/aggregate";
import {
  rebuiltMatchSchema,
  type RebuiltMatchData,
} from "@/games/2026-rebuilt/match-schema";
import {
  rebuiltPitSchema,
  type RebuiltPitData,
  type ScoringMechanism,
} from "@/games/2026-rebuilt/pit-schema";
import { parseCopr2026 } from "@/games/2026-rebuilt/official";
import { parseStatbotics2026Components } from "@/lib/statbotics/schemas";
import type { Json } from "@/types/database";
import { pitStatusLabels } from "./directory-model";
export {
  roleLabels,
  pitStatusLabels,
  sortKeys,
  directoryQuerySchema,
  formatNumber,
  formatPercent,
  defaultDirection,
  sortValue,
  directoryRows,
} from "./directory-model";
export type { TeamSort, DirectoryListRow } from "./directory-model";

export type MatchObservation = {
  id: string;
  matchId: string;
  matchKey: string;
  matchNumber: number;
  setNumber?: number;
  compLevel: string;
  completedAt: string | null;
  data: RebuiltMatchData;
};
export type TeamDirectoryRow = {
  teamNumber: number;
  nickname: string | null;
  avatarUrl?: string | null;
  city: string | null;
  state: string | null;
  pitStatus: keyof typeof pitStatusLabels;
  pitMechanism: ScoringMechanism;
  pitReported: boolean;
  pitOtherType: string | null;
  rank: number | null;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  statbotics: {
    fetchedAt?: string | null;
    total: number | null;
    auto: number | null;
    teleop: number | null;
    endgame: number | null;
    components: ReturnType<typeof parseStatbotics2026Components>;
  } | null;
  tba: {
    fetchedAt?: string | null;
    opr: number | null;
    dpr: number | null;
    ccwm: number | null;
    components: ReturnType<typeof parseCopr2026>;
  } | null;
  scouting: RebuiltAggregate;
  observations: MatchObservation[];
};
type SubmissionRow = {
  id: string;
  match_id: string;
  team_number: number;
  game_data: Json;
  completed_at: string | null;
};
type MatchRow = {
  id: string;
  tba_match_key: string;
  match_number: number;
  set_number?: number;
  comp_level: string;
};
export function buildScouting(
  eventId: string,
  submissions: readonly SubmissionRow[],
  matches: readonly MatchRow[],
) {
  const matchById = new Map(matches.map((m) => [m.id, m]));
  // Keep one canonical final per robot/match. The newest accepted row wins only for analytics;
  // every readable row remains available to a future correction/audit workflow.
  const canonical = new Map<string, SubmissionRow>();
  for (const row of submissions) {
    const parsed = rebuiltMatchSchema.safeParse(row.game_data);
    if (!parsed.success || !matchById.has(row.match_id)) continue;
    const key = `${row.match_id}:${row.team_number}`;
    const prior = canonical.get(key);
    if (!prior || (row.completed_at ?? "") > (prior.completed_at ?? ""))
      canonical.set(key, row);
  }
  const valid = [...canonical.values()].map((row) => ({
    eventId,
    matchId: row.match_id,
    teamNumber: row.team_number,
    data: rebuiltMatchSchema.parse(row.game_data),
  }));
  const aggregate = aggregateEvent(valid),
    metrics = new Map(
      aggregate.teams.map((row) => [row.teamNumber, row.metrics]),
    );
  const observations = new Map<number, MatchObservation[]>();
  for (const row of canonical.values()) {
    const match = matchById.get(row.match_id)!;
    const list = observations.get(row.team_number) ?? [];
    list.push({
      id: row.id,
      matchId: row.match_id,
      matchKey: match.tba_match_key,
      matchNumber: match.match_number,
      setNumber: match.set_number,
      compLevel: match.comp_level,
      completedAt: row.completed_at,
      data: rebuiltMatchSchema.parse(row.game_data),
    });
    observations.set(row.team_number, list);
  }
  for (const list of observations.values())
    list.sort((a, b) => {
      const level = (value: string) =>
        ({ qm: 0, ef: 1, qf: 2, sf: 3, f: 4 })[value] ?? 5;
      return (
        level(a.compLevel) - level(b.compLevel) ||
        (a.setNumber ?? 0) - (b.setNumber ?? 0) ||
        a.matchNumber - b.matchNumber ||
        a.matchKey.localeCompare(b.matchKey)
      );
    });
  return { metrics, observations };
}
export function parsePit(input: Json): RebuiltPitData | null {
  const result = rebuiltPitSchema.safeParse(input);
  return result.success ? result.data : null;
}
export function fuelTotal(data: RebuiltMatchData) {
  const auto = data.auto.estimated_fuel_scored,
    teleop = data.teleop.estimated_fuel_scored;
  return auto == null || teleop == null ? null : auto + teleop;
}
export function recentScouting(row: TeamDirectoryRow, limit = 3) {
  return aggregateTeam(
    row.observations.slice(-limit).map((observation) => ({
      eventId: "event",
      matchId: observation.matchId,
      teamNumber: row.teamNumber,
      data: observation.data,
    })),
  );
}
export function worthReviewing(row: TeamDirectoryRow) {
  const human = row.scouting.fuel.total.mean,
    external = row.tba?.components.total_fuel;
  return (
    human != null &&
    external != null &&
    Math.abs(human - external) >= Math.max(10, Math.abs(external) * 0.5)
  );
}
export const emptyScouting = () => aggregateTeam([]);
