"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Input, Select } from "@/components/ui/fields";
import { InteractiveCard } from "@/components/ui/interactive-card";
import { EmptyState } from "@/components/ui/states";
import { ScoutingStatusChip } from "@/components/ui/scouting-status-chip";
import { TeamAvatar } from "@/features/team-avatar/components/team-avatar";
import {
  scoringMechanisms,
  scoringMechanismLabels,
} from "@/games/2026-rebuilt/pit-options";
import {
  defaultDirection,
  directoryRows,
  formatNumber,
  formatPercent,
  roleLabels,
  sortValue,
  type DirectoryListRow,
  type TeamSort,
} from "../directory-model";
const sortOptions: readonly [TeamSort, string][] = [
  ["team", "Team number"],
  ["rank", "Event rank"],
  ["epa", "Statbotics EPA"],
  ["auto_epa", "Auto EPA"],
  ["teleop_epa", "Teleop EPA"],
  ["opr", "TBA OPR"],
  ["tba_auto_fuel", "TBA AUTO FUEL COPR"],
  ["tba_teleop_fuel", "TBA TELEOP FUEL COPR"],
  ["median_fuel", "Our median FUEL"],
  ["mean_fuel", "Our mean FUEL"],
  ["scoring", "Scoring activity share"],
  ["passing", "Shuttling/passing share"],
  ["reliability", "Full-match rate"],
  ["defense", "Defense frequency"],
  ["auto_success", "Auto success rate"],
  ["pit", "Pit status"],
];
function sortDisplay(row: DirectoryListRow, sort: TeamSort) {
  const value = sortValue(row, sort);
  if (["team", "epa", "median_fuel", "reliability"].includes(sort)) return null;
  const label = sortOptions.find(([key]) => key === sort)?.[1] ?? sort;
  return `${label}: ${["reliability", "defense", "auto_success", "scoring", "passing"].includes(sort) ? formatPercent(value) : formatNumber(value)}`;
}
export function TeamDirectory({
  eventKey,
  source,
  eventWide,
}: {
  eventKey: string;
  source: DirectoryListRow[];
  eventWide: boolean;
}) {
  const router = useRouter(),
    search = useSearchParams();
  const current = Object.fromEntries(search.entries()),
    { query, rows } = directoryRows(source, current);
  function update(name: string, value: string) {
    const next = new URLSearchParams(search);
    if (value && value !== "all") next.set(name, value);
    else next.delete(name);
    if (name === "sort") next.set("dir", defaultDirection(value as TeamSort));
    router.replace(`/events/${eventKey}/teams${next.size ? `?${next}` : ""}`, {
      scroll: false,
    });
  }
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <div className="col-span-2 lg:col-span-1">
          <Input
            id="team-search"
            label="Find a team"
            value={query.q}
            placeholder="Number or nickname"
            onChange={(e) => update("q", e.target.value)}
          />
        </div>
        <Select
          id="team-sort"
          label="Sort by"
          value={query.sort}
          onChange={(e) => update("sort", e.target.value)}
        >
          {sortOptions.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
        <Select
          id="team-direction"
          label="Direction"
          value={query.dir}
          onChange={(e) => update("dir", e.target.value)}
        >
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </Select>
        <Select
          id="team-pit-filter"
          label="Pit status"
          value={query.pit}
          onChange={(e) => update("pit", e.target.value)}
        >
          <option value="all">All</option>
          <option value="unscouted">Unscouted / underway</option>
          <option value="completed">Completed</option>
        </Select>
        <Select
          id="team-mechanism-filter"
          label="Scoring mechanism"
          value={query.mechanism}
          onChange={(e) => update("mechanism", e.target.value)}
        >
          <option value="all">All</option>
          {scoringMechanisms.map((mechanism) => (
            <option key={mechanism} value={mechanism}>
              {scoringMechanismLabels[mechanism]}
            </option>
          ))}
        </Select>
      </div>
      <p role="status" className="text-sm text-muted">
        Showing {rows.length} of {source.length} teams · Missing values sort
        last.
        {!eventWide && " Your readable scouting records only."}
      </p>
      {!rows.length ? (
        <EmptyState
          title="No matching teams"
          description="Try another search or filter."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => {
            const role = row.scouting.roles.mostCommon;
            return (
              <InteractiveCard
                key={row.teamNumber}
                prefetch={false}
                href={`/events/${eventKey}/teams/${row.teamNumber}`}
                className="block h-full space-y-4 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <TeamAvatar
                      teamNumber={row.teamNumber}
                      src={row.avatarUrl}
                    />
                    <div className="min-w-0">
                      <h2 className="text-xl font-semibold">
                        Team {row.teamNumber}
                      </h2>
                      {row.nickname && (
                        <p className="break-words text-muted">{row.nickname}</p>
                      )}
                    </div>
                  </div>
                  <ScoutingStatusChip status={row.pitStatus} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <p>
                    <span className="block text-muted">Observed role</span>
                    <strong>{role ? roleLabels[role] : "—"}</strong>
                    {role && (
                      <span className="ml-1 text-muted">
                        n={row.scouting.roles.sampleSize}
                      </span>
                    )}
                  </p>
                  <p>
                    <span className="block text-muted">Statbotics EPA</span>
                    <strong>{formatNumber(row.statbotics?.total)}</strong>
                  </p>
                  <p>
                    <span className="block text-muted">Median FUEL</span>
                    <strong>
                      {formatNumber(row.scouting.fuel.total.median)}
                    </strong>
                    <span className="ml-1 text-muted">
                      n={row.scouting.fuel.confidentSampleSize}
                    </span>
                  </p>
                  <p>
                    <span className="block text-muted">Full-match rate</span>
                    <strong>
                      {formatPercent(row.scouting.reliability.fullMatchRate)}
                    </strong>
                    <span className="ml-1 text-muted">
                      n={row.scouting.sampleSize}
                    </span>
                  </p>
                </div>
                {sortDisplay(row, query.sort) && (
                  <p className="border-t border-border pt-3 text-sm font-semibold">
                    {sortDisplay(row, query.sort)}
                  </p>
                )}
              </InteractiveCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
