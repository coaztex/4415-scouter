"use client";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/fields";
import { editAssignmentAction } from "../server/actions";
import {
  assignmentSlot,
  isProtected,
  type ScheduleSnapshot,
  type ScheduleAssignment,
} from "../model";
import { ScheduleFeedback } from "./feedback";
export function ManualAssignmentEditor({
  snapshot,
  assignment,
}: {
  snapshot: ScheduleSnapshot;
  assignment?: ScheduleAssignment;
}) {
  const [state, action, pending] = useActionState(editAssignmentAction, {});
  const [matchId, setMatchId] = useState(
    assignment
      ? (assignmentSlot(assignment) ?? snapshot.data.matches[0]?.id)
      : snapshot.data.matches[0]?.id,
  );
  const [kind, setKind] = useState(assignment?.assignment_type ?? "break");
  const match = snapshot.data.matches.find((m) => m.id === matchId);
  if (assignment && isProtected(assignment))
    return (
      <p className="text-sm text-muted">
        Protected: scouting has started, this row is completed, or a record is
        attached. No reassignment or casual correction.
      </p>
    );
  return (
    <details className="rounded-control border border-border p-4">
      <summary className="min-h-12 cursor-pointer py-3 font-bold">
        {assignment ? "Edit assignment / break" : "Add assignment or break"}
      </summary>
      <form
        action={action}
        onReset={(event) => event.preventDefault()}
        className="mt-3 space-y-4"
      >
        <input type="hidden" name="event_id" value={snapshot.data.event.id} />
        <input type="hidden" name="version" value={snapshot.version} />
        <input type="hidden" name="id" value={assignment?.id ?? ""} />
        <fieldset
          disabled={pending || snapshot.data.event.status !== "active"}
          className="grid gap-4 sm:grid-cols-2"
        >
          <Select
            id={`edit-kind-${assignment?.id ?? "new"}`}
            label="Row type"
            name="assignment_type"
            value={kind}
            onChange={(e) => setKind(e.target.value as "match" | "break")}
          >
            <option value="match">Robot assignment</option>
            <option value="break">Break</option>
          </Select>
          <Select
            id={`edit-match-${assignment?.id ?? "new"}`}
            label="Match / break during match"
            name="slot_match_id"
            value={matchId ?? ""}
            onChange={(e) => setMatchId(e.target.value)}
            required
          >
            {snapshot.data.matches
              .filter(
                (m) =>
                  !assignment ||
                  !assignmentSlot(assignment) ||
                  m.id === assignmentSlot(assignment),
              )
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.key}
                </option>
              ))}
          </Select>
          <Select
            id={`edit-scout-${assignment?.id ?? "new"}`}
            label="Scout"
            name="scout_user_id"
            defaultValue={assignment?.scout_user_id}
            required
          >
            {snapshot.data.scouts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name || s.username} · {s.username}
              </option>
            ))}
          </Select>
          {kind === "match" && (
            <>
              <Select
                key={matchId}
                id={`edit-team-${assignment?.id ?? "new"}`}
                label="Team / imported station"
                name="team_number"
                defaultValue={assignment?.team_number ?? undefined}
                required
              >
                {match?.stations.map((s) => (
                  <option key={s.team_number} value={s.team_number}>
                    Team {s.team_number} · {s.alliance} {s.station}
                  </option>
                ))}
              </Select>
              <Select
                id={`edit-status-${assignment?.id ?? "new"}`}
                label="Assignment status"
                name="status"
                defaultValue={assignment?.status ?? "assigned"}
              >
                <option value="assigned">Assigned</option>
                <option value="missed">Missed</option>
              </Select>
            </>
          )}
          <p className="text-sm text-muted sm:col-span-2">
            Only imported team/station combinations are valid. Submitted and
            in-progress work stays locked. Selecting an occupied scout or
            station swaps the affected editable rows in the same match. All
            affected rows are checked for attached work.
          </p>
          <label className="flex min-h-12 items-center gap-3 sm:col-span-2">
            <input
              type="checkbox"
              name="confirmed"
              value="yes"
              required
              className="size-5"
            />
            I confirm this reassignment, any resulting scout/station swap,
            status change, or break change.
          </label>
          <Button
            name="operation"
            value={assignment ? "update" : "create"}
            type="submit"
          >
            Save change
          </Button>
          {assignment?.assignment_type === "break" && (
            <Button
              name="operation"
              value="remove"
              type="submit"
              variant="secondary"
            >
              Remove break
            </Button>
          )}
        </fieldset>
      </form>
      <ScheduleFeedback state={state} />
    </details>
  );
}
