import { Card } from "@/components/ui/card";
import { formatNumber, formatPercent } from "@/features/teams/model";
import type { RebuiltAggregate } from "@/games/2026-rebuilt/aggregate";
import { fuelDistribution } from "../distribution";
import type { StatsRow } from "../model";

function Count({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="border-b border-border px-1 py-3">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Coverage({
  label,
  value,
  total,
  detail,
}: {
  label: string;
  value: number;
  total: number;
  detail: string;
}) {
  const width = total ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between gap-3 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums">
          {value}/{total}
        </span>
      </div>
      <div
        className="mt-1 h-2 overflow-hidden rounded-full bg-background"
        role="meter"
        aria-label={`${label} coverage`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={value}
      >
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${width}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </div>
  );
}

export function FuelDistribution({ rows }: { rows: readonly StatsRow[] }) {
  const d = fuelDistribution(rows);
  const position = (value: number) =>
    d.max === d.min ? 50 : ((value - d.min!) / (d.max! - d.min!)) * 100;
  return (
    <Card>
      <h2 className="text-lg font-bold">TELEOP FUEL distribution</h2>
      <p className="mt-1 text-sm text-muted">
        Team medians · minimum 2 usable FUEL observations per team ·{" "}
        {d.teamCount} teams.
      </p>
      {d.teamCount < 5 ? (
        <p className="mt-4 rounded-control bg-background p-3 text-sm">
          Distribution needs at least 5 eligible teams.
        </p>
      ) : (
        <>
          {d.max !== d.min && (
            <div
              className="relative mx-2 mt-7 h-4 rounded-full bg-background"
              aria-hidden="true"
            >
              <div
                className="absolute inset-y-0 rounded-full bg-accent-soft"
                style={{
                  left: `${position(d.q1!)}%`,
                  right: `${100 - position(d.q3!)}%`,
                }}
              />
              <div
                className="absolute -top-1 h-6 w-1 rounded-full bg-accent"
                style={{ left: `${position(d.median!)}%` }}
              />
            </div>
          )}
          <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
            {(
              [
                ["25th", d.q1],
                ["Median", d.median],
                ["75th", d.q3],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="font-bold tabular-nums">
                  {formatNumber(value)}
                </dd>
              </div>
            ))}
          </dl>
          {d.topDecile !== null && (
            <p className="mt-3 text-center text-xs text-muted">
              Top-decile threshold: {formatNumber(d.topDecile)} FUEL
            </p>
          )}
        </>
      )}
    </Card>
  );
}

export function Overview({
  rows,
  overall,
  uncertain,
}: {
  rows: readonly StatsRow[];
  overall: RebuiltAggregate;
  uncertain: boolean;
}) {
  const scoutedTeams = rows.filter((row) => row.metrics.sampleSize > 0).length;
  const tba = rows.filter(
    (row) => row.tba?.opr != null || row.rank != null,
  ).length;
  const statbotics = rows.filter((row) => row.statbotics?.total != null).length;
  const roles = [
    ["Scorer", overall.roles.counts.scorer],
    ["Shuttling / Passing", overall.roles.counts.passer_feeder],
    ["Defender", overall.roles.counts.defender],
    ["Mixed", overall.roles.counts.mixed],
    ["Inactive", overall.roles.counts.inactive],
  ] as const;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        <Count label="Event teams" value={rows.length} />
        <Count label="Teams observed" value={scoutedTeams} />
        <Count
          label="Robot-matches"
          value={overall.sampleSize}
          hint="Readable scouting records"
        />
        <Count
          label="Confident FUEL"
          value={overall.fuel.confidentSampleSize}
          hint="Complete estimates"
        />
        <Count
          label="Timed activity"
          value={overall.activity.scoring.share.sampleSize}
          hint="Usable TELEOP timelines"
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold">Event Baselines</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs text-muted">
                Median TELEOP FUEL · n={overall.fuel.teleop.sampleSize}
              </dt>
              <dd className="text-xl font-bold tabular-nums">
                {formatNumber(overall.fuel.teleop.median)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">
                Scoring time share · n=
                {overall.activity.scoring.share.sampleSize}
              </dt>
              <dd className="text-xl font-bold tabular-nums">
                {formatPercent(overall.activity.scoring.share.mean)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">
                Shuttling / Passing share · n=
                {overall.activity.shuttling_passing.share.sampleSize}
              </dt>
              <dd className="text-xl font-bold tabular-nums">
                {formatPercent(overall.activity.shuttling_passing.share.mean)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">
                Full-match rate · n={overall.sampleSize}
              </dt>
              <dd className="text-xl font-bold tabular-nums">
                {formatPercent(overall.reliability.fullMatchRate)}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-muted">
            Pooled observations; teams with more matches contribute more.
          </p>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">Evidence coverage</h2>
          <p className="mt-1 text-sm text-muted">
            Sources remain separate. Missing EPA is unknown, never zero.
          </p>
          <div className="mt-4 space-y-4">
            <Coverage
              label="Our scouting"
              value={scoutedTeams}
              total={rows.length}
              detail="Teams with readable observations"
            />
            <Coverage
              label="TBA cache"
              value={tba}
              total={rows.length}
              detail="Teams with rank or OPR"
            />
            <Coverage
              label="Statbotics cache"
              value={statbotics}
              total={rows.length}
              detail="Teams with EPA"
            />
          </div>
        </Card>
      </div>
      <FuelDistribution rows={rows} />
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-semibold">
          Observed roles · n={overall.roles.sampleSize}
        </span>
        {roles.map(([name, count]) => (
          <span
            key={name}
            className="rounded-full border border-border px-2 py-1"
          >
            {name} {count}
          </span>
        ))}
      </div>
      <p className="text-xs text-muted">
        Very-uncertain FUEL:{" "}
        {uncertain ? "included where complete" : "excluded"}.{" "}
        {overall.fuel.veryUncertainSampleSize} flagged; DNS/DNF output is
        excluded from FUEL aggregates.
      </p>
    </div>
  );
}
