import { z } from "zod";

const coordinate = z.number().finite();
const dimension = z.number().finite().positive();
const text = z.string().trim().min(1).max(200);
const rectangle = z.object({
  x: coordinate,
  y: coordinate,
  width: dimension,
  height: dimension,
});
export const pitAssignmentSchema = z.object({
  teamNumber: z.number().int().positive(),
  pitLabel: text,
});
export const pitMapLayoutSchema = z
  .object({
    schemaVersion: z.literal(1),
    width: dimension.nullable(),
    height: dimension.nullable(),
    pits: z
      .array(
        rectangle.extend({
          id: text,
          teamNumber: z.number().int().positive().nullable(),
          pitLabel: text.nullable(),
        }),
      )
      .max(2000),
    walls: z.array(rectangle).max(2000),
    areas: z.array(rectangle.extend({ label: text })).max(2000),
    labels: z.array(z.object({ text, x: coordinate, y: coordinate })).max(2000),
    arrows: z.array(rectangle.extend({ angle: coordinate })).max(2000),
    assignments: z
      .array(pitAssignmentSchema)
      .max(2000)
      .refine(
        (rows) => new Set(rows.map((r) => r.teamNumber)).size === rows.length,
      ),
  })
  .superRefine((map, ctx) => {
    if ((map.width === null) !== (map.height === null))
      ctx.addIssue({
        code: "custom",
        message: "Map dimensions must both be known or unknown.",
      });
    if (
      map.width === null &&
      [map.pits, map.walls, map.areas, map.labels, map.arrows].some(
        (rows) => rows.length,
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Geometry requires map dimensions.",
      });
    if (new Set(map.pits.map((pit) => pit.id)).size !== map.pits.length)
      ctx.addIssue({ code: "custom", message: "Pit IDs must be unique." });
  });
export type PitMapLayout = z.infer<typeof pitMapLayoutSchema>;
export type PitMapPit = PitMapLayout["pits"][number];
export type PitMapWall = PitMapLayout["walls"][number];
export type PitMapArea = PitMapLayout["areas"][number];
export type PitMapLabel = PitMapLayout["labels"][number];
export type PitMapArrow = PitMapLayout["arrows"][number];
export type PitAssignment = z.infer<typeof pitAssignmentSchema>;
export type EventPitMap = PitMapLayout & {
  eventId: string;
  source: "nexus" | "manual";
  sourceEventKey: string | null;
  fetchedAt: string;
};
export function emptyPitMapLayout(): PitMapLayout {
  return {
    schemaVersion: 1,
    width: null,
    height: null,
    pits: [],
    walls: [],
    areas: [],
    labels: [],
    arrows: [],
    assignments: [],
  };
}
export function hasPitGeometry(layout: PitMapLayout | null) {
  return !!layout && layout.width !== null && layout.height !== null;
}
export function pitAssignmentsByTeam(
  map: Pick<PitMapLayout, "assignments"> | null,
) {
  return new Map(
    (map?.assignments ?? []).map((row) => [row.teamNumber, row.pitLabel]),
  );
}
export function withPitAssignments(
  layout: PitMapLayout,
  assignments: PitAssignment[],
): PitMapLayout {
  const teamsByLabel = new Map<string, number[]>();
  for (const assignment of assignments)
    teamsByLabel.set(assignment.pitLabel, [
      ...(teamsByLabel.get(assignment.pitLabel) ?? []),
      assignment.teamNumber,
    ]);
  return {
    ...layout,
    assignments,
    pits: layout.pits.map((pit) => {
      const teams = teamsByLabel.get(pit.pitLabel ?? pit.id) ?? [];
      return { ...pit, teamNumber: teams.length === 1 ? teams[0] : null };
    }),
  };
}
