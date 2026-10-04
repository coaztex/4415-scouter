# Supabase foundation

For current self-registration, pending approval and password recovery configuration, see [AUTHENTICATION_UX.md](AUTHENTICATION_UX.md). The original foundation details below are historical where they describe the absence of public signup or future approval work.

## Current connection status

The project is linked. The authentication repair confirmed valid public and service-role configuration and an existing confirmed/password-enabled Auth account with an active admin profile. The profiles, relational event, TBA sync, and Statbotics sync migrations are now applied remotely. See [authentication audit](AUTHENTICATION.md).

## Implemented and deferred

Installed `@supabase/supabase-js`, `@supabase/ssr`, and the `server-only` boundary marker. The Supabase CLI is a development dependency for repeatable configuration and migrations. `tsx` runs TypeScript security tests using Node's test runner; no additional test framework was added.

`src/lib/supabase/client.ts` creates a browser cookie client. `server.ts` creates a request-scoped server client using `await cookies()`. `src/proxy.ts` delegates to the session refresh helper: verified `getClaims()`, updated request cookies, response cookies, and SSR cache headers. No deprecated auth helpers are used. See [Supabase's Next.js SSR guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client).

The proxy only refreshes sessions; it does not grant access. Login/logout, server-only username lookup, verified profile display, and protected-route guards are implemented. Protected code verifies identity and checks current profile activation/permissions; a valid JWT alone is insufficient. Do not cache authenticated responses with ISR or a shared user-independent cache. Future auth Route Handlers must return private/no-store responses and preserve all session cookies/cache headers if redirecting.

## Environment boundaries

`src/lib/env/public.ts` reads only the two explicit public variables. It accepts modern `sb_publishable_` keys and HTTPS origins (HTTP allowed for loopback development); legacy anon JWT keys are deliberately not accepted. Do not put a secret into a public variable: Next.js can embed public values at build time, so validation cannot undo an incorrectly configured build.

`src/lib/server/env.ts` is guarded by `server-only`. Public configuration and private service-role configuration have separate getters. The private getter is lazy, checks service-role JWT shape without logging values, and is unused by normal clients. Supabase verifies the actual signature. A narrowly scoped server-only username helper uses a service-role client; it is not exported or exposed as a lookup endpoint. Never export the private getter through a client-facing barrel.

Both public variables missing: the public placeholder shell works without making Supabase requests. One missing or malformed value: validation fails. All actual client factories require both values; missing configuration must never become an authorization bypass. Local environment values are configured; they are never committed.

## Profile model and security

The migration adds only `profile_role` and `profiles`, plus private helpers and triggers. Profiles reference Auth users with cascade deletion, unique lowercase/trimmed usernames (3–40 ASCII letters, digits, underscores), display names, role, active status, and timestamps.

There is one profile-creation flow: an Auth insert trigger, with non-destructive backfill for existing users. It assigns a UUID-derived username, empty display name, `scout`, and `active = false`. It never trusts user metadata for permissions. Accounts remain unapproved until a future controlled admin operation activates them. The first admin must be provisioned through a deliberate trusted operator step once that workflow is designed; no automatic first-user admin or public signup UI exists.

The new profile role is application-level. Future event membership roles remain separate. For now the directory assumes one trusted team's deployment: active users can read other active profiles, while inactive users see only themselves. Multi-organization directory access must be narrowed with membership policies before hosting multiple teams' private workspaces.

RLS and column grants permit authenticated reads of only `id, username, display_name, role, active`. Queries must select these columns explicitly, not `*`. Anonymous reads are denied. No authenticated inserts, updates, or deletes are allowed, including users whose profile role is admin. Only future server admin logic may write through privileged credentials after verifying its caller, active admin status, validated fields, and audit requirements. Service-role access bypasses RLS and must never reach browsers. The private activation helper uses the caller's `auth.uid()` and avoids recursive RLS.

## Original setup reference for a new deployment

The current project is already linked. The following steps are only for a new deployment; do not relink/reset the existing project.

1. Create or select a Supabase development project in your own account. If it already contains tables or Auth users, disclose that before applying migrations. This migration deliberately does not overwrite existing objects; conflicting schema requires review.
2. Copy `.env.example` to `.env.local` in the project root. Fill `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the project's Connect dialog. Leave `SUPABASE_SERVICE_ROLE_KEY` and `TBA_AUTH_KEY` blank for now. Do not paste private keys into chat or commit `.env.local`.
3. Restart `npm run dev` after changing the environment. Use the same pair for a production build when it becomes relevant. No Vercel setup is needed yet.
4. To authorize CLI linking, provide the project reference and explicitly confirm that this repository may be linked. After confirmation, run `npx supabase login`, then `npx supabase link --project-ref YOUR_PROJECT_REF`. Enter passwords interactively, not in tracked files or command arguments. These commands have NOT been run.
5. Before applying anything, run `npx supabase migration list --linked` and review the existing schema plus `npx supabase db push --linked --dry-run`. Reconcile any pre-existing schema/history without resetting or dropping data. Ask for explicit approval of the reviewed migration before `npx supabase db push --linked`. Never run a remote reset.
6. After applying the migration, generate types with `npx supabase gen types typescript --linked --schema public`, review the output, then replace `src/types/database.ts`. Its current types are handwritten from the migration, not remotely generated. Set localhost Site URL/allowed redirect URLs under Auth URL configuration when the real login flow is implemented.

**Before Prompt 4:** Supply the public configuration locally and authorize linking/migration application if Prompt 4 is to exercise live Auth or database behavior. Offline coding can continue without it, but live verification cannot. The service-role key is not needed until controlled admin operations are built.

## Offline verification

Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run format:check`, and `npm run build` without credentials.

The SQL regression suite uses a fresh PostgreSQL 17 container with minimal Auth fixtures. It verifies backfill, safe defaults despite malicious metadata, normalization/uniqueness, timestamps, active/inactive visibility, denied writes and role escalation, anonymous/column restrictions, privileged writes, and cascade deletion. It is not a replacement for live Supabase/PostgREST and refresh-token testing.

To repeat SQL checks in PowerShell, use a new disposable container name if the example is already in use. No host port is published and networking is disabled:

```powershell
docker run --detach --rm --name frc26-profiles-test --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine
# Wait for: docker exec frc26-profiles-test pg_isready -U postgres
Get-Content tests/sql/auth-fixture.sql | docker exec -i frc26-profiles-test psql -U postgres -v ON_ERROR_STOP=1
Get-Content supabase/migrations/20260923000000_profiles_foundation.sql | docker exec -i frc26-profiles-test psql -U postgres -v ON_ERROR_STOP=1
Get-Content tests/sql/profiles.sql | docker exec -i frc26-profiles-test psql -U postgres -v ON_ERROR_STOP=1
docker stop frc26-profiles-test
```

Check each command's exit code before continuing. Never run the fixture against Supabase or an existing database. A full local Supabase stack can be started separately with `npx supabase start`; no local or remote reset is required for this task.
