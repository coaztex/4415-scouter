import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthorizationError, requireRole } from "@/lib/auth/server";
import { PageHeading } from "@/components/layout/page-heading";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Select } from "@/components/ui/fields";
import { Button, buttonStyles } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listSchedulingEvents, readScheduleSnapshot } from "../server/queries";
import { assignmentSlot } from "../model";
import { ScheduleGenerator } from "./generator";
import { ManualAssignmentEditor } from "./manual-editor";
import { LiveUpdates } from "@/features/events/components/live-updates";
export async function SchedulingWorkspace({
  searchParams,
  basePath,
}: {
  searchParams: Promise<{ event?: string; page?: string }>;
  basePath: string;
}) {
  try {
    await requireRole("strategy");
  } catch (error) {
    if (error instanceof AuthorizationError && error.status === 401)
      redirect("/login");
    return (
      <ErrorState
        title="Access denied"
        description="An active strategy lead or administrator is required."
      />
    );
  }
  const events = await listSchedulingEvents(),
    params = await searchParams;
  const selected = events.find((e) => e.tba_key === params.event) ?? events[0];
  const snapshot = selected ? await readScheduleSnapshot(selected.id) : null;
  const page = Math.max(
    1,
    Math.min(10000, Number.parseInt(params.page ?? "1", 10) || 1),
  );
  const assignments = snapshot
    ? [...snapshot.data.assignments].sort(
        (a, b) =>
          a.sequence - b.sequence || a.scout_name.localeCompare(b.scout_name),
      )
    : [];
  return (
    <div className="space-y-6">
      <PageHeading eyebrow="Team operations" title="Scout Scheduling" />
      {events.length > 0 && (
        <form action={basePath} className="flex flex-wrap items-end gap-3">
          <Select
            id="schedule-event"
            name="event"
            label="Event"
            defaultValue={selected?.tba_key}
          >
            {events.map((e) => (
              <option key={e.id} value={e.tba_key}>
                {e.name} · {e.status}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            View schedule
          </Button>
        </form>
      )}
      {!snapshot ? (
        <EmptyState
          title="No events available"
          description="Ask an admin to import the event and schedule."
        />
      ) : (
        <>
          <LiveUpdates
            eventId={snapshot.data.event.id}
            tables={["scouting_assignments", "match_scouting_submissions"]}
          />
          <Link
            href={`/events/${snapshot.data.event.tba_key}/scouting`}
            className={buttonStyles("secondary")}
          >
            View my scout schedule
          </Link>
          {snapshot.data.event.status === "archived" && (
            <p role="status">
              This event is archived. Schedule editing is disabled.
            </p>
          )}
          {!snapshot.data.matches.length ? (
            <EmptyState
              title="No imported matches"
              description="Sync the TBA match roster before assigning scouts."
            />
          ) : (
            <>
              <ScheduleGenerator
                key={snapshot.data.event.id}
                snapshot={snapshot}
              />
              <ManualAssignmentEditor
                key={snapshot.version + "new"}
                snapshot={snapshot}
              />
            </>
          )}
          <section className="space-y-4">
            <h2 className="text-xl font-bold">
              Saved assignments · {assignments.length}
            </h2>
            {!assignments.length && (
              <EmptyState
                title="No assignments yet"
                description="Generate a schedule or add an assignment."
              />
            )}
            {assignments.slice((page - 1) * 25, page * 25).map((a) => {
              const m = snapshot.data.matches.find(
                  (m) => m.id === assignmentSlot(a),
                ),
                s = m?.stations.find((s) => s.team_number === a.team_number);
              return (
                <article
                  key={a.id}
                  className="space-y-3 rounded-card border border-border bg-surface p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-bold">
                      {m?.key ?? "Legacy unanchored break"} · {a.scout_name}
                    </h3>
                    <Badge>
                      {a.assignment_type === "break"
                        ? "Break"
                        : a.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <p>
                    {a.assignment_type === "break"
                      ? `Rest during this match${a.status === "submitted" ? " · completed" : ""}`
                      : `Team ${a.team_number} · ${s?.alliance ?? "unknown"} station ${s?.station ?? "?"}`}
                  </p>
                  <ManualAssignmentEditor
                    key={snapshot.version + a.id}
                    snapshot={snapshot}
                    assignment={a}
                  />
                </article>
              );
            })}
            <div className="flex gap-3">
              {page > 1 && (
                <Link
                  className={buttonStyles("secondary")}
                  href={`${basePath}?event=${selected?.tba_key}&page=${page - 1}`}
                >
                  Previous
                </Link>
              )}
              {page * 25 < assignments.length && (
                <Link
                  className={buttonStyles("secondary")}
                  href={`${basePath}?event=${selected?.tba_key}&page=${page + 1}`}
                >
                  Next
                </Link>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
