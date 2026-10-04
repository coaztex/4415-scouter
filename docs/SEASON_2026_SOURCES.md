# Verified 2026 provider mappings

Verified 2026-09-26 against the existing imported event `2026cascmp`. There are no invented credentials, component aliases, or production fixtures.

## TBA

Recorded fixtures:

- `tests/fixtures/tba-2026-matches.json`: the unmodified public `2026cascmp_f1m1` object selected from `GET /api/v3/event/2026cascmp/matches`.
- `tests/fixtures/tba-2026-coprs.json`: every exact component key from `GET /api/v3/event/2026cascmp/coprs`, reduced to team `frc4414` values for a small fixture.

Fixture retrieval uses the existing server key without storing it in fixtures/logs. [TBA's season implementation](https://github.com/the-blue-alliance/the-blue-alliance/blob/4ff0795d28574c13405eb9d0a83f9287a0186f4d/src/backend/common/game_specific/seasons/game_specifics_2026.py) provides supporting source context.

| Source field                                                                | Typed output                                                                    |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `score_breakdown.{red,blue}.hubScore.autoCount`                             | Official alliance AUTO FUEL                                                     |
| `hubScore.teleopCount`                                                      | Official alliance TELEOP FUEL, including transition/shifts/endgame              |
| `hubScore.totalCount`                                                       | Official alliance TOTAL FUEL                                                    |
| `autoTowerPoints`, `endGameTowerPoints`, `totalTowerPoints`                 | Separate tower point totals                                                     |
| `autoTowerRobot1/2/3`, `endGameTowerRobot1/2/3`                             | Raw per-station tower outcome strings, retained without guessed enum conversion |
| `oprs[team]`, `dprs[team]`, `ccwms[team]`                                   | Existing OPR/DPR/CCWM columns                                                   |
| COPR `Hub Auto Fuel Count`, `Hub Teleop Fuel Count`, `Hub Total Fuel Count` | `components_2026.auto_fuel/teleop_fuel/total_fuel`                              |
| COPR `autoTowerPoints`, `endGameTowerPoints`, `totalTowerPoints`            | `components_2026.auto_tower_points/endgame_tower_points/total_tower_points`     |

Unknown source fields remain in the stored breakdown/component payload; missing mapped values remain null. COPRs can be negative estimates and are not clamped. Total alliance points include other scoring/fouls and must not substitute for FUEL counts.

The existing client now fetches COPRs once for a played 2026 event, never per team. `matches.raw_tba_payload` stores score breakdown plus post-result time. `external_team_metrics.payload.coprs` stores one team's exact component map; normalized common metrics still use columns. The RLS-scoped `getCachedTbaMetrics` exposes typed components to later pages.

Migration `20260928000000_tba_2026_breakdowns.sql` replaces the existing snapshot function without altering tables, columns, signatures, authorization or old migrations. It preserves scouting data; absent optional breakdown/COPR responses retain cached source data. New source data arrives on an explicit sync, not a page load.

## Statbotics

The live selected-event list endpoint returned HTTP 500, and the individual team-event probe returned 503. Therefore **no successful current live Statbotics response was recorded**. The fixture is explicitly a source-shaped mock with synthetic values, not evidence of real team EPA.

Exact response structure verified from the provider's current published source at commit `a2cea5553e35693d423400f419bd770cb2143408`:

- [TeamEvent.to_dict response builder](https://github.com/avgupta456/statbotics/blob/a2cea5553e35693d423400f419bd770cb2143408/backend/src/db/models/team_event.py).
- [2026 component names and derived response fields](https://github.com/avgupta456/statbotics/blob/a2cea5553e35693d423400f419bd770cb2143408/backend/src/breakdown.py).
- [2026 phase definitions](https://github.com/avgupta456/statbotics/blob/a2cea5553e35693d423400f419bd770cb2143408/backend/src/tba/breakdown.py).

`epa.total_points` maps to current total EPA, and `epa.breakdown.auto_points/teleop_points/endgame_points` retain the existing normalized columns. Under `epa.breakdown`, the additional verified fields exposed by `components_2026` are:

`auto_fuel`, `auto_tower`, `transition_fuel`, `first_shift_fuel`, `second_shift_fuel`, `endgame_fuel`, `endgame_tower`, `teleop_fuel`, `total_fuel`, `total_tower`.

The last three are provider-derived response fields. We read them only when supplied; we do not fabricate totals from missing components. Statbotics components are **EPA point contributions**, not human FUEL estimates. Its `teleop_points` excludes its separate endgame portion, whereas `teleop_fuel` includes endgame FUEL; keep those labels distinct.

The bounded source-specific EPA object remains in JSONB with `normalization_version: 2`. Unknown EPA fields survive. Record/win-probability data is not newly normalized or cached because no implemented feature consumes it. Previous payloads are not rewritten by migration.

`updated_at`, if explicitly returned, maps to `source_updated_at`; the current response builder supplies no such field, so null is normal. Never use event ordering `time` as update time. `fetched_at` records our retrieval separately.

No API key is required. The separate adapter, request bounds, cache-only reads, and nonfatal failure orchestration remain unchanged. Live EPA verification can be repeated when the provider recovers; it does not block the scouting foundation.

## Verification result

The migration was applied after a remote migration-status check, dry run, and disposable PostgreSQL regression tests. An authenticated admin sync of the existing event completed on 2026-09-26: 61 teams, 135 matches, and 60 rankings remain cached. A database read verified all 135 matches have score breakdowns and the typed TBA cache reader returns the exact recorded team 4414 FUEL/tower COPRs. The final-match red alliance reads AUTO 130, TELEOP 552, TOTAL 682 FUEL. Both scouting submission tables still contain zero 2026 records.

The same orchestration reported Statbotics HTTP 500 after the successful TBA commit, confirming failure isolation live. No test submissions, accounts, or synthetic competitions were written to the remote database. Lint, typecheck, 59 unit tests, formatting, production build, and all five SQL regression suites passed. Local and remote migration lists match. Generated table/function types did not require changes.
