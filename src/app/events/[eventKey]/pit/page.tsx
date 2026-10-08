import { PageHeading } from "@/components/layout/page-heading";
import { PitScouting } from "@/features/pit-map/components/pit-scouting";
import { listPitTeams } from "@/features/pit/server/queries";
import { LiveUpdates } from "@/features/events/components/live-updates";
export const metadata = { title: "Pit Scouting" };
export default async function Page({
  params,
}: {
  params: Promise<{ eventKey: string }>;
}) {
  const { eventKey } = await params,
    { event, rows, pitMap, completed } = await listPitTeams(eventKey);
  return (
    <div className="space-y-5">
      <PageHeading title="Pit Scouting" />
      <PitScouting
        eventId={event.id}
        eventKey={eventKey}
        rows={rows}
        map={pitMap}
        completed={completed}
        activeEvent={event.status === "active"}
      />
      <LiveUpdates
        eventId={event.id}
        tables={["event_teams", "scouting_coverage_signal"]}
      />
    </div>
  );
}
