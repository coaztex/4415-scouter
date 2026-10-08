"use client";
import { usePitPresence } from "./use-pit-presence";
export function PitFormPresence({
  eventId,
  teamNumber,
  enabled,
}: {
  eventId: string;
  teamNumber: number;
  enabled: boolean;
}) {
  const presence = usePitPresence(eventId, teamNumber, enabled);
  return presence.otherTeams.includes(teamNumber) ? (
    <p
      role="status"
      className="rounded-control border border-warning bg-surface px-4 py-3 text-sm"
    >
      Another scout is working on this team.
    </p>
  ) : null;
}
