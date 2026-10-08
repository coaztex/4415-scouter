import type { StationLabel } from "@/features/events/match-stations";

// Presentation belongs to the station in this match, never to a global team.
// Dark text on these bright fills remains readable; labels also identify owners.
export const STATION_PALETTE = {
  R1: "#ffad66",
  R2: "#ff80bf",
  R3: "#ffe066",
  B1: "#67e8f9",
  B2: "#c4a0ff",
  B3: "#b9f566",
} as const satisfies Record<StationLabel, string>;
export const STATION_ORDER = ["R1", "R2", "R3", "B1", "B2", "B3"] as const;
export const STRATEGY_INK = "#111827";
export const UNOWNED_COLOR = "#e5e7eb";
export const stationAlliance = (station: StationLabel) =>
  station.startsWith("R") ? "red" : "blue";
export const drawingColor = (station: StationLabel | null) =>
  station ? STATION_PALETTE[station] : UNOWNED_COLOR;

/** Preserve every station's slot even when the cached assignment is missing. */
export function stationSlots<
  T extends { station: StationLabel; teamNumber: number },
>(teams: readonly T[]) {
  return STATION_ORDER.map((station) => ({
    station,
    team: teams.find((team) => team.station === station) ?? null,
    alliance: stationAlliance(station),
    color: STATION_PALETTE[station],
  }));
}
