import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { buttonStyles } from "@/components/ui/button";
import { ScoutingRecord } from "@/features/teams/components/record";
import { getScoutingRecord } from "@/features/teams/server/queries";
export const metadata = { title: "Scouting record" };
export default async function Page({
  params,
}: {
  params: Promise<{
    eventKey: string;
    teamNumber: string;
    submissionId: string;
  }>;
}) {
  const { eventKey, teamNumber, submissionId } = await params,
    number = Number(teamNumber);
  if (
    !Number.isSafeInteger(number) ||
    number <= 0 ||
    String(number) !== teamNumber
  )
    notFound();
  const detail = await getScoutingRecord(eventKey, number, submissionId);
  return (
    <div className="space-y-5">
      <Link
        href={`/events/${eventKey}/teams/${number}`}
        className={buttonStyles("secondary")}
      >
        ← Team {number}
      </Link>
      <PageHeading
        title={`${detail.record.matchKey.split("_").at(-1)?.toUpperCase()} · Team ${number}`}
      />
      <ScoutingRecord
        data={detail.record.data}
        incidents={detail.incidents.filter(
          (incident) => incident.created_from_submission_id === submissionId,
        )}
      />
    </div>
  );
}
