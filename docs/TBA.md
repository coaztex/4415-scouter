# The Blue Alliance integration

For live cache refreshes and optional signed webhooks, see [Live event updates](LIVE_UPDATES.md).

## Configuration and prerequisites

The linked project and server key are configured, and the imported event is `2026cascmp`. Migrations through `20260928000000_tba_2026_breakdowns.sql` are applied. The 2026 match breakdown/COPR upgrade was verified against recorded live TBA responses; see [exact source mappings](SEASON_2026_SOURCES.md). The following configuration steps also serve as a reference for a new deployment.

1. Sign in to the [TBA Account Dashboard](https://www.thebluealliance.com/account). In **Read API Keys**, generate a read API v3 key for this application. See [TBA's API guide](https://www.thebluealliance.com/apidocs).
2. Put it in `TBA_AUTH_KEY` in the existing local `.env.local`, then restart Next.js. Do not paste the key into chat, commit it, or prefix it with `NEXT_PUBLIC_`.
3. For deployment, add `TBA_AUTH_KEY` to the **Vercel project** environment variables for the environments that should sync (Production, and Preview/Development only if needed). Redeploy after changing configuration. This key is used by the Next.js server: it does **not** belong in Supabase database settings or browser configuration. Only a future Supabase Edge Function implementation would need its own Supabase secret.
4. The reviewed migrations are applied to the linked project without a reset. Email/username login and logout are implemented; see [authentication repair](AUTHENTICATION.md). Admin checks fail closed.
5. Use the team's chosen event for verification. `2026fixture` remains synthetic test data only; `2026cascmp` was already imported before the upgrade.

## Transport

`src/lib/tba/client.ts` is the only TBA transport. It uses HTTPS API v3, the `X-TBA-Auth-Key` header, an 8-second per-attempt timeout, no redirect following, and at most two retries after the original GET. Network/timeout errors and HTTP 408/429/500/502/503/504 may retry. Invalid JSON/schema, authentication errors, and other permanent errors do not retry. Backoff is bounded; a Retry-After longer than two seconds stops the operation rather than retrying sooner than the provider requested.

Typed errors expose safe codes and HTTP status, never response bodies, credentials, or underlying fetch diagnostics. Response schemas discard unrelated fields. Numeric zero is preserved. Unknown/suffixed offseason team keys fail validation because the database deliberately uses numeric team IDs; do not silently map these onto another team.

The client base URL is centrally configured and restricted to TBA's official v3 origin/path so callers cannot exfiltrate the key via arbitrary hosts. Test transport and sleep functions are injectable. ETag, Last-Modified, Cache-Control, and fetch timestamps are captured per endpoint. Conditional 304 reuse is deferred because a complete endpoint response cache has not been introduced. Manual sync intentionally refetches; regular page loads never call TBA.

## Endpoint selection

| Endpoint                 | When                                     | Stored/use                                                                                 |
| ------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| `/event/{key}`           | Preview and sync, before other endpoints | Event metadata and year/game validation.                                                   |
| `/event/{key}/teams`     | Preview and sync                         | Preview count; team and event-team cache.                                                  |
| `/event/{key}/matches`   | Sync                                     | Match schedule/results and alliance stations, surrogate/DQ flags.                          |
| `/event/{key}/rankings`  | Sync                                     | Ranking/record and raw sort orders with their labels. No assumed mapping to ranking_score. |
| `/event/{key}/oprs`      | Sync                                     | OPR, DPR, CCWM in external metrics.                                                        |
| `/event/{key}/alliances` | Sync only when playoff matches exist     | Small selection name/pick lists in event source metadata for future match preparation.     |

`/event/{key}/coprs` is fetched once for a played 2026 event. Exact component maps are stored per team in external-metrics JSONB, and the cached reader exposes selected typed FUEL/tower components. Team statuses and media remain deferred because their consumers are not implemented. No per-team request fanout is added. Optional endpoint 404/null means unavailable and preserves existing ranking/OPR/COPR data; an explicit empty ranking array clears rankings. Cache metadata identifies the latest fetch even when optional data is unavailable.

## Admin workflow and authorization

`/admin` verifies the Supabase user on the server and reads the current active profile role. Unauthenticated users redirect to `/login`; other roles see access denied and no import controls. The Server Action independently repeats admin authorization before validation, provider access, or mutation. It benefits from Next.js Server Action origin protections; no public webhook/lookup/import endpoint is exposed.

Preview shows the validated event key/name, dates, location, and team count. Preview is read-only. The separate import form requires an explicit confirmation checkbox. The server refetches the key on import; it never trusts metadata submitted by the browser. The confirmation is an admin UX step, not a substitute for authorization or a cryptographically frozen provider snapshot.

`Sync now` loads the existing event's game slug from Supabase, then invokes the same service. Unknown or mismatched game/year combinations fail. Existing app archive status, creator, and game slug are preserved. Page loading reads Supabase cache only.

`syncTbaEvent(client, repository, key, gameSlug)` is shared by UI and future job entry points. Future webhook/scheduler callers must authenticate the incoming request and provide a DB context authorized as an active admin. The current RPC is security-invoker and explicitly checks admin identity; there is no service-role bypass for jobs. No webhook, cron job, scheduler secret, or duplicate sync implementation was added.

## Atomic persistence and conflicts

`apply_tba_snapshot` commits one complete validated provider snapshot in a single Postgres transaction. It uses an event-key advisory lock and rejects snapshots older than the last successful fetch start. Source failures occur before the transaction and cannot leave a half-created event. Repeat imports use stable event/team/match keys and update existing rows.

The migration makes station uniqueness deferrable so teams can swap stations atomically. Missing roster rows may be removed only if foreign keys permit it. If a removed roster team has an assignment/submission reference, the entire snapshot rolls back with an error: administrators must deliberately reconcile the conflict. Sync never changes assignments, submissions, notes, pit statuses, Statbotics metrics, or profile roles. Missing events/teams/matches are not pruned from historical tables. Cached history may therefore include matches later omitted by TBA; automatic archival/reconciliation is deferred.

Only relevant fields are retained: event metadata and selected alliances/cache headers, team metadata, match scores/times/roster flags, raw score breakdowns and post-result time, rankings with sort labels, and numeric TBA metrics with exact COPR source keys. Videos and large media payloads are not duplicated into rows. The existing `matches.raw_tba_payload` stores breakdowns; no redundant season table exists. `source_updated_at` stays null where the endpoint offers no reliable per-record modification timestamp; post-result time and fetch metadata retain their distinct meanings.

Success updates event and sync-state timestamps. On failure, the repository records a bounded safe diagnostic for an existing event without replacing a newer attempt's status. The source fetch runs outside a DB transaction: no long-running DB lock or false persistent `running` state is held during HTTP requests. The UI shows pending state. Failure-state recording is best effort when the DB itself is unavailable; failed first-time imports have no event ID and therefore report the error to the caller only.

## Verification

Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run format:check`, and `npm run build`. Mocked tests cover headers, timeout/retry bounds, permanent failures, invalid bodies, optional endpoints, URL validation, preview request order, snapshot atomicity at the service boundary, and role hierarchy.

Apply all migrations to a disposable PostgreSQL database after `tests/sql/auth-fixture.sql`, then run `tests/sql/tba-sync.sql` with `psql -v ON_ERROR_STOP=1`. This tests database admin rejection, idempotence, zero values, station swaps, stale snapshot rejection, optional rankings, and rollback/scouting preservation. Never apply fixture SQL to Supabase. Database types were regenerated against this local migrated database, not the unchanged remote.

The recorded 2026 fixtures contain public source data. They are test inputs, never migration seeds. Function signatures and table columns did not change, so the existing generated database types remain valid.
