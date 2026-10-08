import { z } from "zod";
import {
  emptyPitMapLayout,
  pitAssignmentSchema,
  pitMapLayoutSchema,
  withPitAssignments,
  type PitAssignment,
} from "@/features/pit-map/model";

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const teamNumber = (value: unknown) => {
  const number =
    typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  const parsed = z.number().int().positive().safeParse(number);
  return parsed.success ? parsed.data : null;
};
const label = (value: unknown) => {
  const parsed = z.string().trim().min(1).max(200).safeParse(value);
  return parsed.success ? parsed.data : null;
};

/** All source assignment compatibility lives here, never in callers or UI. */
export function normalizeNexusAssignments(input: unknown) {
  const warnings: string[] = [];
  const root = object(input);
  const array = Array.isArray(input)
    ? input
    : Array.isArray(root?.pits)
      ? root.pits
      : null;
  const candidates: { teamNumber: number | null; pitLabel: string | null }[] =
    [];
  if (input === null || input === undefined)
    return { assignments: [] as PitAssignment[], warnings };
  if (array) {
    for (const value of array.slice(0, 2000)) {
      const row = object(value);
      candidates.push({
        teamNumber: teamNumber(
          row?.teamNumber ?? row?.team_number ?? row?.team ?? row?.number,
        ),
        pitLabel: label(
          row?.pitLabel ??
            row?.pit_label ??
            row?.pitAddress ??
            row?.pit ??
            row?.location ??
            row?.address ??
            row?.label,
        ),
      });
    }
    if (array.length > 2000)
      throw new Error("Nexus pit assignments exceed the supported size.");
  } else if (root && !Object.hasOwn(root, "pits")) {
    const entries = Object.entries(root);
    if (entries.length > 2000)
      throw new Error("Nexus pit assignments exceed the supported size.");
    for (const [key, value] of entries)
      candidates.push({ teamNumber: teamNumber(key), pitLabel: label(value) });
  } else throw new Error("Nexus pit assignments have an unsupported shape.");
  const byTeam = new Map<number, PitAssignment>();
  const ambiguous = new Set<number>();
  for (const candidate of candidates) {
    const parsed = pitAssignmentSchema.safeParse(candidate);
    if (!parsed.success) {
      warnings.push("An invalid pit assignment was omitted.");
      continue;
    }
    const row = parsed.data;
    if (
      byTeam.has(row.teamNumber) &&
      byTeam.get(row.teamNumber)!.pitLabel !== row.pitLabel
    )
      ambiguous.add(row.teamNumber);
    byTeam.set(row.teamNumber, row);
  }
  for (const number of ambiguous) {
    byTeam.delete(number);
    warnings.push("Conflicting pit assignments were omitted.");
  }
  return {
    assignments: [...byTeam.values()].sort(
      (a, b) => a.teamNumber - b.teamNumber,
    ),
    warnings: [...new Set(warnings)],
  };
}

const rectangle = z.object({
  position: z.object({ x: z.number().finite(), y: z.number().finite() }),
  size: z.object({
    x: z.number().finite().positive(),
    y: z.number().finite().positive(),
  }),
});
const rect = (input: unknown) => {
  const parsed = rectangle.safeParse(input);
  return parsed.success
    ? {
        x: parsed.data.position.x,
        y: parsed.data.position.y,
        width: parsed.data.size.x,
        height: parsed.data.size.y,
      }
    : null;
};

/** Normalize Nexus geometry and join its pit addresses to canonical assignments. */
export function normalizeNexusPitMap(
  assignmentsInput: unknown,
  mapInput: unknown,
) {
  const result = normalizeNexusAssignments(assignmentsInput);
  const warnings = [...result.warnings];
  const layout = emptyPitMapLayout();
  const root = object(mapInput);
  const size = z
    .object({
      x: z.number().finite().positive(),
      y: z.number().finite().positive(),
    })
    .safeParse(root?.size);
  if (mapInput !== null && mapInput !== undefined && !size.success)
    warnings.push("Nexus graphical map dimensions are unavailable or invalid.");
  if (!root || !size.success)
    return { layout: withPitAssignments(layout, result.assignments), warnings };
  layout.width = size.data.x;
  layout.height = size.data.y;
  const entries = (key: string) => {
    if (root[key] === null || root[key] === undefined) return [];
    const section = object(root[key]);
    if (!section) {
      warnings.push(`Invalid optional ${key} data was omitted.`);
      return [];
    }
    if (Object.keys(section).length > 2000)
      throw new Error("Nexus map exceeds the supported size.");
    return Object.entries(section);
  };
  const mapAssignments: PitAssignment[] = [];
  for (const [id, value] of entries("pits")) {
    const shape = rect(value),
      pitLabel = label(id),
      row = object(value);
    if (!shape || !pitLabel) {
      warnings.push("Invalid pit geometry was omitted.");
      continue;
    }
    const number = teamNumber(row?.team);
    layout.pits.push({ id: pitLabel, pitLabel, teamNumber: number, ...shape });
    if (number !== null) mapAssignments.push({ teamNumber: number, pitLabel });
  }
  for (const [, value] of entries("walls")) {
    const shape = rect(value);
    if (shape) layout.walls.push(shape);
    else warnings.push("Invalid wall geometry was omitted.");
  }
  for (const [, value] of entries("areas")) {
    const shape = rect(value),
      areaLabel = label(object(value)?.label);
    if (shape && areaLabel) layout.areas.push({ ...shape, label: areaLabel });
    else warnings.push("Invalid area geometry was omitted.");
  }
  for (const [, value] of entries("labels")) {
    const row = object(value),
      text = label(row?.label);
    const position = z
      .object({ x: z.number().finite(), y: z.number().finite() })
      .safeParse(row?.position);
    if (text && position.success)
      layout.labels.push({ text, ...position.data });
    else warnings.push("Invalid map label was omitted.");
  }
  for (const [, value] of entries("arrows")) {
    const shape = rect(value),
      angle = z
        .number()
        .finite()
        .safeParse(object(value)?.angle ?? 0);
    if (shape && angle.success)
      layout.arrows.push({ ...shape, angle: angle.data });
    else warnings.push("Invalid arrow geometry was omitted.");
  }
  const mapped = normalizeNexusAssignments(mapAssignments);
  warnings.push(...mapped.warnings);
  const explicitTeams = new Set(
    result.assignments.map((row) => row.teamNumber),
  );
  const explicitLabels = new Set(result.assignments.map((row) => row.pitLabel));
  const assignments = [
    ...result.assignments,
    ...mapped.assignments.filter(
      (row) =>
        !explicitTeams.has(row.teamNumber) && !explicitLabels.has(row.pitLabel),
    ),
  ].sort((a, b) => a.teamNumber - b.teamNumber);
  return {
    layout: pitMapLayoutSchema.parse(withPitAssignments(layout, assignments)),
    warnings: [...new Set(warnings)],
  };
}
