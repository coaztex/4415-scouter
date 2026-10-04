export type LiveTable =
  | "events"
  | "event_teams"
  | "scouting_assignments"
  | "match_scouting_submissions"
  | "scouting_coverage_signal";

export function liveChangeEvents(table: LiveTable): ("INSERT" | "UPDATE")[] {
  return table === "events" || table === "event_teams"
    ? ["UPDATE"]
    : ["INSERT", "UPDATE"];
}

export function liveChangeFilter(eventId: string, table: LiveTable) {
  return table === "events" ? `id=eq.${eventId}` : `event_id=eq.${eventId}`;
}
