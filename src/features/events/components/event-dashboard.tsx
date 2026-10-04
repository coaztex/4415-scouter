import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InteractiveCard } from "@/components/ui/interactive-card";
import {
  hasOfficialStart,
  matchDetailsHref,
  matchPrepHref,
  matchScores,
  matchTimeLabel,
  readableMatchLabel,
} from "@/features/event-schedule/model";
import type { EventScheduleData } from "@/features/event-schedule/server/queries";
import type { getMyAssignments } from "@/features/scheduling/server/scout-queries";
import type { getEventProgress } from "../server/queries";
import { dashboardMatches } from "../dashboard";
import { EventModules } from "./event-modules";

type Assignments = Awaited<ReturnType<typeof getMyAssignments>>;
type Progress = Awaited<ReturnType<typeof getEventProgress>>;
type Match = EventScheduleData["matches"][number];

function Alliance({
  match,
  alliance,
  ownTeamNumber,
}: {
  match: Match;
  alliance: "red" | "blue";
  ownTeamNumber: number | null;
}) {
  const teams = match.stations.filter(
    (station) => station.alliance === alliance,
  );
  const score = matchScores(match)[alliance];
  return (
    <div
      className={`alliance-${alliance} min-w-0 rounded-control border-l-4 p-3`}
    >
      <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide">
        <span>{alliance}</span>
        {score !== null && (
          <strong className="text-xl tabular-nums">{score}</strong>
        )}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-sm font-semibold tabular-nums">
        {teams.length
          ? teams.map((team) => (
              <span
                key={team.team_number}
                className={
                  team.team_number === ownTeamNumber
                    ? "underline decoration-2 underline-offset-4"
                    : ""
                }
              >
                {team.team_number}
              </span>
            ))
          : "Roster pending"}
      </p>
    </div>
  );
}

export function EventDashboard({
  eventKey,
  role,
  schedule,
  assignments,
  progress,
  ownTeamNumber,
  active,
}: {
  eventKey: string;
  role: EventScheduleData["profile"]["role"];
  schedule: EventScheduleData;
  assignments: Assignments;
  progress: Progress;
  ownTeamNumber: number | null;
  active: boolean;
}) {
  const { featured, kind, recent, completedCount } = dashboardMatches(
    schedule.matches,
    ownTeamNumber,
    active,
  );
  const pending = [assignments.next, ...assignments.upcoming].filter(
    (row): row is NonNullable<typeof row> => row !== null,
  );
  const nextMatch = pending.find((row) => row.assignment_type === "match");
  const nextAssignedMatch = schedule.matches.find(
    (match) => match.id === nextMatch?.match_id,
  );
  const remaining = pending.filter(
    (row) => row.assignment_type === "match",
  ).length;
  const pitPercent =
    progress.pits !== null && progress.teams
      ? Math.min(100, Math.round((progress.pits / progress.teams) * 100))
      : 0;
  return (
    <div className="space-y-7">
      <div className="grid items-start gap-5 md:grid-cols-2 lg:grid-cols-[minmax(0,1.35fr)_minmax(19rem,1fr)]">
        <Card className="overflow-hidden border-border-strong !p-0">
          <div className="h-1 bg-brand-secondary" aria-hidden="true" />
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">
                {kind === "our-next"
                  ? `Next for Team ${ownTeamNumber}`
                  : kind === "latest"
                    ? "Latest result"
                    : "Next match"}
              </h2>
              <span className="text-xs font-medium text-muted">
                {completedCount} completed · {schedule.matches.length} matches
              </span>
            </div>
            {featured ? (
              <>
                <p className="mt-4 text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">
                  {readableMatchLabel(featured)}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {matchTimeLabel(featured, schedule.event.timezone)}
                </p>
                {hasOfficialStart(featured) && kind !== "latest" && (
                  <p className="mt-1 text-sm font-semibold text-warning">
                    Result pending
                  </p>
                )}
                <div className="mt-5 grid grid-cols-2 gap-2 sm:gap-3">
                  <Alliance
                    match={featured}
                    alliance="red"
                    ownTeamNumber={ownTeamNumber}
                  />
                  <Alliance
                    match={featured}
                    alliance="blue"
                    ownTeamNumber={ownTeamNumber}
                  />
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    href={matchDetailsHref(eventKey, featured.tba_match_key)}
                    className={buttonStyles("primary")}
                  >
                    View match
                  </Link>
                  {kind === "our-next" && role !== "scout" && (
                    <Link
                      href={matchPrepHref(eventKey, featured.tba_match_key)}
                      className={buttonStyles("secondary")}
                    >
                      Match Prep
                    </Link>
                  )}
                </div>
              </>
            ) : (
              <div className="mt-5">
                <p className="text-muted">No matches cached yet.</p>
                <Link
                  href={`/events/${encodeURIComponent(eventKey)}/schedule`}
                  className={`mt-4 ${buttonStyles("secondary")}`}
                >
                  Open Schedule
                </Link>
              </div>
            )}
          </div>
        </Card>

        <div className="grid gap-5">
          <Card className="border-border-strong">
            <h2 className="text-lg font-semibold">My Scouting</h2>
            {assignments.next?.assignment_type === "break" && (
              <p className="mt-2 text-sm font-medium text-warning">
                Break next
              </p>
            )}
            {nextMatch ? (
              <>
                <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-2xl font-semibold tabular-nums">
                  <span>
                    {nextMatch.team_number === null
                      ? "Team pending"
                      : `Team ${nextMatch.team_number}`}
                  </span>
                  {nextAssignedMatch && (
                    <span className="text-lg font-medium text-muted">
                      {readableMatchLabel(nextAssignedMatch)}
                    </span>
                  )}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {nextMatch.status.replaceAll("_", " ")} · {remaining}{" "}
                  remaining
                </p>
                <Link
                  href={
                    active && nextMatch.match
                      ? `/events/${encodeURIComponent(eventKey)}/scout/match/${nextMatch.id}`
                      : `/events/${encodeURIComponent(eventKey)}/scouting`
                  }
                  className={`mt-4 ${buttonStyles("primary")}`}
                >
                  {active && nextMatch.match
                    ? "Open assignment"
                    : "View assignments"}
                </Link>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm text-muted">
                  No pending match assignments.
                </p>
                <Link
                  href={`/events/${encodeURIComponent(eventKey)}/scouting`}
                  className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-accent hover:underline"
                >
                  View Match Scouting
                </Link>
              </>
            )}
          </Card>
          <Card>
            <h2 className="text-lg font-semibold">Scouting Progress</h2>
            <div className="mt-4 flex items-baseline justify-between gap-3">
              <span className="text-sm text-muted">Pit teams scouted</span>
              <strong className="text-xl font-semibold tabular-nums">
                {progress.pits === null || progress.teams === null
                  ? "—"
                  : `${progress.pits}/${progress.teams}`}
              </strong>
            </div>
            <div
              role={
                progress.teams !== null && progress.pits !== null
                  ? "progressbar"
                  : undefined
              }
              aria-label={
                progress.teams !== null && progress.pits !== null
                  ? "Pit scouting progress"
                  : undefined
              }
              aria-valuemin={
                progress.teams !== null && progress.pits !== null
                  ? 0
                  : undefined
              }
              aria-valuemax={
                progress.teams !== null && progress.pits !== null
                  ? Math.max(1, progress.teams, progress.pits)
                  : undefined
              }
              aria-valuenow={
                progress.teams !== null && progress.pits !== null
                  ? progress.pits
                  : undefined
              }
              aria-hidden={
                progress.teams === null || progress.pits === null
                  ? true
                  : undefined
              }
              className="mt-2 h-2 overflow-hidden rounded-full bg-surface-subtle"
            >
              <div
                className="h-full rounded-full bg-brand-secondary"
                style={{ width: `${pitPercent}%` }}
              />
            </div>
            <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-border pt-3">
              <span className="text-sm text-muted">Final match samples</span>
              <strong className="text-xl font-semibold tabular-nums">
                {progress.samples ?? "—"}
              </strong>
            </div>
          </Card>
        </div>
      </div>
      <div className="grid items-start gap-6 md:grid-cols-2 lg:grid-cols-[minmax(0,1.35fr)_minmax(19rem,1fr)]">
        <section aria-labelledby="recent-matches-heading">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="recent-matches-heading" className="text-lg font-semibold">
              Recent Matches
            </h2>
            <Link
              href={`/events/${encodeURIComponent(eventKey)}/schedule`}
              className="text-sm font-semibold text-accent hover:underline"
            >
              Schedule
            </Link>
          </div>
          {recent.length ? (
            <div className="space-y-2">
              {recent.map((match) => {
                const score = matchScores(match);
                return (
                  <InteractiveCard
                    key={match.id}
                    href={matchDetailsHref(eventKey, match.tba_match_key)}
                    className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3"
                  >
                    <span className="font-semibold tabular-nums">
                      {readableMatchLabel(match)}
                    </span>
                    <span className="ml-auto text-sm tabular-nums text-muted">
                      <span className="text-alliance-red">Red</span> {score.red}{" "}
                      · <span className="text-alliance-blue">Blue</span>{" "}
                      {score.blue}
                    </span>
                  </InteractiveCard>
                );
              })}
            </div>
          ) : (
            <p className="rounded-card border border-border bg-surface p-4 text-sm text-muted">
              No completed matches yet.
            </p>
          )}
        </section>
        <EventModules eventKey={eventKey} role={role} />
      </div>
    </div>
  );
}
