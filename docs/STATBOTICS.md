# Statbotics integration

The independent server-only adapter uses the public [Statbotics v3 API](https://api.statbotics.io/docs). No API key or additional environment variables are required. The provider's response builder and 2026 component mappings were checked; see [exact source mappings and provenance](SEASON_2026_SOURCES.md). Live verification for the existing `2026cascmp` event is limited by provider HTTP 500/503 responses.

`GET /v3/team_events?event={key}&limit=1000` retrieves event EPA without per-team fanout. The adapter validates identity, duplicate teams, finite metrics, and response shape independently of TBA. Three attempts maximum, eight-second request/body timeouts, and exponential equal jitter (250–500 ms, then 500–1000 ms) limit provider load. Retry-After seconds and HTTP dates are honored without shortening the wait. If another attempt would exceed the 28-second provider budget, the request stops and the requested cooldown persists in Supabase. Responses reaching the 1000-row cap fail closed; pagination for exceptionally large events is deferred.

## Metric meanings

- `epa_total`: current team-event `epa.total_points` (also accepts a mean object). This is not the event-history mean under `epa.stats.mean`.
- `epa_auto`, `epa_teleop`, `epa_endgame`: the respective `epa.breakdown.*_points` values when supplied. No substitute tower/climb calculation is invented for missing endgame values.
- Missing/null values remain null; actual zero remains zero.
- The bounded source-specific `epa` object retains evolving components and history in `payload`. `components_2026` exposes verified FUEL/tower fields when present. No record/win-probability normalization is added because no implemented consumer uses it. Missing derived source totals remain null rather than inferred from partial data.
- `source_updated_at`: optional explicit ISO `updated_at`; current responses may not supply it, so null is expected. The provider's `time` is event ordering time and is never presented as an update time. `fetched_at` separately identifies our cache snapshot.

`getCachedStatboticsMetrics(db, eventId)` exposes typed normalized columns, event key, team number, payload, and timestamps under the caller's RLS permissions. Regular page loads use this database cache, never the provider.

## Sync and failure isolation

`syncEvent` is the shared admin import/manual-sync orchestration: TBA commits first, then `syncStatboticsForEvent` attempts an independent snapshot. Statbotics failure returns a warning and cannot roll back the completed TBA import. `Retry Statbotics` uses the same service without needing a TBA key or fetching TBA again. Future authorized jobs can call these services without duplicating parsing.

After the calling action authorizes an admin, service-only RPC `claim_statbotics_sync` claims a shared two-minute lease across events and app instances. Busy or cooling-down requests skip Statbotics and report available cached EPA. Terminal transient failures impose at least 30 seconds of cooldown, or the longer Retry-After time. A crashed worker's lease expires; stale release tokens cannot release a later owner's lease.

`store_statbotics_sync` checks token, expiry and event inside the same transaction as the existing `apply_statbotics_snapshot`. Expired workers cannot commit after a newer claim. Metrics, timestamps and status commit atomically, only for imported attendees. TBA metrics and scouting data remain untouched. Cache reads retain the caller's RLS scope; coordination and fenced writes use the existing server-only service-role key. Existing snapshot advisory locking and attempt ordering remain in place.

Absent teams and empty provider results preserve older cache rows, whose `fetched_at` remains unchanged. Missing fields on a returned row become null rather than falsely retaining a current value. A successful empty result means the provider request completed, not that every attending team has EPA. Consumers should show missing/stale data using row timestamps. Failures record bounded safe messages and preserve `last_success_at`; failure recording is best effort if the database itself is unavailable.

## Setup and verification

The additive `20261026000000_statbotics_sync_gate.sql` migration is applied to the linked project. Existing EPA columns, JSONB payloads and scouting schemas remain unchanged. The existing `SUPABASE_SERVICE_ROLE_KEY` is required on the server for coordination. Admin sign-in is implemented; see [authentication repair](AUTHENTICATION.md). No authentication bypass was added.

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`. In a fresh disposable PostgreSQL database, apply `tests/sql/auth-fixture.sql`, all migrations, then `tests/sql/statbotics-sync.sql` with `ON_ERROR_STOP=1`. Never run test fixtures against the remote project. Tests cover missing fields, zero metrics, unknown fields, retries, source identity, failure isolation, idempotence, non-attendees, stale attempts, and admin enforcement.

`npm run test:sql` runs all migrations and suites in a disposable PostgreSQL container, including `statbotics-gate.sql` for overlap, expiry/fencing, cooldown and permissions. See [isolated diagnostics and follow-up verification](STATBOTICS_DIAGNOSTICS.md) for the direct API controls, deployed-source comparison and real cache-preservation check.

The October 8 investigation reproduced upstream HTTP 500/503 responses, including `2026cass` and a regular-season control. Statbotics' published ingestion excludes ordinary offseason events. See [sync investigation](SYNC_RELIABILITY.md) for endpoint evidence, full flow, source references and operational limits. Structured JSON logs distinguish upstream requests/responses, transformation, Supabase commit and failure-recording errors. Supabase codes/messages reach the authorized admin UI; bounded provider response details stay in server logs. Successful empty results explicitly report missing EPA coverage. No additional credentials are needed, and a provider failure does not undo TBA sync or block scouting.
