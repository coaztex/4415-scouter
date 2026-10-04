import { getEventSchedule } from "@/features/event-schedule/server/queries";
import { EventSchedule } from "@/features/event-schedule/components/schedule";
import { groups } from "@/features/event-schedule/model";
import {
  isEventInLiveWindow,
  tbaAutoRefreshSeconds,
} from "@/features/events/server/live-refresh";
export const metadata = { title: "Schedule" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ eventKey: string }>;
  searchParams: Promise<{ group?: string }>;
}) {
  const { eventKey } = await params,
    query = await searchParams;
  const group = groups.find((value) => value === query.group) ?? "all";
  const data = await getEventSchedule(eventKey);
  return (
    <EventSchedule
      data={data}
      group={group}
      now={data.generatedAt}
      liveWindow={isEventInLiveWindow(data.event)}
      staleAfterMs={tbaAutoRefreshSeconds() * 1000}
    />
  );
}
