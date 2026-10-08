import { useId } from "react";
import {
  drivetrains,
  drivetrainLabels,
  scoringMechanisms,
  scoringMechanismLabels,
} from "@/games/2026-rebuilt/pit-options";
import { weightRange, type PitSpecFilters } from "../filters";

export function PitSpecFilters({
  filters,
  onChange,
  onClear,
}: {
  filters: PitSpecFilters;
  onChange: (filters: PitSpecFilters) => void;
  onClear: () => void;
}) {
  const hintId = useId(),
    errorId = useId();
  const range = weightRange(filters);
  const chips = [
    ...(range.min !== null && Number.isFinite(range.min)
      ? [
          {
            id: "min",
            label: `≥ ${range.min} lb`,
            remove: () => onChange({ ...filters, minWeight: "" }),
          },
        ]
      : []),
    ...(range.max !== null && Number.isFinite(range.max)
      ? [
          {
            id: "max",
            label: `≤ ${range.max} lb`,
            remove: () => onChange({ ...filters, maxWeight: "" }),
          },
        ]
      : []),
    ...filters.drivetrains.map((value) => ({
      id: `drive-${value}`,
      label: `Drivetrain: ${drivetrainLabels[value]}`,
      remove: () =>
        onChange({
          ...filters,
          drivetrains: filters.drivetrains.filter((item) => item !== value),
        }),
    })),
    ...filters.shooters.map((value) => ({
      id: `shooter-${value}`,
      label: `Shooter: ${scoringMechanismLabels[value]}`,
      remove: () =>
        onChange({
          ...filters,
          shooters: filters.shooters.filter((item) => item !== value),
        }),
    })),
  ];
  const choice =
    "flex min-h-11 cursor-pointer items-center gap-2 rounded-control border px-3";
  return (
    <section
      aria-label="Pit specifications"
      className="min-w-0 space-y-3 rounded-card border border-border bg-surface p-4 text-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">Pit specifications</h2>
        <button
          type="button"
          onClick={onClear}
          className="min-h-11 rounded-control border border-border px-3 font-bold"
        >
          Clear filters
        </button>
      </div>
      <span id={hintId} className="sr-only">
        Pit-reported robot weight; excludes battery and bumpers.
      </span>
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <fieldset className="min-w-0">
          <legend className="mb-2 font-bold">Weight (lb)</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["minWeight", "maxWeight"] as const).map((key) => (
              <label key={key} className="grid min-w-0 gap-1">
                {key === "minWeight"
                  ? "Minimum weight (lb)"
                  : "Maximum weight (lb)"}
                <input
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  placeholder="No limit"
                  value={filters[key]}
                  aria-describedby={`${hintId}${range.error ? ` ${errorId}` : ""}`}
                  aria-invalid={!!range.error}
                  onChange={(e) =>
                    onChange({ ...filters, [key]: e.target.value })
                  }
                  className="min-h-11 w-full min-w-0 rounded-control border border-border bg-surface px-3"
                />
              </label>
            ))}
          </div>
          {range.error && (
            <p id={errorId} role="alert" className="mt-2 text-danger">
              {range.error}
            </p>
          )}
        </fieldset>
        <fieldset className="min-w-0">
          <legend className="mb-2 font-bold">Drivetrain</legend>
          <div className="flex flex-wrap gap-2">
            {drivetrains.map((value) => (
              <label
                key={value}
                className={`${choice} ${filters.drivetrains.includes(value) ? "border-accent bg-accent-soft" : "border-border"}`}
              >
                <input
                  type="checkbox"
                  className="size-5 accent-accent"
                  aria-label={`Drivetrain: ${drivetrainLabels[value]}`}
                  checked={filters.drivetrains.includes(value)}
                  onChange={(e) =>
                    onChange({
                      ...filters,
                      drivetrains: e.target.checked
                        ? [...filters.drivetrains, value]
                        : filters.drivetrains.filter((item) => item !== value),
                    })
                  }
                />
                {drivetrainLabels[value]}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="min-w-0">
          <legend className="mb-2 font-bold">Shooter type</legend>
          <div className="flex flex-wrap gap-2">
            {scoringMechanisms.map((value) => (
              <label
                key={value}
                className={`${choice} ${filters.shooters.includes(value) ? "border-accent bg-accent-soft" : "border-border"}`}
              >
                <input
                  type="checkbox"
                  className="size-5 accent-accent"
                  aria-label={`Shooter: ${scoringMechanismLabels[value]}`}
                  checked={filters.shooters.includes(value)}
                  onChange={(e) =>
                    onChange({
                      ...filters,
                      shooters: e.target.checked
                        ? [...filters.shooters, value]
                        : filters.shooters.filter((item) => item !== value),
                    })
                  }
                />
                {scoringMechanismLabels[value]}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      {!!chips.length && (
        <div aria-label="Active pit filters" className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              aria-label={`Remove ${chip.label} filter`}
              onClick={chip.remove}
              className="min-h-11 rounded-control border border-accent bg-accent-soft px-3"
            >
              {chip.label} ×
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
