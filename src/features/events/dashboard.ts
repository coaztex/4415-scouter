import {
  isPlayed,
  orderedMatches,
  type OfficialMatch,
} from "@/features/event-schedule/model";

export type DashboardMatch = OfficialMatch & {
  stations: readonly { team_number: number; alliance: "red" | "blue" }[];
};

export function dashboardMatches<T extends DashboardMatch>(
  matches: readonly T[],
  ownTeamNumber: number | null,
  active: boolean,
) {
  const ordered = orderedMatches(matches);
  const completed = ordered.filter(isPlayed);
  const upcoming = ordered.filter((match) => !isPlayed(match));
  const ourNext =
    active && ownTeamNumber !== null
      ? upcoming.find((match) =>
          match.stations.some(
            (station) => station.team_number === ownTeamNumber,
          ),
        )
      : null;
  const featured = ourNext ?? completed.at(-1) ?? upcoming[0] ?? null;
  const kind = ourNext
    ? "our-next"
    : featured && isPlayed(featured)
      ? "latest"
      : "upcoming";
  const recent = completed
    .filter((match) => match.id !== featured?.id)
    .slice(-3)
    .reverse();
  return { featured, kind, recent, completedCount: completed.length };
}
