import {
  profileMetrics,
  type MetricId,
  type Profile,
  type ProfileId,
} from "./model";

type WeightPreset = {
  id: string;
  title: string;
  purpose: string;
  weights: Profile["weights"];
};

// Each preset totals 100. These are explicit strategy starting ratios, not
// estimates fitted to event results or claims of objectively optimal weights.
export const weightPresets: Record<ProfileId, readonly WeightPreset[]> = {
  offense: [
    {
      id: "proven-output",
      title: "Proven output",
      purpose: "Prioritize observed FUEL while retaining scoring activity.",
      weights: { fuel: 75, scoring_share: 25 },
    },
    {
      id: "active-scorer",
      title: "Active scorer",
      purpose: "Value sustained scoring activity alongside observed FUEL.",
      weights: { fuel: 45, scoring_share: 55 },
    },
    {
      id: "output-cross-check",
      title: "Output cross-check",
      purpose: "Keep scouting primary, with small TBA and Statbotics checks.",
      weights: { fuel: 60, scoring_share: 20, copr_fuel: 10, epa_teleop: 10 },
    },
  ],
  support: [
    {
      id: "dedicated-feeder",
      title: "Dedicated feeder",
      purpose: "Favor repeated Passer-Feeder role observations.",
      weights: { passer_role: 70, passing_share: 30 },
    },
    {
      id: "active-shuttle",
      title: "Active shuttle",
      purpose: "Favor time actually spent shuttling or passing.",
      weights: { passing_share: 70, passer_role: 30 },
    },
    {
      id: "balanced-support",
      title: "Balanced support",
      purpose: "Balance observed support role and passing activity.",
      weights: { passing_share: 50, passer_role: 50 },
    },
  ],
  defense: [
    {
      id: "frequent-defense",
      title: "Frequent defense",
      purpose: "Favor teams regularly observed playing defense.",
      weights: { defense_frequency: 70, defense_share: 30 },
    },
    {
      id: "sustained-defense",
      title: "Sustained defense",
      purpose: "Favor teams spending more match time defending.",
      weights: { defense_frequency: 30, defense_share: 70 },
    },
    {
      id: "rated-impact",
      title: "Rated impact",
      purpose: "Include scout-rated effectiveness, which is subjective.",
      weights: {
        defense_frequency: 40,
        defense_share: 25,
        defense_effectiveness: 35,
      },
    },
  ],
  reliability: [
    {
      id: "finish-matches",
      title: "Finish matches",
      purpose: "Favor complete matches over reported minor incidents.",
      weights: { full_match: 75, issue_free: 25 },
    },
    {
      id: "few-issues",
      title: "Few issues",
      purpose: "Favor observations without reported issues.",
      weights: { full_match: 30, issue_free: 70 },
    },
    {
      id: "always-starts",
      title: "Always starts",
      purpose: "Favor teams that take the field consistently.",
      weights: { availability: 70, full_match: 30 },
    },
  ],
  auto: [
    {
      id: "repeatable-auto",
      title: "Repeatable auto",
      purpose: "Prioritize observed routine success over FUEL volume.",
      weights: { auto_success: 80, auto_fuel: 20 },
    },
    {
      id: "fuel-output",
      title: "FUEL output",
      purpose: "Favor observed AUTO FUEL with a success check.",
      weights: { auto_success: 35, auto_fuel: 65 },
    },
    {
      id: "auto-cross-check",
      title: "Auto cross-check",
      purpose: "Use mostly scouting with small external auto checks.",
      weights: {
        auto_success: 55,
        auto_fuel: 25,
        copr_auto: 10,
        epa_auto: 10,
      },
    },
  ],
  complement: [
    {
      id: "add-scorer",
      title: "Add scorer",
      purpose: "Seek another FUEL producer who finishes matches.",
      weights: { fuel: 70, full_match: 30 },
    },
    {
      id: "add-feeder",
      title: "Add feeder",
      purpose: "Seek a passing partner with match reliability.",
      weights: { passing_share: 50, passer_role: 30, full_match: 20 },
    },
    {
      id: "add-defender",
      title: "Add defender",
      purpose: "Seek regular defense with match reliability.",
      weights: { defense_frequency: 55, defense_share: 25, full_match: 20 },
    },
    {
      id: "add-auto",
      title: "Add auto",
      purpose: "Seek observed AUTO success and FUEL production.",
      weights: { auto_success: 55, auto_fuel: 30, full_match: 15 },
    },
    {
      id: "add-reliability",
      title: "Add reliability",
      purpose: "Seek a partner that finishes with few observed issues.",
      weights: { full_match: 65, issue_free: 35 },
    },
  ],
};

export type PresetEditor = {
  selected: string;
  undoPreset: string | null;
};

export const manualPresetEditor = (): PresetEditor => ({
  selected: "manual",
  undoPreset: null,
});

export function chooseWeightPreset(
  profile: ProfileId,
  choice: string,
  currentWeights: Profile["weights"],
): { weights: Profile["weights"]; editor: PresetEditor } {
  if (choice === "manual")
    return { weights: currentWeights, editor: manualPresetEditor() };
  const preset = weightPresets[profile].find((p) => p.id === choice);
  if (!preset) throw new Error("Unknown weight preset.");
  return {
    weights: { ...preset.weights },
    editor: { selected: preset.id, undoPreset: null },
  };
}

export function editPresetWeight(
  profile: ProfileId,
  metric: MetricId,
  value: number,
  currentWeights: Profile["weights"],
  editor: PresetEditor,
): { weights: Profile["weights"]; editor: PresetEditor } {
  if (!profileMetrics[profile].includes(metric))
    throw new Error("Metric is not available for this profile.");
  if (value === (currentWeights[metric] ?? 0))
    return { weights: currentWeights, editor };
  return {
    weights: { ...currentWeights, [metric]: value },
    editor: {
      selected: "manual",
      undoPreset:
        editor.selected === "manual" ? editor.undoPreset : editor.selected,
    },
  };
}

export function undoPresetWeightEdit(
  profile: ProfileId,
  editor: PresetEditor,
): { weights: Profile["weights"]; editor: PresetEditor } {
  if (!editor.undoPreset) throw new Error("No preset edit to undo.");
  return chooseWeightPreset(profile, editor.undoPreset, {});
}
