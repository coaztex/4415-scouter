"use client";
import Link from "next/link";
import { roleLabels } from "@/features/teams/directory-model";
import {
  drivetrainLabels,
  scoringMechanismLabels,
} from "@/games/2026-rebuilt/pit-options";
import { rawLabel, type PicklistState, type ScoredTeam } from "../model";
import type { EvidenceTeam } from "../snapshot";
type Control = PicklistState["controls"][string];
export function TeamEntry({
  team,
  score,
  eventKey,
  control,
  onControl,
  position,
  total,
  onMove,
  readOnly,
}: {
  team: EvidenceTeam;
  score: ScoredTeam;
  eventKey: string;
  control: Control;
  onControl?: (value: Control) => void;
  position?: number;
  total: number;
  onMove?: (target: number) => void;
  readOnly: boolean;
}) {
  const roles = Object.entries(team.roles)
    .filter(([, count]) => count > 0)
    .map(
      ([role, count]) =>
        `${roleLabels[role as keyof typeof roleLabels]} ${count}`,
    )
    .join(" · ");
  return (
    <article
      className={`rounded-card border p-4 ${control.excluded ? "border-border bg-background" : "border-border bg-surface"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            prefetch={false}
            className="text-lg font-bold text-accent hover:underline"
            href={`/events/${eventKey}/teams/${team.teamNumber}`}
          >
            {position !== undefined ? `${position + 1}. ` : ""}#
            {team.teamNumber} · {team.nickname ?? "Name unavailable"}
          </Link>
          <p
            className="text-xs text-muted"
            title="Pit-scouted / team-reported. Robot only; battery and bumpers excluded."
          >
            Pit specs:{" "}
            {team.robotWeightLbs === null
              ? "Weight: Unknown"
              : `${team.robotWeightLbs} lb`}{" "}
            · {drivetrainLabels[team.drivetrain]} ·{" "}
            {scoringMechanismLabels[team.mechanism]}
          </p>
          <p className="text-sm">
            <b>{team.sampleSize} scouting matches</b> · Role n=
            {team.roleSamples}
            {roles ? ` · ${roles}` : " · no role evidence"}
          </p>
          <p className="text-sm text-muted">
            Total FUEL: {team.fuelUsable} usable · {team.fuelUncertain} very
            uncertain excluded
          </p>
          {team.recentUncertain > 0 && (
            <p className="text-sm font-bold text-warning">
              {team.recentUncertain} of the last 3 or fewer observations have
              very uncertain FUEL.
            </p>
          )}
          {team.recentConcern && (
            <p className="text-sm font-bold text-danger">
              Recent reliability concern: major issue, DNF or DNS in last 3
              observed matches.
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xl font-bold">
            {score.score === null
              ? "Unranked"
              : `${score.score.toFixed(1)} / 100`}
          </p>
          <p className="text-sm">
            {Math.round(score.coverage * 100)}% weight coverage
          </p>
          {score.reason && <p className="text-sm text-muted">{score.reason}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={control.favorite}
            disabled={readOnly}
            onChange={(e) =>
              onControl?.({ ...control, favorite: e.target.checked })
            }
          />
          Favorite #{team.teamNumber}
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={control.excluded}
            disabled={readOnly}
            onChange={(e) =>
              onControl?.({ ...control, excluded: e.target.checked })
            }
          />
          Exclude #{team.teamNumber}
        </label>
        {position !== undefined && onMove && !readOnly && (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const value = Number(
                new FormData(e.currentTarget).get("position"),
              );
              if (Number.isInteger(value) && value >= 1 && value <= total)
                onMove(value - 1);
            }}
          >
            <label htmlFor={`position-${team.teamNumber}`}>Move to</label>
            <input
              key={position}
              id={`position-${team.teamNumber}`}
              name="position"
              type="number"
              min={1}
              max={total}
              defaultValue={position + 1}
              className="min-h-11 w-20 rounded-control border border-border px-2"
            />
            <button
              type="submit"
              className="min-h-11 rounded-control border border-border px-3 font-bold"
            >
              Move
            </button>
          </form>
        )}
      </div>
      {onControl && !readOnly ? (
        <details open={control.excluded || !!control.note}>
          <summary className="min-h-11 cursor-pointer py-2 text-sm text-accent">
            {control.excluded ? "Required exclusion reason" : "Team note"}
          </summary>
          <label className="mt-1 block text-sm">
            {control.excluded
              ? "Exclusion reason (required)"
              : "Strategy note (optional)"}
            <input
              aria-label={`Note for team ${team.teamNumber}`}
              required={control.excluded}
              maxLength={500}
              value={control.note}
              onChange={(e) => onControl({ ...control, note: e.target.value })}
              className="mt-1 min-h-11 w-full rounded-control border border-border bg-surface px-3"
            />
          </label>
        </details>
      ) : control.note ? (
        <p className="text-sm">
          {control.excluded ? "Exclusion reason" : "Note"}: {control.note}
        </p>
      ) : null}
      <details className="mt-2">
        <summary className="min-h-11 cursor-pointer py-3 font-bold text-accent">
          Contributions & match records · #{team.teamNumber}
        </summary>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="pb-2 text-left text-muted">
              Percentiles compare eligible event teams. Missing or undersampled
              metrics are omitted; included weights are rescaled. Points are
              contributions to a score only when coverage is sufficient.
            </caption>
            <thead>
              <tr>
                {[
                  "Metric / source",
                  "Raw · sample",
                  "Percentile · peers",
                  "Weight",
                  "Effective share",
                  "Points",
                  "Treatment",
                ].map((h) => (
                  <th key={h} className="border-b border-border p-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {score.contributions.map((c) => (
                <tr key={c.id}>
                  <td className="border-b border-border p-2">
                    {c.label}
                    <span className="block text-xs text-muted">{c.source}</span>
                  </td>
                  <td className="border-b border-border p-2">
                    {rawLabel(c)}
                    <span className="block text-xs">
                      {c.sample === null ? "n unavailable" : `n=${c.sample}`}
                    </span>
                  </td>
                  <td className="border-b border-border p-2">
                    {c.normalized === null ? "—" : c.normalized.toFixed(1)} ·{" "}
                    {c.peers} teams
                  </td>
                  <td className="border-b border-border p-2">{c.weight}</td>
                  <td className="border-b border-border p-2">
                    {(c.effectiveWeight * 100).toFixed(1)}%
                  </td>
                  <td className="border-b border-border p-2">
                    {c.points === null ? "—" : c.points.toFixed(2)}
                  </td>
                  <td className="border-b border-border p-2">{c.treatment}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!score.contributions.length && (
          <p className="my-2 text-sm">
            All metrics are disabled for this profile.
          </p>
        )}
        <p className="mt-3 text-sm">
          FUEL excludes very-uncertain, DNS and DNF estimates. Missing phases
          remain unknown.
        </p>
        <ul className="mt-3 flex flex-wrap gap-3 text-sm">
          {team.records.map((r) => (
            <li key={r.id}>
              <Link
                prefetch={false}
                className="inline-block min-h-11 py-2 font-bold text-accent underline"
                href={`/events/${eventKey}/teams/${team.teamNumber}/matches/${r.id}`}
              >
                {r.matchKey}
              </Link>
              <span className="block text-xs">
                {roleLabels[r.role]} · {r.reliability} · FUEL{" "}
                {r.confidence.replaceAll("_", " ")}
              </span>
            </li>
          ))}
        </ul>
        {!team.records.length && (
          <p className="mt-3 text-sm text-muted">
            No validated match observations.
          </p>
        )}
      </details>
    </article>
  );
}
