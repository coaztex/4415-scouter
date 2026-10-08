# Admin workspace

`/admin` redirects active admins to `/admin/events`. Every admin page and mutation verifies the current Supabase user and active admin profile server-side. Navigation visibility is only a convenience.

## Modules

- Events: existing TBA metadata preview and confirmed import, cached event list, manual TBA/Statbotics sync, and confirmed archive/reactivation. No hard-delete control.
- Users: paginated account search, role/status filters, account creation, and confirmed profile/role/status edits.
- Scout Scheduling: event selection, balanced generation with preview, transactional save, and confirmed manual assignment/break editing. Strategy leads use the same workspace at `/schedule`. See [scheduling](SCHEDULING.md).
- Data & Sync: provider configuration, per-event cached team/match/ranking counts, attempts/successes/errors, and manual sync through the existing shared orchestration.
- Competition Readiness: database reachability, TBA configuration presence, active scout count, and selected-event team/match/assignment counts, missed assignments, open server conflicts, and last successful TBA/Statbotics sync timestamps. Device-local pending sync cannot be measured globally; configuration presence does not prove provider reachability. No secret values are displayed.

## Creating a team account

1. Open Admin → Users → Create a team account.
2. Enter the display name, unique lower-case username, real team-member email, initial role, and a unique temporary password of 8–128 characters. Prefer a password-manager-generated password. This uses the shared [password policy](../src/lib/auth/password-policy.ts); the hosted Supabase Auth minimum must also be 8 (see [deployment settings](AUTHENTICATION_UX.md#supabase-setup-before-deployment)).
3. Review the confirmation and submit. This server-only Auth Admin API operation marks the email confirmed; the administrator must verify ownership before creating the account. No invitation email or SMTP setup is required.
4. Share the temporary password privately. The member signs in with their email or username, opens Account, and replaces it using their current password. Other sessions are revoked where Supabase permits.

Passwords are neither returned in action responses nor logged or stored in profile/audit rows. The service-role client stays inside the server-only account helper. There is no public signup page. Disable **Allow new users to sign up** in Supabase Authentication settings for team-managed accounts; this page does not change that project setting.

Temporary passwords do not currently have a forced-change deadline or a first-login gate. Members should change them immediately. Password recovery and administrator reset UI are deferred.

Auth creation and profile activation cannot share one database transaction. The existing Auth trigger first creates an inactive scout profile; a separate privileged transaction assigns the requested username, role, name, and active status. If activation fails, the response identifies the inactive account. Find it in Users, review its values, and activate it rather than attempting another creation with the same email. No cleanup deletes an Auth user automatically.

## Database security

Migration `20260927000000_admin_workspace.sql` adds:

- A private locked active-admin counter and trigger protecting the last active admin against demotion, deactivation, deletion, and concurrent removal attempts.
- A service-role-only `admin_save_profile` operation. It rechecks and locks the verified acting admin, locks the target, compares the previous values to reject stale changes, updates the profile, and records changed values atomically.
- An admin-readable account audit table containing profile changes, actor, target, and timestamp; no emails/passwords.
- Admin visibility of inactive profiles, without granting ordinary authenticated clients profile writes or execution of the privileged operation.
- Removal of authenticated event-delete privileges; archive/reactivate is the supported UI lifecycle.

The action obtains the actor from verified authentication, never from submitted form data. An inactive account can retain a Supabase session but app authorization and RLS deny its access. Database-owner access remains privileged and outside client RLS guarantees.

## Verification and deployment

The migration has been applied to the linked Supabase project without seeds or resets. Generated database types include the new audit table and function. No new environment variables or dependencies are needed; account creation uses the existing server-only `SUPABASE_SERVICE_ROLE_KEY`.

`npm test` covers validation, provisioning failure recovery, and role logic alongside existing adapter/game tests. `tests/sql/admin-workspace.sql` tests RLS, grants, audit records, stale writes, and last-admin protection in a disposable database. `tests/admin-concurrency.mjs` targets only the disposable `frc26-admin-test` PostgreSQL container to test simultaneous admin deactivations; never run its fixture SQL against production. Existing SQL suites also pass with the new migration.

Live page checks use the existing admin session. Account creation, password replacement, and privilege changes are not exercised against the real administrator account; those mutations are covered by mocked provisioning and disposable-database tests.
