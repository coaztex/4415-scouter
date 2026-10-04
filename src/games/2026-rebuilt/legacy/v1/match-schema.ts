import { z } from "zod";
import {
  climbLevel,
  conciseNote,
  issueCategory,
  observationCount,
  phase,
  yesNoUnknown,
  uniqueItems,
} from "./shared";

const issue = z.strictObject({
  id: z.string().uuid(),
  phase,
  // Null means timing was not recorded. Relative to this phase's start.
  atSeconds: z.number().finite().min(0).max(600).nullable(),
  observed: z.strictObject({
    category: issueCategory,
    description: conciseNote.optional(),
  }),
  recovered: yesNoUnknown.optional(),
  // Added later by an authorized reviewer; never inferred from symptoms.
  confirmedCause: z
    .strictObject({
      category: issueCategory,
      evidence: conciseNote,
      confirmedByUserId: z.string().uuid(),
      confirmedAt: z.string().datetime({ offset: true }),
    })
    .optional(),
});
const shuffleEvent = z.strictObject({
  id: z.string().uuid(),
  phase,
  atSeconds: z.number().finite().min(0).max(600).nullable(),
});
const phaseObservation = z.strictObject({
  fuelScored: observationCount.nullable(),
  shuffleCount: observationCount.nullable(),
});
const defense = z.discriminatedUnion("amount", [
  z.strictObject({ amount: z.literal("none") }),
  z.strictObject({
    amount: z.enum(["some", "heavy"]),
    effectiveness: z.enum(["poor", "okay", "strong"]),
  }),
]);
const climb = z.discriminatedUnion("observation", [
  z.strictObject({
    observation: z.enum(["unknown", "not_observed", "observed_no_attempt"]),
  }),
  z.strictObject({
    observation: z.literal("attempted"),
    achievedLevel: climbLevel.optional(),
  }),
]);

export const rebuiltMatchSchema = z
  .strictObject({
    auto: phaseObservation.extend({
      movement: z.enum(["normal", "limited", "failed"]).nullable(),
    }),
    teleop: phaseObservation,
    // Only recorded occurrences; missing log is not proof of no shuffling/issues.
    shuffleEvents: z.array(shuffleEvent).max(500).optional(),
    issues: z.array(issue).max(100).optional(),
    postMatch: z.strictObject({
      defense: defense.nullable(),
      reliability: z
        .enum(["normal", "minor_issue", "major_issue", "DNF", "DNS"])
        .nullable(),
      driverControl: z.enum(["rough", "normal", "strong"]).optional(),
      climb: climb.optional(),
      importantNote: conciseNote.optional(),
    }),
  })
  .superRefine((data, ctx) => {
    const events = [...(data.shuffleEvents ?? []), ...(data.issues ?? [])];
    if (!uniqueItems(events.map((event) => event.id)))
      ctx.addIssue({
        code: "custom",
        message: "Observation event IDs must be unique.",
        path: ["shuffleEvents"],
      });
    for (const key of ["auto", "teleop"] as const) {
      const recorded =
        data.shuffleEvents?.filter((event) => event.phase === key).length ?? 0;
      const count = data[key].shuffleCount;
      if (recorded > 0 && (count === null || count < recorded))
        ctx.addIssue({
          code: "custom",
          message: "Shuffle count must include recorded occurrences.",
          path: [key, "shuffleCount"],
        });
    }
    if (
      data.postMatch.reliability === "DNS" &&
      ((data.auto.fuelScored ?? 0) > 0 ||
        (data.teleop.fuelScored ?? 0) > 0 ||
        (data.auto.shuffleCount ?? 0) > 0 ||
        (data.teleop.shuffleCount ?? 0) > 0 ||
        data.postMatch.climb?.observation === "attempted" ||
        (data.postMatch.defense !== null &&
          data.postMatch.defense.amount !== "none"))
    )
      ctx.addIssue({
        code: "custom",
        message:
          "DNS cannot include observed scoring, shuffling, defense, or climb attempts.",
        path: ["postMatch", "reliability"],
      });
  });

export type RebuiltMatchData = z.infer<typeof rebuiltMatchSchema>;
// Pure configuration for future controls; no form or per-click database writes.
export const matchCaptureConfig = {
  fuelIncrements: [5, 10, 20],
  allowUndo: true,
  shuffleIncrements: [1],
  driverControlRequired: false,
  climbPriority: "low",
} as const;
