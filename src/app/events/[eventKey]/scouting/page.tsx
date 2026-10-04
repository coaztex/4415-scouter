import { getEvent } from "@/features/events/server/queries";
import { ScoutScheduleList } from "@/features/scheduling/components/scout-list";
import { LiveUpdates } from "@/features/events/components/live-updates";
export const metadata = { title: "Match Scouting" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ eventKey: string }>;
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { eventKey } = await params;
  const event = await getEvent(eventKey);
  return (
    <>
      <ScoutScheduleList
        event={event}
        submitted={(await searchParams).submitted === "1"}
      />
      <LiveUpdates
        eventId={event.id}
        tables={["scouting_assignments", "match_scouting_submissions"]}
      />
    </>
  );
}
