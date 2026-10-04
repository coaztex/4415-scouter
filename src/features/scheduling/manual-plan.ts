import {
  assignmentSlot,
  isProtected,
  type ScheduleSnapshot,
  type PlanRow,
  type PlanOperations,
} from "./model";
/** For a single match, swap occupied scouts/stations atomically instead of double booking. */
export function planManualEdit(
  snapshot: ScheduleSnapshot,
  desired: PlanRow,
): PlanOperations {
  const source = snapshot.data.assignments.find((a) => a.id === desired.id);
  if (!source) return { remove_ids: [], rows: [desired] };
  if (isProtected(source)) throw new Error("This assignment is protected.");
  if (
    assignmentSlot(source) !== null &&
    assignmentSlot(source) !== desired.slot_match_id
  )
    throw new Error(
      "Edit within the same match; generate a new range to change match allocation.",
    );
  const changes = new Map<string, PlanRow>();
  const rowFor = (id: string) => {
    const a = snapshot.data.assignments.find((a) => a.id === id)!;
    if (isProtected(a))
      throw new Error("The requested swap includes protected scouting work.");
    const row: PlanRow = {
      id: a.id,
      slot_match_id: assignmentSlot(a)!,
      scout_user_id: a.scout_user_id,
      team_number: a.team_number,
      assignment_type: a.assignment_type,
      status: a.status === "missed" ? "missed" : "assigned",
    };
    changes.set(id, row);
    return row;
  };
  const current = rowFor(source.id);
  const scoutConflict = snapshot.data.assignments.find(
    (a) =>
      a.id !== source.id &&
      assignmentSlot(a) === desired.slot_match_id &&
      a.scout_user_id === desired.scout_user_id,
  );
  if (scoutConflict)
    rowFor(scoutConflict.id).scout_user_id = source.scout_user_id;
  const teamConflict =
    desired.team_number === null
      ? null
      : snapshot.data.assignments.find(
          (a) =>
            a.id !== source.id &&
            a.match_id === desired.slot_match_id &&
            a.team_number === desired.team_number,
        );
  if (teamConflict) {
    const other = changes.get(teamConflict.id) ?? rowFor(teamConflict.id);
    other.team_number = source.team_number;
    other.assignment_type = source.assignment_type;
    if (other.assignment_type === "break") other.status = "assigned";
  }
  Object.assign(current, desired);
  return { remove_ids: [], rows: [...changes.values()] };
}
