# Match scouting schedules

Admins open **Admin → Scout Scheduling**. Strategy leads and admins can also open `/schedule`; `/admin` itself remains admin-only. Scouts open **Match Scouting** inside their event at `/events/[eventKey]/scouting`. Every page/action obtains identity from the verified session; navigation does not authorize access.

## Generate and save

1. Import/sync the event's TBA matches and robot roster. Create and activate the team accounts in Admin → Users.
2. Select an event, active team members, match stage (qualifications by default), inclusive match range, and consecutive-match target.
3. Choose **Keep saved rows; fill gaps** (default) or **Replace editable rows in range**. The existing schema has no separate unpublished assignment state: saved assignments are already visible to scouts. Fill-gaps mode keeps those rows, while broader reset replaces only rows with no started/attached work.
4. Generate a preview. Review exact robot-slot coverage, every gap, team observation distribution, workload range, break blocks, retained assignment, and warnings. Regenerate as needed; **Accept & Publish** writes the reviewed plan.

Generation replaces editable rows inside the chosen range, including manual assignments and assignments to people no longer selected. Submitted, in-progress, missed, and submission-linked rows remain unchanged, including rows belonging to unselected/inactive scouts. Outside-range assignments are untouched. A selection supports up to 200 matches, 100 scouts, and 3,000 changed/removed rows per save. Snapshot reads support up to 1,000 matches and 10,000 assignments per event and fail explicitly above those limits.

The pure deterministic planner walks imported matches in order. It first retains protected work (and all saved work in fill-gaps mode). It then fills as many distinct canonical robot slots as available selected scouts allow. When short, it chooses teams with fewer existing **distinct final match observations plus retained/planned assignments**; ties use team number. Workers are selected by smaller total event workload, then shorter current run, then stable ID. Surplus scouts rest; an unfinished one-match rest is continued first to form a two-match block, then long-running/high-load scouts rotate out. New explicit BREAK rows are created only for consecutive blocks of at least two matches. A lone idle match remains idle without a fake break row. Breaks never consume a scout needed to fill an otherwise coverable robot slot. Protected or manually retained breaks can still be singletons, and protected work can exceed the run target. Full coverage with too few scouts can therefore produce long runs; the preview states this rather than claiming a feasible rest schedule. This heuristic is deterministic and testable, not a globally optimal solver.

The preview includes an opaque database snapshot version and a hash of distinct final observations. On publish, the server verifies the reviewed selection and versions, regenerates the plan, and compares the operations with the preview; it never trusts client-supplied assignment rows. PostgreSQL locks the event, roster, affected profiles, and assignments, checks the snapshot again, and commits all changes together. Changed roster/account/assignment data rejects the preview. Refresh and generate again. Repeating an unchanged generation produces no row changes. Preview only reads; no assignments are written until publish.

## Manual changes and breaks

Each saved editable row offers scout, imported team/station, row type, and assigned/missed controls. Choosing an occupied scout or robot swaps the affected editable rows within that match, atomically. The confirmation explicitly includes resulting swaps. Protected rows block the whole operation. Team/station corrections select an existing TBA roster combination; this interface does not rewrite the imported roster.

Use **Add assignment or break** for uncovered robots or extra rest, and **Remove break** for an editable break. Converting a robot assignment to a break intentionally leaves that robot uncovered. A scout can finish their own next break; it moves to completed, without creating a scouting submission. Submitted/completed break rows are retained during regeneration.

Scouts see a prominent Next card (in-progress work first, then earliest pending row), upcoming rows, and completed/missed rows. Every robot card shows team, match, alliance, and station. Consecutive 2+ match break cards explicitly show BREAK and the block range. Successful scouting submission returns to the personal list. Scheduled times are labeled UTC and are advisory. Refresh after a lead changes assignments; realtime/offline schedule delivery is deferred. Late matches are not automatically marked missed. The assignment route is protected and opens the phased 2026 capture workflow; opening it does not mark work in progress until the scout starts the draft. Explicit submitted-record correction UI remains future work.

## Storage and security

Migration `20260929000000_scout_scheduling.sql` has been applied to the linked Supabase project after local SQL tests and a linked dry-run. It adds `break_match_id` to anchor breaks while retaining null `match_id`/`team_number` for them and a unique scout/slot index across both work and breaks. Legacy unanchored breaks remain readable; editable ones can be explicitly anchored in the manual editor. Generation does not silently reinterpret them, and conflicting legacy sequence rows may require a lead to remove/reanchor them first.

`get_schedule_snapshot` and `save_scouting_schedule` require an active strategy/admin identity. `finish_scout_break` only updates the caller's own active-event break. Direct authenticated assignment inserts/updates/deletes are revoked, including for app admins; checked RPCs own all writes. Existing RLS still limits scout reads to their own assignments and lead reads to visible events. Archived events are admin-readable but scheduling is read-only.

Database triggers prevent deletion or identity changes for started/submitted/linked assignments. Submission writes lock the event then assignment and advance assignment status transactionally: draft → in_progress, final → submitted. Final records cannot be detached or downgraded. If a reassignment commits before an old scout's draft arrives, the composite foreign key rejects that draft; if the draft commits first, the lead's stale preview is rejected. Neither ordering silently changes ownership.

No service-role client, new secret, dependency, or season-specific column is needed. Generated TypeScript database types include the new column and RPCs.

## Verification

- `tests/scheduling.test.ts`: determinism, exact coverage gaps, under-observed-team priority, workload balance, two-match break blocks, no avoidable break hole, preservation, idempotence, range isolation, preview/publish integrity, manual swaps, and scout ordering/statuses.
- `tests/sql/scheduling.sql`: transactional rollback, grants/RLS, valid rosters, active profiles, stale versions, protected identities, draft/final status transitions, breaks, and archive restrictions. Apply the auth fixture and all migrations to disposable PostgreSQL first. All SQL suite fixtures roll back.
- `tests/scheduling-concurrency.mjs`: both draft/save race orderings against the explicitly named disposable `frc26-scheduling-test` container. This script leaves synthetic fixtures only inside that disposable container; recreate it before rerunning. Never use these fixtures on Supabase.

Live preview/read verification can use the real imported event without saving invented assignments. Leads choose the actual roster and range before saving their first schedule.
