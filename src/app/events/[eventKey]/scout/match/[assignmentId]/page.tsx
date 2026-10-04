import { z } from "zod";
import { notFound } from "next/navigation";
import { getCaptureContext } from "@/features/scouting/match/server/context";
import { MatchWorkflow } from "@/features/scouting/match/components/workflow";
export const metadata = { title: "Match scouting" };
export default async function Page({
  params,
}: {
  params: Promise<{ eventKey: string; assignmentId: string }>;
}) {
  const { eventKey, assignmentId } = await params;
  if (!z.uuid().safeParse(assignmentId).success) notFound();
  const context = await getCaptureContext(eventKey, assignmentId);
  return (
    <MatchWorkflow
      key={context.actorId + context.assignmentId}
      context={context}
    />
  );
}
