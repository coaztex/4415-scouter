# Live event updates

The browser reads event data from Supabase, never directly from TBA. The event shell listens only for its event row; pit scouting listens for that event's `event_teams` changes; scout scheduling listens for assignment and match submission inserts/updates. Assignment deletions touch the event row once per database statement, since filtered DELETE payloads cannot safely identify the event under RLS. These subscriptions refresh server-rendered data and respect existing row-level read policies. A disconnected browser can still reload the page.

Schedule and Match Details use a separate `scouting_coverage_signal` row scoped to the event. Its timestamp changes when a report is submitted or an assignment's in-progress status changes. Scouts can receive that signal without receiving another scout's private report, then re-read the authorized coverage aggregate. No match card opens its own subscription.

While an active event is near its competition dates, visible event pages make a lightweight authenticated refresh check on entry and every two minutes. The check reads one cached event row. TBA is called only when the cached sync is older than `TBA_REFRESH_INTERVAL_SECONDS` (default 300, allowed range 60–3600). A database lease prevents separate app instances from fetching the same event concurrently; a failed attempt also gets a cooldown. The existing admin Sync Now uses the same lease and preserves its full TBA, Statbotics, and media sync. Automatic/webhook refreshes update TBA data only.

## Optional TBA webhook setup

The callback URL is `https://<your-deployed-domain>/api/tba/webhook`. This project is not deployed yet, so live webhook delivery is unverified. Do not register a localhost URL without a public tunnel.

1. Generate a long random secret. Set `TBA_WEBHOOK_SECRET` in the deployed server environment and enter the **same** secret when creating the webhook in your TBA account. Keep the existing server-only `TBA_AUTH_KEY` and `SUPABASE_SERVICE_ROLE_KEY` configured. Redeploy after changing environment variables. None of these keys belongs in a `NEXT_PUBLIC_` variable.
2. In your TBA account, create a webhook with the callback URL. TBA sends a signed verification message. Sign in as an app admin and open **Administration → Data & Sync** to read the latest verification key, then enter it in the TBA account dashboard. The app stores only the latest received key.
3. Subscribe the account to the event(s) you cache, such as `2026cascmp`, and select **Match Score**, **Event Schedule Updated**, and **Alliance Selection**. The handler recognizes `match_score`, `schedule_updated`, and `alliance_selection` messages. It also accepts signed ping and verification messages. Other signed message types are acknowledged without starting a sync.
4. Use TBA's dashboard ping and a test notification after deployment. Check that the app's **Data & Sync** timestamp advances and the cached schedule/results update. No webhook has been registered by this code.

The route rejects absent or invalid `X-TBA-HMAC` signatures, using SHA-256 HMAC over the exact raw request bytes. It acknowledges TBA promptly and performs the guarded refresh after the HTTP response. TBA allows ten seconds for the HTTP acknowledgement; the app's post-response refresh has a 60-second execution limit. If a refresh fails, existing cached data remains and a later refresh check or admin Sync Now can retry.
