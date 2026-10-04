import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import {
  formatMetric,
  metricSample,
  metricValue,
  rankedRows,
  type Metric,
  type StatsQuery,
  type StatsRow,
} from "../model";

export type ExtraColumn = {
  label: string;
  render: (row: StatsRow) => ReactNode;
};
export function Ranking({
  eventKey,
  rows,
  metric,
  query,
  columns = [],
  note,
}: {
  eventKey: string;
  rows: readonly StatsRow[];
  metric: Metric;
  query: StatsQuery;
  columns?: ExtraColumn[];
  note?: string;
}) {
  const ranked = rankedRows(rows, metric, query);
  const available = ranked.filter(
    (row) => metricValue(row, metric) !== null,
  ).length;
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{metric.label}</h2>
          <p className="text-sm text-muted">
            {note ?? "Team rankings for this event."}
          </p>
        </div>
        <Badge>{metric.source}</Badge>
      </div>
      <p className="mt-3 text-sm text-muted" role="status">
        {available} with data · {ranked.length} shown. Missing values sort last
        in both directions.
        {metric.scouting &&
          ` Minimum ${query.min} metric samples. One-match values are limited evidence.`}
      </p>
      {!ranked.length ? (
        <div className="mt-4">
          <EmptyState
            title="No teams meet this filter"
            description="Lower the minimum sample count or wait for scouting data."
          />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-control border border-border">
          <table className="w-full min-w-[680px] border-collapse text-left text-sm">
            <thead className="bg-background text-muted">
              <tr>
                <th scope="col" className="p-3">
                  Team
                </th>
                <th scope="col" className="p-3">
                  {metric.label}
                </th>
                {metric.scouting && (
                  <th scope="col" className="p-3">
                    Metric n / matches
                  </th>
                )}
                {columns.map((column) => (
                  <th scope="col" className="p-3" key={column.label}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranked.map((row) => (
                <tr
                  key={row.teamNumber}
                  className="border-t border-border align-top even:bg-background/50"
                >
                  <th scope="row" className="p-3 font-semibold">
                    <Link
                      prefetch={false}
                      className="underline-offset-2 hover:underline focus-visible:underline"
                      href={`/events/${encodeURIComponent(eventKey)}/teams/${row.teamNumber}`}
                    >
                      {row.teamNumber}{" "}
                      <span className="block max-w-40 truncate font-normal text-muted">
                        {row.nickname ?? "—"}
                      </span>
                    </Link>
                  </th>
                  <td className="p-3 font-bold tabular-nums">
                    {formatMetric(metricValue(row, metric), metric)}
                  </td>
                  {metric.scouting && (
                    <td className="p-3 tabular-nums">
                      {metricSample(row, metric)} / {row.metrics.sampleSize}
                      {metricSample(row, metric) === 1 && (
                        <span className="block text-xs font-semibold text-warning">
                          Limited sample
                        </span>
                      )}
                    </td>
                  )}
                  {columns.map((column) => (
                    <td key={column.label} className="p-3 tabular-nums">
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
