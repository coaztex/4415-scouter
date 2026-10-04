import { getOfficialMatch } from "@/features/event-schedule/server/queries";
import { MatchDetails } from "@/features/event-schedule/components/details";
import { RefreshEvent } from "@/features/event-schedule/components/refresh";
import { LiveUpdates } from "@/features/events/components/live-updates";
import {
  isEventInLiveWindow,
  tbaAutoRefreshSeconds,
} from "@/features/events/server/live-refresh";
export const metadata = { title: "Match Details" };
export default async function Page({
  params,
}: {
  params: Promise<{ eventKey: string; matchKey: string }>;
}) {
  const { eventKey, matchKey } = await params;
  const data = await getOfficialMatch(eventKey, matchKey);
  return (
    <>
      <MatchDetails
        data={data}
        liveWindow={isEventInLiveWindow(data.event)}
        staleAfterMs={tbaAutoRefreshSeconds() * 1000}
        refresh={
          data.profile.role === "admin" && data.event.status === "active" ? (
            <RefreshEvent eventKey={eventKey} />
          ) : undefined
        }
      />
      <LiveUpdates
        eventId={data.event.id}
        tables={["scouting_coverage_signal"]}
      />
    </>
  );
}
