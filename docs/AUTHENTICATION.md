# Authentication repair and verification

This is the historical authentication repair report. Current signup, approval and recovery behavior and operator steps are documented in [AUTHENTICATION_UX.md](AUTHENTICATION_UX.md), which supersedes the signup-disable advice below.

## Root cause

The login page was still a static “Sign-in is not available yet” placeholder. There was no credential form, login Server Action/route, or logout implementation. The existing SSR clients, Next.js 16 proxy refresh, `getUser` verification, profile schema/RLS, and role guards were present. Creating an Auth user could not fix missing application code. Those working pieces were retained.

## Read-only live findings

The existing operator account has a password, confirmed email, email identity, no ban, and a matching profile: username `coaztex`, display name `Daniel Shin`, active `admin`. No account/profile bootstrap is needed. The public URL, publishable key, and legacy service-role key are configured and were validated by successful read-only requests. Anonymous profile access is denied. No remote user, profile, password, policy, or configuration was modified.

Public signup is currently enabled in Supabase. Disable **Authentication → Sign In / Providers → Allow new users to sign up** to enforce team-managed accounts at the Auth API. Keep Email enabled; do not disable verification globally or recreate the existing account.

Only `20260923000000_profiles_foundation` is applied remotely. These existing migrations are pending:

- `20260924000000_event_relational_model.sql`
- `20260925000000_tba_sync.sql`
- `20260926000000_statbotics_sync.sql`

Authentication needs only the applied foundation. Successful login redirects to `/events`, but that page cannot load its data until the event migrations are applied. After reviewing them, run `npx supabase db push --linked --dry-run`, then authorize/apply `npx supabase db push --linked`. Never reset the remote project. No migration was applied during the repair.

## Implemented flow

The form posts `Email or username` and password to a Server Action. Identifiers are trimmed/lowercased; passwords are never trimmed. Email authentication uses the normal publishable-key cookie client. Username login resolves profile ID and Auth email only inside `src/lib/auth/username.ts`, protected by `server-only`. Its privileged client is never exported. The helper neither changes users nor signs them in. The normal client verifies the submitted password, then checks an active profile before allowing navigation. Failed profile checks clear the newly issued session.

Unknown usernames, invalid passwords, unconfirmed accounts, missing/inactive profiles, and lookup failures use the same public error. Unknown usernames still perform a failed password request against a random non-deliverable address; this creates no account or fake email alias. No username lookup endpoint, public signup form, email return value, or raw provider error exists. Failure delay reduces obvious fast paths but is not constant-time networking.

Supabase's Auth limits remain enabled. A bounded per-process burst limiter adds ten attempts per minute, using the trusted Vercel forwarding header only on Vercel. Other hosts use a shared bucket. This is not distributed protection: before production, configure a deployment-wide Vercel Firewall rate limit on POST `/login` (and restrict unexpected Server Action POST routes as appropriate). Do not treat in-memory state as a durable abuse boundary.

Logout revokes the current session with `scope: local`, clears SSR cookies, invalidates layout caches, and redirects to `/login`. Other devices remain signed in. Errors are visible rather than claiming a failed logout succeeded. The proxy still refreshes cookies via `getClaims`; protected pages/actions verify with `getUser` and current profile role. Inactive users can still sign out. `/admin` rejects non-admin roles independently of navigation visibility.

## Verification

Automated tests cover email/username normalization, password preservation, active-profile enforcement and session cleanup, unknown-user behavior, invalid inputs, safe failures, rate-limit expiration, and admin role gates. Unauthenticated HTTP checks against the running app confirm `/events` and `/admin` redirect to `/login` (Next.js may stream this redirect in a 200 response). The browser displays the real labeled login form.

The operator confirmed live **email login, username `coaztex` login, and logout all work**. Both login methods reach `/events`; its pending-schema error is separate from authentication.

For follow-up verification, enter the password directly at `http://localhost:3000/login`, never in chat:

1. Log in using email and password; confirm navigation to `/events` and the header displays the expected name/role.
2. Sign out; confirm protected routes return to `/login`.
3. Repeat with username `coaztex` and the same password.
4. Open `/admin`. With the event migrations applied, an authorized admin should see the import form and cached-events section; “Access denied” indicates a role problem.
5. A real non-admin end-to-end check needs a team-managed active scout/strategy test account. No live account was downgraded or created for testing; role logic is covered offline.

Password login by both identifiers and logout are operator-confirmed. Non-admin role checks passed offline; a live non-admin session has not been tested. Lint, typecheck, all 40 unit tests, formatting, and production build passed. The service-role value was absent from all 19 generated client static files. Work stops at this authentication repair; no later playbook features are implemented.
