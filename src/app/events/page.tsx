import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/layout/page-heading";
import { EmptyState } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { InteractiveCard } from "@/components/ui/interactive-card";
import { eventContext, listEvents } from "@/features/events/server/queries";
import { eventDates, eventLocation } from "@/features/events/presentation";
export const metadata: Metadata = { title: "Events" };
export default async function EventsPage() {
  const { profile } = await eventContext();
  const events = await listEvents();
  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageHeading title="Events" />
        {profile.role === "admin" && (
          <Link href="/admin/events#event-import" className={buttonStyles()}>
            Add event
          </Link>
        )}
      </div>
      {!events.length ? (
        <EmptyState
          title="No events available"
          description={
            profile.role === "admin"
              ? "Add your first event using its TBA event key."
              : "Ask an admin to add an event."
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {events.map((event) => (
            <InteractiveCard
              key={event.id}
              href={`/events/${event.tba_key}`}
              className="block p-5"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <Badge>
                  {event.status === "active" ? "Active" : "Archived"}
                </Badge>
                <span className="text-sm text-muted">{event.year}</span>
              </div>
              <h2 className="text-xl font-semibold">{event.name}</h2>
              <p className="mt-3">
                {eventDates(event.start_date, event.end_date)}
              </p>
              {eventLocation(event) && (
                <p className="mt-1 text-muted">{eventLocation(event)}</p>
              )}
              <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
                <span>
                  {event.teamCount === null
                    ? "Team count unavailable"
                    : `${event.teamCount} teams`}
                </span>
                <span>
                  {event.pitCompletedCount === null || event.teamCount === null
                    ? "Pit progress unavailable"
                    : `Pits: ${event.pitCompletedCount}/${event.teamCount} completed`}
                </span>
              </div>
              {!event.last_tba_sync_at && (
                <p className="mt-2 text-sm text-muted">
                  Official data not yet synced
                </p>
              )}
            </InteractiveCard>
          ))}
        </div>
      )}
    </>
  );
}
