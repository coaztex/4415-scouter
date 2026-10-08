import { pitMapStatuses } from "../status";
export function PitMapLegend() {
  return (
    <ul
      aria-label="Pit scouting status legend"
      className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold"
    >
      {(["not_scouted", "in_progress", "complete"] as const).map((status) => (
        <li key={status} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-flex size-5 items-center justify-center rounded border-2"
            style={{
              background: pitMapStatuses[status].fill,
              borderColor: pitMapStatuses[status].stroke,
              color: pitMapStatuses[status].text,
            }}
          >
            {pitMapStatuses[status].symbol}
          </span>
          {pitMapStatuses[status].label}
        </li>
      ))}
    </ul>
  );
}
