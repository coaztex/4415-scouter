"use client";
import { useState } from "react";
import { InteractiveCard } from "@/components/ui/interactive-card";
import { Input, Select } from "@/components/ui/fields";
import { EmptyState } from "@/components/ui/states";
import { ScoutingStatusChip } from "@/components/ui/scouting-status-chip";
import { visibleTeams, type TeamFilter, type TeamListRow } from "../model";
import { NexusInspectionStatus } from "./nexus-inspection-status";
export function PitTeamList({
  eventKey,
  rows,
  onSearchChange,
}: {
  eventKey: string;
  rows: TeamListRow[];
  onSearchChange?: (term: string) => void;
}) {
  const [term, setTerm] = useState(""),
    [filter, setFilter] = useState<TeamFilter>("all"),
    shown = visibleTeams(rows, term, filter);
  const complete = rows.filter((r) => r.status === "completed").length;
  return (
    <div className="space-y-5">
      <p role="status" className="text-lg font-bold">
        {complete} / {rows.length} teams completed
      </p>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <Input
          id="pit-search"
          label="Find a team"
          placeholder="Team number or nickname"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            onSearchChange?.(e.target.value);
          }}
        />
        <Select
          id="pit-filter"
          label="Show teams"
          value={filter}
          onChange={(e) => setFilter(e.target.value as TeamFilter)}
        >
          <option value="all">All</option>
          <option value="unscouted">Unscouted</option>
          <option value="completed">Completed</option>
        </Select>
      </div>
      {!rows.length ? (
        <EmptyState
          title="No teams imported"
          description="Ask an admin to sync the team roster."
        />
      ) : !shown.length ? (
        <EmptyState
          title="No matching teams"
          description="Try another team number, nickname, or filter."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((row) => (
            <InteractiveCard
              key={row.teamNumber}
              href={`/events/${eventKey}/pit/${row.teamNumber}`}
              className="block h-full p-4 sm:p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-xl font-semibold">Team {row.teamNumber}</h2>
                <ScoutingStatusChip status={row.status} />
              </div>
              {row.nickname && (
                <p className="mt-2 text-muted">{row.nickname}</p>
              )}
              {row.pitLabel && (
                <p className="mt-2 text-sm font-semibold">
                  Pit: {row.pitLabel}
                </p>
              )}
              {row.claimedBy && row.status === "in_progress" && (
                <p className="mt-2 text-sm font-semibold">Scout working</p>
              )}
              <NexusInspectionStatus inspection={row.inspection ?? null} />
            </InteractiveCard>
          ))}
        </div>
      )}
    </div>
  );
}
