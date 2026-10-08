import Link from "next/link";
import { Card } from "@/components/ui/card";
import { formatNumber, formatPercent } from "@/features/teams/model";
import type { RebuiltAggregate } from "@/games/2026-rebuilt/aggregate";
import type { Metric, StatsQuery, StatsRow } from "../model";
import { FuelDistribution } from "./overview";
import { Ranking, type ExtraColumn } from "./ranking";

const number = (value: number | null) => formatNumber(value);
const percent = (value: number | null) => formatPercent(value);
const sample = (n: number) => (
  <span className="text-xs text-muted">
    n={n}
    {n === 1 ? " · limited" : ""}
  </span>
);
const teamHref = (eventKey: string, team: number) =>
  `/events/${encodeURIComponent(eventKey)}/teams/${team}`;
const freshness = (value: string | null | undefined) =>
  value ? `Cached ${value.slice(0, 10)} UTC` : "Cache date unavailable";

export function StatsSection({
  eventKey,
  rows,
  overall,
  autoStarts,
  query,
  metric,
}: {
  eventKey: string;
  rows: readonly StatsRow[];
  overall: RebuiltAggregate;
  autoStarts: { left: number; center: number; right: number; unknown: number };
  query: StatsQuery;
  metric: Metric;
}) {
  let columns: ExtraColumn[] = [];
  let note = "";
  let supporting: React.ReactNode = null;
  switch (query.tab) {
    case "fuel":
      note = "Scouted FUEL estimates.";
      columns = [
        {
          label: "Median TELEOP FUEL",
          render: (r) => number(r.metrics.fuel.teleop.median),
        },
        {
          label: "Mean TELEOP FUEL",
          render: (r) => number(r.metrics.fuel.teleop.mean),
        },
        {
          label: "Best TELEOP FUEL",
          render: (r) => number(r.metrics.fuel.teleop.best),
        },
        {
          label: "Variation σ",
          render: (r) =>
            r.metrics.fuel.teleop.sampleSize < 2
              ? "—"
              : number(r.metrics.fuel.teleop.standardDeviation),
        },
      ];
      supporting = (
        <>
          <FuelDistribution rows={rows} />
          <p className="text-sm text-muted">
            Very-uncertain FUEL is{" "}
            {query.uncertain === "include"
              ? "included where complete"
              : "excluded"}
            ; {overall.fuel.veryUncertainSampleSize} flagged. DNS/DNF estimates
            stay out. An observed zero remains zero.
          </p>
        </>
      );
      break;
    case "activity":
      note = "Scouted Teleop time shares, not FUEL volume.";
      columns = [
        {
          label: "Scoring time share",
          render: (r) => percent(r.metrics.activity.scoring.share.mean),
        },
        {
          label: "Shuttling / Passing time share",
          render: (r) =>
            percent(r.metrics.activity.shuttling_passing.share.mean),
        },
        {
          label: "Defense time share",
          render: (r) => percent(r.metrics.activity.defending.share.mean),
        },
        {
          label: "Other / Idle time share",
          render: (r) => percent(r.metrics.activity.other_idle.share.mean),
        },
        { label: "Role n", render: (r) => r.metrics.roles.sampleSize },
      ];
      supporting = (
        <p className="text-sm text-muted">
          Defense effectiveness is a subjective scout rating.
        </p>
      );
      break;
    case "auto":
      note = "Observed Auto performance; pit routines are team reported.";
      columns = [
        {
          label: "Median AUTO FUEL",
          render: (r) => (
            <>
              {number(r.metrics.fuel.auto.median)}{" "}
              {sample(r.metrics.fuel.auto.sampleSize)}
            </>
          ),
        },
        {
          label: "Success",
          render: (r) => (
            <>
              {r.metrics.auto.execution.sampleSize < 2
                ? "—"
                : percent(r.metrics.auto.successfulRate)}{" "}
              {sample(r.metrics.auto.execution.sampleSize)}
            </>
          ),
        },
        {
          label: "Partial / failed",
          render: (r) =>
            `${r.metrics.auto.execution.counts.partial} / ${r.metrics.auto.execution.counts.failed}`,
        },
      ];
      supporting = (
        <Card>
          <h2 className="font-bold">AUTO evidence</h2>
          <p className="mt-1 text-sm text-muted">
            Observed success{" "}
            {overall.auto.execution.sampleSize < 2
              ? "insufficient sample"
              : percent(overall.auto.successfulRate)}{" "}
            · n={overall.auto.execution.sampleSize}. Starts: {autoStarts.left}{" "}
            left, {autoStarts.center} center, {autoStarts.right} right,{" "}
            {autoStarts.unknown} unknown.
          </p>
          <p className="mt-2 text-sm text-muted">
            {rows.filter((r) => (r.claimedRoutines?.length ?? 0) > 0).length}{" "}
            teams have pit-reported routines.
          </p>
        </Card>
      );
      break;
    case "reliability":
      note =
        "Full-match rate includes normal, minor-issue and major-issue finishes.";
      columns = [
        { label: "DNS", render: (r) => r.metrics.reliability.counts.DNS },
        { label: "DNF", render: (r) => r.metrics.reliability.counts.DNF },
        {
          label: "Disabled issue reports",
          render: (r) => r.metrics.issues.observed.counts.disabled,
        },
        {
          label: "Minor / major",
          render: (r) =>
            `${r.metrics.reliability.counts.minor_issue} / ${r.metrics.reliability.counts.major_issue}`,
        },
        {
          label: "Recent",
          render: (r) =>
            r.issueTrend === null
              ? "—"
              : `${r.issueTrend >= 0 ? "+" : ""}${Math.round(r.issueTrend * 100)} pp`,
        },
        {
          label: "Incidents",
          render: (r) => (
            <Link
              prefetch={false}
              className="font-semibold text-accent underline-offset-2 hover:underline"
              href={`${teamHref(eventKey, r.teamNumber)}?tab=incidents`}
            >
              Review →
            </Link>
          ),
        },
      ];
      supporting = (
        <Card>
          <h2 className="font-bold">Observed reliability</h2>
          <p className="mt-1 text-sm text-muted">
            Full-match rate {percent(overall.reliability.fullMatchRate)} · n=
            {overall.sampleSize}; DNS {overall.reliability.counts.DNS}, DNF{" "}
            {overall.reliability.counts.DNF}. Recent change needs two
            three-match windows.
          </p>
        </Card>
      );
      break;
    case "external":
      note =
        "EPA: Statbotics · OPR/COPR, rank and record: TBA · — means unknown.";
      columns = [
        {
          label: "Statbotics components / cache",
          render: (r) => (
            <>
              {metric.key !== "epa" && (
                <strong>EPA {number(r.statbotics?.total ?? null)}</strong>
              )}
              <span className="block text-xs text-muted">
                AUTO {number(r.statbotics?.auto ?? null)} · TELEOP{" "}
                {number(r.statbotics?.teleop ?? null)}
              </span>
              <span className="block text-xs text-muted">
                {freshness(r.statbotics?.fetchedAt)}
              </span>
            </>
          ),
        },
        {
          label: "TBA estimates / cache",
          render: (r) => (
            <>
              {metric.key !== "opr" && <>OPR {number(r.tba?.opr ?? null)} · </>}
              TELEOP FUEL COPR {number(r.tba?.components.teleop_fuel ?? null)}
              <span className="block text-xs text-muted">
                {freshness(r.tba?.fetchedAt)}
              </span>
            </>
          ),
        },
        {
          label: "TBA rank / record",
          render: (r) =>
            r.rank === null
              ? "—"
              : `${r.rank} · ${r.wins ?? "—"}-${r.losses ?? "—"}-${r.ties ?? "—"}`,
        },
      ];
      supporting = query.team ? (
        <ExternalComparison
          eventKey={eventKey}
          row={rows.find((r) => r.teamNumber === query.team) ?? null}
        />
      ) : null;
      break;
    default:
      return null;
  }
  return (
    <div className="space-y-4">
      <Ranking
        eventKey={eventKey}
        rows={rows}
        metric={metric}
        query={query}
        columns={
          query.tab === "fuel" || query.tab === "activity"
            ? columns.filter((column) => column.label !== metric.label)
            : columns
        }
        note={note}
      />
      {supporting}
    </div>
  );
}

function ExternalComparison({
  eventKey,
  row,
}: {
  eventKey: string;
  row: StatsRow | null;
}) {
  if (!row) return null;
  return (
    <Card>
      <h2 className="text-lg font-bold">
        Team {row.teamNumber} · sources side by side
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3 text-sm">
        <div>
          <strong>Our scouting</strong>
          <p>
            TELEOP median {number(row.metrics.fuel.teleop.median)} · n=
            {row.metrics.fuel.teleop.sampleSize}
          </p>
        </div>
        <div>
          <strong>TBA</strong>
          <p>
            OPR {number(row.tba?.opr ?? null)} · TELEOP FUEL COPR{" "}
            {number(row.tba?.components.teleop_fuel ?? null)}
          </p>
          <p className="text-xs text-muted">{freshness(row.tba?.fetchedAt)}</p>
        </div>
        <div>
          <strong>Statbotics</strong>
          <p>
            EPA {number(row.statbotics?.total ?? null)} · TELEOP{" "}
            {number(row.statbotics?.teleop ?? null)}
          </p>
          <p className="text-xs text-muted">
            {freshness(row.statbotics?.fetchedAt)}
          </p>
        </div>
      </div>
      <Link
        prefetch={false}
        className="mt-3 inline-block font-semibold text-accent underline-offset-2 hover:underline"
        href={teamHref(eventKey, row.teamNumber)}
      >
        Team profile and match records →
      </Link>
    </Card>
  );
}
