# Game modules

## Current contract and version policy

The existing `2026-rebuilt` module now writes **schema version 2** (previously 1). The registry returns version 2 when version is omitted and lists one current capture option per game. Always select stored rows with `getGameModule(row.game_slug, row.schema_version)`, then `parseGameData(game, row, "match" | "pit")`.

Version 1 is frozen inside the same module's `legacy/v1` directory, including its schemas, aggregates, and fixtures. Its old `shuffleCount`, `shuffleEvents`, movement, and pit-note meanings are preserved, not renamed into shuttling/passing or converted into durations. This is a historical reader, not another capture option. Unknown versions fail closed. Version-2 parsing rejects old shapes; do not pool versions in analytics or fabricate confidence, roles, or activity from version 1.

A read-only inspection of the linked database on 2026-09-26 found **zero 2026 match and zero pit submissions**. No scouting data migration was necessary. Historical fixtures do exist and retain regression coverage.

Core infrastructure stays unchanged: `GameModule` owns schemas, parsers, pure team/event aggregation, metric metadata and optional match-prep/picklist configuration. Seasons share numeric summaries but do not blend official OPR/COPR/EPA into a hidden human-scouting score. Provider clients remain server-only and outside game modules.

## Canonical version-2 match payload

Use the exported inferred `RebuiltMatchData` type and strict `rebuiltMatchSchema`. Version 2 uses snake_case persisted observation fields; aggregate property paths are separately defined in presentation metadata.

| Section    | Fields and meaning                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUTO       | `estimated_fuel_scored`: integer estimate or null; `start_position`: left/center/right/unknown; `execution_result`: successful/partial/failed or null when unobserved; `collected_additional_fuel`: yes/no/unknown; `climb`: null or result none/attempted/achieved, with optional `achieved_level: level_1` only when achieved.                                                                                                 |
| TELEOP     | `estimated_fuel_scored`: integer or null; `activity`: null when not timed, otherwise the timeline described below.                                                                                                                                                                                                                                                                                                               |
| Issues     | Optional `issues[]`: UUID, phase, relative `at_seconds` or null, `observed.category`, optional description and recovered yes/no/unknown. Categories: disabled (disabled/no movement), communications, drivetrain (impaired), intake, shooter_scorer, tipped, other. These are observed symptoms.                                                                                                                                 |
| Post-match | `observed_role`: scorer/passer_feeder/defender/mixed/inactive; `defense_observed`: explicit boolean; optional `defense_effectiveness`: poor/average/strong; `reliability`: normal/minor_issue/major_issue/DNF/DNS; optional recovered and driver_control (rough/average/strong/unknown); `climb`: null/none/attempted/level_1/level_2/level_3; `fuel_estimate_confidence`: good/rough/very_uncertain; optional `important_note`. |

AUTO level 1 follows [FIRST's REBUILT scoring rules](https://firstfrc.blob.core.windows.net/frc2026/Manual/HTML/2026GameManual.htm). These observations do not certify official scoring eligibility.

An issue's optional legacy `confirmed_cause` JSON shape remains in the version-2 parser for compatibility, but match capture rejects scout-supplied confirmed causes. The canonical reviewed cause now lives in `team_incidents`, separate from the immutable submission observation, and is written only by a checked reviewer RPC. See [incident evidence](INCIDENTS.md). Zod alone is not authorization.

FUEL controls later use **+1/+5/+10/+20 and Undo**. Estimates are scored FUEL, not misses, shots, attempts, capacity, or points. The model has no live cycle counter, collection timer, hopper fractions, passed-ball count, climb timer, or continuous AUTO activity.

## Activity timeline

`teleop.activity` has `duration_seconds` and ordered `transitions: [{ at_seconds, state }]`. The time origin is the start of the observed teleop window. States are exactly `scoring`, `shuttling_passing`, `defending`, `other_idle`.

A positive-duration window must start at timestamp zero with one state. Each transition ends the previous state and starts the new state. Times strictly increase, must precede the observation end, and consecutive states must differ. Invalid/overlapping/same-time entries are rejected, never silently sorted or repaired. Zero duration requires an empty transition list and does not participate in timed aggregates. Missing timing is null, not an invented idle match.

`deriveActivity` returns seconds, contiguous period counts, and shares (fractions 0–1) for each state. No tap creates a database row. The UI should begin with a deliberate state, record changes locally, and close the last period at the observation end. A late start or early end is a partial observation: do not extrapolate it to 140 seconds. The generous 600-second validation ceiling is an input sanity guard, not an official match duration.

“Shuttling/passing” means moving FUEL into the alliance zone for alliance use. Do not label new observations “shuffling” or “ferrying.” A period is a contiguous state interval, not a manually counted robot cycle or a number of balls.

Defense effectiveness is accepted only with at least **5 timed defense seconds** or an explicit `defense_observed: true`. Five seconds is the module's documented noise threshold, not a game rule. A brief real defensive action may be deliberately marked. Untimed, unmarked observations do not prove absence of defense.

## Confidence, missing data, and aggregates

Callers select canonical final submissions first. Team/event aggregates validate payloads and identities, reject duplicate team/match observations and mixed events, and never mutate input. Team summaries also reject mixed teams. Event summaries pool team/match observations, not averages of team averages.

- AUTO/TELEOP/TOTAL FUEL expose mean, median, best, population standard deviation and sample size. Total requires both phases known. Zero is an observation; null is missing. No missing estimate becomes zero.
- Default FUEL summaries exclude `very_uncertain`. Opt in with `rebuilt2026.aggregateTeam(rows, { includeVeryUncertainFuel: true })` or the event equivalent. The same record's role, activity, issues and reliability remain included regardless of FUEL confidence. Records remain readable and stored.
- `sampleSize` counts all selected scouted records. `fuel.confidentSampleSize` counts good/rough records with both FUEL phases known, excluding DNS. Each phase also has its own sample size. `veryUncertainSampleSize` makes excluded estimates visible.
- DNS requires null FUEL/timeline and no observed field actions. It affects reliability and role distribution, never offensive zero. DNF can have explicit partial-match estimates, including a genuine zero, but these partial records are excluded from default offensive production aggregates; they remain visible in match history. `excludedDnfSampleSize` counts DNF records with complete phase estimates.
- Each activity state exposes seconds/period/share summaries and frequency of at least one period among positive timed windows. Share is the mean of per-observation shares, not pooled duration weighting. Timed sample size accompanies summaries.
- Defense frequency uses meaningful timed or deliberately marked defense divided by known defense observations. Its effectiveness distribution counts only supplied ratings and exposes its own denominator.
- Roles expose counts, frequencies, sample size, modes, and `mostCommon`; ties return no single most-common role.
- AUTO execution exposes successful/partial/failed counts/rates among known results; additional-FUEL frequency excludes unknown and DNS.
- Driver-control and defense-effectiveness metadata explicitly label these subjective supporting assessments. No artificial numeric ordinal score is calculated.
- Full-match rate = normal/minor/major issue divided by all statuses including DNF/DNS. Started-completion rate excludes DNS from its denominator. Observed issue event/category counts stay separate from confirmed causes.
- AUTO/post-match climbs are secondary distributions. They do not dominate performance metrics.

Empty denominators and absent means/medians/best/SD return null. One known value has population SD zero; display sample size beside consistency.

## Official comparison

`official.ts` parses exact 2026 TBA FUEL and tower fields; see [source mapping and fixtures](SEASON_2026_SOURCES.md). `reconcileAlliance2026` accepts a completed TBA-shaped match, alliance, and exactly one selected final version-2 observation per official roster team. Cached DB callers compose that match from relational identity/roster/result fields plus `raw_tba_payload.score_breakdown`.

Unplayed/missing breakdowns are unavailable; fewer than three scouts returns missing teams; duplicate IDs/teams, wrong match/event/alliance, or wrong versions are rejected. Known phase sums are compared individually; unknown estimates return null differences. Percentage difference is `100 * abs(estimate - official) / official` only when official > 0; zero denominators remain null even when both values are zero. Contributing IDs and the very-uncertain flag are returned. Reconciliation deliberately includes uncertain estimates and flags them rather than borrowing the analytics filter.

This is a review signal only. Never rescale/rewrite individual estimates, infer which scout was wrong, or treat alliance totals as individual ground truth. No review UI or automatic correction exists.

## Future seasons and persistence

Add a `2027-*` module implementing the same contract and register it centrally. Its event slug selects its own forms/metrics without changing auth, imports, teams, assignments, or admin infrastructure. On incompatible changes, increment the payload version, preserve readers, and list only the newest version for capture.

The stable submission tables already hold `game_slug`, `schema_version`, and JSONB. No 2026 observation columns or per-tap tables were added. The new TBA migration only updates the existing snapshot function to write the already-existing JSONB columns; generated database type signatures remain unchanged.

Future submission services must validate the selected version and enforce reviewer-field authorization before storage. RLS does not run Zod; season validation for direct API writes remains a separate future concern.

## Verification

`npm test` covers revised and legacy validation, invalid timelines, all observed roles, confidence filtering, zero/missing/DNS/DNF behavior, AUTO rates, source parsing, reconciliation and registry/presentation paths. SQL tests verify source-cache persistence, optional-data retention, scouting preservation, RLS and existing admin behavior. No new scouting UI is implemented.
