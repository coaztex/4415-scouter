import { z } from "zod";
import { climbLevel, conciseNote, uniqueItems, yesNoUnknown } from "./shared";

const routine = z.strictObject({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80).optional(),
  startSide: z.enum(["left", "center", "right", "unknown"]),
  scoresFuel: yesNoUnknown,
  collectsAdditionalFuel: yesNoUnknown,
  climb: z.enum(["yes", "no"]).optional(),
  reliabilityClaim: z.enum([
    "untested",
    "inconsistent",
    "usually",
    "consistent",
    "unknown",
  ]),
  note: conciseNote.optional(),
});

export const rebuiltPitSchema = z.strictObject({
  // Stable media record references, never a signed URL or image bytes.
  photoMediaIds: z
    .array(z.string().uuid())
    .max(10)
    .refine(uniqueItems)
    .optional(),
  drivetrain: z.enum(["swerve", "tank", "other", "unknown"]),
  fuelCapacity: z.strictObject({
    band: z.enum(["low", "medium", "high", "unknown"]),
    volunteeredExact: z
      .union([
        z.number().int().min(0).max(10000),
        z.string().trim().min(1).max(100),
      ])
      .optional(),
  }),
  // Null = unknown/not asked; [] = explicitly none reported.
  preferredScoringAreas: z
    .array(z.enum(["close", "mid", "far"]))
    .max(3)
    .refine(uniqueItems)
    .nullable(),
  shootWhileMoving: yesNoUnknown,
  traversal: z
    .array(z.enum(["trench", "bump"]))
    .max(2)
    .refine(uniqueItems)
    .nullable(),
  // Optional tactical detail, not another required yes/no question.
  shufflingNote: conciseNote.optional(),
  climbing: z.discriminatedUnion("capability", [
    z.strictObject({ capability: z.enum(["none", "unknown"]) }),
    z.strictObject({
      capability: z.literal("yes"),
      highestDemonstratedLevel: climbLevel.optional(),
    }),
  ]),
  autonomousRoutines: z
    .array(routine)
    .max(20)
    .refine((routines) => uniqueItems(routines.map((item) => item.id)))
    .nullable(),
  strategyNote: conciseNote.optional(),
});
export type RebuiltPitData = z.infer<typeof rebuiltPitSchema>;
