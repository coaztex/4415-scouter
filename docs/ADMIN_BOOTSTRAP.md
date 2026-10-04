# First administrator bootstrap

## Verified prerequisite state

The authentication repair verified one confirmed Auth user with a password and a matching active admin profile. All three Supabase environment variables are configured. No bootstrap or profile change is needed for that existing account. Do not rerun first-admin promotion on it.

The steps below are retained for a fresh deployment. Login, username resolution, logout, and server authorization are now implemented; see [authentication audit](AUTHENTICATION.md).

## 1. Enable team approval

In the Supabase Dashboard for the linked project, open Authentication → Sign In / Providers and enable **Allow new users to sign up** and the **Email** provider. Disable **Confirm email** and keep anonymous sign-ins disabled. New self-registered users remain inactive until an admin approves them. The first administrator still needs this one-time trusted bootstrap. See [current setup](AUTHENTICATION_UX.md).

## 2. Create the initial Auth user

In Authentication → Users, choose **Add user → Create new user**. Enter your own administrator email and a strong, unique password directly in the Dashboard. Verify you control that email out of band; with Confirm email disabled, Supabase marks it confirmed automatically. Do not insert rows directly into `auth.users`, use a fake email alias, or send the password through chat.

Copy the new user's UUID from its details. The existing trigger will create an inactive scout profile automatically. It will not trust metadata to assign admin privileges.

## 3. Activate exactly that profile

In the same project's SQL Editor, paste the following. Replace all three placeholders before running it. The username must contain 3–40 lowercase ASCII letters, digits, or underscores. Escape a single quote in a display name by doubling it. Review the UUID against the Auth user you just created.

```sql
begin;

do $$
declare
  target_id uuid := 'REPLACE_WITH_AUTH_USER_UUID';
  affected integer;
begin
  if exists (select 1 from public.profiles where role = 'admin' and active) then
    raise exception 'An active admin already exists; stop and review instead of bootstrapping again';
  end if;

  if not exists (
    select 1 from auth.users
    where id = target_id and email_confirmed_at is not null
  ) then
    raise exception 'Target Auth user is missing or email is not confirmed';
  end if;

  update public.profiles
  set username = 'REPLACE_WITH_YOUR_USERNAME',
      display_name = 'REPLACE_WITH_YOUR_DISPLAY_NAME',
      role = 'admin',
      active = true
  where id = target_id and role = 'scout' and active = false;

  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Expected one inactive scout profile; no bootstrap changes committed';
  end if;
end;
$$;

commit;
```

If any statement fails, roll back the transaction and investigate rather than bypassing the checks. This is a one-time operator action, not an application endpoint, migration, or repeatable account-management flow. No email/password is hard-coded in the repository.

Verify in the SQL Editor:

```sql
select id, username, display_name, role, active
from public.profiles
where id = 'REPLACE_WITH_AUTH_USER_UUID';
```

Expect your chosen username/display name, `admin`, and `true`.

## 4. Prepare server-only username authentication

Username login now uses a server-only helper that looks up a normalized username's profile ID and obtains its Auth email. Only the ordinary cookie client authenticates the password. Neither emails resolved from usernames nor provider errors are returned to the browser. Email login does not require the service key.

Set `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` and the Vercel server environment using the project's legacy service-role JWT from API Keys. Never use a `NEXT_PUBLIC_` name or paste it into chat. The existing account's environment is already configured.

## Verification

Visit `/login`, authenticate with email or username, check profile/role, sign out, and verify protected routes return to `/login`. Public signup produces pending accounts until approved. See [current setup](AUTHENTICATION_UX.md).
