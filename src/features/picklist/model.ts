import { z } from "zod";
import type { TeamDirectoryRow } from "@/features/teams/model";
import type { ScoringMechanism } from "@/games/2026-rebuilt/pit-schema";

export function pickTeam(row: TeamDirectoryRow) {
  const recent = row.observations.slice(-3);
  return {
    teamNumber: row.teamNumber,
    nickname: row.nickname,
    mechanism: row.pitMechanism,
    robotWeightLbs: row.pitRobotWeightLbs,
    drivetrain: row.pitDrivetrain,
    pitReported: row.pitReported,
    scouting: row.scouting,
    tba: row.tba,
    statbotics: row.statbotics,
    issueFreeCount: row.observations.filter(
      (o) =>
        o.data.post_match.reliability === "normal" && !o.data.issues?.length,
    ).length,
    recentConcern: recent.some((o) =>
      ["major_issue", "DNF", "DNS"].includes(o.data.post_match.reliability),
    ),
    recentUncertain: recent.filter(
      (o) => o.data.post_match.fuel_estimate_confidence === "very_uncertain",
    ).length,
    records: row.observations.map((o) => ({
      id: o.id,
      matchKey: o.matchKey,
      role: o.data.post_match.observed_role,
      reliability: o.data.post_match.reliability,
      confidence: o.data.post_match.fuel_estimate_confidence,
    })),
  };
}
export type PickTeam = ReturnType<typeof pickTeam>;

export function filterByMechanisms<T extends { mechanism: ScoringMechanism }>(
  rows: readonly T[],
  selected: readonly ScoringMechanism[],
): T[] {
  if (!selected.length) return [...rows];
  const allowed = new Set(selected);
  return rows.filter((row) => allowed.has(row.mechanism));
}

export const profileIds = [
  "offense",
  "support",
  "defense",
  "reliability",
  "auto",
  "complement",
] as const;
export type ProfileId = (typeof profileIds)[number];
export const profileLabels: Record<ProfileId, string> = {
  offense: "Scoring / Offense",
  support: "Support / Shuttling-Passing",
  defense: "Defense",
  reliability: "Reliability",
  auto: "Auto",
  complement: "Complement to our robot",
};
export const metricIds = [
  "fuel",
  "scoring_share",
  "copr_fuel",
  "epa_teleop",
  "passing_share",
  "passer_role",
  "defense_frequency",
  "defense_share",
  "defense_effectiveness",
  "full_match",
  "availability",
  "issue_free",
  "auto_success",
  "auto_fuel",
  "copr_auto",
  "epa_auto",
] as const;
export type MetricId = (typeof metricIds)[number];
type Reading = { value: number | null; sample: number | null };
type Metric = {
  id: MetricId;
  label: string;
  source: "Our scouting" | "TBA" | "Statbotics";
  unit: "FUEL" | "%" | "points";
  group: string;
  description: string;
  read: (row: PickTeam) => Reading;
};
const reading = (value: number | null, sample: number | null): Reading => ({
  value,
  sample,
});
export const metrics: Metric[] = [
  {
    id: "fuel",
    label: "Median total FUEL",
    source: "Our scouting",
    unit: "FUEL",
    group: "offense",
    description:
      "AUTO + TELEOP median; excludes very uncertain, DNS and DNF estimates; both phases required.",
    read: (r) =>
      reading(r.scouting.fuel.total.median, r.scouting.fuel.total.sampleSize),
  },
  {
    id: "scoring_share",
    label: "Scoring time share",
    source: "Our scouting",
    unit: "%",
    group: "offense",
    description:
      "Mean share of timed TELEOP spent scoring; activity is not scoring accuracy.",
    read: (r) =>
      reading(
        r.scouting.activity.scoring.share.mean,
        r.scouting.activity.scoring.share.sampleSize,
      ),
  },
  {
    id: "copr_fuel",
    label: "Total FUEL COPR",
    source: "TBA",
    unit: "FUEL",
    group: "offense",
    description:
      "Cached component OPR; overlaps human FUEL and offensive EPA. Provider sample size unavailable.",
    read: (r) => reading(r.tba?.components.total_fuel ?? null, null),
  },
  {
    id: "epa_teleop",
    label: "TELEOP EPA",
    source: "Statbotics",
    unit: "points",
    group: "offense",
    description:
      "Cached external TELEOP contribution estimate; overlaps human FUEL and COPR. Provider sample size unavailable.",
    read: (r) => reading(r.statbotics?.teleop ?? null, null),
  },
  {
    id: "passing_share",
    label: "Shuttling / passing time share",
    source: "Our scouting",
    unit: "%",
    group: "support",
    description:
      "Mean share of timed TELEOP shuttling/passing; does not measure delivery accuracy.",
    read: (r) =>
      reading(
        r.scouting.activity.shuttling_passing.share.mean,
        r.scouting.activity.shuttling_passing.share.sampleSize,
      ),
  },
  {
    id: "passer_role",
    label: "Passer-Feeder role frequency",
    source: "Our scouting",
    unit: "%",
    group: "support",
    description:
      "Observed Passer-Feeder matches / role observations; overlaps passing activity.",
    read: (r) =>
      reading(
        r.scouting.roles.frequencies.passer_feeder,
        r.scouting.roles.sampleSize,
      ),
  },
  {
    id: "defense_frequency",
    label: "Defense frequency",
    source: "Our scouting",
    unit: "%",
    group: "defense",
    description:
      "Deliberate defense observation or at least five timed defense seconds, among known samples.",
    read: (r) =>
      reading(r.scouting.defense.frequency, r.scouting.defense.sampleSize),
  },
  {
    id: "defense_share",
    label: "Defense time share",
    source: "Our scouting",
    unit: "%",
    group: "defense",
    description: "Mean timed TELEOP defense share; overlaps defense frequency.",
    read: (r) =>
      reading(
        r.scouting.activity.defending.share.mean,
        r.scouting.activity.defending.share.sampleSize,
      ),
  },
  {
    id: "defense_effectiveness",
    label: "Strong defense rating (subjective)",
    source: "Our scouting",
    unit: "%",
    group: "defense-rating",
    description:
      "Strong ratings / rated defense observations. Subjective scout judgment; no rating is not a poor rating.",
    read: (r) =>
      reading(
        r.scouting.defense.effectiveness.frequencies.strong,
        r.scouting.defense.effectiveness.sampleSize,
      ),
  },
  {
    id: "full_match",
    label: "Full-match rate",
    source: "Our scouting",
    unit: "%",
    group: "reliability",
    description:
      "Normal, minor issue or major issue / all observations; DNS and DNF are incomplete. Does not imply issue-free.",
    read: (r) =>
      reading(
        r.scouting.reliability.fullMatchRate,
        r.scouting.reliability.sampleSize,
      ),
  },
  {
    id: "availability",
    label: "Started-match rate",
    source: "Our scouting",
    unit: "%",
    group: "reliability",
    description: "Non-DNS / all observations. Overlaps full-match rate.",
    read: (r) =>
      reading(
        r.scouting.sampleSize
          ? 1 - r.scouting.reliability.counts.DNS / r.scouting.sampleSize
          : null,
        r.scouting.sampleSize,
      ),
  },
  {
    id: "issue_free",
    label: "No observed issue rate",
    source: "Our scouting",
    unit: "%",
    group: "reliability",
    description:
      "Normal reliability and no recorded issue events / all observed matches. Measures reported incidents, not offensive output.",
    read: (r) =>
      reading(
        r.scouting.sampleSize ? r.issueFreeCount / r.scouting.sampleSize : null,
        r.scouting.sampleSize,
      ),
  },
  {
    id: "auto_success",
    label: "Observed auto success",
    source: "Our scouting",
    unit: "%",
    group: "auto-execution",
    description:
      "Successful / known successful, partial or failed results. Pit claims are not scored.",
    read: (r) =>
      reading(
        r.scouting.auto.successfulRate,
        r.scouting.auto.execution.sampleSize,
      ),
  },
  {
    id: "auto_fuel",
    label: "Median AUTO FUEL",
    source: "Our scouting",
    unit: "FUEL",
    group: "auto-output",
    description:
      "Usable observed AUTO output; excludes very uncertain, DNS and DNF estimates.",
    read: (r) =>
      reading(r.scouting.fuel.auto.median, r.scouting.fuel.auto.sampleSize),
  },
  {
    id: "copr_auto",
    label: "AUTO FUEL COPR",
    source: "TBA",
    unit: "FUEL",
    group: "auto-output",
    description:
      "Cached AUTO component OPR; overlaps AUTO FUEL and AUTO EPA. Provider sample size unavailable.",
    read: (r) => reading(r.tba?.components.auto_fuel ?? null, null),
  },
  {
    id: "epa_auto",
    label: "AUTO EPA",
    source: "Statbotics",
    unit: "points",
    group: "auto-output",
    description:
      "Cached AUTO EPA, including non-FUEL points; overlaps AUTO output. Provider sample size unavailable.",
    read: (r) => reading(r.statbotics?.auto ?? null, null),
  },
];
export const profileMetrics: Record<ProfileId, readonly MetricId[]> = {
  offense: ["fuel", "scoring_share", "copr_fuel", "epa_teleop"],
  support: ["passing_share", "passer_role"],
  defense: ["defense_frequency", "defense_share", "defense_effectiveness"],
  reliability: ["full_match", "availability", "issue_free"],
  auto: ["auto_success", "auto_fuel", "copr_auto", "epa_auto"],
  complement: metricIds,
};
export const weightsSchema = z.partialRecord(
  z.enum(metricIds),
  z.number().finite().min(0).max(100),
);
export const profileSchema = z.strictObject({
  weights: weightsSchema,
  minSamples: z.number().int().min(1).max(20),
  minCoverage: z.number().min(0.1).max(1),
});
export const stateSchema = z
  .strictObject({
    profiles: z.record(z.enum(profileIds), profileSchema),
    strategy: z.strictObject({
      strengths: z.string().trim().max(500),
      needs: z.string().trim().max(500),
    }),
    controls: z.record(
      z.string().regex(/^[1-9]\d*$/),
      z
        .strictObject({
          favorite: z.boolean(),
          excluded: z.boolean(),
          note: z.string().trim().max(500),
        })
        .refine(
          (c) => !c.excluded || c.note.length > 0,
          "Excluded teams require a reason.",
        ),
    ),
    manualOrder: z
      .array(z.number().int().positive())
      .max(1000)
      .refine((a) => new Set(a).size === a.length),
  })
  .superRefine((s, ctx) => {
    for (const p of profileIds)
      for (const key of Object.keys(s.profiles[p].weights) as MetricId[])
        if (!profileMetrics[p].includes(key))
          ctx.addIssue({
            code: "custom",
            message: `Metric ${key} does not belong to ${p}.`,
          });
  });
export type PicklistState = z.infer<typeof stateSchema>;
export type Profile = z.infer<typeof profileSchema>;
export function defaultState(): PicklistState {
  const profile = (weights: Profile["weights"]): Profile => ({
    weights,
    minSamples: 3,
    minCoverage: 0.7,
  });
  return {
    profiles: {
      offense: profile({ fuel: 100 }),
      support: profile({ passing_share: 100 }),
      defense: profile({ defense_frequency: 100 }),
      reliability: profile({ full_match: 100 }),
      auto: profile({ auto_success: 75, auto_fuel: 25 }),
      complement: profile({}),
    },
    strategy: { strengths: "", needs: "" },
    controls: {},
    manualOrder: [],
  };
}
/** Midrank percentile: ties share a rank; an equal/single-value cohort is neutral. */
export function percentile(
  value: number,
  population: readonly number[],
): number {
  if (
    !Number.isFinite(value) ||
    !population.length ||
    population.some((v) => !Number.isFinite(v))
  )
    throw new Error("Finite values and a nonempty cohort are required.");
  if (population.length === 1) return 50;
  const tied = (v: number) =>
    Math.abs(v - value) <= 1e-9 * Math.max(1, Math.abs(v), Math.abs(value));
  const below = population.filter((v) => v < value && !tied(v)).length;
  const equal = population.filter(tied).length;
  return (100 * (below + (equal - 1) / 2)) / (population.length - 1);
}
export function correlatedWarnings(profile: Profile) {
  const enabled = metrics.filter((m) => (profile.weights[m.id] ?? 0) > 0);
  const groups = [...new Set(enabled.map((m) => m.group))];
  const warnings = groups.flatMap((g) => {
    const group = enabled.filter((m) => m.group === g);
    return group.length > 1
      ? [
          `Related inputs: ${group.map((m) => m.label).join(" + ")}. Their evidence may overlap.`,
        ]
      : [];
  });
  if (
    enabled.some((m) => m.id === "fuel" || m.id === "copr_fuel") &&
    enabled.some((m) => ["auto_fuel", "copr_auto", "epa_auto"].includes(m.id))
  )
    warnings.push(
      "Total FUEL already includes AUTO; enabling both can count AUTO output twice.",
    );
  return warnings;
}
export type Contribution = {
  id: MetricId;
  label: string;
  source: Metric["source"];
  unit: Metric["unit"];
  raw: number | null;
  sample: number | null;
  peers: number;
  normalized: number | null;
  weight: number;
  effectiveWeight: number;
  points: number | null;
  treatment: string;
};
export type ScoredTeam = {
  teamNumber: number;
  score: number | null;
  coverage: number;
  reason: string | null;
  contributions: Contribution[];
};
export function scoreTeams(
  rows: readonly PickTeam[],
  profile: Profile,
  configured = true,
): ScoredTeam[] {
  const enabled = metrics.filter((m) => (profile.weights[m.id] ?? 0) > 0);
  const usable = (m: Metric, r: Reading) =>
    r.value !== null &&
    Number.isFinite(r.value) &&
    (m.source !== "Our scouting" || (r.sample ?? 0) >= profile.minSamples);
  const cohorts = new Map(
    enabled.map((m) => [
      m.id,
      rows
        .map(m.read)
        .filter((r) => usable(m, r))
        .map((r) => r.value!),
    ]),
  );
  const totalWeight = enabled.reduce(
    (s, m) => s + (profile.weights[m.id] ?? 0),
    0,
  );
  return rows.map((row) => {
    const contributions: Contribution[] = enabled.map((m) => {
      const r = m.read(row),
        population = cohorts.get(m.id)!;
      const normalized = usable(m, r) ? percentile(r.value!, population) : null;
      return {
        id: m.id,
        label: m.label,
        source: m.source,
        unit: m.unit,
        raw: r.value,
        sample: r.sample,
        peers: population.length,
        normalized,
        weight: profile.weights[m.id]!,
        effectiveWeight: 0,
        points: null,
        treatment:
          r.value === null
            ? "Missing; omitted"
            : normalized === null
              ? `Below ${profile.minSamples} samples; omitted`
              : m.source === "Our scouting"
                ? "Included"
                : "Included; provider sample size unavailable",
      };
    });
    const availableWeight = contributions
      .filter((c) => c.normalized !== null)
      .reduce((s, c) => s + c.weight, 0);
    const coverage = totalWeight ? availableWeight / totalWeight : 0;
    for (const c of contributions)
      if (c.normalized !== null && availableWeight > 0) {
        c.effectiveWeight = c.weight / availableWeight;
        c.points = c.normalized * c.effectiveWeight;
      }
    const reason = !configured
      ? "Configure our needs first"
      : !totalWeight
        ? "All metrics disabled"
        : !availableWeight
          ? "No usable metrics"
          : coverage + 1e-9 < profile.minCoverage
            ? "Insufficient metric coverage"
            : null;
    return {
      teamNumber: row.teamNumber,
      score: reason
        ? null
        : contributions.reduce((s, c) => s + (c.points ?? 0), 0),
      coverage,
      reason,
      contributions,
    };
  });
}
export function manualOrder(
  roster: readonly number[],
  saved: readonly number[],
) {
  const valid = new Set(roster);
  return [
    ...new Set([
      ...saved.filter((n) => valid.has(n)),
      ...[...roster].sort((a, b) => a - b),
    ]),
  ];
}
export function moveTeam(
  order: readonly number[],
  team: number,
  target: number,
) {
  if (!order.includes(team)) return [...order];
  const result = order.filter((n) => n !== team);
  result.splice(Math.max(0, Math.min(result.length, target)), 0, team);
  return result;
}
export const rawLabel = (c: Pick<Contribution, "raw" | "unit">) =>
  c.raw === null
    ? "—"
    : c.unit === "%"
      ? `${(c.raw * 100).toFixed(1)}%`
      : `${c.raw.toFixed(1)} ${c.unit}`;
