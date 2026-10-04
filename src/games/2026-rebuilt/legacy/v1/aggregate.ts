import type { AggregateSubmission, EventAggregate } from "../../../core/module";
import { rate, summarize } from "../../../core/statistics";
import { rebuiltMatchSchema, type RebuiltMatchData } from "./match-schema";

type Submission = AggregateSubmission<RebuiltMatchData>;

function combined(a: number | null, b: number | null) {
  return a === null || b === null ? null : a + b;
}
function frequency(values: readonly (number | null)[]) {
  const known = values.filter((v): v is number => v !== null);
  const matchesWithShuffle = known.filter((v) => v > 0).length;
  return {
    ...summarize(values),
    matchesWithShuffle,
    frequency: rate(matchesWithShuffle, known.length),
  };
}

function calculate(data: readonly RebuiltMatchData[]) {
  const defense = data.flatMap((d) =>
    d.postMatch.defense === null ? [] : [d.postMatch.defense],
  );
  const defending = defense.filter((d) => d.amount !== "none");
  const status = data.flatMap((d) =>
    d.postMatch.reliability === null ? [] : [d.postMatch.reliability],
  );
  const reliabilityCounts = {
    normal: 0,
    minor_issue: 0,
    major_issue: 0,
    DNF: 0,
    DNS: 0,
  };
  for (const s of status) reliabilityCounts[s]++;
  const completed =
    reliabilityCounts.normal +
    reliabilityCounts.minor_issue +
    reliabilityCounts.major_issue;
  const effectiveness = { poor: 0, okay: 0, strong: 0 };
  for (const d of defending) effectiveness[d.effectiveness]++;
  return {
    sampleSize: data.length,
    fuel: {
      auto: summarize(data.map((d) => d.auto.fuelScored)),
      teleop: summarize(data.map((d) => d.teleop.fuelScored)),
      total: summarize(
        data.map((d) => combined(d.auto.fuelScored, d.teleop.fuelScored)),
      ),
    },
    shuffle: {
      auto: frequency(data.map((d) => d.auto.shuffleCount)),
      teleop: frequency(data.map((d) => d.teleop.shuffleCount)),
      total: frequency(
        data.map((d) => combined(d.auto.shuffleCount, d.teleop.shuffleCount)),
      ),
    },
    defense: {
      sampleSize: defense.length,
      defendedMatches: defending.length,
      frequency: rate(defending.length, defense.length),
      amount: {
        none: defense.filter((d) => d.amount === "none").length,
        some: defense.filter((d) => d.amount === "some").length,
        heavy: defense.filter((d) => d.amount === "heavy").length,
      },
      effectiveness: {
        sampleSize: defending.length,
        counts: effectiveness,
        strongRate: rate(effectiveness.strong, defending.length),
      },
    },
    reliability: {
      sampleSize: status.length,
      counts: reliabilityCounts,
      // Full match is completion, not absence of issues. DNS counts against attendance.
      fullMatchRate: rate(completed, status.length),
      normalRate: rate(reliabilityCounts.normal, status.length),
      startedCompletionRate: rate(
        completed,
        status.length - reliabilityCounts.DNS,
      ),
    },
  };
}
export type RebuiltAggregate = ReturnType<typeof calculate>;

function validated(
  submissions: readonly Submission[],
  singleTeam: boolean,
): Submission[] {
  const seen = new Set<string>();
  const event = submissions[0]?.eventId;
  const team = submissions[0]?.teamNumber;
  return submissions.map((submission) => {
    if (
      !submission.eventId ||
      !submission.matchId ||
      !Number.isSafeInteger(submission.teamNumber) ||
      submission.teamNumber < 1
    )
      throw new Error("Invalid aggregate submission identity.");
    if (
      submission.eventId !== event ||
      (singleTeam && submission.teamNumber !== team)
    )
      throw new Error(
        "Aggregate inputs must share an event and, for team metrics, a team.",
      );
    const identity = JSON.stringify([
      submission.matchId,
      submission.teamNumber,
    ]);
    if (seen.has(identity))
      throw new Error(
        "Select one canonical final observation per team/match before aggregating.",
      );
    seen.add(identity);
    return { ...submission, data: rebuiltMatchSchema.parse(submission.data) };
  });
}

export function aggregateTeam(
  submissions: readonly Submission[],
): RebuiltAggregate {
  return calculate(
    validated(submissions, true).map((submission) => submission.data),
  );
}
export function aggregateEvent(
  submissions: readonly Submission[],
): EventAggregate<RebuiltAggregate> {
  const observations = validated(submissions, false);
  const teams = new Map<number, RebuiltMatchData[]>();
  for (const observation of observations) {
    const group = teams.get(observation.teamNumber) ?? [];
    group.push(observation.data);
    teams.set(observation.teamNumber, group);
  }
  return {
    eventId: observations[0]?.eventId ?? null,
    overall: calculate(observations.map((observation) => observation.data)),
    teams: [...teams.entries()]
      .sort(([a], [b]) => a - b)
      .map(([teamNumber, data]) => ({ teamNumber, metrics: calculate(data) })),
  };
}
