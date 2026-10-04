# Match Prep

`/events/[eventKey]/match-prep` is restricted to active strategy/admin profiles. It reads cached schedule, team metrics, final 2026 version-2 scouting records, and final pit reports. It makes no live provider calls. A configured `events.our_team_number` defaults the page to that team's first unplayed match. Users can select any upcoming cached match. Matches with an actual time or both nonnegative alliance scores are considered played.

Admin event settings validate the team number against the event roster. The setting is optional and never hard-coded. Without it, Match Prep requires explicit match selection and cannot identify our alliance.

Cards show event rank, EPA, available TBA FUEL COPR, observed role distribution, confident usable median FUEL with its sample size, observed auto success, timed passing share, defense frequency, and reliability. Very-uncertain recent FUEL observations are called out and excluded from the median. Expected behavior phrases follow fixed thresholds in `src/features/match-prep/model.ts`; no generated strategy is used.

Auto compatibility lists each ally's pit-claimed start sides and match-observed auto success separately. Shared known start sides trigger a possible overlap warning. Pit data has no route geometry, so the page does not infer path collisions. Strategy/admin users can save one concise plan per match. Row-level security allows strategy/admin reading and active-event writing; archived events are read-only.

Migration: `20261004000000_match_prep.sql`. It was applied to the linked Supabase project after a linked dry run and a disposable PostgreSQL migration/RLS check. Generated database types were refreshed from the linked schema. `2026cascmp` is configured with team 4415. On 2026-09-26 its cached schedule had 135 played matches and no upcoming matches, so the live page correctly shows the empty state. No test match, plan, or scouting submission was added to that event. Unit tests cover match defaulting, played-match exclusion, role ties, FUEL uncertainty, and shared start sides; the SQL test covers role and archive boundaries.
