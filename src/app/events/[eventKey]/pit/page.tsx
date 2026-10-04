import { PageHeading } from "@/components/layout/page-heading";
import { PitTeamList } from "@/features/pit/components/team-list";
import { listPitTeams } from "@/features/pit/server/queries";
import { LiveUpdates } from "@/features/events/components/live-updates";
export const metadata = { title: "Pit Scouting" };
export default async function Page({
  params,
}: {
  params: Promise<{ eventKey: string }>;
}) {
  const { eventKey } = await params,
    { event, rows } = await listPitTeams(eventKey);
  return (
    <div className="space-y-5">
      <PageHeading title="Pit Scouting" />
      <PitTeamList eventKey={eventKey} rows={rows} />
      <LiveUpdates eventId={event.id} tables={["event_teams"]} />
    </div>
  );
}
