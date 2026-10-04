import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeading } from "@/components/layout/page-heading";
import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { timezoneNotice } from "@/features/events/timezone";
import { GameScoreBreakdown } from "@/games/score-breakdown";
import { isAtLeastRole } from "@/lib/auth/roles";
import {
  isPlayed,
  officialMatchLabel,
  resultLabel,
  matchScores,
  matchTimeLabel,
  matchPrepHref,
  deriveSchedulePosition,
  currentEvidenceExpiresAt,
} from "../model";
import type { OfficialMatchData } from "../server/queries";
import { CoverageBadge } from "./coverage";
import { MatchVideo } from "./video";
import { FreshnessStatus } from "./freshness";
import { CurrentExpiry } from "./current-expiry";

export function MatchDetails({
  data,
  refresh,
  liveWindow,
  staleAfterMs,
}: {
  data: OfficialMatchData;
  refresh?: ReactNode;
  liveWindow: boolean;
  staleAfterMs: number;
}) {
  const { event, match, teams, profile } = data;
  const scores = matchScores(match),
    played = isPlayed(match);
  const position = deriveSchedulePosition(
    data.matches,
    event.last_tba_sync_at,
    data.generatedAt,
  );
  const raw =
    data.raw && typeof data.raw === "object" && !Array.isArray(data.raw)
      ? data.raw
      : {};
  return (
    <div className="space-y-5">
      <Link
        href={`/events/${event.tba_key}/schedule`}
        className="inline-flex min-h-12 items-center font-bold text-accent"
      >
        ← Schedule
      </Link>
      <PageHeading
        title={officialMatchLabel(match, true)}
        description={matchTimeLabel(match, event.timezone)}
      />
      <p className="text-sm text-muted">
        {timezoneNotice(event)} · {match.tba_match_key}
      </p>
      <p className="text-sm font-semibold text-muted" role="status">
        {position.current?.id === match.id
          ? "CURRENT · "
          : position.startedPending?.id === match.id
            ? "Result pending · "
            : position.next?.id === match.id && !played
              ? match.scheduled_time
                ? "Next scheduled · "
                : "Next unplayed · "
              : ""}
        <FreshnessStatus
          lastSync={event.last_tba_sync_at}
          initialNow={data.generatedAt}
          liveWindow={liveWindow}
          syncExpiresAt={data.syncExpiresAt}
          staleAfterMs={staleAfterMs}
          timezone={event.timezone}
        />
      </p>
      {position.current?.id === match.id && (
        <CurrentExpiry
          expiresAt={currentEvidenceExpiresAt(match, event.last_tba_sync_at)!}
        />
      )}
      <div className="flex flex-wrap gap-3">
        {refresh}
        <a
          href={`https://www.thebluealliance.com/match/${encodeURIComponent(match.tba_match_key)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonStyles("secondary")}
        >
          TBA ↗
        </a>
        {isAtLeastRole(profile.role, "strategy") && (
          <Link
            href={matchPrepHref(event.tba_key, match.tba_match_key)}
            className={buttonStyles("primary")}
          >
            Match Prep
          </Link>
        )}
      </div>
      <section
        aria-label="Official match result"
        className="overflow-hidden rounded-card border border-border"
      >
        <h2 className="bg-surface p-3 text-center text-xl font-bold">
          {resultLabel(match)}
        </h2>
        <div className="grid grid-cols-2">
          {(["red", "blue"] as const).map((alliance) => (
            <div
              key={alliance}
              className={`alliance-${alliance} border-t p-5 text-center`}
            >
              <h3 className="font-bold uppercase">{alliance} alliance</h3>
              <p className="mt-2 text-4xl font-bold tabular-nums">
                {played ? (scores[alliance] ?? "—") : "—"}
              </p>
              <p className="mt-1 text-sm text-muted">
                {played
                  ? scores[alliance] === null
                    ? "Score unavailable"
                    : "Official score"
                  : "Awaiting result"}
              </p>
            </div>
          ))}
        </div>
      </section>
      {!data.coverageAvailable && (
        <p role="status">
          Scouting status unavailable. No missing or completed state has been
          inferred.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {(["red", "blue"] as const).map((alliance) => (
          <section
            key={alliance}
            className={`alliance-${alliance} rounded-card border p-4`}
            aria-label={`${alliance} alliance teams`}
          >
            <h2 className="mb-3 text-lg font-bold capitalize">
              {alliance} alliance
            </h2>
            <div className="space-y-3">
              {teams
                .filter((team) => team.alliance === alliance)
                .map((team) => {
                  const record = team.records.find((row) => row.viewHref);
                  return (
                    <article
                      key={team.team_number}
                      className="rounded-control border border-border bg-surface p-3"
                    >
                      <Link
                        href={`/events/${event.tba_key}/teams/${team.team_number}`}
                        className="inline-flex min-h-12 items-center font-bold text-accent"
                      >
                        {team.team_number} ·{" "}
                        {team.nickname ?? "Name unavailable"}
                      </Link>
                      <div className="flex flex-wrap items-center gap-2">
                        <CoverageBadge state={team.coverage.state} />
                        <span className="text-sm text-muted">
                          {team.coverage.count === null
                            ? "Count unavailable"
                            : `${team.coverage.count} completed`}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {record?.viewHref && (
                          <Link
                            href={record.viewHref}
                            className={buttonStyles("secondary")}
                          >
                            View
                          </Link>
                        )}
                        {team.assignmentId && (
                          <Link
                            href={`/events/${event.tba_key}/scout/match/${team.assignmentId}`}
                            className={buttonStyles("primary")}
                          >
                            Scout
                          </Link>
                        )}
                        {!record?.viewHref && !team.assignmentId && (
                          <p className="text-sm text-muted">
                            {team.coverage.state === "complete"
                              ? "Detailed reports are restricted or unavailable."
                              : "No scouting assignment for you."}
                          </p>
                        )}
                      </div>
                    </article>
                  );
                })}
              {!teams.some((team) => team.alliance === alliance) && (
                <p>Alliance roster unavailable.</p>
              )}
            </div>
          </section>
        ))}
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-xl font-bold">Match video</h2>
          <MatchVideo raw={data.raw} />
        </Card>
        <Card>
          <h2 className="mb-3 text-xl font-bold">Official score breakdown</h2>
          {played ? (
            <GameScoreBreakdown
              gameSlug={event.game_slug}
              payload={raw.score_breakdown}
            />
          ) : (
            <p className="text-muted">
              Detailed score breakdown unavailable until an official result is
              cached.
            </p>
          )}
        </Card>
      </div>
      <Card>
        <h2 className="mb-3 text-xl font-bold">Our scouting · this match</h2>
        {!data.recordsAvailable && (
          <p role="status">
            Scouting record details are temporarily unavailable.
          </p>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {teams.map((team) => (
            <article
              key={team.team_number}
              className="rounded-control border border-border p-3"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold">Team {team.team_number}</h3>
                <CoverageBadge state={team.coverage.state} />
              </div>
              <p className="text-sm text-muted">
                {team.coverage.count === null
                  ? "Completed count unavailable"
                  : `${team.coverage.count} completed observations for this robot-match`}
              </p>
              {team.records[0]?.summary.length ? (
                <p className="mt-2 text-sm">
                  Latest readable observation:{" "}
                  {team.records[0].summary.join(" · ")}
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  {team.coverage.state === "missing"
                    ? "No scouting record yet."
                    : team.coverage.state === "in_progress"
                      ? "Scouting started; awaiting a final observation."
                      : "No readable observation summary available."}
                </p>
              )}
              {team.records
                .filter((record) => record.viewHref)
                .map((record, index) => (
                  <Link
                    key={record.id}
                    href={record.viewHref!}
                    className="mr-4 inline-flex min-h-12 items-center font-bold text-accent underline"
                  >
                    View scouting
                    {team.records.length > 1 ? ` ${index + 1}` : ""}
                  </Link>
                ))}
            </article>
          ))}
        </div>
      </Card>
    </div>
  );
}
