import type { ReactNode } from "react";
import { eventContext, getEvent } from "@/features/events/server/queries";
import { EventNavigation } from "@/features/events/components/event-navigation";
import { LiveUpdates } from "@/features/events/components/live-updates";
import {
  eventCacheFreshness,
  isEventInLiveWindow,
} from "@/features/events/server/live-refresh";
import { eventTime } from "@/features/events/timezone";
import { shortEventLabel } from "@/features/events/presentation";
export default async function EventLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ eventKey: string }>;
}) {
  const { eventKey } = await params;
  await eventContext();
  const event = await getEvent(eventKey);
  const liveWindow = isEventInLiveWindow(event);
  const freshness = eventCacheFreshness(event);
  return (
    <>
      <EventNavigation eventKey={eventKey} label={shortEventLabel(event)} />
      <LiveUpdates
        eventId={event.id}
        eventKey={eventKey}
        tables={["events"]}
        checkTba={liveWindow}
      />
      {freshness.stale && (
        <p
          className="mb-5 rounded-control border border-warning bg-surface p-3 text-sm"
          role="status"
        >
          {event.last_tba_sync_at
            ? `Official TBA cache may be stale. Last synced ${eventTime(event.last_tba_sync_at, event.timezone) ?? "at an unavailable time"}.`
            : "Official TBA data has not been synced for this event. Cached schedules and external metrics may be unavailable."}
        </p>
      )}
      {children}
    </>
  );
}
