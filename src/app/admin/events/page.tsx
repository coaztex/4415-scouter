import Link from "next/link";
import { PageHeading } from "@/components/layout/page-heading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { EventImport } from "@/features/events/components/event-import";
import { listGameModules } from "@/games/registry";
import { adminEvents } from "@/features/admin/server/queries";
import {
  SyncControls,
  EventStatusControl,
  OurTeamControl,
  EventTimezoneControl,
  PitMapSyncControls,
} from "@/features/admin/components/event-controls";
import {
  SyncStatus,
  PitMapSyncStatus,
} from "@/features/admin/components/sync-status";
import { eventTime } from "@/features/events/timezone";
export const metadata = { title: "Event administration" };
export default async function AdminEvents() {
  const events = await adminEvents();
  return (
    <>
      <PageHeading eyebrow="Administration" title="Events" />
      <EventImport
        games={listGameModules()}
        events={[]}
        showCachedEvents={false}
      />
      <h2 className="my-6 text-xl font-bold">Imported events</h2>
      {!events.length ? (
        <EmptyState
          title="No imported events"
          description="Preview a TBA event key above, then confirm the import."
        />
      ) : (
        <div className="space-y-5">
          {events.map((event) => (
            <Card key={event.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link
                  href={`/events/${event.tba_key}`}
                  className="min-h-12 py-3 text-xl font-bold text-accent"
                >
                  {event.name}
                </Link>
                <Badge>{event.status}</Badge>
              </div>
              <p className="text-sm text-muted">{event.tba_key}</p>
              <p className="mt-2 break-words text-sm">
                TBA snapshot:{" "}
                {eventTime(event.last_tba_sync_at, event.timezone) ?? "Never"} ·
                Statbotics snapshot:{" "}
                {eventTime(event.last_statbotics_sync_at, event.timezone) ??
                  "Never"}
              </p>
              <SyncStatus states={event.event_sync_state} />
              <OurTeamControl
                id={event.id}
                teamNumber={event.our_team_number}
              />
              <SyncControls eventKey={event.tba_key} />
              <PitMapSyncStatus cache={event.pitMapCache} />
              <PitMapSyncControls
                eventKey={event.tba_key}
                nexusEventKey={event.nexus_event_key}
              />
              <EventTimezoneControl
                id={event.id}
                timezone={event.timezone}
                timezone_source={event.timezone_source}
              />
              <EventStatusControl
                key={event.status}
                id={event.id}
                status={event.status}
              />
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
