import Link from "next/link";
import { PageHeading } from "@/components/layout/page-heading";
import { EmptyState } from "@/components/ui/states";
import { timezoneNotice } from "@/features/events/timezone";
import {
  groups,
  groupLabels,
  matchGroup,
  isPlayed,
  hasOfficialStart,
  deriveSchedulePosition,
  officialMatchLabel,
  currentEvidenceExpiresAt,
  type MatchGroup,
} from "../model";
import type { EventScheduleData } from "../server/queries";
import { MatchCard } from "./match-card";
import { CoverageLegend } from "./coverage";
import { SchedulePosition } from "./position";
import { LiveUpdates } from "@/features/events/components/live-updates";
import { FreshnessStatus } from "./freshness";
import { CurrentExpiry } from "./current-expiry";

export function EventSchedule({
  data,
  group,
  now,
  liveWindow,
  staleAfterMs,
}: {
  data: EventScheduleData;
  group: MatchGroup;
  now: number;
  liveWindow: boolean;
  staleAfterMs: number;
}) {
  const { event, matches } = data;
  const filtered = matches.filter(
    (match) => group === "all" || matchGroup(match.comp_level) === group,
  );
  const position = deriveSchedulePosition(
    filtered,
    event.last_tba_sync_at,
    now,
  );
  const targetId = position.targetId
    ? `schedule-match-${position.targetId}`
    : null;
  const completedCount = filtered.filter(isPlayed).length;
  const lastCompletedIndex = position.lastCompleted
    ? filtered.findIndex((match) => match.id === position.lastCompleted?.id)
    : -1;
  return (
    <div className="space-y-5">
      <PageHeading title="Schedule" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          className="inline-flex max-w-full gap-1 overflow-x-auto rounded-control border border-border-strong bg-surface p-1"
          aria-label="Match phase"
        >
          {groups.map((value) => (
            <Link
              key={value}
              prefetch={false}
              href={`/events/${event.tba_key}/schedule?group=${value}`}
              aria-current={group === value ? "page" : undefined}
              className={`flex min-h-11 shrink-0 items-center rounded-control px-3.5 py-2 text-sm font-semibold transition-colors ${group === value ? "bg-brand-secondary text-on-brand-secondary" : "text-foreground hover:bg-accent-soft"}`}
            >
              {groupLabels[value]}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <SchedulePosition
            targetId={targetId}
            label={
              position.current
                ? "current"
                : position.startedPending
                  ? "started match"
                  : position.next
                    ? "next"
                    : "latest completed"
            }
          />
          <Link
            className="inline-flex min-h-11 items-center py-2 text-sm font-semibold text-accent underline-offset-4 hover:underline"
            href={`/events/${event.tba_key}/scouting`}
          >
            Match Scouting →
          </Link>
        </div>
      </div>
      <div
        className="border-l-2 border-brand-secondary pl-3 text-sm"
        aria-label="Schedule position"
      >
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <p>
            Last completed:{" "}
            <strong>
              {position.lastCompleted
                ? officialMatchLabel(position.lastCompleted)
                : "None cached"}
            </strong>
          </p>
          {position.current ? (
            <p className="font-semibold text-accent">
              CURRENT — {officialMatchLabel(position.current)}
            </p>
          ) : position.startedPending ? (
            <p>
              Started · result pending:{" "}
              <strong>{officialMatchLabel(position.startedPending)}</strong>
            </p>
          ) : position.next ? (
            <p>
              {position.next.scheduled_time
                ? "Next scheduled"
                : "Next unplayed"}
              : <strong>{officialMatchLabel(position.next)}</strong>
            </p>
          ) : (
            <p>No later match cached</p>
          )}
          {(position.current || position.startedPending) &&
            position.following && (
              <p>
                {hasOfficialStart(position.following)
                  ? "Also started · result pending"
                  : position.following.scheduled_time
                    ? "Next scheduled"
                    : "Next unplayed"}
                : <strong>{officialMatchLabel(position.following)}</strong>
              </p>
            )}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        <p>Event time: {timezoneNotice(event)}</p>
        <p>
          <FreshnessStatus
            lastSync={event.last_tba_sync_at}
            initialNow={now}
            liveWindow={liveWindow}
            syncExpiresAt={data.syncExpiresAt}
            staleAfterMs={staleAfterMs}
            timezone={event.timezone}
          />
        </p>
      </div>
      <CoverageLegend />
      {!data.coverageAvailable && (
        <p
          role="status"
          className="rounded-control border border-border bg-surface p-3"
        >
          Scouting status unavailable.
        </p>
      )}
      {!matches.length ? (
        <EmptyState
          title="Schedule not yet published"
          description="No matches available. Ask an admin to sync the schedule."
        />
      ) : !filtered.length ? (
        <EmptyState
          title={`No ${groupLabels[group].toLowerCase()} matches cached`}
          description="No matches in this phase. Try All or sync the schedule."
        />
      ) : (
        <section className="space-y-3" aria-label="Official matches">
          <h2 className="text-lg font-semibold">
            Official matches{" "}
            <span className="text-base font-normal text-muted">
              · {completedCount} completed / {filtered.length} cached
            </span>
          </h2>
          <div className="grid gap-4 xl:grid-cols-2">
            {filtered.map((match, index) => {
              const isCurrent = position.current?.id === match.id;
              const isNext = position.next?.id === match.id;
              const phaseLabel = isPlayed(match)
                ? "Completed"
                : isCurrent
                  ? "CURRENT"
                  : isNext && hasOfficialStart(match)
                    ? "Result pending"
                    : isNext
                      ? match.scheduled_time
                        ? "Next scheduled"
                        : "Next unplayed"
                      : hasOfficialStart(match) || index < lastCompletedIndex
                        ? "Result pending"
                        : match.scheduled_time
                          ? "Scheduled"
                          : "Unplayed";
              return (
                <div key={match.id} className="contents">
                  {isNext && (
                    <div
                      role="separator"
                      aria-label={
                        isCurrent
                          ? "Current match"
                          : position.startedPending
                            ? "Started match awaiting result"
                            : match.scheduled_time
                              ? "Next scheduled match"
                              : "Next unplayed match"
                      }
                      className="col-span-full flex items-center gap-3 py-2 text-xs font-semibold uppercase tracking-wide text-accent"
                    >
                      <span className="h-px flex-1 bg-border" />
                      {isCurrent
                        ? "CURRENT"
                        : position.startedPending
                          ? "RESULT PENDING"
                          : match.scheduled_time
                            ? "NEXT SCHEDULED"
                            : "NEXT UNPLAYED"}
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  <div
                    id={`schedule-match-${match.id}`}
                    className="scroll-mt-24"
                  >
                    <MatchCard
                      match={match}
                      eventKey={event.tba_key}
                      timezone={event.timezone}
                      phaseLabel={phaseLabel}
                      emphasized={isNext}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
      <LiveUpdates eventId={event.id} tables={["scouting_coverage_signal"]} />
      {position.current && (
        <CurrentExpiry
          expiresAt={currentEvidenceExpiresAt(
            position.current,
            event.last_tba_sync_at,
          )!}
        />
      )}
    </div>
  );
}
