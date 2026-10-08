# Sync investigation — October 8, 2026

## Findings

The screenshot's Statbotics HTTP 500 originates upstream. `StatboticsClient.teamEvents` constructs that error from `response.status`; it is not a Supabase error or the status of a custom application REST route. Direct requests outside the application reproduced the problem:

| Endpoint                                               | Observed response                                   |
| ------------------------------------------------------ | --------------------------------------------------- |
| Statbotics `/v3/team_events?event=2026cass&limit=1000` | 503 HTML server error                               |
| Statbotics `/v3/team_events?event=2026cass&limit=100`  | 500 with `[]`                                       |
| Statbotics `/v3/event/2026cass`                        | 500 with `{}`                                       |
| Statbotics `/v3/team_events?event=2026casd&limit=100`  | 500 HTML server error; Node requests also timed out |
| Nexus `/api/v1/event/2026cass/pits`                    | 404, `"No pits."`                                   |
| Nexus `/api/v1/event/2026cass/map`                     | 404, `"No map."`                                    |
| Nexus `/api/v1/event/2026cass/inspection`              | 404, `"No teams."`                                  |

Statbotics' [published team-event route](https://github.com/avgupta456/statbotics/blob/a2cea5553e35693d423400f419bd770cb2143408/backend/src/api/team_event.py) supports the event filter and 1000-row batch limit used by this application. The [TBA ingestion implementation](https://github.com/avgupta456/statbotics/blob/a2cea5553e35693d423400f419bd770cb2143408/backend/src/tba/read_tba.py#L96) skips offseason/preseason event types 99/100 unless explicitly overridden. The [override list](https://github.com/avgupta456/statbotics/blob/a2cea5553e35693d423400f419bd770cb2143408/backend/src/tba/constants.py#L137) does not include `2026cass`. Thus current published ingestion does not provide normal event EPA coverage for this offseason event. Season EPA is not silently substituted for event EPA.

The provider's [exception wrappers](https://github.com/avgupta456/statbotics/blob/a2cea5553e35693d423400f419bd770cb2143408/backend/src/utils/decorators.py) turn exceptions into HTTP 500 with empty list/object bodies. Therefore a 500 `[]` must never be interpreted as a successful empty dataset. Without the provider's internal logs, its exact exception cannot be established; control-event and documentation failures also show wider service availability problems. The application's null-EPA transformation is not the origin of these upstream responses.

For Nexus, the missing-data message was accurate for the API resources under **the requested `2026cass` key** at verification time. The user confirmed its map geometry has not yet been published. Names shared by different Nexus events are insufficient evidence of identity. The app uses the requested key, or an explicit user override; it never searches for a replacement event. No other event's data or geometry was saved.

Two local shortcomings contributed to confusion: upstream details/stages were absent from logs, and missing Nexus resources were cached for 24 hours. Supabase error codes/messages were discarded by repository wrappers. Inspection was not requested at all.

## Complete application flow

1. `SyncControls`, `PitMapSyncControls` and Event Import forms submit `eventKey` and operation using React `useActionState` to `eventImportAction`. Next.js sends a Server Action POST; there is no dedicated Statbotics REST route in `src/app/api`. The action authorizes an admin before provider requests or writes.
2. Full sync runs `syncEvent`: TBA fetch/transaction first, then independent Statbotics, media and Nexus stages. Retry Statbotics runs only its service. Expected failures are returned as action state, rendered by frontend alert/status text and persisted sync status cards.
3. Statbotics makes one event-wide `/team_events` batch request per attempt. HTTP success is required before decoding the bounded body, validating event/team identity and duplicates, and normalizing EPA. Missing/null fields become null; zero stays zero. No per-team fanout occurs.
4. `statboticsRepository` invokes `apply_statbotics_snapshot`. The existing PostgreSQL function upserts only imported attendees and updates timestamps/status atomically. Failures record status with an error-only payload. Previous metrics and last-success timestamps survive upstream/transform failures and transaction rollback.
5. Nexus fetches `/pits` and `/map` independently, with at most two concurrent requests. The normalizer retains assignments without geometry and joins map rectangles to addresses even without optional map team numbers. `store_nexus_pit_map` atomically saves useful data, verifies the exact event key, rejects older attempts and retains cached snapshots on fully failed/missing fetches.
6. Nexus `/inspection` follows those requests, with independent normalization, TTL and transactional cache. `store_nexus_inspection` validates source identity, permissions, snapshot fields and attempt ordering. Failed or missing refreshes retain previous inspection data. Pit list and team page queries read the cache without provider calls. Scouting report data and workflow statuses are separate.

## Changes and verification

Structured JSON error logs include provider, stage, event key, upstream status, attempt and bounded response details. Supabase diagnostics preserve code/message/details/hint; admin-facing errors identify Supabase instead of reporting a generic HTTP 500. Credentials are redacted and raw response bodies stay out of the client.

Transient HTTP 429/500/502/503/504 (also 408) and transport failures retry sequentially, at most three attempts, with exponential equal jitter (250–500 ms, then 500–1000 ms). Retry-After seconds/dates are never shortened; waits exceeding the 28-second provider budget stop the request and persist the requested cooldown. A shared database lease now limits Statbotics concurrency to one event batch across app instances, with stale-worker fencing. Permanent HTTP failures and invalid payloads do not retry. Request/body timeouts and size limits remain bounded. See [follow-up diagnostics](STATBOTICS_DIAGNOSTICS.md) for the isolated controls and new verification.

Missing/partial maps become eligible for another sync after five minutes instead of 24 hours. Successful geometry remains cached for 24 hours; failed transport attempts for one hour. Inspection is eligible after five minutes regardless of map freshness. Forced Sync Pit Map bypasses all TTLs. These are cache intervals for authorized syncs; no unattended polling was added.

Verification: 228 unit tests and 78 UI tests passed; 25 disposable PostgreSQL suites passed, including cache rollback, permissions, stale attempts and inspection independence. Typecheck, lint and production build passed. The linked migration dry-run contained only the new inspection-cache migration; it was applied, and database types were regenerated with the official Supabase generator. A live service sync of **only `2026cass`** reported all three Nexus resources unavailable, persisted accurate attempt state, and verified cached snapshots/fetch timestamps were unchanged. No test scouting records were written remotely.

## Files created or modified

| Area                  | Files                                                                                                                                                                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared diagnostics    | `src/lib/server/sync-diagnostics.ts` (new)                                                                                                                                                                                                                                                   |
| Statbotics            | `src/lib/statbotics/client.ts`; `src/features/events/server/statbotics-sync.ts`; `src/features/events/server/statbotics-repository.ts`                                                                                                                                                       |
| Nexus                 | `src/lib/nexus/client.ts`; `src/lib/nexus/inspection.ts` (new); `src/features/events/server/nexus-sync.ts`; `src/features/events/server/nexus-repository.ts`; `src/features/events/server/nexus-inspection-sync.ts` (new); `src/features/events/server/nexus-inspection-repository.ts` (new) |
| Actions/queries/cache | `src/features/events/server/actions.ts`; `src/features/events/server/queries.ts`; `src/features/pit-map/server/cache.ts`; `src/features/pit/server/queries.ts`                                                                                                                               |
| Pit UI                | `src/features/pit/model.ts`; `src/features/pit/components/team-list.tsx`; `src/features/pit/components/nexus-inspection-status.tsx` (new); `src/app/events/[eventKey]/pit/[teamNumber]/page.tsx`; `src/features/admin/components/event-controls.tsx`                                         |
| Database              | `supabase/migrations/20261025000000_nexus_inspection_cache.sql` (new); `src/types/database.generated.ts`; `src/types/database.ts`                                                                                                                                                            |
| Tests                 | `tests/statbotics.test.ts`; `tests/nexus.test.ts`; `tests/nexus-inspection.test.ts` (new); `tests/sync-status-ui.test.tsx` (new); `tests/sql/statbotics-sync.sql`; `tests/sql/nexus-inspection.sql` (new)                                                                                    |
| Documentation         | `docs/STATBOTICS.md`; `docs/PIT_MAPS.md`; `docs/SYNC_RELIABILITY.md` (new)                                                                                                                                                                                                                   |

No environment variables or dependencies were added. Nexus inspection uses the existing server-only `NEXUS_API_KEY`. Statbotics needs no API key. Ordinary inspection reads use existing authenticated Supabase access; controlled service verification used the existing service-role key.

## Remaining operational limits

Statbotics availability and offseason coverage cannot be repaired within this repository. No successful live `2026cass` EPA response was obtained. Nexus must publish resources for `2026cass` before the app can show current addresses, geometry or inspection. Inspection is a cached snapshot updated on an authorized sync, not a live inspection feed; older/failing snapshots are labeled cached. The application code still needs the normal deployment/restart process to reach a hosted instance; the linked database migration is already applied. Exceptionally large Statbotics events reaching the 1000-row cap still fail closed instead of using pagination.
