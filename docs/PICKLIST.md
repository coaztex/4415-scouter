# Picklist

`/events/[eventKey]/picklist` requires an active strategy/admin profile. It uses validated final version-2 2026 scouting aggregates and cached TBA/Statbotics data. No model, generated strategy, prediction, or hidden composite supplies rankings. The default view is Scoring / Offense. There is no Overall profile.

## Profiles and defaults

| Profile                     | Enabled default weights                  | Other editable inputs (default 0)                              |
| --------------------------- | ---------------------------------------- | -------------------------------------------------------------- |
| Scoring / Offense           | Median total FUEL 100                    | Scoring time share, TBA total FUEL COPR, Statbotics TELEOP EPA |
| Support / Shuttling-Passing | Passing time share 100                   | Observed Passer-Feeder role frequency                          |
| Defense                     | Defense frequency 100                    | Defense time share, strong effectiveness rating (subjective)   |
| Reliability                 | Full-match rate 100                      | Started-match rate, no observed issue rate                     |
| Auto                        | Observed success 75; median AUTO FUEL 25 | TBA AUTO FUEL COPR, Statbotics AUTO EPA                        |
| Complement to our robot     | All disabled until configured            | Any explicit metric above                                      |

Each event stores weights, minimum scouting sample count and minimum coverage for all six profiles. Defaults require three usable observations per scouting metric and 70% enabled-weight coverage. Weights are relative values between 0 and 100; 0 disables a metric. They need not sum to 100.

### Weight scenario presets

The weight editor starts in **Manual weights** on each visit. Selecting a short scenario replaces **only the selected profile's weights** with the ratios below; the sample minimum and coverage do not change. Every preset totals 100 for readability. These are strategy starting ratios chosen for the described alliance need, not weights fitted to competition outcomes or a claim of objectively optimal pick order. Review the contribution table and adjust them during selection. Picking Manual keeps the current weights. Editing any weight after choosing a scenario switches the selector to Manual and shows **Undo manual changes**, which restores that scenario's exact weights. The scenario selector and undo history are local editing aids; saved event state and snapshots retain the actual numeric weights. On a new visit, Manual appears while the saved weights remain.

| Profile                     | Scenario           | Weights                                                                                       |
| --------------------------- | ------------------ | --------------------------------------------------------------------------------------------- |
| Scoring / Offense           | Proven output      | Median total FUEL 75; scoring time share 25                                                   |
| Scoring / Offense           | Active scorer      | Median total FUEL 45; scoring time share 55                                                   |
| Scoring / Offense           | Output cross-check | Median total FUEL 60; scoring time share 20; TBA total FUEL COPR 10; Statbotics TELEOP EPA 10 |
| Support / Shuttling-Passing | Dedicated feeder   | Passer-Feeder role frequency 70; passing time share 30                                        |
| Support / Shuttling-Passing | Active shuttle     | Passing time share 70; Passer-Feeder role frequency 30                                        |
| Support / Shuttling-Passing | Balanced support   | Passing time share 50; Passer-Feeder role frequency 50                                        |
| Defense                     | Frequent defense   | Defense frequency 70; defense time share 30                                                   |
| Defense                     | Sustained defense  | Defense frequency 30; defense time share 70                                                   |
| Defense                     | Rated impact       | Defense frequency 40; defense time share 25; subjective strong rating 35                      |
| Reliability                 | Finish matches     | Full-match rate 75; no observed issue rate 25                                                 |
| Reliability                 | Few issues         | Full-match rate 30; no observed issue rate 70                                                 |
| Reliability                 | Always starts      | Started-match rate 70; full-match rate 30                                                     |
| Auto                        | Repeatable auto    | Observed success 80; median AUTO FUEL 20                                                      |
| Auto                        | FUEL output        | Observed success 35; median AUTO FUEL 65                                                      |
| Auto                        | Auto cross-check   | Observed success 55; median AUTO FUEL 25; TBA AUTO FUEL COPR 10; Statbotics AUTO EPA 10       |
| Complement                  | Add scorer         | Median total FUEL 70; full-match rate 30                                                      |
| Complement                  | Add feeder         | Passing time share 50; Passer-Feeder role frequency 30; full-match rate 20                    |
| Complement                  | Add defender       | Defense frequency 55; defense time share 25; full-match rate 20                               |
| Complement                  | Add auto           | Observed success 55; median AUTO FUEL 30; full-match rate 15                                  |
| Complement                  | Add reliability    | Full-match rate 65; no observed issue rate 35                                                 |

Presets do not fill in the free-text alliance needs. Complement still requires a human-written need before it produces scores. The existing warnings remain visible for correlated inputs, especially the external cross-check scenarios. Missing metrics continue to follow the event's coverage rule, so a preset may leave teams unranked when evidence is thin.

Complement uses a minimal event strategy configuration: free-text `strengths` and `needs`, each up to 500 characters, plus its own explicit metric weights. Strategy users describe the desired complement and choose its weights. No needs are inferred from team number, role, or missing scouting. An empty needs description prevents Complement scores. `events.our_team_number` identifies the team's evidence link and removes our robot from candidate comparisons. No team number or actual strategic preference is hard-coded.

## Scoring and evidence policy

1. For each enabled metric, require a known finite value and the configured sample minimum for scouting data. External provider sample counts are not stored and are explicitly shown as unavailable; the scouting minimum does not apply to them.
2. Normalize eligible candidates using a midrank percentile: `100 × (lower count + (tie count − 1)/2) / (peer count − 1)`. A single peer or all-equal values produce 50. Relative numeric differences within `1e-9` are ties to avoid floating-point artifacts. Larger values are better for all listed metrics.
3. Use the full event candidate cohort, excluding our robot. Favorites, manual positions, exclusions and UI filters do not change normalization.
4. Weight coverage is usable enabled weight divided by total enabled weight. Missing and undersampled values are omitted, never filled with zero. Rescale usable weights to sum to one. The score is the sum of percentile × rescaled weight. Below minimum coverage, no enabled weight, or no usable evidence produces an unranked result.

Contribution tables expose raw value, source, sample size, percentile, comparison-team count, configured weight, effective weight, weighted points and the inclusion/omission reason. They also link to individual validated match records. Scores are relative to the event and profile, not estimates of objective robot quality; partial-coverage scores can compare different subsets, so coverage remains visible.

The team directory offers a single-select primary scoring mechanism filter. Picklist offers multi-select Drum, Turret, Other, and Unknown alongside All; selections only hide or show candidates after every profile score is computed against the complete event field. The badge comes from the team's latest readable completed 2026 pit report. Missing reports and older reports without the field remain Unknown. Mechanism is not an input to any ranking profile or preset. Older saved snapshots without mechanism metadata also display Unknown.

Very-uncertain FUEL, DNS and DNF offensive estimates are excluded by the shared game aggregate. Total FUEL requires both phases. AUTO FUEL uses its own usable phase sample count. These records still contribute their observed roles, reliability and non-FUEL activity evidence. Usable FUEL counts, role counts, total scouting counts, uncertainty and recent reliability concerns appear on each team. A recent concern means major issue, DNF or DNS in the last three observed matches.

Offensive FUEL, scoring time, COPR and EPA can reflect overlapping performance. Related inputs show a warning when enabled together; total FUEL plus AUTO output also warns because total already contains AUTO. Passing activity and observed support role overlap, as do defense time/frequency and availability/completion/issue rates. Defaults use one metric per correlated group and leave external offense inputs disabled. No external/human combination is hidden inside another metric. Defense effectiveness is explicitly subjective. Reliability metrics are separate from offensive production.

## Manual decisions and snapshots

Favorites, exclusions with a required reason, and notes live in event team controls. Manual order is an independent list of team numbers, initially ascending; new teams append. Changing weights or profiles never reorders it. Move-to-position controls work against the complete candidate order, including filtered or excluded teams. Edits remain local until Save picklist; an unsaved indicator and save control remain available. Revision checks reject stale concurrent saves while preserving the local draft.

Named snapshots preserve saved configuration, team controls, manual order, all six computed profiles and contributions, sample summaries, role distributions, recent flags and record links. Formula version 1 and capture time are stored. The server computes evidence from readable cached data, then the database captures the saved state only if its revision still matches. Snapshots are immutable through authenticated APIs and are inspected with `?snapshot=<uuid>`. Source match links open current records; the snapshot's contributions remain frozen. The latest 100 snapshot links are listed. CSV export is deferred.

## Storage and access

Migration `20261005000000_picklists.sql` adds `event_picklists` and `picklist_snapshots`, initializes conservative defaults for existing/future events, and provides checked save/snapshot RPCs. Tables have strategy/admin-only reads. Direct authenticated writes are revoked. RPCs validate active roles, active events, roster membership, weights, exclusion reasons and expected revisions. Archived events are admin-readable and read-only. Existing scouting/provider tables are unchanged. No new environment variables or dependencies are required.

Unit tests cover normalization, ties, weighted contributions, missing data, confidence exclusions, small samples, disabling correlated inputs, profile semantics, Complement configuration, manual-order independence and frozen snapshots. The disposable SQL suite checks role access, validation, stale-save rejection, immutability and archive restrictions.
