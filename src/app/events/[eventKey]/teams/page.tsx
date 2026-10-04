import { PageHeading } from "@/components/layout/page-heading";
import { TeamDirectory } from "@/features/teams/components/directory";
import { getTeamDirectory } from "@/features/teams/server/queries";
import { isAtLeastRole } from "@/lib/auth/roles";
export const metadata = { title: "Teams" };
export default async function Page({
  params,
}: {
  params: Promise<{ eventKey: string }>;
}) {
  const { eventKey } = await params,
    { rows, profile } = await getTeamDirectory(eventKey, true);
  return (
    <div className="space-y-5">
      <PageHeading title="Teams" />
      <TeamDirectory
        eventKey={eventKey}
        source={rows.map(({ observations, ...summary }) => {
          void observations;
          return summary;
        })}
        eventWide={isAtLeastRole(profile.role, "strategy")}
      />
    </div>
  );
}
