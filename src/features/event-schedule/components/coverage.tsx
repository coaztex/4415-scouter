import Link from "next/link";
import { coverageLabels, type ScoutingState } from "../model";

const shortLabels: Record<ScoutingState, string> = {
  complete: "Complete",
  in_progress: "In progress",
  missing: "Missing",
  unavailable: "Unavailable",
};

export function CoverageBadge({ state }: { state: ScoutingState }) {
  return (
    <span
      className={`coverage-${state} inline-flex items-center rounded-control px-2 py-1 text-xs font-semibold`}
    >
      {shortLabels[state]}
    </span>
  );
}
export function TeamPill({
  eventKey,
  teamNumber,
  state,
}: {
  eventKey: string;
  teamNumber: number;
  state: ScoutingState;
}) {
  const label = `Team ${teamNumber} — ${coverageLabels[state]}`;
  return (
    <Link
      prefetch={false}
      href={`/events/${encodeURIComponent(eventKey)}/teams/${teamNumber}`}
      aria-label={label}
      title={label}
      className={`coverage-${state} relative z-20 flex min-h-15 min-w-0 flex-col items-center justify-center gap-0.5 rounded-control px-2 py-2 text-base font-semibold leading-tight tabular-nums transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-focus-ring`}
    >
      <span>{teamNumber}</span>
      <span className="text-[11px] font-medium leading-none">
        {shortLabels[state]}
      </span>
    </Link>
  );
}
export function CoverageLegend() {
  return (
    <div
      className="flex flex-wrap items-center gap-2 text-sm"
      aria-label="Scouting status legend"
    >
      {(["complete", "in_progress", "missing"] as const).map((state) => (
        <CoverageBadge key={state} state={state} />
      ))}
    </div>
  );
}
