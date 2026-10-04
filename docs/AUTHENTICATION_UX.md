# Team managed registration and password resets

## Account lifecycle

`/register` accepts display name, username, email, password, and confirmation. The existing Supabase Auth signup creates a session immediately when **Confirm email** is disabled. Its database trigger creates an inactive Scout profile with `approval_pending=true`. Self-registration never accepts role or activation metadata. The username constraint handles concurrent collisions atomically. Signup redirects to `/pending-approval` without an email link.

`profiles.active` remains the database authorization gate. Pending users have `active=false`, `approval_pending=true`; disabled users have both false. Pending sign-ins retain a session only for the approval screen. Protected pages redirect there; server role guards and RLS deny application data and actions. Disabled users receive the existing generic sign-in failure.

Admin → Users shows pending accounts and lets an active admin approve as Scout by default, explicitly choose Strategy/Admin, or reject/disable. The service-only audited `admin_save_profile` operation checks the acting admin, current row, and last-admin guard. Users cannot approve themselves or change their own role.

## Team managed password recovery

`/forgot-password` accepts username or email and always returns the same neutral result for known, unknown, duplicate, or temporarily unavailable requests. The server-only lookup matches the Supabase Auth email or profile username. `password_reset_requests` stores one pending request per profile; statuses are pending, resolved, or dismissed. The admin queue appears at the top of Admin → Users. Ordinary users cannot resolve requests or update Auth passwords.

An admin may enter a unique temporary password of 16–128 characters or generate one. The server first marks the profile `active=false, must_change_password=true` under an admin-checked database operation, then calls Supabase Auth Admin `updateUserById`, and finally marks the request resolved. The temporary password appears once to that admin in the action response and is never stored in the request table or logged. The admin shares it privately after verifying the person's identity. A failed Auth update leaves the request pending for retry and the old password usable only to complete a required change. The last active admin cannot be reset this way until another admin is promoted.

An approved user signing in with a temporary password goes to `/change-password`. The authenticated action checks the profile again, changes the password through Supabase Auth, and clears the flag through a service-only database operation. The active gate stays false until completion. A pending account stays on `/pending-approval` after a reset; approval then allows the required password change before workspace access. A rejected/disabled account cannot use this path to activate itself.

## Supabase setup before deployment

1. Review and apply migrations `20261016000000_account_registration.sql` and `20261017000000_team_password_resets.sql` to the linked project after a dry run. Do not reset the linked database. The local integration test applies migrations only to local Supabase.
2. In **Authentication → Sign In / Providers**, enable the **Email** provider and **Allow new users to sign up**. In the Email provider settings, disable **Confirm email**. Keep **Allow anonymous sign-ins** disabled in the general Auth configuration. Disabling confirmation makes Supabase mark signup emails as confirmed internally without proving mailbox ownership. Admins must verify a person's identity and team membership out of band before approval or password reset.
3. Keep `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY`. The service key is required for username login, admin account management, and reset requests. `APP_SITE_URL`, custom SMTP, Resend, confirmation/recovery templates, and `/auth/confirm` redirect allowlists are no longer required for these auth flows. Keep unrelated email integrations if added later.
4. Keep suitable deployment-wide rate limits for `/register`, `/forgot-password`, and `/login`. The app's in-process limiter is a local backstop, not a distributed limit. If Auth CAPTCHA is enabled, integrate its challenge into the signup form before enforcing it.

## Verification

`npm test` covers validation, pending/forced access, neutral reset responses, username/email login, and forced-change flow. `npm run test:sql` runs all migrations in a disposable PostgreSQL container and tests duplicate requests, admin-only reset operations, approval, role assignment, last-admin protection, and RLS. `npm run test:auth:local` uses local Supabase and an isolated Next server on port 3002 to test real signup, pending route/API denial, neutral and duplicate requests, admin reset, approval, required password change, and both login identifiers. It requires an existing active local fixture admin. It creates and removes its own temporary accounts. No linked or production Supabase project is used by that command.
