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
    strategyBoard: {
      phases: [
        { id: "auto", label: "Auto" },
        { id: "transition", label: "Transition" },
        { id: "active_hub_1", label: "Active HUB 1" },
        { id: "inactive_hub_1", label: "Inactive HUB 1" },
        { id: "active_hub_2", label: "Active HUB 2" },
        { id: "inactive_hub_2", label: "Inactive HUB 2" },
        { id: "endgame", label: "Endgame" },
      ],
      field: {
        width: 1000,
        // Keep the existing horizontal drawing units; map normalized Y to
        // the approved image's exact intrinsic ratio without changing documents.
        height: (1000 * 3240) / 7992,
        backgroundAsset: "/fields/2026-field-gray.png",
        label: "2026 REBUILT field",
        // Image-relative anchors beside the approved image's printed stations.
        stationLabels: {
          R1: { x: 0.235, y: 0.16 },
          R2: { x: 0.235, y: 0.36 },
          R3: { x: 0.235, y: 0.7 },
          B1: { x: 0.765, y: 0.84 },
          B2: { x: 0.765, y: 0.64 },
          B3: { x: 0.765, y: 0.3 },
        },
      },
    },
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
