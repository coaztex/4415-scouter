# Statbotics follow-up diagnostics — October 8, 2026

## Verified cause and limits

These HTTP failures originate from Statbotics, before our parser or metric writes. Historical event/team endpoints fail too, so missing offseason coverage alone does not explain the outage. The provider's internal exception remains unknown without its logs. Its [published exception wrappers](https://github.com/avgupta456/statbotics/blob/a2cea5553e35693d423400f419bd770cb2143408/backend/src/utils/decorators.py) return HTTP 500 with `[]` for plural routes and `{}` for singular routes.

## Isolated probes before any follow-up code edits

At approximately **23:05 UTC**, `curl.exe` made one request at a time with a 20-second diagnostic timeout, independent of the app and Supabase:

| Exact Statbotics endpoint                    | Status/body                 | Total time |
| -------------------------------------------- | --------------------------- | ---------- |
| `/v3/team_events?event=2019ncwak&limit=1000` | 500 / `[]`                  | 4.279 s    |
| `/v3/team_event/5511/2019ncwak`              | 500 / `{}`                  | 2.501 s    |
| `/v3/team_year/254/2024`                     | 500 / `{}`                  | 1.800 s    |
| `/v3/team/254`                               | 500 / `{}`                  | 4.681 s    |
| `/v3/team_events?event=2026cass&limit=1000`  | 503 / HTML unavailable page | 0.164 s    |
| `/v3/team_events?event=2019ncwak&limit=1`    | 500 / `[]`                  | 1.080 s    |

The 500 responses identified `server: Google Frontend`. The 503 HTML suggested trying in 30 seconds but supplied no Retry-After header. A controlled pair at concurrency **2** also failed: historical batch 500 in 2.917 s and team-year 500 in 2.673 s. No load/stress test was performed. Failures occur without parallelism or a large payload and arrive within our eight-second timeout. This does not establish whether traffic elsewhere overloads the provider.

## Comparison with the deployed backend

The public [GitHub deployment records](https://api.github.com/repos/coaztex/4415-scouter/deployments) identify production source commit `0d9b262612aad1b2f8fdd38beb2b67e1f72291e1` and deployment `https://4415-scouter-5bt7fpfx2-coaztexs-projects.vercel.app`. A request to that deployment returned **302 to Vercel authentication**, not an application response. A fresh production Server Action and runtime logs could not be accessed.

The [deployed client source](https://github.com/coaztex/4415-scouter/blob/0d9b262612aad1b2f8fdd38beb2b67e1f72291e1/src/lib/statbotics/client.ts) generates `Statbotics sync failed (http, HTTP 500)` exclusively from an unsuccessful upstream `response.status`. Linked Supabase state contained this exact error for `2026cascmp`, attempted at `23:00:18.284 UTC`, with 60 cached EPA rows and last success on October 4. We compared deployed code and saved backend state with direct probes; this is **not a fresh Vercel runtime comparison**.

All 60 cached payloads passed the current normalizer. No new successful live 2xx EPA response was obtained, so current live success-payload parsing could not be verified. Empty JSON accompanying HTTP 500 is an upstream failure and never reaches the success parser.

## Implementation

- `src/lib/statbotics/client.ts` retains one event-wide bulk endpoint, at most three sequential attempts, eight-second request/body deadlines and a 28-second provider budget. Errors log exact URL, event, stage, origin, status, duration, attempt, bounded response details, Retry-After and timeout error name.
- `src/lib/statbotics/retry.ts` supplies exponential equal jitter (250–500 ms, then 500–1000 ms), respecting Retry-After seconds/dates without capping the requested wait. A wait too long for this request is deferred rather than shortened.
- `src/features/events/server/statbotics-sync.ts` requires a shared claim before fetching; skipped/failed refreshes report persistent cache counts and oldest fetch time. Pages already read persisted EPA and continue doing so during outages. Permanent HTTP errors and invalid payloads do not retry. Terminal transient failures persist a cooldown of at least 30 seconds or the longer provider time.
- `src/features/events/server/statbotics-repository.ts` uses service-only coordination/fenced-write RPCs and keeps caller-scoped cache reads. Supabase errors retain their operation, code, message, details and hint. Claim failures prevent upstream requests; failed commits retain old data. Release errors are reported rather than hidden.
- `20261026000000_statbotics_sync_gate.sql` adds a singleton gate and claim/store/release RPCs. One batch at a time is permitted globally, across events and app instances. Leases expire after two minutes; the snapshot write checks token, expiry and event under a row lock in the same transaction. Expired workers cannot commit or release a later owner's claim. Scouting tables and EPA record structures are unchanged.

Both Statbotics-only retries and full import/sync paths already call the shared service. No unrelated endpoint or scouting workflow was changed in this follow-up.

## Verification and deployment

`npm test`: **235 unit tests + 78 UI tests passed**. `npm run test:sql`: **26 suites passed** in disposable PostgreSQL, including overlap, expiry/fencing, persistent cooldown, role permissions and cache rollback. Typecheck, lint and production build passed. Focused tests also distinguish a transport failure reading HTTP 200 from a parser failure.

The linked migration dry-run listed only `20261026000000_statbotics_sync_gate.sql`; it was applied successfully, and database types were regenerated using the Supabase CLI. No new environment variable or dependency was added. Coordination now requires the existing server-only `SUPABASE_SERVICE_ROLE_KEY`; Statbotics itself requires no key.

A live **local server-service** smoke check at **23:14:33.592 UTC** used real Statbotics and linked Supabase for `2026cascmp`. The provider returned HTTP 500 `[]` on exactly three attempts (462/379/363 ms). Supabase successfully recorded the failure. An overlapping `2026cass` sync was rejected before its upstream call. All 60 cached rows' EPA values, payloads and fetch timestamps were identical before and after. `last_success_at` remained `2026-10-04T07:26:19.874948+00:00`. No synthetic scouting records or fabricated EPA were written remotely.

The new server code is not deployed. Older deployments do not use the shared gate. Authenticated Vercel access is still needed for a fresh production sync/log comparison. Provider availability cannot be repaired here. Published Statbotics ingestion excludes ordinary offseason events, including `2026cass`; no existing event EPA cache is available for that event, and season EPA is not substituted under its key. See [the original investigation](SYNC_RELIABILITY.md) for source coverage and Nexus findings. `2026cael` remains excluded as explicitly requested.
