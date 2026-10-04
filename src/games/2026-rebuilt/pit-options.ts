export const scoringMechanisms = [
  "drum",
  "turret",
  "other",
  "unknown",
] as const;
export type ScoringMechanism = (typeof scoringMechanisms)[number];
export const scoringMechanismLabels: Record<ScoringMechanism, string> = {
  drum: "Drum",
  turret: "Turret",
  other: "Other",
  unknown: "Unknown",
};
