# Data review and corrections

`/events/[eventKey]/data-review` is restricted to strategy/admin accounts. It brings together rejected offline sync candidates, unfinished or missed assignments, duplicate candidates, pit `needs_review` state, records that do not validate against the current registered game schema, very-uncertain FUEL records, and 2026 TBA alliance reconciliation.

## Correction design

The implementation uses an append-only revision table. `match_scouting_submissions` and `pit_scouting_submissions` remain the canonical rows consumed by existing analytics. Before the narrow correction RPC updates a canonical payload, it locks the row and inserts the complete superseded row into `scouting_submission_revisions`. The audit entry records the editor, timestamp, optional reason, old revision, and whether the replacement came from a manual correction or video re-scout. `client_submission_id`, event, team, scout, match, and assignment identity cannot change. Optimistic revision checks prevent a stale editor from overwriting a newer correction.

Ordinary scouts cannot correct final submissions. The server action re-authenticates a strategy/admin account, parses corrected JSON with the current registered match or pit schema, and calls the service-role-only RPC. A direct final-row update remains blocked by the submission guard. `reviewed_no_change` changes only review state, so the originally submitted payload remains canonical. `video_review_requested` is a queue state; a later video-based correction must explicitly use `video_rescout` provenance.

Rejected offline submissions are inserted into `scouting_sync_conflicts`; identical retries are idempotent. A candidate with another final record for the same assignment/team is labeled `duplicate_candidate`, while reuse of a client UUID is labeled `client_id_collision`. No candidate overwrites a canonical record.

## 2026 official comparison

The page calls the pure Prompt 10A `reconcileAlliance2026` helper for completed matches with a complete official three-team roster, TBA score breakdown, and one valid version-2 final submission per team. AUTO, TELEOP, and TOTAL show official TBA FUEL beside the sum of the three human estimates, with absolute and percentage differences. Every contributing team, immutable submission ID, confidence, and abnormal reliability/issue signal remains visible.

`FUEL_REVIEW_THRESHOLD` in `src/features/data-review/model.ts` is the single prioritization policy: 25% discrepancy, or 20 FUEL when the official value is zero. The queue can be filtered to threshold hits and sorted by discrepancy magnitude or match. The threshold is only a review signal. The workflow never rescales robot estimates, attributes alliance discrepancy to one robot, or overwrites role, activity, defense, reliability, or any other human observation.
