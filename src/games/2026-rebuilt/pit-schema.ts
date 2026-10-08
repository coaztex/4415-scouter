import { z } from "zod";
import {
  climbLevel,
  conciseNote,
  uniqueItems,
  yesNoUnknown,
  observationCount,
} from "./shared";
import { autoClimb } from "./match-schema";
import { drivetrains, scoringMechanisms } from "./pit-options";
export { scoringMechanisms, scoringMechanismLabels } from "./pit-options";
export type { ScoringMechanism } from "./pit-options";
export const scoringMechanismSchema = z.enum(scoringMechanisms);
export const drivetrainSchema = z.enum(drivetrains);
export const rebuiltPitBaseSchema = z.strictObject({
  photo_media_ids: z.array(z.uuid()).max(10).refine(uniqueItems).optional(),
  drivetrain: drivetrainSchema,
  robot_weight_lbs: z.number().finite().positive().nullable().default(null),
  primary_scoring_mechanism: scoringMechanismSchema.default("unknown"),
  other_shooter_type: z.string().trim().max(80).optional(),
  fuel_capacity: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("approximate_count"),
      amount: observationCount,
    }),
    z.strictObject({
      kind: z.literal("band"),
      band: z.enum(["low", "medium", "high", "unknown"]),
    }),
  ]),
  preferred_scoring_areas: z
    .array(z.enum(["close", "mid", "far"]))
    .max(3)
    .refine(uniqueItems)
    .nullable(),
  shoot_while_moving: yesNoUnknown,
  traversal: z
    .array(z.enum(["trench", "bump"]))
    .max(2)
    .refine(uniqueItems)
    .nullable(),
  climbing: z.discriminatedUnion("capability", [
    z.strictObject({ capability: z.enum(["none", "unknown"]) }),
    z.strictObject({
      capability: z.literal("yes"),
      highest_demonstrated_level: climbLevel.optional(),
    }),
  ]),
  autonomous_routines: z
    .array(
      z.strictObject({
        id: z.uuid(),
        name: z.string().trim().min(1).max(80).optional(),
        start_side: z.enum(["left", "center", "right", "unknown"]),
        scores_fuel: yesNoUnknown,
        collects_additional_fuel: yesNoUnknown,
        climb: autoClimb.optional(),
        reliability_claim: z.enum([
          "untested",
          "inconsistent",
          "usually",
          "consistent",
          "unknown",
        ]),
        note: conciseNote.optional(),
      }),
    )
    .max(20)
    .refine((rows) => uniqueItems(rows.map((row) => row.id)))
    .nullable(),
  strategy_note: conciseNote.optional(),
});
export const rebuiltPitSchema = rebuiltPitBaseSchema.superRefine(
  (data, ctx) => {
    if (
      data.primary_scoring_mechanism === "other" &&
      !data.other_shooter_type?.trim()
    )
      ctx.addIssue({
        code: "custom",
        path: ["other_shooter_type"],
        message: "Describe the other shooter type.",
      });
    if (
      data.primary_scoring_mechanism !== "other" &&
      data.other_shooter_type?.trim()
    )
      ctx.addIssue({
        code: "custom",
        path: ["other_shooter_type"],
        message: "Other shooter type belongs only with Other.",
      });
  },
);
export type RebuiltPitData = z.infer<typeof rebuiltPitSchema>;
