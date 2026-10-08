# FRC Scout

An event-centered FRC scouting and strategy application. The app includes cookie-based email/username authentication, role-protected event workspaces, server-side TBA/Statbotics adapters, versioned game modules, match scouting, and pit scouting.

## Stack

Next.js 16.3.6 App Router, React 19.2.8, strict TypeScript, Tailwind CSS 4, npm, ESLint, and minimally configured Prettier. Node.js 24.x is the selected runtime.

## Local development

```powershell
npm ci
npm run dev
```

Open http://localhost:3000. The root redirects to `/events`.

Configure `.env.local` using `.env.example`. Supabase URL and publishable key are required for authentication; the server-only service-role key is also required for username login. See [authentication status and verification](docs/AUTHENTICATION.md).

## Routes

- `/login`: email or username and password login; active sessions redirect to `/events`.
- `/events`: RLS-filtered event cards and cached progress.
- `/events/[eventKey]`: event home and role-aware navigation.
- `/account`: authenticated password changes.
- `/admin`: active admins only; events, users, scout scheduling, data/sync, and system health.
- `/schedule`: strategy/admin schedule generation, preview, and manual editing.
- `/events/[eventKey]/scouting`: the current scout's assignments and breaks; assignment links open the protected phased match workflow.
- `/events/[eventKey]/scout/match/[assignmentId]`: the phased 2026 REBUILT match capture workflow.
- `/events/[eventKey]/pit`: searchable event-team list and progress.
- `/events/[eventKey]/pit/[teamNumber]`: claimed pit report, draft, and final submission.
- `/events/[eventKey]/teams`: searchable, sortable event team directory.
- `/events/[eventKey]/teams/[teamNumber]`: evidence-based team profile, matches, pit claims, notes, and media status.
- `/events/[eventKey]/stats`: event-wide 2026 scouting summaries and source-separated external rankings.
- `/events/[eventKey]/picklist`: strategy/admin role-specific profiles, editable weights, manual order, exclusions and immutable snapshots. See [Picklist](docs/PICKLIST.md).

## Checks

```powershell
npm run lint
npm run typecheck
npm run format:check
npm test
npm run test:sql # optional; requires Docker, uses only disposable local PostgreSQL
npm run build
npm run start
```

Use `npm run format` to format source and documentation. Typecheck generates Next.js route types before running TypeScript, so it also works on a fresh checkout.
`npm test` runs unit and interactive component tests. See [competition-day test coverage and fixtures](docs/TESTING.md) for the SQL runner, synthetic data, and deferred browser smoke tests.

## Design and components

Shared components live in `src/components/ui` and `src/components/layout`. CSS/Tailwind tokens in `src/app/globals.css` define colors, spacing, radii, and typography. The shell uses system fonts, high contrast, 48px controls, visible focus, and a skip link. Tabs support arrow keys, Home, and End. Input and Select provide labels and associated hint/error text.

`src/app/icon.svg` is a temporary brand favicon; replace it when real assets are available. Search indexing is disabled for this preview. Navigation displays the verified profile identity and role with a sign-out control. Role filtering must never replace server authorization/RLS.

The app is installable on supported browsers with a manifest and a public-static-only service worker. See [PWA installation and offline limits](docs/PWA.md).

## Git and deployment

This repository has `origin` set to `https://github.com/coaztex/4415-scouter.git` and tracks `origin/main`. A Git remote alone does not mean that Vercel is connected to the repository. Check the intended Vercel account and project before linking or deploying; do not create a second project by accident.

### Vercel production setup

1. Install dependencies with `npm ci` on Node 24, then run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:sql` (Docker required), and `npm run build`. Keep the working tree changes you intend to deploy in a commit; a Git-based Vercel deployment builds the pushed commit, not uncommitted local files.
2. Run `npx supabase migration list --linked` and confirm every local migration has a matching remote version. Apply only reviewed pending migrations with `npx supabase migration up --linked --yes`; never reset the linked project. Confirm the active admin Auth user/profile, RLS behavior, and the selected event's TBA and Statbotics sync statuses.
3. Sign in to the intended Vercel account with `npx vercel login`. Run `npx vercel link` in this directory and select the correct scope and existing project. If no project exists, import `coaztex/4415-scouter` through the Vercel dashboard and connect its `main` production branch, then link this checkout. The local `.vercel` link is ignored by Git. Verify the linked project and Git integration in Vercel before deploying.
4. In **Vercel → Project → Settings → Environment Variables**, set the following for **Production**. Also set them for **Preview** only if preview builds should connect to an appropriately isolated Supabase project and TBA account. Use **Development** only for `vercel dev` or `vercel env pull`; local `next dev` uses `.env.local` instead. Do not point an untrusted preview at production service credentials.

   | Variable                               | Production                               | Preview / Development                            | Exposure    |
   | -------------------------------------- | ---------------------------------------- | ------------------------------------------------ | ----------- |
   | `NEXT_PUBLIC_SUPABASE_URL`             | Required                                 | Required when that environment is used           | Public      |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Required                                 | Required when that environment is used           | Public      |
   | `SUPABASE_SERVICE_ROLE_KEY`            | Required                                 | Required only for isolated, trusted environments | Server only |
   | `TBA_AUTH_KEY`                         | Required for import/sync                 | Required where import/sync is enabled            | Server only |
   | `TBA_REFRESH_INTERVAL_SECONDS`         | Optional; defaults to 300 seconds        | Optional                                         | Server only |
   | `TBA_WEBHOOK_SECRET`                   | Optional; required if webhook is enabled | Optional                                         | Server only |

   Statbotics needs no key. This app has no AI provider integration or app-base URL variable. Never give server secrets a `NEXT_PUBLIC_` prefix. Vercel supplies `VERCEL` automatically. [Environment variable changes apply only to new deployments](https://vercel.com/docs/environment-variables), so deploy again after changing them.

5. In Supabase Auth, keep the Email provider and user signup enabled, disable **Confirm email**, and keep anonymous sign-ins disabled for this team-managed approval flow. Set the hosted Email provider's minimum password length to **8**, matching the shared application policy and local `supabase/config.toml`; repository changes do not update the hosted policy. See [password-policy deployment notes](docs/AUTHENTICATION_UX.md#supabase-setup-before-deployment). This implementation uses password authentication and admin-managed resets; it does not use email confirmation/recovery redirects or an app-base URL. Review the Auth Site URL for general project hygiene after the production domain is known, but no redirect allowlist entry is required by the current flow.
6. Before production deployment, sign in with a real active Scout account in a staging or authorized test environment, submit one assigned match, and verify it appears once after refresh. Exercise the offline queue in a disconnect/reconnect simulation. Do not submit synthetic observations into a real competition event. If no active Scout account exists, arrange one and complete this gate before deployment.
7. Push the reviewed commit to the branch connected to Vercel, or use `npx vercel --prod` after confirming the linked project and environment values. Do not assume a successful local build is a production deployment. Record the resulting production URL and deployment ID.

### Production checks

- On the actual production domain, sign in and out with an authorized account; verify the Supabase session cookie works across navigation and refresh. Check a Scout session and an Admin session with their correct permissions.
- In Admin → Data & Sync, sync the selected event and verify TBA and Statbotics report success. Confirm one protected match submission path and the offline queue behavior.
- Confirm private keys and webhook secrets are absent from browser responses and generated client assets. The public Supabase URL and publishable key are expected in client code.
- If enabling TBA webhooks, set the same `TBA_WEBHOOK_SECRET` in Vercel Production and in the [TBA Account Dashboard](https://www.thebluealliance.com/account), and register the callback `https://<your-production-domain>/api/tba/webhook` in TBA. The exact URL cannot be finalized until Vercel assigns or connects the production domain. Check Admin → Data & Sync for the received TBA verification key. Redeploy after setting the Vercel secret.
- Recheck Supabase Auth settings against the production domain. The current password and admin-reset flows have no email callback URL; if an email redirect flow is added later, configure its exact URLs in Supabase Auth before enabling it.

## Documentation

- [Architecture and planned boundaries](docs/ARCHITECTURE.md)
- [Development rules and setup history](docs/DEVELOPMENT.md)
- [Competition-day test coverage and fixtures](docs/TESTING.md)
- [Supabase connection steps, security model, and tests](docs/SUPABASE.md)
- [Admin workspace, account creation, and security](docs/ADMIN_WORKSPACE.md)
- [Scout scheduling, manual edits, and transactional safeguards](docs/SCHEDULING.md)
- [2026 match scouting workflow, draft recovery, and submission security](docs/MATCH_SCOUTING.md)
- [2026 pit scouting, claims, and submission security](docs/PIT_SCOUTING.md)
- [Offline drafts, device queue, retries, and recovery](docs/OFFLINE_SCOUTING.md)
- [Event team directory, profiles, and metric provenance](docs/TEAMS.md)
- [Event Stats, ranking controls, and source provenance](docs/STATS.md)

## Relational schema

The event/season schema and admin workspace migrations are applied to the linked Supabase project. See [database design and RLS](docs/DATABASE.md) for keys and lifecycle rules, and [admin security](docs/ADMIN_WORKSPACE.md) for the latest deployment and verification status.

## Game modules

REBUILT schema version 2 supports FUEL estimates, shuttling/passing activity, confidence-aware aggregates, alliance reconciliation, and concise pit capability claims. Version 1 remains readable. See [game-module guide](docs/GAME_MODULES.md) for canonical fields and [verified source mappings](docs/SEASON_2026_SOURCES.md) for TBA/Statbotics provenance.

## TBA imports

Admin preview/import and manual sync use a server-only adapter and atomic database transaction. Event pages read cached Supabase data. See [TBA setup and sync behavior](docs/TBA.md) for key configuration and current authentication prerequisites.

# Statbotics adapter

Server-side EPA caching and independent retries are documented in [docs/STATBOTICS.md](docs/STATBOTICS.md). No Statbotics API key is required.
