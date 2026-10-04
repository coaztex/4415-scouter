import { z } from "zod";
import {
  rebuiltMatchSchema,
  matchCaptureConfig,
  issueSchema,
  type RebuiltMatchData,
} from "@/games/2026-rebuilt/match-schema";
import {
  activityState,
  activityTimelineSchema,
  deriveActivity,
  meaningfulDefenseSeconds,
  type ActivityState,
} from "@/games/2026-rebuilt/activity";

export const captureIdentitySchema = z.object({
  assignmentId: z.uuid(),
  actorId: z.uuid(),
  assignedScoutId: z.uuid(),
  matchId: z.uuid(),
  teamNumber: z.number().int().positive(),
});
export type CaptureIdentity = z.infer<typeof captureIdentitySchema>;
export type CaptureContext = CaptureIdentity & {
  eventId: string;
  eventKey: string;
  matchKey: string;
  alliance: string;
  station: number;
  override: boolean;
  submitted: boolean;
};
export const draftSchema = z.strictObject({
  format: z.literal(1),
  gameSlug: z.literal("2026-rebuilt"),
  schemaVersion: z.literal(2),
  identity: captureIdentitySchema,
  clientSubmissionId: z.uuid(),
  phase: z.enum(["auto", "teleop", "post"]),
  startedMs: z.number().finite().nonnegative(),
  teleopStartedMs: z.number().finite().nullable(),
  completedMs: z.number().finite().nullable(),
  lastClockMs: z.number().finite(),
  timingFault: z.string().nullable(),
  transitions: z
    .array(
      z.object({
        at_seconds: z.number().finite().min(0).max(600),
        state: activityState,
      }),
    )
    .max(500),
  autoUndo: z.array(z.number().int().positive()).max(10000),
  teleopUndo: z.array(z.number().int().positive()).max(10000),
  data: rebuiltMatchSchema,
});
export type MatchDraft = z.infer<typeof draftSchema>;
export function freshDraft(
  identity: CaptureIdentity,
  now: number,
  uuid: string,
): MatchDraft {
  return {
    format: 1,
    gameSlug: "2026-rebuilt",
    schemaVersion: 2,
    identity,
    clientSubmissionId: uuid,
    phase: "auto",
    startedMs: now,
    teleopStartedMs: null,
    completedMs: null,
    lastClockMs: now,
    timingFault: null,
    transitions: [],
    autoUndo: [],
    teleopUndo: [],
    data: {
      auto: {
        estimated_fuel_scored: 0,
        start_position: "unknown",
        execution_result: null,
        collected_additional_fuel: "unknown",
        climb: { result: "none" },
      },
      teleop: { estimated_fuel_scored: 0, activity: null },
      issues: [],
      post_match: {
        observed_role: "mixed",
        defense_observed: false,
        reliability: "normal",
        climb: "none",
        fuel_estimate_confidence: "rough",
        driver_control: "unknown",
      },
    },
  };
}
export function draftKey(identity: CaptureIdentity) {
  return `frc:match:v2:${identity.actorId}:${identity.assignmentId}`;
}
export function recoverDraft(
  raw: string,
  identity: CaptureIdentity,
): MatchDraft {
  const draft = draftSchema.parse(JSON.parse(raw));
  for (const phase of ["auto", "teleop"] as const) {
    const history = phase === "auto" ? draft.autoUndo : draft.teleopUndo;
    if (
      history.reduce((sum, n) => sum + n, 0) !==
      (draft.data[phase].estimated_fuel_scored ?? 0)
    )
      throw new Error(
        "The saved FUEL total and undo history disagree. Preserve this draft for review.",
      );
  }
  for (const key of Object.keys(identity) as (keyof CaptureIdentity)[])
    if (draft.identity[key] !== identity[key])
      throw new Error(
        "This draft belongs to a different assignment, scout, or robot. Keep it for review; do not attach it to the current assignment.",
      );
  if (draft.phase === "teleop" && draft.teleopStartedMs === null)
    throw new Error("Draft timing metadata is missing.");
  if (draft.phase === "teleop") {
    const last = draft.transitions.at(-1)?.at_seconds;
    if (last === undefined) throw new Error("Draft activity state is missing.");
    // Validate ordering with a synthetic bound only for inspection, never store a duration.
    activityTimelineSchema.parse({
      duration_seconds: last + 0.001,
      transitions: draft.transitions,
    });
  }
  return draft;
}
export function fuel(
  draft: MatchDraft,
  amount: 1 | 5 | 10 | 20 | "undo",
): MatchDraft {
  if (draft.phase === "post") return draft;
  const phase = draft.phase,
    key = phase === "auto" ? "autoUndo" : "teleopUndo";
  const history = [...draft[key]];
  let total = draft.data[phase].estimated_fuel_scored ?? 0;
  if (amount === "undo") total -= history.pop() ?? 0;
  else {
    if (
      !matchCaptureConfig.fuelIncrements.includes(amount) ||
      total + amount > 10000
    )
      return draft;
    history.push(amount);
    total += amount;
  }
  return {
    ...draft,
    [key]: history,
    data: {
      ...draft.data,
      [phase]: { ...draft.data[phase], estimated_fuel_scored: total },
    },
  };
}
export function addObservedIssue(
  draft: MatchDraft,
  input: unknown,
): MatchDraft {
  const issue = issueSchema.parse(input);
  if (issue.confirmed_cause)
    throw new Error("Scouts capture observations, not confirmed causes.");
  if ((draft.data.issues?.length ?? 0) >= 100)
    throw new Error(
      "Issue limit reached. Review existing issues in Post-match.",
    );
  return {
    ...draft,
    data: { ...draft.data, issues: [...(draft.data.issues ?? []), issue] },
  };
}
function clockError(draft: MatchDraft, now: number) {
  return !Number.isFinite(now) ||
    now < draft.lastClockMs ||
    now < draft.startedMs
    ? "The device clock moved backwards. Your draft is preserved."
    : null;
}
export function activity(
  draft: MatchDraft,
  state: ActivityState,
  now: number,
): MatchDraft {
  if (
    draft.phase !== "teleop" ||
    draft.timingFault ||
    draft.teleopStartedMs === null
  )
    return draft;
  const fault = clockError(draft, now),
    at = (now - draft.teleopStartedMs) / 1000,
    last = draft.transitions.at(-1)!;
  if (fault || at > 600)
    return {
      ...draft,
      timingFault:
        fault ??
        "The activity window exceeds the module's timing limit. Your draft is preserved.",
    };
  if (state === last.state) return { ...draft, lastClockMs: now };
  if (at <= last.at_seconds)
    return {
      ...draft,
      timingFault:
        "Two activity changes have invalid or equal times. Your draft is preserved; no interval was invented.",
    };
  if (draft.transitions.length >= 500)
    return {
      ...draft,
      timingFault:
        "The activity transition limit was reached. Your draft is preserved.",
    };
  return {
    ...draft,
    lastClockMs: now,
    transitions: [...draft.transitions, { at_seconds: at, state }],
  };
}
export function advance(draft: MatchDraft, now: number): MatchDraft {
  if (draft.phase === "post") return draft;
  const fault = clockError(draft, now);
  if (fault) return { ...draft, timingFault: fault };
  if (draft.timingFault) return draft;
  if (draft.phase === "auto") {
    if (draft.data.auto.execution_result === null)
      throw new Error("Choose the observed Auto execution result first.");
    return {
      ...draft,
      phase: "teleop",
      teleopStartedMs: now,
      lastClockMs: now,
      transitions: [{ at_seconds: 0, state: "other_idle" }],
    };
  }
  const timeline = activityTimelineSchema.safeParse({
    duration_seconds: (now - draft.teleopStartedMs!) / 1000,
    transitions: draft.transitions,
  });
  if (!timeline.success)
    return {
      ...draft,
      timingFault:
        "Activity times are invalid. The draft is preserved; review timing before submission.",
    };
  return {
    ...draft,
    phase: "post",
    completedMs: now,
    lastClockMs: now,
    data: {
      ...draft.data,
      teleop: { ...draft.data.teleop, activity: timeline.data },
    },
  };
}
export function needsDefense(data: RebuiltMatchData) {
  return (
    data.post_match.defense_observed ||
    (data.teleop.activity !== null &&
      deriveActivity(data.teleop.activity).seconds.defending >=
        meaningfulDefenseSeconds)
  );
}
export function finalPayload(draft: MatchDraft): RebuiltMatchData {
  if (
    draft.phase !== "post" ||
    draft.completedMs === null ||
    draft.completedMs < draft.startedMs ||
    draft.timingFault
  )
    throw new Error(
      "Complete the phases and resolve timing errors before submitting. Your draft is saved.",
    );
  const data = rebuiltMatchSchema.parse(draft.data);
  if (needsDefense(data) && !data.post_match.defense_effectiveness)
    throw new Error(
      "Choose defense effectiveness for the defense you observed.",
    );
  if (data.issues?.some((i) => i.confirmed_cause))
    throw new Error("Confirmed causes belong to a later reviewer workflow.");
  return data;
}
export function markDns(draft: MatchDraft, now: number): MatchDraft {
  if (clockError(draft, now))
    throw new Error(
      "Correct the device clock before marking DNS. Draft preserved.",
    );
  return {
    ...draft,
    phase: "post",
    completedMs: now,
    lastClockMs: now,
    timingFault: null,
    transitions: [],
    autoUndo: [],
    teleopUndo: [],
    data: {
      ...draft.data,
      auto: {
        ...draft.data.auto,
        estimated_fuel_scored: null,
        execution_result: null,
        collected_additional_fuel: "unknown",
        climb: { result: "none" },
      },
      teleop: { estimated_fuel_scored: null, activity: null },
      post_match: {
        ...draft.data.post_match,
        observed_role: "inactive",
        reliability: "DNS",
        defense_observed: false,
        defense_effectiveness: undefined,
        climb: "none",
      },
    },
  };
}
/** Explicit recovery option: keep estimates/issues, discard invalid timing as unknown. */
export function omitTiming(draft: MatchDraft, now: number): MatchDraft {
  if (clockError(draft, now))
    throw new Error(
      "Correct the device clock before continuing. Draft preserved.",
    );
  return {
    ...draft,
    phase: "post",
    completedMs: now,
    lastClockMs: now,
    timingFault: null,
    data: {
      ...draft.data,
      teleop: { ...draft.data.teleop, activity: null },
      issues: draft.data.issues?.map((i) =>
        i.phase === "teleop" ? { ...i, at_seconds: null } : i,
      ),
    },
  };
}
