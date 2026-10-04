import type { GameModule } from "../core/module";
import {
  aggregateTeam,
  aggregateEvent,
  type RebuiltAggregate,
} from "./aggregate";
import { rebuiltMatchSchema, type RebuiltMatchData } from "./match-schema";
import { rebuiltPitSchema, type RebuiltPitData } from "./pit-schema";
import { rebuiltMetrics } from "./presentation";

export const rebuilt2026 = {
  slug: "2026-rebuilt",
  year: 2026,
  displayName: "REBUILT",
  schemaVersion: 2,
  matchSchema: rebuiltMatchSchema,
  pitSchema: rebuiltPitSchema,
  parseMatch: (input: unknown) => rebuiltMatchSchema.parse(input),
  parsePit: (input: unknown) => rebuiltPitSchema.parse(input),
  summarizeMatch: (input: unknown) => {
    const data = rebuiltMatchSchema.parse(input);
    const role = {
      scorer: "Scorer",
      passer_feeder: "Passer-Feeder",
      defender: "Defender",
      mixed: "Mixed",
      inactive: "Inactive",
    }[data.post_match.observed_role];
    return [
      role,
      `Auto: ${data.auto.execution_result ?? "unknown"}`,
      `Reliability: ${data.post_match.reliability.replaceAll("_", " ")}`,
    ];
  },
  aggregateTeam,
  aggregateEvent,
  metrics: rebuiltMetrics,
  features: {
    matchPrep: {
      metricIds: [
        "fuel.auto.mean",
        "fuel.teleop.mean",
        "activity.shuttling_passing.frequency",
        "defense.frequency",
        "reliability.fullMatchRate",
      ],
    },
    picklist: {
      metricIds: [
        "fuel.total.mean",
        "fuel.total.standardDeviation",
        "reliability.fullMatchRate",
      ],
      defaultSortMetric: "fuel.total.mean",
    },
  },
} satisfies GameModule<RebuiltMatchData, RebuiltPitData, RebuiltAggregate>;
