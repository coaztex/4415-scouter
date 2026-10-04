import type { RebuiltMatchData } from "../../src/games/2026-rebuilt/legacy/v1/match-schema";
import type { RebuiltPitData } from "../../src/games/2026-rebuilt/legacy/v1/pit-schema";

export function matchData(): RebuiltMatchData {
  return {
    auto: { fuelScored: 0, movement: "normal", shuffleCount: 0 },
    teleop: { fuelScored: 0, shuffleCount: 0 },
    postMatch: { defense: { amount: "none" }, reliability: "normal" },
  };
}
export function pitData(): RebuiltPitData {
  return {
    drivetrain: "unknown",
    fuelCapacity: { band: "unknown" },
    preferredScoringAreas: null,
    shootWhileMoving: "unknown",
    traversal: null,
    climbing: { capability: "unknown" },
    autonomousRoutines: null,
  };
}
