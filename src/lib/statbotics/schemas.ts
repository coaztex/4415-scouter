import { z } from "zod";

export const statboticsEventKey = z
  .string()
  .regex(/^[0-9]{4}[a-z0-9]+$/)
  .max(40);
const metric = z.number().finite().nullish();
// Verified in upstream breakdown.py and TeamEvent.to_dict(); no inferred aliases.
export const statbotics2026Components = z.object({
  auto_fuel: metric,
  auto_tower: metric,
  transition_fuel: metric,
  first_shift_fuel: metric,
  second_shift_fuel: metric,
  endgame_fuel: metric,
  endgame_tower: metric,
  teleop_fuel: metric,
  total_fuel: metric,
  total_tower: metric,
});
export function parseStatbotics2026Components(input: unknown) {
  const value = statbotics2026Components.parse(input ?? {});
  return {
    auto_fuel: value.auto_fuel ?? null,
    auto_tower: value.auto_tower ?? null,
    transition_fuel: value.transition_fuel ?? null,
    first_shift_fuel: value.first_shift_fuel ?? null,
    second_shift_fuel: value.second_shift_fuel ?? null,
    endgame_fuel: value.endgame_fuel ?? null,
    endgame_tower: value.endgame_tower ?? null,
    teleop_fuel: value.teleop_fuel ?? null,
    total_fuel: value.total_fuel ?? null,
    total_tower: value.total_tower ?? null,
  };
}
export const teamEventSchema = z.object({
  team: z.number().int().positive(),
  event: statboticsEventKey,
  epa: z
    .object({
      total_points: z
        .union([z.number().finite(), z.object({ mean: metric }).passthrough()])
        .nullish(),
      breakdown: z
        .object({
          auto_points: metric,
          teleop_points: metric,
          endgame_points: metric,
        })
        .passthrough()
        .nullish(),
    })
    .passthrough()
    .nullish(),
  // The provider's `time` is event ordering time, NOT a modification timestamp.
  updated_at: z.iso.datetime({ offset: true }).nullish(),
});
export function normalizeTeamEvent(input: unknown) {
  const row = teamEventSchema.parse(input);
  const total = row.epa?.total_points;
  return {
    team_number: row.team,
    event_key: row.event,
    epa_total: typeof total === "number" ? total : (total?.mean ?? null),
    epa_auto: row.epa?.breakdown?.auto_points ?? null,
    epa_teleop: row.epa?.breakdown?.teleop_points ?? null,
    epa_endgame: row.epa?.breakdown?.endgame_points ?? null,
    source_updated_at: row.updated_at ?? null,
    components_2026: row.event.startsWith("2026")
      ? parseStatbotics2026Components(row.epa?.breakdown)
      : null,
    // Source-specific bounded EPA payload; record/predictions have no consumer.
    payload: { normalization_version: 2, epa: row.epa ?? null },
  };
}
export type StatboticsMetric = ReturnType<typeof normalizeTeamEvent>;
