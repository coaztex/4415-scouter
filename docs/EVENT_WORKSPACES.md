# Event selection and home

`/events` is the default landing route. Active authenticated profiles read event cards from Supabase under their own session and RLS. Active events sort first, then newest season/start date. Dates use UTC calendar formatting to avoid shifting an event day on devices in different time zones. Cards show dates, available location, status, team count, and completed pit count. Embedded counts avoid downloading rosters or one request per event.

Existing policy is unchanged: active scouts/strategists can browse active events; active admins can also browse archived events. There is no per-event membership model yet. Empty lists explain the next step. Only admins see Add event, linking to the existing protected TBA preview/confirmation flow at `/admin#event-import`.

The event home displays cached identity and four primary modules. Strategy/admin profiles additionally see Match Prep and Picklist. The shared module policy is used by cards, event navigation, and server-side placeholder-route authorization. An unauthorized or unknown module returns not-found; hiding links is not the security boundary.

Routes are scoped under `/events/[eventKey]`: `scouting`, `pit`, `teams`, `stats`, `match-prep`, and `picklist`. Match scouting and [pit scouting](PIT_SCOUTING.md) now have working flows; other module destinations remain placeholders. Horizontal navigation keeps 48px tap targets on narrow screens, with a compact Events/event breadcrumb. Module cards are full-card links.

Home counts come from the database:

- Match Scouting: the current user's assigned/in-progress match rows, excluding breaks.
- Pit Scouting: completed pit-status rows / event teams.
- Teams: cached event-team count.
- Stats: final match scouting submissions visible through RLS. Labeled **Your samples** for scouts and **Event samples** for strategy/admin; draft submissions are excluded.

Count failures display unavailable, not zero. Event fetch failures use a retryable error boundary; loading boundaries cover the list and event workspace. Missing/inaccessible events return not-found. No external API fetch runs on page load.

## Validation and remaining setup

Unit tests check strategy route visibility and calendar-date behavior. The actual embedded-count query was verified through a disposable PostgREST/PostgreSQL stack with the project's migrations and synthetic data: admin archived visibility, scout archive restriction, active-first/newest-first ordering, zero-team events, total teams, and completed pits all passed. No production data was seeded or modified.

Email/username sign-in and logout are now implemented; see [authentication repair](AUTHENTICATION.md). Active sessions visiting `/login` redirect to `/events`. The event migrations are now applied to the linked project, and the authenticated empty state loads successfully. There are no new environment variables or migrations for event selection.
