# Stable relational model

## Migration and deployment status

`20260924000000_event_relational_model.sql` adds the competition schema on top of the profile foundation. It and the subsequent provider/admin migrations are applied to the linked Supabase project. Scheduling migration `20260929000000_scout_scheduling.sql` adds anchored breaks and controlled transactional scheduling. Event Schedule migration `20261006000000_event_schedule.sql` adds an admin-editable IANA event time zone, preserves cached TBA video/score-breakdown fields, and exposes a read-only robot-match scouting coverage function. Migrations contain no fake competition seeds. See [scheduling](SCHEDULING.md) and [event schedule](EVENT_SCHEDULE.md) for their lifecycles and verification details.

Robot media migration `20261007000000_robot_media.sql` adds a private Storage bucket and event/team media metadata. It is applied to the linked project. See [robot media](ROBOT_MEDIA.md) for access rules, image limits, and upload behavior.

Team avatar migration `20261008000000_team_avatars.sql` adds a separate private Storage bucket and event-scoped metadata for TBA branding images. It is applied to the linked project. See [team avatars](TEAM_AVATARS.md).

The model serves a single trusted scouting organization across many events and seasons. Active profiles can see active event data. This is not multi-tenant organization isolation; introduce membership boundaries before hosting unrelated teams' private workspaces.

## Keys and relationships

| Table                      | Convention and purpose                                                                                                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| events                     | UUID identity; unique TBA key. Year and game slug must agree with the key's year. Archive rather than delete historical events. `timezone` is a validated IANA zone (default `UTC`) and `timezone_source` records default, TBA, or admin ownership. |
| teams                      | Positive integer team number is the stable PK. TBA key must equal `frc` + team number. No additional UUID is needed.                                                                                                                                |
| event_teams                | Composite event/team PK; pit workflow status and current claim. External metric caches live separately.                                                                                                                                             |
| matches                    | UUID identity plus unique TBA match key and event/level/set/match coordinates. The key must match those coordinates. Raw provider JSON may retain validated score breakdown and cached video metadata for Schedule/Match Details.                   |
| match_teams                | Match/team PK; one team per alliance station, stations 1–3. Composite FKs ensure team and match belong to the same event. Nullable surrogate/DQ distinguishes unknown from false.                                                                   |
| scouting_assignments       | UUID identity; match rows target a match team. Break rows require null match/team. One scout per match team, one match team per scout per match, one item per scout/event/sequence.                                                                 |
| match_scouting_submissions | UUID identity and separate unique client UUID. Composite assignment FK binds event, match, team, and scout together. Assignment may be absent for deliberate unassigned observations.                                                               |
| pit_scouting_submissions   | UUID identity and unique client UUID; event-team FK. Multiple scouts may observe the same team independently.                                                                                                                                       |
| external_team_metrics      | Event/team/source PK, metric version and observation timestamps. OPR/DPR/CCWM and total EPA have common columns; other provider fields remain in payload. Values may be null and must not be confused with zero.                                    |
| event_rankings             | Event/team PK; rank index. Tied ranks are allowed. Nullable records/score avoid inventing unavailable values.                                                                                                                                       |
| team_notes                 | UUID identity, shared event/team note, author and timestamps. No visibility/category system in MVP.                                                                                                                                                 |
| event_sync_state           | Event/source PK; admin-only operational status and bounded error summary. No sync implementation.                                                                                                                                                   |

Foreign keys use restrictive deletion by default, preserving observations and history. Deleting a referenced Auth/profile user is consequently blocked until historical ownership is explicitly handled; deactivate profiles instead. Event creation requires a real creator profile, including future sync-driven event creation.

No alliance/station cache is duplicated on assignments: join `match_teams` to avoid stale copies. Breaks share the assignment table and use `break_match_id` to identify their match slot, retaining null robot identity. A unique scout/slot index spans work and breaks. Submission triggers advance assignments to in_progress/submitted atomically and protect attached records. Scouts cannot reassign or directly alter assignment status; a scoped RPC allows completing their own break.

## Submission lifecycle and retries

Both submission tables have draft/final status, start/completion times, immutable identity, revision numbers, and optional admin correction reason. Final rows require completion time. Match submissions permit only one final per assignment and one final per event/match/team/scout, even when unassigned. Pit submissions permit one final per event/team/scout. Multiple drafts are allowed; clients should reuse their draft UUID.

Generate `client_submission_id` once per logical draft. Upsert on that column using the same identity and payload. Exact retries are no-ops and do not change revision/timestamps. Changed retries cannot rewrite a final row. Never generate a new UUID on each retry. Do not send a new internal row ID on conflict updates.

Match and pit capture now use checked server actions and narrow service-role RPCs. Pit drafts use revision checks and visible claims; submission finalization and event-team completion are atomic. Strategy can read all active-event submissions but cannot directly edit another scout's report. Final changes require an explicit correction workflow; this pit UI keeps completed reports read-only. The schema does not implement a full correction history/audit log; that belongs with the future admin correction workflow. Service-role sync code is not a substitute for a verified admin identity for final corrections. See [pit scouting](PIT_SCOUTING.md).

## RLS matrix

All public application tables, including profiles and the admin audit table, enable RLS. Anonymous users have no table privileges. Active role checks are centralized in narrowly scoped `private` security-definer helpers with empty search paths and explicit grants. They take no caller-supplied user ID.

| Data                                                            | Scout                                                            | Strategy                                                  | Admin                                                                    |
| --------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------ |
| Active events, event teams, matches, rosters, rankings, metrics | Read                                                             | Read                                                      | Manage                                                                   |
| Archived events and related rows                                | No access                                                        | No access                                                 | Manage                                                                   |
| Assignments                                                     | Read own; finish own break through RPC                           | Read visible event assignments; checked scheduling RPCs   | Same scheduling RPCs; read archives                                      |
| Submissions                                                     | Read/write own active-event drafts; finalize; exact final replay | Same writing rights; read all active-event submissions    | Manage, subject to immutable identity/final-correction rules             |
| Team notes                                                      | Read active-event notes                                          | Read and create authored event notes                      | Manage                                                                   |
| Reviewed team incidents                                         | Read own-source incidents in active events                       | Read all active-event incidents; checked confirmation RPC | Read archives; checked confirmation RPC                                  |
| Sync status/errors                                              | No access                                                        | No access                                                 | Manage                                                                   |
| Profile roles                                                   | No writes                                                        | No writes                                                 | No direct profile writes; existing controlled-server-only policy remains |

Inactive users cannot access competition tables, regardless of role. Teams are visible when associated with a visible event. Scheduling is read-only for archives. RLS and restricted table/function grants are authoritative alongside server route authorization. Direct authenticated assignment writes are revoked, including for app admins; scheduling functions validate every mutation.

## Season-specific payloads

SQL checks that game data is an object, issues are an array, schema version is positive, and game slug agrees with the parent event. It does not interpret season fields. `src/games/core/module.ts` defines the typed runtime-parser contract and rejects mismatched game/version envelopes. Future modules implement `parseMatch` and `parsePit`; repositories must use these parsers for both incoming payloads and stored JSONB before exposing typed game data.

The 2026 REBUILT module now supplies Zod schemas and pure metrics; see [Game modules](GAME_MODULES.md). Match capture invokes that version-2 parser before the service-role transaction. Direct database access is denied for authenticated submission writes; the narrow capture RPC enforces assignment identity, active accounts, idempotent UUID retries, and reviewer-cause separation. No 2026-only observation columns were added.

## Indexes and provider metadata

Composite PKs cover event/team membership, metrics, rankings, and sync state. Additional indexes cover active event/year/date lists, event match times, match team lookup, scout/event/status/sequence assignments, event/team/status submissions, assignment references, rankings by rank, and event/team notes. Foreign key leading columns are indexed where needed for known access/deletion paths. Avoid redundant indexes over existing PK prefixes.

Raw JSONB stores only provider data safe for all intended readers. Future adapters must remove credentials, headers, PII, and unsafe diagnostics. `last_error` is capped at 500 characters; the sync adapter must redact first and truncate second. Length checks cannot sanitize secrets. `winning_alliance = null` covers unknown/tied result; `result_metadata` distinguishes these cases without inventing a winner.

## Generated types and verification

`src/types/database.generated.ts` is generated by Supabase CLI introspection of the migrated database. `src/types/database.ts` is a stable re-export/alias layer. Do not manually edit the generated file. Regenerate after schema changes using `supabase gen types typescript --linked --schema public` once the linked migration has applied, then run Prettier and typecheck.

For local SQL verification, create an empty disposable PostgreSQL 17 database, apply `tests/sql/auth-fixture.sql`, then all migrations in filename order. Run `tests/sql/profiles.sql` and `tests/sql/event-model.sql` with `psql -v ON_ERROR_STOP=1`. Fixture Auth objects are only for vanilla PostgreSQL and must never be applied to Supabase. Both test suites roll back their synthetic test data.

Tests cover year/event consistency, assignment conflicts, cross-event FK failures, RLS visibility/writes, inactive/anonymous access, draft/final lifecycle, replay, duplicate finals, admin corrections, and archive isolation. Node tests exercise game dispatch/validation and environment boundaries. These tests do not replace future Supabase Auth/PostgREST integration tests.

Before remote application: inspect migration status and existing schema, run a linked dry-run, review the migration, and follow the current task's authorization. Never reset the linked project. No new credentials are required to review or test this schema locally.
