import { PageHeading } from "@/components/layout/page-heading";
import { StatsControls } from "@/features/stats/components/controls";
import { Overview } from "@/features/stats/components/overview";
import { StatsSection } from "@/features/stats/components/sections";
import {
  querySchema,
  selectedMetric,
  tabLabels,
  withAvailableExternalDefault,
} from "@/features/stats/model";
import { getEventStats } from "@/features/stats/server/queries";
import { isAtLeastRole } from "@/lib/auth/roles";

export const metadata = { title: "Stats" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ eventKey: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { eventKey } = await params;
  const parsed = querySchema.parse(await searchParams);
  // The opt-in applies only where FUEL aggregates are presented.
  const query =
    parsed.tab === "external"
      ? { ...parsed, uncertain: "exclude" as const }
      : parsed;
  const { profile, rows, overall, autoStarts } = await getEventStats(
    eventKey,
    query,
  );
  const displayQuery = withAvailableExternalDefault(query, rows);
  const metric = selectedMetric(displayQuery);
  return (
    <div className="space-y-5">
      <PageHeading title="Stats" />
      <p className="text-sm text-muted">
        {isAtLeastRole(profile.role, "strategy")
          ? "Human summaries include readable event-wide scouting."
          : "Human summaries include scouting records visible to your role; strategy and admin users see event-wide observations."}
      </p>
      <StatsControls
        key={`${displayQuery.tab}:${displayQuery.q}`}
        eventKey={eventKey}
        query={displayQuery}
        teams={rows.map((row) => ({
          teamNumber: row.teamNumber,
          nickname: row.nickname,
        }))}
      />
      <h2 className="sr-only">{tabLabels[displayQuery.tab]}</h2>
      {displayQuery.tab === "overview" ? (
        <Overview
          rows={rows}
          overall={overall}
          uncertain={displayQuery.uncertain === "include"}
        />
      ) : metric ? (
        <StatsSection
          eventKey={eventKey}
          rows={rows}
          overall={overall}
          autoStarts={autoStarts}
          query={displayQuery}
          metric={metric}
        />
      ) : null}
    </div>
  );
}
