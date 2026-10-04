import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { EventDashboard } from "@/features/events/components/event-dashboard";
import { getEventSchedule } from "@/features/event-schedule/server/queries";
import { getMyAssignments } from "@/features/scheduling/server/scout-queries";
import {
  eventContext,
  getEvent,
  getEventProgress,
} from "@/features/events/server/queries";
import {
  eventDates,
  eventLocation,
  shortEventLabel,
} from "@/features/events/presentation";
export const metadata: Metadata = { title: "Event workspace" };
export default async function EventPage({
  params,
}: {
  params: Promise<{ eventKey: string }>;
}) {
  const { eventKey } = await params;
  const { profile } = await eventContext();
  const event = await getEvent(eventKey);
  const [progress, schedule, assignments] = await Promise.all([
    getEventProgress(event.id),
    getEventSchedule(eventKey),
    getMyAssignments(event.id),
  ]);
  const title = shortEventLabel(event);
  return (
    <>
      <div className="mb-3">
        <Badge>
          {event.status === "active" ? "Active event" : "Archived event"}
        </Badge>
      </div>
      <header className="mb-6">
        <h1 className="max-w-3xl break-words text-[clamp(1.75rem,5vw,2.75rem)] font-semibold leading-tight tracking-tight">
          {title}
        </h1>
        {title !== event.name && (
          <p className="mt-2 max-w-3xl text-sm text-muted">{event.name}</p>
        )}
        <p className="mt-2 text-sm text-muted">
          {[
            eventDates(event.start_date, event.end_date),
            eventLocation(event),
            event.tba_key,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>
      {progress.teams === 0 && (
        <p className="mb-6 rounded-control border border-border bg-surface p-4">
          No teams are cached for this event yet.
        </p>
      )}
      <EventDashboard
        eventKey={eventKey}
        role={profile.role}
        schedule={schedule}
        assignments={assignments}
        progress={progress}
        ownTeamNumber={event.our_team_number}
        active={event.status === "active"}
      />
    </>
  );
}
