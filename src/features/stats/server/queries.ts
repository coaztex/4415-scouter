import "server-only";
import { getTeamDirectory } from "@/features/teams/server/queries";
import { buildStatsRows, type StatsQuery } from "../model";

export async function getEventStats(eventKey: string, query: StatsQuery) {
  const directory = await getTeamDirectory(eventKey);
  const stats = buildStatsRows(
    directory.event.id,
    directory.rows,
    query.uncertain === "include",
  );
  if (query.tab === "auto") {
    for (const row of stats.rows)
      row.claimedRoutines =
        directory.pitMap.get(row.teamNumber)?.autonomous_routines ?? null;
  }
  return { ...directory, ...stats };
}
