"use client";
import { matchCaptureConfig } from "@/games/2026-rebuilt/match-schema";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/fields";
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <Select
      id={`capture-${label.replaceAll(" ", "-")}`}
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
export function FuelCounter({
  phase,
  total,
  onTap,
  canUndo,
}: {
  phase: string;
  total: number | null;
  onTap: (amount: 1 | 5 | 10 | 20 | "undo") => void;
  canUndo: boolean;
}) {
  return (
    <section aria-label={`${phase} estimated FUEL`} className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold">Estimated {phase} FUEL</p>
          <output
            aria-label={`${phase} FUEL total`}
            className="text-5xl font-bold tabular-nums"
          >
            {total ?? "Unknown"}
          </output>
        </div>
        <Button
          variant="secondary"
          disabled={!canUndo}
          onClick={() => onTap("undo")}
          aria-label={`Undo ${phase} FUEL increment`}
        >
          Undo
        </Button>
      </div>
      <div className="fuel-buttons grid grid-cols-2 gap-3">
        {matchCaptureConfig.fuelIncrements.map((n) => (
          <Button
            key={n}
            className="fuel-tap touch-manipulation select-none text-3xl"
            onClick={() => onTap(n)}
            aria-label={`Add ${n} estimated ${phase} FUEL`}
          >
            +{n}
          </Button>
        ))}
      </div>
    </section>
  );
}
export function PhaseAdvance({
  phase,
  onAdvance,
  className,
}: {
  phase: "auto" | "teleop";
  onAdvance: () => void;
  className?: string;
}) {
  return (
    <Button className={className} onClick={onAdvance}>
      {phase === "auto" ? "Continue to Teleop" : "Finish Teleop"}
    </Button>
  );
}
export const yesNo = [
  ["yes", "Yes"],
  ["no", "No"],
  ["unknown", "Unknown"],
] as const;
