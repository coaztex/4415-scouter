import Link from "next/link";
import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { PageHeading } from "@/components/layout/page-heading";
import { isAtLeastRole } from "@/lib/auth/roles";
import { eventContext } from "@/features/events/server/queries";
import { getMyAssignments } from "../server/scout-queries";
import type { ScoutScheduleRow } from "../scout-schedule";
import { FinishBreak } from "./break-control";
import { eventTime } from "@/features/events/timezone";
function Row({
  row,
  eventKey,
  next = false,
  active,
  timezone,
}: {
  row: ScoutScheduleRow;
  eventKey: string;
  next?: boolean;
  active: boolean;
  timezone: string;
}) {
  return (
    <Card className={next ? "border-2 border-accent" : ""}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className={next ? "text-2xl font-bold" : "text-lg font-bold"}>
          {row.assignment_type === "break"
            ? row.breakBlock
              ? `BREAK · ${row.breakBlock.length}-match block`
              : "BREAK"
            : `Scout team ${row.team_number}`}
        </h3>
        <span
          className={`${row.status === "submitted" ? "scouting-status-complete" : row.status === "in_progress" ? "scouting-status-in_progress" : row.status === "missed" ? "scouting-status-missing" : "border-border bg-background"} inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold`}
        >
          {row.status === "submitted"
            ? "✓ "
            : row.status === "in_progress"
              ? "◐ "
              : row.status === "missed"
                ? "! "
                : ""}
          {row.assignment_type === "break" && row.completed
            ? "Break complete"
            : row.displayStatus.replace("_", " ")}
        </span>
      </div>
      <p className="mt-3 font-bold">
        {row.match?.tba_match_key ?? "Unanchored break / match unavailable"}
      </p>
      {row.station && (
        <p className="mt-2 text-lg capitalize">
          {row.station.alliance} alliance · Station {row.station.station}
        </p>
      )}
      {row.match?.scheduled_time && (
        <p className="mt-2 text-sm text-muted">
          <span aria-hidden="true">▦</span> Scheduled{" "}
          {eventTime(row.match.scheduled_time, timezone)}
        </p>
      )}
      {row.assignment_type === "break" && (
        <p className="mt-3 text-muted">
          {row.breakBlock && `${row.breakBlock.first}–${row.breakBlock.last}. `}
          Rest during this match. Finish when ready for your next assignment.
        </p>
      )}
      {row.assignment_type === "match" &&
        !row.completed &&
        row.match &&
        active && (
          <Link
            href={`/events/${eventKey}/scout/match/${row.id}`}
            className={`mt-4 ${buttonStyles("primary")}`}
          >
            Open assignment
          </Link>
        )}
      {row.assignment_type === "break" && !row.completed && next && active && (
        <FinishBreak id={row.id} />
      )}
    </Card>
  );
}
export async function ScoutScheduleList({
  event,
  submitted = false,
}: {
  event: {
    id: string;
    tba_key: string;
    name: string;
    status: string;
    timezone: string;
  };
  submitted?: boolean;
}) {
  const { profile } = await eventContext(),
    schedule = await getMyAssignments(event.id);
  return (
    <div className="space-y-6">
      <PageHeading
        title="Match Scouting"
        description="Assignments and breaks in match order."
      />
      {isAtLeastRole(profile.role, "strategy") && (
        <Link
          href={`/schedule?event=${event.tba_key}`}
          className={buttonStyles("secondary")}
        >
          Manage scout schedule
        </Link>
      )}
      {submitted && (
        <p
          role="status"
          className="rounded-control border border-accent bg-accent-soft p-4 font-bold"
        >
          Submission confirmed. Your next assignment is highlighted below.
        </p>
      )}
      <section
        aria-labelledby="next-assignment"
        className={
          submitted ? "rounded-card bg-accent-soft p-4 ring-2 ring-accent" : ""
        }
      >
        <h2 id="next-assignment" className="mb-3 text-xl font-bold">
          Next
        </h2>
        {schedule.next ? (
          <Row
            row={schedule.next}
            eventKey={event.tba_key}
            next
            active={event.status === "active"}
            timezone={event.timezone}
          />
        ) : (
          <EmptyState
            title="No pending assignments"
            description="A lead can assign matches, or you have completed your current schedule."
          />
        )}
      </section>
      <section>
        <h2 className="mb-3 text-xl font-bold">
          Upcoming · {schedule.upcoming.length}
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {schedule.upcoming.map((row) => (
            <Row
              key={row.id}
              row={row}
              eventKey={event.tba_key}
              active={event.status === "active"}
              timezone={event.timezone}
            />
          ))}
        </div>
        {!schedule.upcoming.length && (
          <p className="text-muted">No further assignments or breaks.</p>
        )}
      </section>
      <section>
        <h2 className="mb-3 text-xl font-bold">
          Completed / missed · {schedule.completed.length}
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {schedule.completed.map((row) => (
            <Row
              key={row.id}
              row={row}
              eventKey={event.tba_key}
              active={event.status === "active"}
              timezone={event.timezone}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
