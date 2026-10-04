import type { AggregateSubmission, EventAggregate } from "../core/module";
import { rate, summarize } from "../core/statistics";
import {
  rebuiltMatchSchema,
  observedRoles,
  reliabilityStatuses,
  type RebuiltMatchData,
} from "./match-schema";
import {
  activityStates,
  deriveActivity,
  meaningfulDefenseSeconds,
} from "./activity";

type Submission = AggregateSubmission<RebuiltMatchData>;
export type AggregateOptions = { includeVeryUncertainFuel?: boolean };
function distribution<T extends string>(
  values: readonly T[],
  keys: readonly T[],
) {
  const counts = Object.fromEntries(keys.map((key) => [key, 0])) as Record<
    T,
    number
  >;
  for (const value of values) counts[value]++;
  const most = Math.max(0, ...Object.values<number>(counts));
  const modes = most > 0 ? keys.filter((key) => counts[key] === most) : [];
  return {
    sampleSize: values.length,
    counts,
    frequencies: Object.fromEntries(
      keys.map((key) => [key, rate(counts[key], values.length)]),
    ) as Record<T, number | null>,
    // Ties have no single winner; do not privilege declaration order.
    mostCommon: modes.length === 1 ? modes[0] : null,
    modes,
  };
}
function total(d: RebuiltMatchData) {
  const a = d.auto.estimated_fuel_scored,
    b = d.teleop.estimated_fuel_scored;
  return a === null || b === null ? null : a + b;
}
function calculate(
  data: readonly RebuiltMatchData[],
  options: AggregateOptions,
) {
  const fuel = data.filter(
    (d) =>
      d.post_match.reliability !== "DNS" &&
      d.post_match.reliability !== "DNF" &&
      (options.includeVeryUncertainFuel ||
        d.post_match.fuel_estimate_confidence !== "very_uncertain"),
  );
  const activities = data.map((d) =>
    d.teleop.activity === null || d.teleop.activity.duration_seconds === 0
      ? null
      : deriveActivity(d.teleop.activity),
  );
  const activity = Object.fromEntries(
    activityStates.map((state) => {
      const known = activities.flatMap((a) => (a === null ? [] : [a]));
      return [
        state,
        {
          seconds: summarize(known.map((a) => a.seconds[state])),
          share: summarize(known.map((a) => a.shares[state])),
          periods: summarize(known.map((a) => a.periods[state])),
          frequency: rate(
            known.filter((a) => a.periods[state] > 0).length,
            known.length,
          ),
        },
      ];
    }),
  ) as Record<
    (typeof activityStates)[number],
    {
      seconds: ReturnType<typeof summarize>;
      share: ReturnType<typeof summarize>;
      periods: ReturnType<typeof summarize>;
      frequency: number | null;
    }
  >;
  const defenseKnown = data.filter(
    (d, i) => d.post_match.defense_observed || activities[i] !== null,
  );
  const defending = data.filter(
    (d, i) =>
      d.post_match.defense_observed ||
      (activities[i]?.seconds.defending ?? 0) >= meaningfulDefenseSeconds,
  );
  const statuses = distribution(
    data.map((d) => d.post_match.reliability),
    reliabilityStatuses,
  );
  const completed =
    statuses.counts.normal +
    statuses.counts.minor_issue +
    statuses.counts.major_issue;
  const autoResults = distribution(
    data.flatMap((d) =>
      d.auto.execution_result === null ? [] : [d.auto.execution_result],
    ),
    ["successful", "partial", "failed"] as const,
  );
  const collection = data.filter(
    (d) =>
      d.post_match.reliability !== "DNS" &&
      d.auto.collected_additional_fuel !== "unknown",
  );
  const issues = data.flatMap((d) => d.issues ?? []);
  const issueCategories = [
    "disabled",
    "communications",
    "drivetrain",
    "intake",
    "shooter_scorer",
    "tipped",
    "other",
  ] as const;
  return {
    sampleSize: data.length,
    fuel: {
      confidentSampleSize: data.filter(
        (d) =>
          d.post_match.reliability !== "DNS" &&
          d.post_match.reliability !== "DNF" &&
          d.post_match.fuel_estimate_confidence !== "very_uncertain" &&
          total(d) !== null,
      ).length,
      veryUncertainSampleSize: data.filter(
        (d) => d.post_match.fuel_estimate_confidence === "very_uncertain",
      ).length,
      excludedDnfSampleSize: data.filter(
        (d) => d.post_match.reliability === "DNF" && total(d) !== null,
      ).length,
      auto: summarize(fuel.map((d) => d.auto.estimated_fuel_scored)),
      teleop: summarize(fuel.map((d) => d.teleop.estimated_fuel_scored)),
      total: summarize(fuel.map(total)),
    },
    activity,
    defense: {
      sampleSize: defenseKnown.length,
      defendedMatches: defending.length,
      frequency: rate(defending.length, defenseKnown.length),
      effectiveness: distribution(
        defending.flatMap((d) =>
          d.post_match.defense_effectiveness
            ? [d.post_match.defense_effectiveness]
            : [],
        ),
        ["poor", "average", "strong"] as const,
      ),
    },
    roles: distribution(
      data.map((d) => d.post_match.observed_role),
      observedRoles,
    ),
    auto: {
      execution: autoResults,
      successfulRate: autoResults.frequencies.successful,
      partialRate: autoResults.frequencies.partial,
      failedRate: autoResults.frequencies.failed,
      additionalFuel: {
        sampleSize: collection.length,
        frequency: rate(
          collection.filter((d) => d.auto.collected_additional_fuel === "yes")
            .length,
          collection.length,
        ),
      },
    },
    driverControl: distribution(
      data.flatMap((d) =>
        d.post_match.driver_control && d.post_match.driver_control !== "unknown"
          ? [d.post_match.driver_control]
          : [],
      ),
      ["rough", "average", "strong"] as const,
    ),
    reliability: {
      ...statuses,
      fullMatchRate: rate(completed, data.length),
      normalRate: rate(statuses.counts.normal, data.length),
      startedCompletionRate: rate(completed, data.length - statuses.counts.DNS),
    },
    issues: {
      eventCount: issues.length,
      matchesWithIssues: data.filter((d) => (d.issues?.length ?? 0) > 0).length,
      observed: distribution(
        issues.map((i) => i.observed.category),
        issueCategories,
      ),
    },
    climb: {
      auto: distribution(
        data.flatMap((d) => (d.auto.climb ? [d.auto.climb.result] : [])),
        ["none", "attempted", "achieved"] as const,
      ),
      postMatch: distribution(
        data.flatMap((d) => (d.post_match.climb ? [d.post_match.climb] : [])),
        ["none", "attempted", "level_1", "level_2", "level_3"] as const,
      ),
    },
  };
}
export type RebuiltAggregate = ReturnType<typeof calculate>;

function validated(
  submissions: readonly Submission[],
  singleTeam: boolean,
): Submission[] {
  const seen = new Set<string>(),
    event = submissions[0]?.eventId,
    team = submissions[0]?.teamNumber;
  return submissions.map((s) => {
    if (
      !s.eventId ||
      !s.matchId ||
      !Number.isSafeInteger(s.teamNumber) ||
      s.teamNumber < 1
    )
      throw new Error("Invalid aggregate submission identity.");
    if (s.eventId !== event || (singleTeam && s.teamNumber !== team))
      throw new Error(
        "Aggregate inputs must share an event and, for team metrics, a team.",
      );
    const key = JSON.stringify([s.matchId, s.teamNumber]);
    if (seen.has(key))
      throw new Error(
        "Select one canonical final observation per team/match before aggregating.",
      );
    seen.add(key);
    return { ...s, data: rebuiltMatchSchema.parse(s.data) };
  });
}
export function aggregateTeam(
  submissions: readonly Submission[],
  options: AggregateOptions = {},
): RebuiltAggregate {
  return calculate(
    validated(submissions, true).map((s) => s.data),
    options,
  );
}
export function aggregateEvent(
  submissions: readonly Submission[],
  options: AggregateOptions = {},
): EventAggregate<RebuiltAggregate> {
  const observations = validated(submissions, false),
    teams = new Map<number, RebuiltMatchData[]>();
  for (const s of observations) {
    const group = teams.get(s.teamNumber) ?? [];
    group.push(s.data);
    teams.set(s.teamNumber, group);
  }
  return {
    eventId: observations[0]?.eventId ?? null,
    overall: calculate(
      observations.map((s) => s.data),
      options,
    ),
    teams: [...teams.entries()]
      .sort(([a], [b]) => a - b)
      .map(([teamNumber, data]) => ({
        teamNumber,
        metrics: calculate(data, options),
      })),
  };
}
