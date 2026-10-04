import { z } from "zod";
const count = z.number().int().nonnegative().nullish();
const tower = z.string().nullish();
const allianceSchema = z.object({
  hubScore: z
    .object({ autoCount: count, teleopCount: count, totalCount: count })
    .nullish(),
  autoTowerPoints: count,
  endGameTowerPoints: count,
  totalTowerPoints: count,
  autoTowerRobot1: tower,
  autoTowerRobot2: tower,
  autoTowerRobot3: tower,
  endGameTowerRobot1: tower,
  endGameTowerRobot2: tower,
  endGameTowerRobot3: tower,
});
/** Exact TBA 2026 fields, verified against the recorded 2026cascmp fixture. Counts, not total points. */
export function parseOfficialAlliance2026(input: unknown) {
  const parsed = allianceSchema.safeParse(input);
  if (!parsed.success) return null;
  const d = parsed.data;
  return {
    fuel: {
      auto: d.hubScore?.autoCount ?? null,
      teleop: d.hubScore?.teleopCount ?? null,
      total: d.hubScore?.totalCount ?? null,
    },
    tower: {
      autoPoints: d.autoTowerPoints ?? null,
      endgamePoints: d.endGameTowerPoints ?? null,
      totalPoints: d.totalTowerPoints ?? null,
      autoRobots: [
        d.autoTowerRobot1 ?? null,
        d.autoTowerRobot2 ?? null,
        d.autoTowerRobot3 ?? null,
      ],
      endgameRobots: [
        d.endGameTowerRobot1 ?? null,
        d.endGameTowerRobot2 ?? null,
        d.endGameTowerRobot3 ?? null,
      ],
    },
  };
}
export type OfficialAlliance2026 = NonNullable<
  ReturnType<typeof parseOfficialAlliance2026>
>;
export const tba2026CoprKeys = {
  auto_fuel: "Hub Auto Fuel Count",
  teleop_fuel: "Hub Teleop Fuel Count",
  total_fuel: "Hub Total Fuel Count",
  auto_tower_points: "autoTowerPoints",
  endgame_tower_points: "endGameTowerPoints",
  total_tower_points: "totalTowerPoints",
} as const;
/** Input is one team's component map as persisted in external_team_metrics.payload.coprs. */
export function parseCopr2026(input: unknown) {
  const parsed = z.record(z.string(), z.number().finite()).safeParse(input);
  const raw = parsed.success ? parsed.data : {};
  return Object.fromEntries(
    Object.entries(tba2026CoprKeys).map(([key, source]) => [
      key,
      raw[source] ?? null,
    ]),
  ) as Record<keyof typeof tba2026CoprKeys, number | null>;
}
