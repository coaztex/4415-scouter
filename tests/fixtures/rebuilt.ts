import type { RebuiltMatchData } from "../../src/games/2026-rebuilt/match-schema";
import type { RebuiltPitData } from "../../src/games/2026-rebuilt/pit-schema";
export function matchData(): RebuiltMatchData {
  return {
    auto: {
      estimated_fuel_scored: 0,
      start_position: "unknown",
      execution_result: "successful",
      collected_additional_fuel: "unknown",
      climb: { result: "none" },
    },
    teleop: {
      estimated_fuel_scored: 0,
      activity: {
        duration_seconds: 140,
        transitions: [{ at_seconds: 0, state: "other_idle" }],
      },
    },
    post_match: {
      observed_role: "scorer",
      defense_observed: false,
      reliability: "normal",
      climb: "none",
      fuel_estimate_confidence: "good",
    },
  };
}
export function pitData(): RebuiltPitData {
  return {
    drivetrain: "unknown",
    robot_weight_lbs: null,
    primary_scoring_mechanism: "unknown",
    fuel_capacity: { kind: "band", band: "unknown" },
    preferred_scoring_areas: null,
    shoot_while_moving: "unknown",
    traversal: null,
    climbing: { capability: "unknown" },
    autonomous_routines: null,
  };
}
