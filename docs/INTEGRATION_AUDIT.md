# Integration audit — October 7, 2026

## Result and targeted fixes

All requested features are implemented in the existing application pipelines. No redesign, new feature, dependency, hosted data change, or migration was introduced by this audit.

Three issues were fixed:

1. **Load saved board discard race:** confirmed removal now blocks debounced, pagehide and unmount checkpoints. This prevents navigation from writing the discarded document back into IndexedDB. Failed removal keeps recovery available.
2. **Expanded-board accessibility:** expansion now exposes a named modal, locks background scrolling, contains keyboard focus, closes with Escape and restores focus. Existing image coordinates, pan/zoom, text options and drawing state are retained.
3. **Stats terminology:** sort controls now use Shuttling / Passing and Other / Idle, matching the tables. Metric keys and calculations are unchanged.

## Feature and architecture audit

| Area                 | Verified integration                                                                                                                                                                                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pit robot weight     | Existing 2026 version-2 payload stores `robot_weight_lbs`; optional/default-null, finite and positive, decimals allowed, no weight maximum. Form/review and team profile specify battery/bumpers excluded. Draft text and legacy reports retain Unknown.                                                                                                                        |
| Picklist             | Typed directory fields become candidate `robotWeightLbs`, drivetrain and mechanism. Canonical pit enums supply controls. AND across categories, OR within selections, unknown numeric exclusion only for active ranges, unknown weights last in both sorts. Filters do not change role scores, saved manual order or snapshots. Viewing filters are deliberately session-local. |
| Nexus                | One server-only client and normalizer module; fixed host, bounded bodies/timeouts/retries, optional server key, normalized event cache, key override, retained-cache failures and assignments-only/no-data fallbacks. No provider requests from components and no PitFUSION source.                                                                                             |
| Pit map              | Existing list remains below the collapsible map. Expand/close, viewport gestures, search, form links, status labels/symbols and red/yellow/green/gray states retained. Viewport transforms update locally through animation frames, not application state.                                                                                                                      |
| Presence             | One event observer on the index and one publisher on an active form; never per pit box. Advisory team-only session data; hidden/disconnected/unmounted routes clear activity. Same-topic removal completes before rejoin. Cleanup removes listeners/channels.                                                                                                                   |
| Auth                 | One shared 8-character policy used by signup, account changes, required resets and admin creation/reset. No remaining 16-character application requirement. Pending approval, forced changes, role assignment, username/email login and RLS preserved.                                                                                                                          |
| Match Prep           | Canonical query selection, automatic next upcoming match, completed/upcoming groups, event-change redirect for invalid selection, historical six-card analytics and honest missing scouting. Match Details links carry the exact match key. No demo data was added to production.                                                                                               |
| Stations             | `features/events/match-stations.ts` supplies Schedule, Match Details, Match Prep and Strategy Board. All preserve R1/R2/R3/B1/B2/B3 order; database pagination ordering is not display ordering.                                                                                                                                                                                |
| Strategy Board       | Per-match revision-checked saves, same device draft store, normalized coordinates, exact approved image, game-defined seven phases, independent drawings/markers/notes, explicit phase duplication and manual Live Mode. No timed HUB inference or pointermove saves.                                                                                                           |
| Drawing identity     | Six station colors with visible station/team labels. Station and team persist; alliance is encoded by station and derived centrally. Selecting another team does not recolor existing drawings. Ownership survives edits, history, duplication, save/reload and import.                                                                                                         |
| Import/scout viewing | More stacks Load/Export/Import. Validated full-phase imports stay local until saved; bad imports preserve the board. Scouts receive a map-only server document with notes redacted, no editor/draft/live controls.                                                                                                                                                              |
| Component boundaries | Drawing interaction stays in FieldBoard, persistence in useBoardSession, match analytics in Match Prep. No duplicate provider, password policy, scoring pipeline or strategy phase definitions found. No unrelated component partitioning was needed.                                                                                                                           |

## Database/deployment audit

**No new migrations or schema changes in this audit.** Earlier additions:

| Migration                                    | Additions                                                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `20261021000000_event_pit_maps.sql`          | `events.nexus_event_key`, event-keyed `event_pit_maps`, normalized/raw cache privacy and checked cache RPC. |
| `20261022000000_pit_presence.sql`            | Completion-existence RPC, coverage trigger, private event Presence authorization policies.                  |
| `20261023000000_strategy_boards.sql`         | Match-keyed `strategy_boards`, composite match/event foreign key, revision CAS RPC and strategy/admin RLS.  |
| `20261024000000_strategy_board_map_read.sql` | Scout map-only read RPC with phase notes removed.                                                           |

Read-only linked inspection confirmed all four are applied. Each local file matches the SQL tokens recorded in `supabase_migrations.schema_migrations`; applied migrations were not edited. Hosted schema inspection confirmed RLS is enabled on both new tables and `realtime.messages`; only the scoped pit Presence receive/publish policies exist there. Primary/unique keys cover cache/event and board/match access; board event lookup has an index. Cache reads, saved boards, drafts, imports and selectors retain event/match/account boundaries. Raw Nexus responses are not granted to authenticated clients.

Weight remains inside the existing game payload; no unrelated robot table or schema-version increment was needed. Generated database types include the new tables/RPCs; normalized pit, board and view-model types are shared with their existing consumers.

Earlier route addition: `/events/[eventKey]/matches/[matchKey]/strategy-board`. Pit-map components, shared station helper, Match Prep selector and Picklist pit filters extend their existing routes. No route/component was added by this audit.

Environment: no new variables in this audit. Earlier `NEXUS_API_KEY` is optional and server-only. Existing Supabase credentials are unchanged. A browser-build scan against configured private credential values found **zero leaks**.

Hosted Auth minimum length is not exposed by the schema/migration audit. Verify the Supabase Email provider minimum is **8**; repository config and application validation cannot enforce that hosted setting. Existing approval and security settings should remain as documented in AUTHENTICATION_UX.md. No pending hosted migration was found.

## Regression evidence

| Requested scenario                             | Evidence                                                                                                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A–B: legacy/no weight and 112.4 lb             | pit, game-module, team and pit-component tests; null/blank, integer/decimal, negative/zero, draft/edit and payload validation.                                                                          |
| C: Swerve AND Turret AND ≤115                  | Real Picklist workspace UI tests select the categories/range and remove Drum from OR selection, leaving the turret candidate with its original score. Phone controls were also exercised in Chromium.   |
| D: two scouts on same team                     | Presence transport/session tests identify the other session, suppress own-only warning, clear disconnects and serialize route cleanup/rejoin. Private-channel authorization is covered in SQL.          |
| E–F: assignments only / no Nexus               | Nexus/cache tests and real PitMap/PitScouting component tests preserve list/form navigation.                                                                                                            |
| G–H: no future schedule / historical selection | Query and UI tests retain selector, canonical URL/reload/event-change behavior, exact station order and available external evidence with no fabricated internal values.                                 |
| I–J: save/refresh and independent phases       | Strategy unit/server/UI tests cover offline restore, save revision, all-phase JSON reload/import, phase isolation, duplicate/clear and conflicts. New discard-race test verifies no draft resurrection. |
| K–L: six identities / team in another station  | Palette/owner tests check all six colors, station/team labels, ownership persistence, missing slots and changed station color for the same team.                                                        |
| M: existing scouting                           | Competition UI tests exercise +1/+5/+10/+20, undo and Auto/Teleop/post-match flow. Activity/aggregation tests retain Scoring, Shuttling / Passing, Defending and Other / Idle.                          |
| N: no old workflow or FUEL-from-time           | Source audit confines Shuffle to preserved version-1 compatibility code. Current Stats menu labels corrected; activity and estimated FUEL remain separate data and calculations.                        |

## Mobile, accessibility and performance

Used an isolated, temporary harness of the actual components with test fixtures and server writes disabled. It is outside the repository and was stopped after inspection.

- Chromium widths **390 × 844** and **320 × 740**: pit filters/chips, historical Match Prep selector/badge and Strategy Board phase/team/tool controls fit without horizontal overflow. Visible interactive controls measured at least 44 px high.
- **120 pits:** map renders links/statuses, expands into its native modal, closes and collapses while list navigation remains visible. Map touch action is `none`; existing integration tests exercise pointer/pinch/wheel and keyboard gestures.
- **300 drawings:** actual Strategy Board renders the bounded maximum; expanded modal scroll lock, focus, Escape and focus return verified in Chromium. Tests cover accumulated pan, pointer-relative zoom, 100% minimum zoom and cancellation of accidental object movement during pinch.
- No browser console errors in the isolated check. Pan updates only the map viewport/FieldBoard; committed gestures checkpoint to the shared device store. Server saves remain explicit, not per pointer movement. Schedule pagination tests cover 1,203 cached rows.
- Palette contrast tests retain at least 4.5:1 marker-label contrast. Pit statuses and drawing owners have labels in addition to color. Pit keyboard Help remains available.

Phone screenshot: [Picklist controls](C:/Users/dhspr/.codex/visualizations/2026/10/05/01a10dca-3a9c-7b61-8815-419976163afb/integration-picklist-phone.png) (absolute artifact path is provided in the handoff).

## Commands/results

- `npm test`: **214 unit + 75 UI tests passed**; three new UI regressions and existing terminology assertion updated.
- `npm run test:sql`: **24 disposable PostgreSQL suites passed**, including RLS, raw-cache privacy, Presence, pending/role gates, event boundaries and strategy conflicts.
- `npm run test:auth:local`: **passed** real signup/pending route/API denial, neutral/deduplicated reset requests, admin-only reset, approval, required change and username/email login.
- Local Auth initially could not start on Windows-reserved ports. Temporary alternate ports allowed the test; local migrations only were applied, the stack stopped, and config restored byte-for-byte. Hosted data was unchanged.
- `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check`: passed.
- `supabase migration list --linked` and linked migration/schema dumps: read-only verification passed; migration SQL comparison passed.

## Files modified by this audit

- `src/features/strategy-board/components/use-board-session.ts`
- `src/features/strategy-board/components/field.tsx`
- `src/features/stats/model.ts`
- `tests/strategy-board-ui.test.tsx`
- `tests/stats-ui.test.tsx`
- `tests/stats.test.ts`
- `docs/PIT_MAPS.md`
- `docs/STRATEGY_BOARD.md`
- `docs/INTEGRATION_AUDIT.md` (new)

## Limits

Live Nexus responses and simultaneous hosted two-device Presence were not exercised; provider/session fixtures, actual components and hosted policy inspection cover their integration contracts. Physical phone pinch gestures were simulated in integration tests. Hosted Auth minimum still needs Dashboard verification. Strategy Board shares server-saved plans, not live collaborative merging; previously loaded boards support offline edits, but never-loaded routes have no new offline route cache. No required implementation TODO remains.
