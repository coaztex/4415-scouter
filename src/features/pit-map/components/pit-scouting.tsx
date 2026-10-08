"use client";
import { useMemo, useState } from "react";
import { PitTeamList } from "@/features/pit/components/team-list";
import { visibleTeams, type TeamListRow } from "@/features/pit/model";
import type { EventPitMap } from "../model";
import { PitMap } from "./pit-map";
import { usePitPresence } from "./use-pit-presence";

export function PitScouting({
  eventId,
  eventKey,
  rows,
  map,
  completed,
  activeEvent,
}: {
  eventId: string;
  eventKey: string;
  rows: TeamListRow[];
  map: EventPitMap | null;
  completed: number[];
  activeEvent: boolean;
}) {
  const [search, setSearch] = useState("");
  const presence = usePitPresence(eventId, null, activeEvent);
  const knownTeams = useMemo(
    () => new Set(rows.map((r) => r.teamNumber)),
    [rows],
  );
  const completedTeams = useMemo(() => new Set(completed), [completed]);
  const activeTeams = useMemo(
    () => new Set(presence.activeTeams),
    [presence.activeTeams],
  );
  const highlightedTeams = useMemo(
    () =>
      new Set(
        search.trim()
          ? visibleTeams(rows, search, "all").map((r) => r.teamNumber)
          : [],
      ),
    [rows, search],
  );
  return (
    <div className="space-y-5">
      <PitMap
        map={map}
        eventKey={eventKey}
        knownTeams={knownTeams}
        completedTeams={completedTeams}
        activeTeams={activeTeams}
        highlightedTeams={highlightedTeams}
        liveAvailable={presence.available}
      />
      <PitTeamList eventKey={eventKey} rows={rows} onSearchChange={setSearch} />
    </div>
  );
}
