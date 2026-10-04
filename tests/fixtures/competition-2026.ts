import type { RebuiltMatchData } from "../../src/games/2026-rebuilt/match-schema";
import { matchData } from "./rebuilt";

/** Entirely fictional teams/event; never imported by application code or seeded. */
export const syntheticEventKey = "2026synthetic";
export const syntheticMatchKey = `${syntheticEventKey}_qm7`;

export const syntheticTbaMatch = {
  key: syntheticMatchKey,
  event_key: syntheticEventKey,
  comp_level: "qm",
  set_number: 1,
  match_number: 7,
  winning_alliance: "red",
  alliances: {
    red: { team_keys: ["frc101", "frc102", "frc103"], score: 520 },
    blue: { team_keys: ["frc104", "frc105", "frc106"], score: 300 },
  },
  score_breakdown: {
    red: { hubScore: { autoCount: 100, teleopCount: 400, totalCount: 500 } },
    blue: { hubScore: { autoCount: 60, teleopCount: 220, totalCount: 280 } },
  },
} as const;

export type SyntheticScenario = {
  name: string;
  teamNumber: number;
  data: RebuiltMatchData;
};

export function syntheticScenarios(): SyntheticScenario[] {
  const scorer = matchData();
  scorer.auto.estimated_fuel_scored = 30;
  scorer.teleop.estimated_fuel_scored = 140;
  scorer.teleop.activity = {
    duration_seconds: 140,
    transitions: [
      { at_seconds: 0, state: "scoring" },
      { at_seconds: 100, state: "other_idle" },
    ],
  };

  const feeder = matchData();
  feeder.auto.estimated_fuel_scored = 20;
  feeder.teleop.estimated_fuel_scored = 100;
  feeder.teleop.activity = {
    duration_seconds: 140,
    transitions: [
      { at_seconds: 0, state: "shuttling_passing" },
      { at_seconds: 120, state: "scoring" },
    ],
  };
  feeder.post_match.observed_role = "passer_feeder";

  const defender = matchData();
  defender.auto.estimated_fuel_scored = 10;
  defender.teleop.estimated_fuel_scored = 20;
  defender.teleop.activity = {
    duration_seconds: 140,
    transitions: [
      { at_seconds: 0, state: "defending" },
      { at_seconds: 110, state: "other_idle" },
    ],
  };
  defender.post_match.observed_role = "defender";
  defender.post_match.defense_observed = true;
  defender.post_match.defense_effectiveness = "strong";

  const uncertain = matchData();
  uncertain.auto.estimated_fuel_scored = 35;
  uncertain.teleop.estimated_fuel_scored = 150;
  uncertain.post_match.fuel_estimate_confidence = "very_uncertain";

  const dns = matchData();
  dns.auto.estimated_fuel_scored = null;
  dns.auto.execution_result = null;
  dns.teleop.estimated_fuel_scored = null;
  dns.teleop.activity = null;
  dns.post_match.reliability = "DNS";
  dns.post_match.observed_role = "inactive";

  const dnf = matchData();
  dnf.auto.estimated_fuel_scored = 5;
  dnf.teleop.estimated_fuel_scored = 0;
  dnf.teleop.activity = {
    duration_seconds: 30,
    transitions: [{ at_seconds: 0, state: "other_idle" }],
  };
  dnf.post_match.reliability = "DNF";

  return [
    { name: "high-output scorer", teamNumber: 101, data: scorer },
    { name: "Passer-Feeder-heavy", teamNumber: 102, data: feeder },
    { name: "defense-heavy", teamNumber: 103, data: defender },
    { name: "very uncertain estimate", teamNumber: 104, data: uncertain },
    { name: "did not start", teamNumber: 105, data: dns },
    { name: "did not finish", teamNumber: 106, data: dnf },
  ];
}
