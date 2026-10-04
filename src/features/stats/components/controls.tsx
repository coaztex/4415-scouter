"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input, Select } from "@/components/ui/fields";
import {
  metricsByTab,
  tabLabels,
  tabs,
  type StatsQuery,
  type StatsTab,
} from "../model";

export function StatsControls({
  eventKey,
  query,
  teams,
}: {
  eventKey: string;
  query: StatsQuery;
  teams: readonly { teamNumber: number; nickname: string | null }[];
}) {
  const router = useRouter(),
    search = useSearchParams();
  const [teamSearch, setTeamSearch] = useState(query.q);
  const base = `/events/${encodeURIComponent(eventKey)}/stats`;
  function url(changes: Record<string, string>) {
    const next = new URLSearchParams(search);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    return `${base}?${next}`;
  }
  function update(changes: Record<string, string>) {
    router.replace(url(changes), { scroll: false });
  }
  return (
    <div className="space-y-4">
      <nav
        aria-label="Stats sections"
        className="flex gap-2 overflow-x-auto border-b border-border pb-2"
      >
        {tabs.map((tab: StatsTab) => (
          <Link
            key={tab}
            href={url({ tab, metric: "", team: "", q: "" })}
            aria-current={tab === query.tab ? "page" : undefined}
            className={`min-h-12 shrink-0 rounded-control px-4 py-3 text-sm font-semibold ${tab === query.tab ? "bg-brand-primary text-on-brand-primary" : "text-muted hover:bg-surface-subtle hover:text-foreground"}`}
          >
            {tabLabels[tab]}
          </Link>
        ))}
      </nav>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {query.tab !== "overview" && (
          <form
            className="flex items-end gap-2 sm:col-span-2 lg:col-span-1"
            onSubmit={(event) => {
              event.preventDefault();
              update({ q: teamSearch.trim() });
            }}
          >
            <div className="min-w-0 flex-1">
              <Input
                id="stats-search"
                label="Find team"
                value={teamSearch}
                onChange={(event) => setTeamSearch(event.target.value)}
                maxLength={80}
                placeholder="Number or name"
              />
            </div>
            <button
              type="submit"
              className="min-h-12 rounded-control border border-border px-3 font-bold"
            >
              Search
            </button>
          </form>
        )}
        {query.tab !== "overview" && (
          <Select
            id="stats-metric"
            label="Rank by"
            value={
              metricsByTab[query.tab].some(
                (choice) => choice.key === query.metric,
              )
                ? query.metric
                : metricsByTab[query.tab][0].key
            }
            onChange={(event) => update({ metric: event.target.value })}
          >
            {metricsByTab[query.tab].map((choice) => (
              <option key={choice.key} value={choice.key}>
                {choice.label}
              </option>
            ))}
          </Select>
        )}
        {query.tab !== "overview" && (
          <Select
            id="stats-direction"
            label="Sort direction"
            value={query.dir}
            onChange={(event) => update({ dir: event.target.value })}
          >
            <option value="desc">High to low</option>
            <option value="asc">Low to high</option>
          </Select>
        )}
        {query.tab !== "overview" && query.tab !== "external" && (
          <Select
            id="stats-minimum"
            label="Minimum metric samples"
            value={query.min}
            onChange={(event) => update({ min: event.target.value })}
          >
            {[0, 1, 2, 3, 5, 10].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        )}
        {(query.tab === "fuel" ||
          query.tab === "auto" ||
          query.tab === "overview") && (
          <Select
            id="stats-confidence"
            label="Very-uncertain FUEL"
            value={query.uncertain}
            onChange={(event) => update({ uncertain: event.target.value })}
          >
            <option value="exclude">Exclude from FUEL averages</option>
            <option value="include">Include in FUEL averages</option>
          </Select>
        )}
        {query.tab === "external" && (
          <Select
            id="stats-team"
            label="Compare one team"
            value={query.team ?? ""}
            onChange={(event) => update({ team: event.target.value })}
          >
            <option value="">Choose a team</option>
            {teams.map((team) => (
              <option key={team.teamNumber} value={team.teamNumber}>
                {team.teamNumber} · {team.nickname ?? "Unnamed"}
              </option>
            ))}
          </Select>
        )}
      </div>
    </div>
  );
}
