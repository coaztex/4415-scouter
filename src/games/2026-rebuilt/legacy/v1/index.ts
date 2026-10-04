import type { GameModule } from "../../../core/module";
import {
  aggregateTeam,
  aggregateEvent,
  type RebuiltAggregate,
} from "./aggregate";
import { rebuiltMatchSchema, type RebuiltMatchData } from "./match-schema";
import { rebuiltPitSchema, type RebuiltPitData } from "./pit-schema";
import { rebuiltMetrics } from "./presentation";

export const rebuilt2026V1 = {
  slug: "2026-rebuilt",
  year: 2026,
  displayName: "REBUILT",
  schemaVersion: 1,
  matchSchema: rebuiltMatchSchema,
  pitSchema: rebuiltPitSchema,
  parseMatch: (input: unknown) => rebuiltMatchSchema.parse(input),
  parsePit: (input: unknown) => rebuiltPitSchema.parse(input),
  aggregateTeam,
  aggregateEvent,
  metrics: rebuiltMetrics,
  features: {
    matchPrep: {
      metricIds: [
        "fuel.auto.mean",
        "fuel.teleop.mean",
        "shuffle.total.frequency",
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
