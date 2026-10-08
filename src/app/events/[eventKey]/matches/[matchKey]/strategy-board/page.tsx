import { getStrategyBoard } from "@/features/strategy-board/server/queries";
import { StrategyBoard } from "@/features/strategy-board/components/board";
export default async function Page({
  params,
}: {
  params: Promise<{ eventKey: string; matchKey: string }>;
}) {
  const { eventKey, matchKey } = await params;
  const context = await getStrategyBoard(eventKey, matchKey);
  return (
    <StrategyBoard
      key={`${context.actorId}:${context.eventId}:${context.matchId}`}
      context={context}
    />
  );
}
