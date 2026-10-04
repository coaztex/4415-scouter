# Competition-day regression tests

Run `npm test` for unit and interactive component tests, `npm run lint`,
`npm run typecheck`, and `npm run build` before deployment. Run
`npm run test:sql` when Docker is available; it creates its own network-isolated,
disposable PostgreSQL 17 container, applies the Auth fixture and migrations,
runs the SQL suites, then removes the container. It cannot connect to a remote
database and does not seed production. `npm run test:unit` and `npm run test:ui`
are available separately while debugging.

The synthetic scenarios in `tests/fixtures/competition-2026.ts` use fictional
team numbers and an event named `2026synthetic`. They cover a high-output
scorer, Passer-Feeder, defender, very-uncertain estimate, DNS, DNF, and a
deliberately discrepant official alliance total. The separate recorded TBA
fixture is a read-only parser contract. No fixture is imported into application
runtime code or applied to Supabase.

The suite prioritizes schema parsing, source mapping, offline durability,
submission idempotency, permissions/RLS, assignment transitions, scoring and
reliability calculations, picklist scoring, and reconciliation invariants.
Component tests exercise FUEL taps/Undo, Auto → Teleop → Post controls,
activity selection, issue capture, post-match fields, pit capacity choices,
and visible offline queue states.
The SQL suite verifies the service-only capture boundary, duplicate client IDs,
and assignment transitions with transaction-rolled-back synthetic rows.

There is no full browser end-to-end suite yet. It would require a hermetic
Supabase Auth/Storage stack and mocked TBA/Statbotics endpoints; running one
against the linked project could create competition-visible data. Before a
competition, perform a manual staging smoke test: log in as scout, open an
assigned 2026 match, exercise scoring and activity changes, submit and return
to schedule; then verify an admin import and a strategy reconciliation review.

## Large local synthetic event

This separate, **entirely synthetic** fixture exercises realistic event-scale
queries and pages. It is never part of a migration or automatic production
seed. It uses event key `2026syntheticlarge`, team numbers 90001–90060, and
IANA timezone `America/Los_Angeles`. The generator is deterministic for a
given seed; the default is 2026. Nothing in it asserts real team performance.

```powershell
npx supabase start
npm run fixture:event -- seed
npm run fixture:event -- check
npm run dev:synthetic
# In another terminal, using the local URL printed by Next (3000 or 3001):
npm run fixture:smoke -- http://127.0.0.1:3000
```

Open `/events/2026syntheticlarge` on that local Next server. Log in with
`synthetic_admin`, `synthetic_strategy`, or `synthetic_scout01` through
`synthetic_scout08`; every fixture account has local-only password
`SyntheticLocalOnly2026!`. Never use these credentials outside local tests.
`dev:synthetic` obtains the _local_ URL and keys from Supabase CLI and
overrides any linked `.env.local` values for this process; it clears TBA
credentials so browsing this fixture does not invoke external sync. The seed,
reset, check and smoke commands reject non-loopback Supabase endpoints, and
smoke also rejects a non-loopback Next URL.

To reproduce a different deterministic distribution, run `npm run fixture:event
-- reset` and then `npm run fixture:event -- seed --seed=2027`. A second seed
with the same value is idempotent; a different value refuses until reset.
Reset deletes only the marker-checked synthetic event and its event-scoped
rows, plus its marked orphan teams and generated avatars. It retains local
test accounts for quick reseeding. No production database is read from
`.env.local` by these commands.

Fixture assumptions and useful checks:

- 72 qualification matches (50 completed, one started/unscored, 21 upcoming),
  eight playoff matches across quarterfinal/semifinal/eighth-final groups, and
  three finals. Qual 13 is tied. Some completed matches have video metadata or
  2026 breakdowns; others deliberately lack one or both. Qual 7 has a large
  scout-versus-official red FUEL discrepancy for Data Review.
- 60 teams, 295 final robot-match observations, eight scouts, 42 pit reports,
  mixed external EPA/OPR availability, and 12 generated avatar tiles. Pit
  mechanisms include Drum, Turret, Other and Unknown; pit statuses include
  completed, in progress, not scouted and needs review. Stats and team pages
  should show multiple observations per team and varied distributions.
- Observations include scoring, shuttling/passing, defense, DNS, DNF, partial
  disable, missing optional fields and very-uncertain FUEL. The latter is
  excluded from default FUEL aggregates while reliability counts remain
  independent. Positive climb observations are intentionally rare.
- The default assignment schedule has rotating two-match breaks, near-balanced
  scout workloads, 144 break rows, four missed assignments and a deliberately
  uncovered qual 47 slot. Qual 66–72 each have one unfilled robot slot to
  simulate insufficient staffing. Use Admin Scheduling preview with the
  fixture scouts to compare full-coverage and short-staffed options; do not
  publish a new schedule if you intend to preserve the baseline fixture.
- Qual 52 includes our fixture team 90001 and a Match Prep note. UTC 15:00
  on October 2 renders as 8:00 AM PDT in the event timezone. Compare
  scheduled and actual times on the Schedule and Match Details screens.

`npm run fixture:smoke -- <local Next URL>` signs in with the synthetic admin
and checks authenticated server rendering for the event list, Event, Schedule,
completed and upcoming Match Details, Teams, a Team page, Stats, Picklist,
an assigned match-capture route, Match Prep, Data Review, Admin Scheduling,
and Competition Readiness.
`tests/large-event.test.ts` checks the richer
data properties and filter/distribution prerequisites. The smoke script is a
server-render check, not a visual/browser interaction test; manually inspect
status colors, charts, filter controls, and scheduling preview when evaluating
UI changes.
