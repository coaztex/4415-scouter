import type {
  Drivetrain,
  ScoringMechanism,
} from "@/games/2026-rebuilt/pit-options";
import { filterByMechanisms } from "./model";

/** Local viewing controls, independent of saved profile weights and manual order. */
export type PitSpecFilters = {
  minWeight: string;
  maxWeight: string;
  drivetrains: Drivetrain[];
  shooters: ScoringMechanism[];
};
export const emptyPitSpecFilters = (): PitSpecFilters => ({
  minWeight: "",
  maxWeight: "",
  drivetrains: [],
  shooters: [],
});
export type PicklistOrder =
  "computed" | "manual" | "weight_asc" | "weight_desc";

export function weightRange(
  filters: Pick<PitSpecFilters, "minWeight" | "maxWeight">,
) {
  const min =
    filters.minWeight.trim() === "" ? null : Number(filters.minWeight);
  const max =
    filters.maxWeight.trim() === "" ? null : Number(filters.maxWeight);
  const error = [min, max].some(
    (v) => v !== null && (!Number.isFinite(v) || v < 0),
  )
    ? "Enter a finite, non-negative weight limit."
    : min !== null && max !== null && min > max
      ? "Minimum weight must be less than or equal to maximum weight."
      : null;
  return { min, max, error };
}
type PitSpecs = {
  robotWeightLbs: number | null;
  drivetrain: Drivetrain;
  mechanism: ScoringMechanism;
};
export function filterByPitSpecs<T extends PitSpecs>(
  rows: readonly T[],
  filters: PitSpecFilters,
): T[] {
  const { min, max, error } = weightRange(filters);
  if (error) return [];
  return filterByMechanisms(rows, filters.shooters).filter(
    (row) =>
      (!filters.drivetrains.length ||
        filters.drivetrains.includes(row.drivetrain)) &&
      ((min === null && max === null) ||
        (row.robotWeightLbs !== null &&
          (min === null || row.robotWeightLbs >= min) &&
          (max === null || row.robotWeightLbs <= max))),
  );
}
/** Missing weight sorts last in both directions. Equal weights use the normal profile order. */
export function compareRobotWeight(
  a: number | null,
  b: number | null,
  order: "weight_asc" | "weight_desc",
) {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return order === "weight_asc" ? a - b : b - a;
}
