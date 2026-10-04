"use client";
import { Select, Input } from "@/components/ui/fields";
import type { RebuiltPitData } from "@/games/2026-rebuilt/pit-schema";
import {
  scoringMechanisms,
  scoringMechanismLabels,
} from "@/games/2026-rebuilt/pit-schema";
export function Choice<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <Select
      id={id}
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map(([key, text]) => (
        <option key={key} value={key}>
          {text}
        </option>
      ))}
    </Select>
  );
}
export const yesNo = [
  ["yes", "Yes"],
  ["no", "No"],
  ["unknown", "Unknown"],
] as const;
export function PitCapabilities({
  data,
  change,
  capacityMode,
  setCapacityMode,
  numeric,
  setNumeric,
}: {
  data: RebuiltPitData;
  change: (fn: (d: RebuiltPitData) => RebuiltPitData) => void;
  capacityMode: "approximate_count" | "band";
  setCapacityMode: (v: "approximate_count" | "band") => void;
  numeric: string;
  setNumeric: (v: string) => void;
}) {
  const patch = (fields: Partial<RebuiltPitData>) =>
    change((d) => ({ ...d, ...fields }));
  const toggle = <T extends "close" | "mid" | "far" | "trench" | "bump">(
    items: T[] | null,
    item: T,
  ) =>
    items?.includes(item)
      ? items.filter((v) => v !== item)
      : [...(items ?? []), item];
  return (
    <div className="space-y-6">
      <section
        aria-label="Robot and scoring"
        className="grid gap-4 sm:grid-cols-2"
      >
        <Choice
          id="pit-drivetrain"
          label="Drivetrain"
          value={data.drivetrain}
          options={[
            ["swerve", "Swerve"],
            ["tank", "Tank"],
            ["other", "Other"],
            ["unknown", "Unknown"],
          ]}
          onChange={(drivetrain) => patch({ drivetrain })}
        />
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-bold">
            Primary scoring mechanism
          </legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {scoringMechanisms.map((mechanism) => (
              <label
                key={mechanism}
                className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-control border px-3 text-center font-bold ${data.primary_scoring_mechanism === mechanism ? "border-accent bg-accent-soft" : "border-border bg-surface"}`}
              >
                <input
                  type="radio"
                  name="primary-scoring-mechanism"
                  className="size-5 accent-accent"
                  value={mechanism}
                  checked={data.primary_scoring_mechanism === mechanism}
                  onChange={() =>
                    patch({
                      primary_scoring_mechanism: mechanism,
                      other_shooter_type:
                        mechanism === "other"
                          ? (data.other_shooter_type ?? "")
                          : undefined,
                    })
                  }
                />
                {scoringMechanismLabels[mechanism]}
              </label>
            ))}
          </div>
          {data.primary_scoring_mechanism === "other" && (
            <div className="mt-3">
              <Input
                id="pit-other-shooter-type"
                label="Other shooter type"
                maxLength={80}
                required
                value={data.other_shooter_type ?? ""}
                onChange={(e) => patch({ other_shooter_type: e.target.value })}
              />
            </div>
          )}
        </fieldset>
        <div className="space-y-3">
          <Choice
            id="pit-capacity-mode"
            label="Approximate maximum FUEL capacity"
            value={capacityMode}
            options={[
              ["approximate_count", "Approximate count"],
              ["band", "Unknown or qualitative estimate"],
            ]}
            onChange={setCapacityMode}
          />
          {capacityMode === "approximate_count" ? (
            <Input
              id="pit-capacity-number"
              label="Approximate number (not exact)"
              type="number"
              min={0}
              max={10000}
              step={1}
              placeholder="Ask only if the team knows"
              value={numeric}
              onChange={(e) => setNumeric(e.target.value)}
            />
          ) : (
            <Choice
              id="pit-capacity-band"
              label="Fallback capacity"
              value={
                data.fuel_capacity.kind === "band"
                  ? data.fuel_capacity.band
                  : "unknown"
              }
              options={[
                ["unknown", "Unknown"],
                ["low", "Low"],
                ["medium", "Medium"],
                ["high", "High"],
              ]}
              onChange={(band) =>
                patch({ fuel_capacity: { kind: "band", band } })
              }
            />
          )}
        </div>
        <Choice
          id="pit-moving"
          label="Shoots while moving"
          value={data.shoot_while_moving}
          options={yesNo}
          onChange={(shoot_while_moving) => patch({ shoot_while_moving })}
        />
        <fieldset className="space-y-2">
          <legend className="text-sm font-bold">Preferred scoring areas</legend>
          <label className="flex min-h-12 items-center gap-3">
            <input
              type="checkbox"
              className="size-5"
              checked={data.preferred_scoring_areas === null}
              onChange={() => patch({ preferred_scoring_areas: null })}
            />
            Unknown
          </label>
          {(["close", "mid", "far"] as const).map((area) => (
            <label
              key={area}
              className="flex min-h-12 items-center gap-3 capitalize"
            >
              <input
                type="checkbox"
                className="size-5"
                checked={data.preferred_scoring_areas?.includes(area) ?? false}
                onChange={() =>
                  patch({
                    preferred_scoring_areas: toggle(
                      data.preferred_scoring_areas,
                      area,
                    ),
                  })
                }
              />
              {area}
            </label>
          ))}
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-sm font-bold">Traversal</legend>
          <label className="flex min-h-12 items-center gap-3">
            <input
              type="checkbox"
              className="size-5"
              checked={data.traversal === null}
              onChange={() => patch({ traversal: null })}
            />
            Unknown
          </label>
          {(["trench", "bump"] as const).map((value) => (
            <label
              key={value}
              className="flex min-h-12 items-center gap-3 capitalize"
            >
              <input
                type="checkbox"
                className="size-5"
                checked={data.traversal?.includes(value) ?? false}
                onChange={() =>
                  patch({ traversal: toggle(data.traversal, value) })
                }
              />
              {value}
            </label>
          ))}
          <p className="text-sm text-muted">
            Select both for trench and bump capability.
          </p>
        </fieldset>
      </section>
      <details className="rounded-control border border-border p-3">
        <summary className="min-h-12 cursor-pointer py-3 font-bold">
          Climbing · lower priority
        </summary>
        <div className="grid gap-4 sm:grid-cols-2">
          <Choice
            id="pit-climb"
            label="Climb capability"
            value={data.climbing.capability}
            options={[
              ["none", "None"],
              ["yes", "Yes"],
              ["unknown", "Unknown"],
            ]}
            onChange={(capability) => patch({ climbing: { capability } })}
          />
          {data.climbing.capability === "yes" && (
            <Choice
              id="pit-climb-level"
              label="Highest demonstrated level (optional)"
              value={data.climbing.highest_demonstrated_level ?? ""}
              options={[
                ["", "Not provided"],
                ["level_1", "Level 1"],
                ["level_2", "Level 2"],
                ["level_3", "Level 3"],
              ]}
              onChange={(level) =>
                patch({
                  climbing: {
                    capability: "yes",
                    ...(level ? { highest_demonstrated_level: level } : {}),
                  },
                })
              }
            />
          )}
        </div>
      </details>
    </div>
  );
}
