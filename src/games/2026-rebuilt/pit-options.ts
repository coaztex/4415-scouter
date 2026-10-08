export const drivetrains = ["swerve", "tank", "other", "unknown"] as const;
export type Drivetrain = (typeof drivetrains)[number];
export const drivetrainLabels: Record<Drivetrain, string> = {
  swerve: "Swerve",
  tank: "Tank",
  other: "Other",
  unknown: "Unknown",
};
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
