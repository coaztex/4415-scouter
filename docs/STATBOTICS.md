# Statbotics integration

The independent server-only adapter uses the public [Statbotics v3 API](https://api.statbotics.io/docs). No API key or additional environment variables are required. The provider's response builder and 2026 component mappings were checked; see [exact source mappings and provenance](SEASON_2026_SOURCES.md). Live verification for the existing `2026cascmp` event is limited by provider HTTP 500/503 responses.

`GET /v3/team_events?event={key}&limit=1000` retrieves event EPA without per-team fanout. The adapter validates identity, duplicate teams, finite metrics, and response shape independently of TBA. Three attempts maximum, eight-second request timeouts, bounded backoff, and transient-only retries limit provider load. Long Retry-After stops instead of retrying early. Responses reaching the 1000-row cap fail closed; pagination for exceptionally large events is deferred.

## Metric meanings

- `epa_total`: current team-event `epa.total_points` (also accepts a mean object). This is not the event-history mean under `epa.stats.mean`.
- `epa_auto`, `epa_teleop`, `epa_endgame`: the respective `epa.breakdown.*_points` values when supplied. No substitute tower/climb calculation is invented for missing endgame values.
- Missing/null values remain null; actual zero remains zero.
- The bounded source-specific `epa` object retains evolving components and history in `payload`. `components_2026` exposes verified FUEL/tower fields when present. No record/win-probability normalization is added because no implemented consumer uses it. Missing derived source totals remain null rather than inferred from partial data.
- `source_updated_at`: optional explicit ISO `updated_at`; current responses may not supply it, so null is expected. The provider's `time` is event ordering time and is never presented as an update time. `fetched_at` separately identifies our cache snapshot.

`getCachedStatboticsMetrics(db, eventId)` exposes typed normalized columns, event key, team number, payload, and timestamps under the caller's RLS permissions. Regular page loads use this database cache, never the provider.

## Sync and failure isolation

`syncEvent` is the shared admin import/manual-sync orchestration: TBA commits first, then `syncStatboticsForEvent` attempts an independent snapshot. Statbotics failure returns a warning and cannot roll back the completed TBA import. `Retry Statbotics` uses the same service without needing a TBA key or fetching TBA again. Future authorized jobs can call these services without duplicating parsing.

The RPC `apply_statbotics_snapshot` checks active admin authorization and retains existing RLS. It commits metrics, event timestamp, and sync state atomically. It only upserts Statbotics rows for cached event attendees. Unknown attendees are ignored until TBA supplies them. Repeat requests update existing rows; TBA metrics, scouting, assignments, and notes are untouched. Event-scoped advisory locking and attempt-time checks reject older attempts.

Absent teams and empty provider results preserve older cache rows, whose `fetched_at` remains unchanged. Missing fields on a returned row become null rather than falsely retaining a current value. A successful empty result means the provider request completed, not that every attending team has EPA. Consumers should show missing/stale data using row timestamps. Failures record bounded safe messages and preserve `last_success_at`; failure recording is best effort if the database itself is unavailable.

## Setup and verification

The Statbotics migration is already applied. This upgrade uses its existing numeric columns and JSONB payload without a new Statbotics migration. Admin sign-in is implemented; see [authentication repair](AUTHENTICATION.md). No authentication bypass was added.

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`. In a fresh disposable PostgreSQL database, apply `tests/sql/auth-fixture.sql`, all migrations, then `tests/sql/statbotics-sync.sql` with `ON_ERROR_STOP=1`. Never run test fixtures against the remote project. Tests cover missing fields, zero metrics, unknown fields, retries, source identity, failure isolation, idempotence, non-attendees, stale attempts, and admin enforcement.

Successful live EPA retrieval remains deferred until the provider recovers. Source-shaped mocks cover the verified response-builder contract and are explicitly synthetic. No additional credentials are needed, and a provider failure does not undo TBA sync or block scouting.
