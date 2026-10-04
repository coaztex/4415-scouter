# Competition performance and reliability pass

This pass keeps auth-sensitive scouting reads request-scoped; it does **not**
add cross-user caches or a new analytics service. Team and Stats pages compute
from RLS-visible canonical records on the server, so a scout cannot receive a
strategy user's cached result. At the synthetic 60-team/295-observation scale,
the authenticated page smoke test renders both successfully.

- The event landing list now batches RLS-scoped team/pit counts instead of
  issuing two count queries per event. Team detail narrows teams, rankings,
  submissions, pits, avatars and external metrics to the requested team.
  Stats Auto reuses the already parsed pit reports, and external-metric cache
  reads reuse the event key/year already fetched by the page.
- The interactive Teams directory no longer receives full match-observation
  histories. Its sorting/label logic and pit mechanism choices are in small
  client-safe modules; aggregate/schema parsing remains server-side. Stats
  charts and tables are Server Components, with only controls hydrated.
- TBA snapshot sync uses a database lease for existing events and an advisory
  transaction lock during the atomic snapshot commit. Assignment/capture RPCs
  lock rows; unique submission IDs and IndexedDB transaction leases protect
  repeated/offline submissions. A delayed device request may retry, but its
  immutable client ID makes the server operation idempotent.
- Realtime subscriptions are event-scoped and cleaned up on unmount. Visible
  event pages check for stale TBA data every two minutes; server leases
  suppress concurrent refreshes. The device queue pumps immediately on a new
  submission or reconnect and checks backoff every ten seconds while idle,
  avoiding a whole-app update every two seconds.
- Pit uploads are resized to at most 1600 px and 2 MB; TBA avatars are
  normalized before storage. External TBA robot-photo URLs are still displayed
  directly and may be large. Thumbnail proxying would require a separately
  bounded media-cache design, so this pass does not silently fetch arbitrary
  external images server-side.
- Schedule rows are paginated during server reads. Event directory and review
  queries retain explicit caps appropriate to a normal FRC event; very large
  multi-event deployments would need pagination and load testing. No real
  competition network/phone benchmark was run in this pass.

`/admin/health` is the admin-only Competition Readiness view. It reads one
selected event at a time and reports only database reachability, TBA
configuration presence, active scouts, loaded teams/matches, match assignments,
missed assignments, open server conflicts, and last successful provider syncs.
It cannot see a scout's device-local pending/failed queue. A database outage
may also prevent role authentication, so the health page itself is not an
out-of-band database monitor. It never displays credential values.

## Perceived loading and targeted match reads

The high-traffic event routes have route-segment loading states with reserved
heading, filter, and content geometry. These are shown only while a navigation
is waiting for server data, not as permanent decorations or per-card spinners.
They use theme tokens (`bg-surface`, `border-border`) and respect reduced-motion
preferences. Actual fetch errors reach the event error boundary; lack of cached
data uses explicit empty states; stale/missing TBA cache is called out in the
event shell and schedule freshness status; unavailable coverage or external
breakdown is labeled unavailable;
auth/role failures follow the existing login/permission path. A measured zero
remains zero, while failed reads are represented as unavailable.

Match Details no longer fetches the event-wide station and coverage snapshot.
It makes one event-scoped lookup for the selected match with its six stations,
one targeted, role-checked `get_match_coverage` RPC, plus batched team names,
submissions, and assignments. It retains a small all-match **metadata** read
for current/next match context. Event Schedule still uses one batched station
read and one event-wide coverage RPC; there is no browser or HTTP N+1 per
status pill. Stats ranking/distribution components remain server-rendered and
do not serialize raw scouting rows to the browser. Drum/Turret filtering uses
the already batched, parsed pit summary for a 60-team event; a JSONB index
would add write overhead without a query predicate to use it at this scale.

Large lists (Schedule cards/team pills, Teams, Stats rankings, Picklist entries)
retain native links but disable automatic per-entry prefetch. The few focused
links on Match Details and other single destinations keep native prefetch.
Team logos reserve a 48/64 px box and load lazily; robot photos declare display
sizes and load lazily; the validated YouTube embed remains lazy. External TBA
photos may still be large because they are displayed directly, not proxied.

Event match times, assignment schedules, admin event sync times, Competition
Readiness sync times, and revision times use the shared IANA event-timezone
formatter. Event calendar dates are date-only values, so the separate UTC date
formatter intentionally prevents rollover. User-action audit timestamps (for
example notes and webhook receipt logs) remain viewer-local; no PST/PDT label
is hard-coded.

`npm run fixture:profile` samples the local synthetic fixture using the local
Supabase credentials only; it does not mutate data or contact production.
With 83 matches and 295 final reports, before this change the event-wide
station read returned about 50,548 JSON characters and event-wide coverage
about 55,776; both were on the Match Details path. Afterward the selected
match/roster returned about 1,270 characters and targeted coverage about 673.
In one local run those targeted requests took 5 ms each; the old event-wide
station/coverage requests took 21/5 ms. These are diagnostic samples, not
production latency guarantees. A 72-match/576-slot schedule preview took 7 ms
of planner CPU after a 21 ms snapshot RPC. The production build completed
without bundle warnings; route-level timing could not be repeated in this
pass because a separate Next dev process owned the shared `.next` lock and
was configured against a different database. The smoke script now prints
per-route elapsed time when run against a dedicated synthetic app server.
