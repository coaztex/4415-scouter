export type MatchStationIdentity = {
  team_number: number;
  alliance: "red" | "blue";
  station: number;
};
export type MatchStation = MatchStationIdentity & { match_id: string };
export type StationLabel = "R1" | "R2" | "R3" | "B1" | "B2" | "B3";

/** Official DB/TBA station identity, never team-number/rank/insertion order.
 * Missing stations remain missing; this helper never invents a team or slot. */
export function getMatchStations<T extends MatchStationIdentity>(
  rows: readonly T[],
) {
  const alliance = (color: "red" | "blue") =>
    rows
      .filter(
        (row) => row.alliance === color && [1, 2, 3].includes(row.station),
      )
      .sort((a, b) => a.station - b.station)
      .map((row) => ({
        ...row,
        stationLabel:
          `${color === "red" ? "R" : "B"}${row.station}` as StationLabel,
      }));
  return { red: alliance("red"), blue: alliance("blue") };
}
