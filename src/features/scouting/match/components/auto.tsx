"use client";
import type { MatchDraft } from "../model";
import { Choice, yesNo } from "./controls";
export function AutoFields({
  draft,
  change,
}: {
  draft: MatchDraft;
  change: (fn: (d: MatchDraft) => MatchDraft) => void;
}) {
  const auto = draft.data.auto;
  const patch = (fields: Partial<typeof auto>) =>
    change((d) => ({
      ...d,
      data: { ...d.data, auto: { ...d.data.auto, ...fields } },
    }));
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Choice
        label="Auto start position"
        value={auto.start_position}
        options={[
          ["left", "Left"],
          ["center", "Center"],
          ["right", "Right"],
          ["unknown", "Unknown"],
        ]}
        onChange={(start_position) => patch({ start_position })}
      />
      <Choice
        label="Auto execution result"
        value={auto.execution_result ?? ""}
        options={[
          ["", "Choose result"],
          ["successful", "Successful"],
          ["partial", "Partial"],
          ["failed", "Failed"],
        ]}
        onChange={(v) => patch({ execution_result: v || null })}
      />
      <Choice
        label="Collected additional FUEL"
        value={auto.collected_additional_fuel}
        options={yesNo}
        onChange={(collected_additional_fuel) =>
          patch({ collected_additional_fuel })
        }
      />
      <Choice
        label="Auto climb"
        value={auto.climb?.result ?? "none"}
        options={[
          ["none", "None"],
          ["attempted", "Attempted"],
          ["achieved", "Achieved"],
        ]}
        onChange={(result) => patch({ climb: { result } })}
      />
      {auto.climb?.result === "achieved" && (
        <Choice
          label="Auto achieved level (optional)"
          value={auto.climb.achieved_level ?? ""}
          options={[
            ["", "Not recorded"],
            ["level_1", "Level 1"],
          ]}
          onChange={(level) =>
            patch({
              climb: {
                result: "achieved",
                ...(level ? { achieved_level: level } : {}),
              },
            })
          }
        />
      )}
    </div>
  );
}
