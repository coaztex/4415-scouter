import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { buttonStyles } from "@/components/ui/button";
import { TeamDetail } from "@/features/teams/components/detail";
import { getTeamDetail } from "@/features/teams/server/queries";
import { TeamAvatar } from "@/features/team-avatar/components/team-avatar";
export const metadata = { title: "Team detail" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ eventKey: string; teamNumber: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { eventKey, teamNumber } = await params,
    number = Number(teamNumber);
  if (
    !Number.isSafeInteger(number) ||
    number <= 0 ||
    String(number) !== teamNumber
  )
    notFound();
  const detail = await getTeamDetail(eventKey, number);
  const selectedTab = (await searchParams).tab;
  return (
    <div className="space-y-5">
      <Link
        href={`/events/${eventKey}/teams`}
        className={buttonStyles("secondary")}
      >
        ← Team directory
      </Link>
      <PageHeading
        title={`Team ${number}${detail.row.nickname ? ` · ${detail.row.nickname}` : ""}`}
        description={
          [detail.row.city, detail.row.state].filter(Boolean).join(", ") ||
          undefined
        }
        leading={<TeamAvatar teamNumber={number} src={detail.row.avatarUrl} />}
      />
      <TeamDetail
        detail={detail}
        eventKey={eventKey}
        initialTab={selectedTab === "incidents" ? "incidents" : undefined}
      />
    </div>
  );
}
