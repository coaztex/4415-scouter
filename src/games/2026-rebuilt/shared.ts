import { z } from "zod";

export const yesNoUnknown = z.enum(["yes", "no", "unknown"]);
export const climbLevel = z.enum(["level_1", "level_2", "level_3"]);
export const conciseNote = z.string().trim().min(1).max(500);
export const observationCount = z.number().int().min(0).max(10000);
export const issueCategory = z.enum([
  "disabled",
  "communications",
  "drivetrain",
  "intake",
  "shooter_scorer",
  "tipped",
  "other",
]);
export const phase = z.enum(["auto", "teleop"]);

export function uniqueItems<T>(values: readonly T[]) {
  return new Set(values).size === values.length;
}
