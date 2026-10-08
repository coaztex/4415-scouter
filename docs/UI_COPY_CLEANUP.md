# UI copy cleanup

## Scope

Presentation-only audit across dashboard/event overview, pit scouting/map, match scouting/prep, Strategy Board, teams, stats, Picklist, data review/incidents, scheduling, admin, authentication and settings. Dashboard and event overview already used concise copy.

## Changes

- Removed the Picklist Boolean-filter tutorial, repeated scoring/filter descriptions and redundant manual-order/preset instructions.
- Shortened Strategy Board tutorials, draft status, empty states, source descriptions and account/admin guidance.
- Standardized visible activity labels to Shuttling / Passing and Other / Idle.
- Removed unused explanatory markup, allowing existing responsive layouts to collapse naturally.

## Retained

- Robot-weight definition: Excludes battery and bumpers.
- Password policy guidance, account approval, permission restrictions and validation errors.
- Unknown/missing data distinctions, source labels, uncertainty, sample sizes and scoring explanations inside existing disclosures.
- Destructive-action confirmations, draft recovery/sync warnings and correction safeguards.
- Pit Map keyboard help and accessibility associations, Strategy Board pinch/scroll zoom and text-hold guidance.

## Behavior

No changes to business logic, calculations, filtering, scoring, payloads, APIs, schemas, migrations or dependencies. Existing interaction tests remain intact; six test files update wording assertions only.

## Modified files

- `src/features/teams/components/detail.tsx`
- `src/features/teams/components/pit-weight.tsx`
- `src/features/teams/components/record.tsx`
- `src/features/strategy-board/components/board.tsx`
- `src/features/strategy-board/components/field.tsx`
- `src/features/stats/components/overview.tsx`
- `src/features/stats/components/sections.tsx`
- `src/features/scouting/match/components/draft-panel.tsx`
- `src/features/scouting/match/components/issues.tsx`
- `src/features/scouting/match/components/post.tsx`
- `src/features/scouting/match/components/workflow.tsx`
- `src/features/scheduling/components/generator.tsx`
- `src/features/scheduling/components/manual-editor.tsx`
- `src/features/scheduling/components/scout-list.tsx`
- `src/features/scheduling/components/workspace.tsx`
- `src/features/robot-media/components/photo-upload.tsx`
- `src/features/pit-map/components/pit-form-presence.tsx`
- `src/features/pit-map/components/pit-map.tsx`
- `src/features/pit/components/fields.tsx`
- `src/features/pit/components/form.tsx`
- `src/features/pit/components/routines.tsx`
- `src/features/pit/components/team-list.tsx`
- `src/features/picklist/components/pit-spec-filters.tsx`
- `src/features/picklist/components/team-entry.tsx`
- `src/features/picklist/components/workspace.tsx`
- `src/features/match-prep/components/match-selector.tsx`
- `src/features/match-prep/components/prep.tsx`
- `src/features/incidents/components/incident-card.tsx`
- `src/features/incidents/components/review-form.tsx`
- `src/features/event-schedule/components/details.tsx`
- `src/features/event-schedule/components/schedule.tsx`
- `src/features/auth/components/lifecycle-forms.tsx`
- `src/features/admin/components/account-forms.tsx`
- `src/features/admin/components/event-controls.tsx`
- `src/app/account/page.tsx`
- `src/app/events/error.tsx`
- `src/app/events/page.tsx`
- `src/app/forgot-password/page.tsx`
- `src/app/schedule/error.tsx`
- `src/app/settings/page.tsx`
- `src/app/events/[eventKey]/layout.tsx`
- `src/app/events/[eventKey]/data-review/page.tsx`
- `src/app/events/[eventKey]/incidents/page.tsx`
- `src/app/events/[eventKey]/picklist/page.tsx`
- `src/app/events/[eventKey]/stats/page.tsx`
- `src/app/events/[eventKey]/pit/[teamNumber]/page.tsx`
- `src/app/events/[eventKey]/data-review/submissions/[kind]/[submissionId]/page.tsx`
- `src/app/admin/health/page.tsx`
- `src/app/admin/sync/page.tsx`
- `tests/competition-ui.test.tsx`
- `tests/match-prep-ui.test.tsx`
- `tests/password-policy-ui.test.tsx`
- `tests/pit-components.test.tsx`
- `tests/pit-map-ui.test.tsx`
- `tests/stats-ui.test.tsx`
- `docs/UI_COPY_CLEANUP.md`

## Validation

- `npm test`: passed (214 unit tests and 72 UI tests), including filter, validation, navigation, draft, permission, touch and responsive-map coverage.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Reviewed changes against a snapshot taken before this cleanup to distinguish them from earlier uncommitted feature work.
- No live authenticated browser walkthrough was performed for this copy-only change.
