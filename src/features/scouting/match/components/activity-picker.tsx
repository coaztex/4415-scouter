"use client";
import {
  activityStates,
  type ActivityState,
} from "@/games/2026-rebuilt/activity";

const activityLabels: Record<ActivityState, string> = {
  scoring: "SCORING",
  shuttling_passing: "SHUTTLING / PASSING",
  defending: "DEFENDING",
  other_idle: "OTHER / IDLE",
};

export function ActivityPicker({
  current,
  onSelect,
}: {
  current: ActivityState;
  onSelect: (value: ActivityState) => void;
}) {
  return (
    <section className="space-y-3" aria-label="Current activity">
      <h2 className="font-bold">Current activity</h2>
      <div className="grid grid-cols-2 gap-3">
        {activityStates.map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={current === value}
            onClick={() => onSelect(value)}
            className={`activity-tap touch-manipulation rounded-control border-2 p-3 text-sm font-bold ${current === value ? "border-accent bg-accent text-on-accent ring-2 ring-accent ring-offset-2 ring-offset-surface" : "border-border bg-surface"}`}
          >
            {current === value && (
              <span className="block text-xs">● ACTIVE</span>
            )}
            {activityLabels[value]}
          </button>
        ))}
      </div>
    </section>
  );
}
