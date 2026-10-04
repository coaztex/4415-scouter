import { z } from "zod";
import {
  conciseNote,
  issueCategory,
  observationCount,
  phase,
  yesNoUnknown,
  uniqueItems,
} from "./shared";
import {
  activityTimelineSchema,
  deriveActivity,
  meaningfulDefenseSeconds,
} from "./activity";
export const autoClimb = z.discriminatedUnion("result", [
  z.strictObject({ result: z.enum(["none", "attempted"]) }),
  z.strictObject({
    result: z.literal("achieved"),
    achieved_level: z.literal("level_1").optional(),
  }),
]);
export const observedRoles = [
  "scorer",
  "passer_feeder",
  "defender",
  "mixed",
  "inactive",
] as const;
export const reliabilityStatuses = [
  "normal",
  "minor_issue",
  "major_issue",
  "DNF",
  "DNS",
] as const;
export const issueSchema = z.strictObject({
  id: z.uuid(),
  phase,
  at_seconds: z.number().finite().min(0).max(600).nullable(),
  observed: z.strictObject({
    category: issueCategory,
    description: conciseNote.optional(),
  }),
  recovered: yesNoUnknown.optional(),
  // Reviewer-only provenance: submission services must separately authorize writes.
  confirmed_cause: z
    .strictObject({
      category: issueCategory,
      evidence: conciseNote,
      confirmed_by_user_id: z.uuid(),
      confirmed_at: z.iso.datetime({ offset: true }),
    })
    .optional(),
});
export const rebuiltMatchSchema = z
  .strictObject({
    auto: z.strictObject({
      estimated_fuel_scored: observationCount.nullable(),
      start_position: z.enum(["left", "center", "right", "unknown"]),
      execution_result: z.enum(["successful", "partial", "failed"]).nullable(),
      collected_additional_fuel: yesNoUnknown,
      climb: autoClimb.nullable(),
    }),
    teleop: z.strictObject({
      estimated_fuel_scored: observationCount.nullable(),
      // null means not timed; zero duration is not a full-match observation.
      activity: activityTimelineSchema.nullable(),
    }),
    issues: z.array(issueSchema).max(100).optional(),
    post_match: z.strictObject({
      observed_role: z.enum(observedRoles),
      defense_observed: z.boolean(),
      defense_effectiveness: z.enum(["poor", "average", "strong"]).optional(),
      reliability: z.enum(reliabilityStatuses),
      recovered: yesNoUnknown.optional(),
      driver_control: z
        .enum(["rough", "average", "strong", "unknown"])
        .optional(),
      climb: z
        .enum(["none", "attempted", "level_1", "level_2", "level_3"])
        .nullable(),
      fuel_estimate_confidence: z.enum(["good", "rough", "very_uncertain"]),
      important_note: conciseNote.optional(),
    }),
  })
  .superRefine((data, ctx) => {
    if (!uniqueItems((data.issues ?? []).map((issue) => issue.id)))
      ctx.addIssue({
        code: "custom",
        path: ["issues"],
        message: "Issue IDs must be unique.",
      });
    const timeline = activityTimelineSchema.safeParse(data.teleop.activity);
    const defense = timeline.success
      ? deriveActivity(timeline.data).seconds.defending
      : 0;
    if (
      data.post_match.defense_effectiveness &&
      !data.post_match.defense_observed &&
      defense < meaningfulDefenseSeconds
    )
      ctx.addIssue({
        code: "custom",
        path: ["post_match", "defense_effectiveness"],
        message:
          "Rate defense only after meaningful timed defense or deliberate observation.",
      });
    for (const [i, issue] of (data.issues ?? []).entries()) {
      if (
        issue.phase === "teleop" &&
        timeline.success &&
        issue.at_seconds !== null &&
        issue.at_seconds > timeline.data.duration_seconds
      )
        ctx.addIssue({
          code: "custom",
          path: ["issues", i, "at_seconds"],
          message: "Issue time exceeds the observed teleop window.",
        });
    }
    if (
      data.post_match.reliability === "DNS" &&
      (data.auto.estimated_fuel_scored !== null ||
        data.teleop.estimated_fuel_scored !== null ||
        data.teleop.activity !== null ||
        data.auto.execution_result !== null ||
        data.auto.collected_additional_fuel === "yes" ||
        (data.auto.climb !== null && data.auto.climb.result !== "none") ||
        data.post_match.observed_role !== "inactive" ||
        data.post_match.defense_observed ||
        (data.post_match.climb !== null && data.post_match.climb !== "none"))
    )
      ctx.addIssue({
        code: "custom",
        path: ["post_match", "reliability"],
        message:
          "DNS has no offensive estimates/timeline or observed field actions. Use null, not zero.",
      });
  });
export type RebuiltMatchData = z.infer<typeof rebuiltMatchSchema>;
export const matchCaptureConfig = {
  fuelIncrements: [1, 5, 10, 20],
  allowUndo: true,
  driverControlRequired: false,
  climbPriority: "low",
} as const;
