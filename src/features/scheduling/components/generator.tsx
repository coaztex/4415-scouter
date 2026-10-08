"use client";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/fields";
import { generateScheduleAction } from "../server/actions";
import type { ScheduleSnapshot } from "../model";
import { ScheduleFeedback } from "./feedback";
export function ScheduleGenerator({
  snapshot,
}: {
  snapshot: ScheduleSnapshot;
}) {
  const [state, action, pending] = useActionState(generateScheduleAction, {});
  const [level, setLevel] = useState("qm"),
    [edited, setEdited] = useState(false);
  const matches = snapshot.data.matches.filter((m) => m.comp_level === level);
  const names = new Map(
    snapshot.data.scouts.map((s) => [s.id, s.display_name || s.username]),
  );
  for (const a of snapshot.data.assignments)
    if (!names.has(a.scout_user_id)) names.set(a.scout_user_id, a.scout_name);
  const matchMap = new Map(snapshot.data.matches.map((m) => [m.id, m]));
  return (
    <Card>
      <h2 className="text-xl font-bold">Generate a schedule</h2>
      <p className="my-3 text-muted">Preview coverage before publishing.</p>
      <form
        id="schedule-generate-form"
        action={action}
        onReset={(event) => event.preventDefault()}
        onChange={() => setEdited(true)}
        onSubmit={() => setEdited(false)}
        className="space-y-5"
      >
        <input type="hidden" name="event_id" value={snapshot.data.event.id} />
        <input type="hidden" name="operation" value="preview" />
        <fieldset
          disabled={pending || snapshot.data.event.status !== "active"}
          className="space-y-5"
        >
          <legend className="font-bold">Active scouts to include</legend>
          <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {snapshot.data.scouts.map((s) => (
              <label
                key={s.id}
                className="flex min-h-12 items-center gap-3 rounded-control border border-border px-3"
              >
                <input
                  type="checkbox"
                  name="scout_id"
                  value={s.id}
                  className="size-5"
                />
                <span>
                  {s.display_name || s.username}
                  <span className="block text-xs text-muted">
                    {s.username} · {s.role}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              id="schedule-level"
              label="Match stage"
              name="comp_level"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            >
              <option value="qm">Qualifications</option>
              <option value="ef">Eighthfinals</option>
              <option value="qf">Quarterfinals</option>
              <option value="sf">Semifinals</option>
              <option value="f">Finals</option>
            </Select>
            <Select
              key={level + "first"}
              id="schedule-first"
              label="First match"
              name="first_match"
              defaultValue={matches[0]?.id}
              required
            >
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.key}
                </option>
              ))}
            </Select>
            <Select
              key={level + "last"}
              id="schedule-last"
              label="Last match (inclusive)"
              name="last_match"
              defaultValue={matches[Math.min(19, matches.length - 1)]?.id}
              required
            >
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.key}
                </option>
              ))}
            </Select>
            <Input
              id="schedule-run"
              label="Consecutive-match target"
              type="number"
              name="max_consecutive"
              min={1}
              max={20}
              defaultValue={3}
              required
            />
            <Select
              id="schedule-replace"
              name="replace_mode"
              label="Existing saved assignments"
              defaultValue="fill_gaps"
            >
              <option value="fill_gaps">Keep saved rows; fill gaps</option>
              <option value="replace_editable">
                Replace editable rows in range
              </option>
            </Select>
          </div>
          <p className="text-sm text-muted">
            Replace mode may change manual assignments; started work stays
            locked. Preview up to 200 matches.
          </p>
          <Button
            type="submit"
            disabled={!matches.length || !snapshot.data.scouts.length}
          >
            {pending ? "Preparing…" : "Generate preview"}
          </Button>
        </fieldset>
      </form>
      <ScheduleFeedback state={state} />
      {state.preview && state.config && !edited && (
        <section className="mt-8 space-y-4" aria-label="Schedule preview">
          <h3 className="text-lg font-bold">Schedule preview</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <p className="rounded-control border border-border p-3">
              <strong>Scouts</strong>
              <br />
              {state.preview.summary.scouts}
            </p>
            <p className="rounded-control border border-border p-3">
              <strong>Matches</strong>
              <br />
              {state.preview.summary.matches}
            </p>
            <p className="rounded-control border border-border p-3">
              <strong>Robot slots</strong>
              <br />
              {state.preview.summary.desiredSlots}
            </p>
            <p className="rounded-control border border-border p-3">
              <strong>Covered</strong>
              <br />
              {state.preview.summary.coveredSlots} (
              {state.preview.summary.coveragePercent}%)
            </p>
            <p className="rounded-control border border-border p-3">
              <strong>Uncovered</strong>
              <br />
              {state.preview.summary.uncovered.length}
            </p>
            <p className="rounded-control border border-border p-3">
              <strong>Teams observed</strong>
              <br />
              {state.preview.summary.teamsCovered}/
              {state.preview.summary.teamsInRange}
            </p>
            <p className="rounded-control border border-border p-3 sm:col-span-2">
              <strong>Assignments per scout in range</strong>
              <br />
              Average {state.preview.summary.averageAssignments.toFixed(1)} ·
              Min {state.preview.summary.minimumAssignments} · Max{" "}
              {state.preview.summary.maximumAssignments}
            </p>
          </div>
          <p>
            {state.preview.operations.rows.length} new/changed rows;{" "}
            {state.preview.operations.remove_ids.length} removed rows. Nothing
            is saved yet.
          </p>
          {state.preview.warnings.length > 0 && (
            <details open>
              <summary className="min-h-12 py-3 font-bold">
                Coverage / rest warnings ({state.preview.warnings.length})
              </summary>
              <ul className="max-h-48 list-disc overflow-y-auto pl-6">
                {state.preview.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              form="schedule-generate-form"
              variant="secondary"
              disabled={pending}
            >
              Regenerate
            </Button>
            <a
              href="#schedule-gaps"
              className="min-h-11 rounded-control border border-border px-4 py-3 font-bold"
            >
              View gaps
            </a>
          </div>
          <details
            id="schedule-gaps"
            open={state.preview.summary.uncovered.length > 0}
          >
            <summary className="min-h-12 py-3 font-bold">
              Uncovered robot-match slots (
              {state.preview.summary.uncovered.length})
            </summary>
            {state.preview.summary.uncovered.length ? (
              <ul className="max-h-56 list-disc overflow-y-auto pl-6">
                {state.preview.summary.uncovered.map((gap) => (
                  <li key={`${gap.matchId}-${gap.teamNumber}`}>
                    {gap.matchKey} · Team {gap.teamNumber}
                  </li>
                ))}
              </ul>
            ) : (
              <p>All imported robot slots in this range are covered.</p>
            )}
          </details>
          <details>
            <summary className="min-h-12 py-3 font-bold">
              Planned observations by team
            </summary>
            <div className="grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-3">
              {state.preview.summary.teamDistribution.map((team) => (
                <p key={team.teamNumber}>
                  Team {team.teamNumber}: {team.planned} planned ·{" "}
                  {team.observed} existing final
                </p>
              ))}
            </div>
          </details>
          <h4 className="font-bold">Workload and break blocks</h4>
          <div className="grid gap-2 sm:grid-cols-3">
            {state.preview.workloads.map((w) => (
              <p
                key={w.scoutId}
                className="rounded-control border border-border p-3"
              >
                <strong>{names.get(w.scoutId)}</strong>
                <br />
                {w.assignmentsInRange} in range · {w.assignments} event
                assignments · longest run {w.longestRun}
                <br />
                {w.breakBlocks.length} break blocks
                {w.breakBlocks.length > 0 && ": "}
                {w.breakBlocks
                  .map(
                    (block) =>
                      `${matchMap.get(block.first)?.key}–${matchMap.get(block.last)?.key} (${block.length})`,
                  )
                  .join(", ")}
              </p>
            ))}
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-left text-sm">
              <caption className="p-3 text-left">
                Proposed assignments and breaks
              </caption>
              <thead>
                <tr>
                  {["Match", "Scout", "Robot / break", "State"].map((h) => (
                    <th key={h} scope="col" className="p-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.preview.rows.map((r, i) => {
                  const m = matchMap.get(r.slot_match_id),
                    s = m?.stations.find(
                      (s) => s.team_number === r.team_number,
                    );
                  return (
                    <tr key={i} className="border-t border-border">
                      <td className="p-3">{m?.key}</td>
                      <td className="p-3">
                        {names.get(r.scout_user_id) || r.scout_user_id}
                      </td>
                      <td className="p-3">
                        {r.assignment_type === "break"
                          ? "Break"
                          : `Team ${r.team_number} · ${s?.alliance} ${s?.station}`}
                      </td>
                      <td className="p-3">
                        {r.retained ? `Retained · ${r.status}` : "Proposed"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <form action={action} className="space-y-4">
            <input
              type="hidden"
              name="event_id"
              value={snapshot.data.event.id}
            />
            <input type="hidden" name="operation" value="save" />
            <input type="hidden" name="version" value={state.version} />
            <input
              type="hidden"
              name="observation_version"
              value={state.observationVersion}
            />
            <input
              type="hidden"
              name="config"
              value={JSON.stringify(state.config)}
            />
            <label className="flex min-h-12 items-center gap-3">
              <input
                type="checkbox"
                name="confirmed"
                value="yes"
                required
                className="size-5"
              />
              I reviewed coverage, gaps, breaks, and replacement of editable
              assignments in this preview.
            </label>
            <Button type="submit" disabled={pending}>
              {pending ? "Publishing…" : "Accept & Publish"}
            </Button>
          </form>
        </section>
      )}
    </Card>
  );
}
