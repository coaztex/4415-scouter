import type { PitMapViewMode } from "../viewport";
import { PitMapHelp } from "./pit-map-help";

export function PitMapToolbar({
  mode,
  onModeChange,
  hasPits,
  onFit,
  onZoom,
  instructionsId,
}: {
  mode: PitMapViewMode;
  onModeChange: (mode: PitMapViewMode) => void;
  hasPits: boolean;
  onFit: () => void;
  onZoom: (factor: number) => void;
  instructionsId: string;
}) {
  const button =
    "min-h-11 min-w-11 rounded-control border border-border px-3 text-sm font-semibold hover:bg-surface-subtle";
  return (
    <div className="flex flex-wrap items-start gap-2">
      <div
        role="group"
        aria-label="Map view"
        className="flex overflow-hidden rounded-control border border-border"
      >
        {(["pits", "venue"] as const).map((view) => (
          <button
            key={view}
            type="button"
            aria-pressed={mode === view}
            disabled={view === "pits" && !hasPits}
            title={
              view === "pits" && !hasPits ? "No pit boxes available" : undefined
            }
            onClick={() => onModeChange(view)}
            className={`min-h-11 px-3 text-sm font-semibold disabled:opacity-40 ${mode === view ? "bg-accent text-on-accent" : "bg-surface hover:bg-surface-subtle"}`}
          >
            {view === "pits" ? "Pits" : "Venue"}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={button}
        aria-label={`Fit ${mode === "pits" ? "pits" : "venue"}`}
        onClick={onFit}
      >
        Fit
      </button>
      <button
        type="button"
        className={button}
        aria-label="Zoom out of pit map"
        onClick={() => onZoom(0.8)}
      >
        −
      </button>
      <button
        type="button"
        className={button}
        aria-label="Zoom in on pit map"
        onClick={() => onZoom(1.25)}
      >
        ＋
      </button>
      <PitMapHelp instructionsId={instructionsId} />
    </div>
  );
}
