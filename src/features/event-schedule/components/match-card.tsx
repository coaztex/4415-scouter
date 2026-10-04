import Link from "next/link";
import type { EventScheduleData } from "../server/queries";
import {
  isPlayed,
  officialMatchLabel,
  matchDetailsHref,
  matchScores,
  matchTimeLabel,
  hasOfficialStart,
} from "../model";
import { TeamPill } from "./coverage";

export function MatchCard({
  match,
  eventKey,
  timezone,
  phaseLabel,
  emphasized = false,
}: {
  match: EventScheduleData["matches"][number];
  eventKey: string;
  timezone: string;
  phaseLabel?: string;
  emphasized?: boolean;
}) {
  const label = officialMatchLabel(match),
    scores = matchScores(match);
  return (
    <article
      className={`interactive-card schedule-match-card relative isolate overflow-hidden rounded-card ${emphasized ? "ring-2 ring-brand-secondary/70" : ""}`}
    >
      {/* Sibling links, never nested anchors: team pills sit above the card link. */}
      <Link
        prefetch={false}
        href={matchDetailsHref(eventKey, match.tba_match_key)}
        aria-label={`View ${label} match details`}
        className="absolute inset-0 z-10 rounded-card"
      >
        <span className="sr-only">View {label} match details</span>
      </Link>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
        <h3 className="flex items-center gap-2 text-xl font-semibold tabular-nums">
          {label}
          {phaseLabel && (
            <span
              className={`rounded-control border px-2 py-1 text-xs font-semibold ${phaseLabel === "Completed" ? "border-border bg-surface-subtle text-muted" : "border-brand-secondary/60 bg-accent-soft text-accent"}`}
            >
              {phaseLabel}
            </span>
          )}
        </h3>
        <p className="text-xs text-muted sm:text-sm">
          {matchTimeLabel(match, timezone)}
        </p>
      </header>
      <div>
        {(["red", "blue"] as const).map((alliance) => (
          <section
            key={alliance}
            aria-label={`${alliance} alliance`}
            className={`schedule-alliance schedule-alliance-${alliance} px-4 py-3`}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <h4
                className={`text-xs font-semibold uppercase tracking-wide ${alliance === "red" ? "text-alliance-red" : "text-alliance-blue"}`}
              >
                {alliance} alliance
              </h4>
              <span
                className={`text-xl font-semibold tabular-nums ${alliance === "red" ? "text-alliance-red" : "text-alliance-blue"}`}
              >
                {isPlayed(match)
                  ? (scores[alliance] ?? "Score unavailable")
                  : hasOfficialStart(match)
                    ? "Result pending"
                    : "Upcoming"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {match.stations
                .filter((station) => station.alliance === alliance)
                .map((station) => (
                  <TeamPill
                    key={station.team_number}
                    eventKey={eventKey}
                    teamNumber={station.team_number}
                    state={station.coverage.state}
                  />
                ))}
              {!match.stations.some(
                (station) => station.alliance === alliance,
              ) && (
                <span className="text-sm text-muted">
                  Roster not yet published
                </span>
              )}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
