import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultState,
  profileIds,
  profileMetrics,
  stateSchema,
} from "../src/features/picklist/model";
import {
  chooseWeightPreset,
  editPresetWeight,
  manualPresetEditor,
  undoPresetWeightEdit,
  weightPresets,
} from "../src/features/picklist/presets";

test("each profile offers realistic, valid 100-point starting ratios", () => {
  const state = defaultState();
  for (const profile of profileIds) {
    assert.ok(weightPresets[profile].length >= 3);
    assert.equal(
      new Set(weightPresets[profile].map((p) => p.id)).size,
      weightPresets[profile].length,
    );
    for (const preset of weightPresets[profile]) {
      assert.equal(
        Object.values(preset.weights).reduce((a, b) => a + b, 0),
        100,
      );
      assert.ok(
        Object.keys(preset.weights).every((id) =>
          profileMetrics[profile].includes(id as never),
        ),
      );
      const applied = chooseWeightPreset(
        profile,
        preset.id,
        state.profiles[profile].weights,
      );
      assert.equal(applied.editor.selected, preset.id);
      assert.equal(
        stateSchema.safeParse({
          ...state,
          profiles: {
            ...state.profiles,
            [profile]: { ...state.profiles[profile], weights: applied.weights },
          },
        }).success,
        true,
      );
    }
  }
});

test("applying a preset replaces stale weights only in its profile and keeps sample policy", () => {
  const state = defaultState();
  state.profiles.offense.weights = { fuel: 5, epa_teleop: 95 };
  const oldSupport = state.profiles.support;
  const policy = {
    minSamples: state.profiles.offense.minSamples,
    minCoverage: state.profiles.offense.minCoverage,
  };
  const applied = chooseWeightPreset(
    "offense",
    "active-scorer",
    state.profiles.offense.weights,
  );
  state.profiles.offense = {
    ...state.profiles.offense,
    weights: applied.weights,
  };
  assert.equal(state.profiles.offense.weights.epa_teleop, undefined);
  assert.deepEqual(state.profiles.offense.weights, {
    fuel: 45,
    scoring_share: 55,
  });
  assert.deepEqual(state.profiles.support, oldSupport);
  assert.deepEqual(
    {
      minSamples: state.profiles.offense.minSamples,
      minCoverage: state.profiles.offense.minCoverage,
    },
    policy,
  );
});

test("editing preset weights selects Manual and undo restores the exact preset", () => {
  const applied = chooseWeightPreset("auto", "repeatable-auto", {});
  const first = editPresetWeight(
    "auto",
    "auto_success",
    65,
    applied.weights,
    applied.editor,
  );
  assert.equal(first.editor.selected, "manual");
  assert.equal(first.editor.undoPreset, "repeatable-auto");
  assert.equal(first.weights.auto_success, 65);
  const second = editPresetWeight(
    "auto",
    "auto_fuel",
    35,
    first.weights,
    first.editor,
  );
  assert.equal(second.editor.undoPreset, "repeatable-auto");
  const undone = undoPresetWeightEdit("auto", second.editor);
  assert.deepEqual(undone.weights, { auto_success: 80, auto_fuel: 20 });
  assert.deepEqual(undone.editor, applied.editor);
});

test("Manual is the default, preserves weights, and has no undo until a preset is edited", () => {
  const initial = manualPresetEditor();
  const defaults = defaultState().profiles.defense.weights;
  assert.deepEqual(initial, { selected: "manual", undoPreset: null });
  assert.deepEqual(chooseWeightPreset("defense", "manual", defaults), {
    weights: defaults,
    editor: initial,
  });
  const manuallyEdited = editPresetWeight(
    "defense",
    "defense_frequency",
    80,
    defaults,
    initial,
  );
  assert.equal(manuallyEdited.editor.undoPreset, null);
  const applied = chooseWeightPreset(
    "defense",
    "rated-impact",
    manuallyEdited.weights,
  );
  const changed = editPresetWeight(
    "defense",
    "defense_share",
    30,
    applied.weights,
    applied.editor,
  );
  assert.equal(changed.editor.undoPreset, "rated-impact");
  const chosenManual = chooseWeightPreset("defense", "manual", changed.weights);
  assert.equal(chosenManual.editor.undoPreset, null);
  assert.deepEqual(chosenManual.weights, changed.weights);
});

test("a user edit cannot accidentally add a metric from another profile", () => {
  assert.throws(() =>
    editPresetWeight("support", "fuel", 50, {}, manualPresetEditor()),
  );
  assert.throws(() => chooseWeightPreset("support", "unknown", {}));
});
