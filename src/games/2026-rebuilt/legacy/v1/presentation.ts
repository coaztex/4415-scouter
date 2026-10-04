import type { MetricDefinition } from "../../../core/module";

export const rebuiltMetrics: readonly MetricDefinition[] = [
  {
    id: "sampleSize",
    label: "Observed matches",
    description: "Selected final team/match observations.",
    format: "integer",
  },
  ...(["auto", "teleop", "total"] as const).flatMap((phase) => [
    ...(
      ["mean", "median", "best", "standardDeviation", "sampleSize"] as const
    ).map((stat): MetricDefinition => ({
      id: `fuel.${phase}.${stat}`,
      label: `${phase.toUpperCase()} FUEL ${stat === "standardDeviation" ? "spread (SD)" : stat}`,
      description:
        stat === "standardDeviation"
          ? "Population standard deviation of observed FUEL. Lower spread is more consistent; read alongside mean and sample size."
          : "Estimated scored FUEL; null observations excluded, zero observations included.",
      format: stat === "sampleSize" ? "integer" : "decimal",
      unit: stat === "sampleSize" ? "observations" : "FUEL",
      ...(stat === "sampleSize"
        ? {}
        : { higherIsBetter: stat !== "standardDeviation" }),
    })),
    {
      id: `shuffle.${phase}.frequency`,
      label: `${phase.toUpperCase()} shuffle frequency`,
      description:
        "Fraction of known observations with at least one shuffle; no automatic better/worse judgment.",
      format: "percent" as const,
    },
    {
      id: `shuffle.${phase}.mean`,
      label: `${phase.toUpperCase()} shuffles per match`,
      description: "Mean known shuffle count, including zeros.",
      format: "decimal" as const,
    },
    {
      id: `shuffle.${phase}.sampleSize`,
      label: `${phase.toUpperCase()} shuffle sample`,
      description: "Number of known shuffle counts.",
      format: "integer" as const,
    },
  ]),
  {
    id: "defense.frequency",
    label: "Defense frequency",
    description: "Some/heavy defense divided by known defense observations.",
    format: "percent",
  },
  {
    id: "defense.effectiveness.strongRate",
    label: "Strong defense rate",
    description: "Strong effectiveness among matches with observed defense.",
    format: "percent",
    higherIsBetter: true,
  },
  {
    id: "reliability.fullMatchRate",
    label: "Full-match rate",
    description:
      "Normal/minor/major issue finishes divided by known statuses, including DNF and DNS.",
    format: "percent",
    higherIsBetter: true,
  },
  {
    id: "reliability.normalRate",
    label: "Issue-free rate",
    description:
      "Normal statuses divided by known statuses, including DNF and DNS.",
    format: "percent",
    higherIsBetter: true,
  },
  {
    id: "reliability.startedCompletionRate",
    label: "Completion when started",
    description: "Completed matches divided by known statuses excluding DNS.",
    format: "percent",
    higherIsBetter: true,
  },
];
