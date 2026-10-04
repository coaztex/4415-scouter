import { notFound } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { PitForm } from "@/features/pit/components/form";
import { pitTeam } from "@/features/pit/server/queries";
export const metadata = { title: "Pit report" };
export default async function Page({
  params,
}: {
  params: Promise<{ eventKey: string; teamNumber: string }>;
}) {
  const { eventKey, teamNumber } = await params,
    number = Number(teamNumber);
  if (
    !Number.isSafeInteger(number) ||
    number <= 0 ||
    String(number) !== teamNumber
  )
    notFound();
  const context = await pitTeam(eventKey, number);
  return (
    <div className="space-y-5">
      <PageHeading
        title={`Team ${number}${context.team.nickname ? ` · ${context.team.nickname}` : ""}`}
        description="Pit claims and demonstrated capability. Match-proven performance belongs in scouting observations."
      />
      <PitForm
        key={`${context.profile.id}:${context.event.id}:${number}`}
        context={{
          eventId: context.event.id,
          eventKey,
          eventStatus: context.event.status,
          status: context.member.pit_status,
          claimedBy: context.member.pit_claimed_by,
          actorId: context.profile.id,
          teamNumber: number,
          nickname: context.team.nickname,
          ownDraft: context.ownDraft,
          priorFinal: context.priorFinal,
        }}
      />
    </div>
  );
}
