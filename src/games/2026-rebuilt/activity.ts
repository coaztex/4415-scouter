import { z } from "zod";
export const activityStates = [
  "scoring",
  "shuttling_passing",
  "defending",
  "other_idle",
] as const;
export const activityState = z.enum(activityStates);
export type ActivityState = z.infer<typeof activityState>;
export const activityTimelineSchema = z
  .strictObject({
    duration_seconds: z.number().finite().min(0).max(600),
    transitions: z
      .array(
        z.strictObject({
          at_seconds: z.number().finite().min(0).max(600),
          state: activityState,
        }),
      )
      .max(500),
  })
  .superRefine((value, ctx) => {
    const transitions = value.transitions;
    if (value.duration_seconds === 0) {
      if (transitions.length)
        ctx.addIssue({
          code: "custom",
          message: "A zero-length observation has no periods.",
        });
      return;
    }
    if (!transitions.length || transitions[0].at_seconds !== 0)
      ctx.addIssue({
        code: "custom",
        message: "A timeline must start at zero with one active state.",
      });
    transitions.forEach((entry, i) => {
      if (
        entry.at_seconds >= value.duration_seconds ||
        (i > 0 &&
          (entry.at_seconds <= transitions[i - 1].at_seconds ||
            entry.state === transitions[i - 1].state))
      )
        ctx.addIssue({
          code: "custom",
          path: ["transitions", i],
          message:
            "State changes must advance time, change state, and precede the observation end.",
        });
    });
  });
export type ActivityTimeline = z.infer<typeof activityTimelineSchema>;
/** A transition ends the previous period; overlaps/gaps cannot be represented. */
export function deriveActivity(input: ActivityTimeline) {
  const timeline = activityTimelineSchema.parse(input);
  const seconds: Record<ActivityState, number> = {
    scoring: 0,
    shuttling_passing: 0,
    defending: 0,
    other_idle: 0,
  };
  const periods = { ...seconds };
  timeline.transitions.forEach((entry, i) => {
    seconds[entry.state] +=
      (timeline.transitions[i + 1]?.at_seconds ?? timeline.duration_seconds) -
      entry.at_seconds;
    periods[entry.state]++;
  });
  const shares = Object.fromEntries(
    activityStates.map((state) => [
      state,
      timeline.duration_seconds > 0
        ? seconds[state] / timeline.duration_seconds
        : null,
    ]),
  ) as Record<ActivityState, number | null>;
  return {
    duration_seconds: timeline.duration_seconds,
    seconds,
    periods,
    shares,
  };
}
export const meaningfulDefenseSeconds = 5;
