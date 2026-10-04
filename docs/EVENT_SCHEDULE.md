# Event Schedule and Match Details

The event **Schedule** page is the official-match view for a selected event. It is separate from **My Match Scouting**, which remains the personal assignment queue. Schedule reads cached `matches` and `match_teams` rows in batches; it does not call The Blue Alliance from the browser.

## Schedule

`/events/[eventKey]/schedule` supports **All**, **Qual**, **Playoff**, and **Final** filters. Cards are ordered by official match coordinates and show the cached result, event-local time, red/blue alliances, team links, and an exact robot-match scouting state:

The page opens near the current or next match once. **Jump to current/next** remains available, but later live updates do not move the user's scroll position. A separator and summary show the last match with posted official scores and the next unplayed match. A scheduled start time alone never makes a match **CURRENT**. That label requires a cached official actual start within two minutes and a TBA sync within one minute. An actual start without posted scores is **Started · result pending**, not completed. The compact freshness label uses the same configured stale interval as the shared TBA refresh service.

- **Complete**: at least one final report exists for that match/team.
- **In progress**: no final report exists, but a draft or active assignment exists.
- **Missing**: no report or active assignment is present.
- **Unavailable**: the viewer can see the match but the coverage lookup was not available.

Coverage is intentionally robot-match specific. It is not a team-wide scouting count and it does not expose another scout's report contents. A narrow event-level Realtime signal tells Schedule and Match Details to re-read the authorized aggregate when submissions or in-progress assignment status changes. Team pills link to the event Team page; the surrounding card opens Match Details.

## Match Details

`/events/[eventKey]/matches/[matchKey]` shows the official result banner, red/blue alliance panels, exact coverage counts, cached video metadata, a season-specific score breakdown, and the current user's accessible scouting summary. Strategy/admin users get a Match Prep deep link. Admins can request a role-protected cached TBA refresh. During competition, the existing event-level live refresh check and database update subscription refresh results, breakdown, and video without a hard reload.

The 2026 renderer only displays validated fields from the stored TBA score breakdown. Unknown or future payload shapes produce **Detailed score breakdown unavailable** instead of guessed values. Cached video keys are validated before rendering a YouTube privacy-enhanced iframe.

## Event time zone

Imported events default to `UTC` and are visibly marked as awaiting confirmation when TBA does not provide a reliable IANA time zone. Admins can set an IANA zone in **Admin → Events**; that override is preserved across later imports. Match times are stored as UTC and formatted at display time, so changing the event setting does not rewrite historical data.

The default is explicit rather than silently inferred. Confirm the event's local zone before relying on the displayed clock time for field decisions.
