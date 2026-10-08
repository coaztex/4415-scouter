import { notFound } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { PitForm } from "@/features/pit/components/form";
import { pitTeam } from "@/features/pit/server/queries";
import { PitFormPresence } from "@/features/pit-map/components/pit-form-presence";
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
        description="Team-reported capabilities."
      />
      {context.pitLabel && (
        <p className="text-sm font-semibold">
          Pit: {context.pitLabel}
          {context.pitMapSource === "nexus" && (
            <>
              {" "}
              ·{" "}
              <a
                href="https://frc.nexus"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent"
              >
                Nexus ↗
              </a>
            </>
          )}
        </p>
      )}
      <PitFormPresence
        eventId={context.event.id}
        teamNumber={number}
        enabled={context.event.status === "active"}
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
