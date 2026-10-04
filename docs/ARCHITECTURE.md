# Architecture

Status: the Next.js application shell is implemented. Supabase SSR plumbing and the foundational profile migration are implemented; live project connection, login flows, product data, integrations, and game modules remain deferred. See [Supabase foundation](SUPABASE.md). This document does not define a final database schema or game rules.

## Platform

- Next.js 16 App Router with strict TypeScript and Tailwind CSS. Use npm and commit package-lock.json after initialization.
- Deploy to Vercel. Persist durable data in Supabase, never in a deployment's local filesystem or process memory.
- Supabase Postgres provides relational persistence, Auth provides identity, Storage holds media, and Realtime supports authorized live updates.
- Use `@supabase/ssr` for cookie-based sessions alongside `@supabase/supabase-js`. Never introduce deprecated `@supabase/auth-helpers-*` packages.
- Prefer Server Components for read-heavy pages. Use Client Components only for interaction, browser APIs, offline capture, or authorized Realtime subscriptions.
- Begin with local React state and server state. Add state-management libraries only after documenting an unmet need. Explain the purpose, alternatives, and cost of large dependency additions before adding them.

## Planned directory structure

The shell currently uses src/app, src/components/ui, src/components/layout, and src/features/events/components. The remaining directories below are planned; create them as their responsibilities are implemented.

```text
src/
  app/                        # App Router routes, layouts, loading/error boundaries
    (auth)/                   # Authentication route group
    (workspace)/events/[eventKey]/
    api/                      # Thin HTTP entry points where needed
  components/                 # Shared accessible UI, no domain persistence
  features/
    auth/
    events/
    scouting/
    pit/
    teams/
    stats/
    strategy/
    admin/
  games/
    core/                     # GameModule contracts and versioned payload types
    2026-rebuilt/              # 2026 validation, field definitions, derived metrics
    registry.ts               # Explicit selection of supported modules
  lib/
    supabase/                 # Browser/server clients and session plumbing
    tba/                      # Server-only TBA adapter
    statbotics/                # Server-only Statbotics adapter
    auth/                     # Shared identity/authorization helpers
    validation/               # Shared non-game validation primitives
    server/                   # Server-only environment/cache/request utilities
  types/                      # Generated DB types and truly shared contracts
  proxy.ts                    # Session refresh boundary when auth is implemented
supabase/
  migrations/                 # Reviewed schema, constraints, indexes, and RLS
docs/
```

`src/app` follows Next.js conventions; other source folders are siblings under `src`. Within a feature, separate domain types, services, repositories, UI, and entry points when needed. Keep server services/repositories in a feature's `server/` directory with `server-only` guards. Do not use a global miscellaneous services folder to erase domain ownership.

## Dependency and data flow

Routes and UI compose feature operations. Server Actions and Route Handlers validate inputs, verify identity and event permissions, and call shared typed domain services/repositories. Server Components call the same read services directly rather than fetching the app's own HTTP endpoints. Database mutations must not be scattered through UI components.

Repositories own database access; external adapters own provider HTTP access. TBA and Statbotics adapters are server-only and centralize timeouts, bounded retries, rate-limit handling, caching, response validation, and mapping into domain types. UI and game modules never fetch providers directly. Mark server-only modules explicitly; folder names alone are not a security mechanism. Provider failure must remain distinguishable from an empty data set.

## Event workspaces and authorization

An event is the main navigation and data scope. Associate workspace-owned observations, assignments, notes, and membership with an explicit event/workspace identifier. The final schema must settle whether multiple organizations can have private workspaces for the same competition event before migrations are written; do not treat a public event key as an authorization grant.

Profiles now carry an application-level role as required in Prompt 3. Future event permissions remain membership-scoped and must not be inferred solely from the profile role. Neither role is user-editable:

| Role     | Intended responsibilities                                                         |
| -------- | --------------------------------------------------------------------------------- |
| scout    | Read assigned event context and submit/edit permitted match and pit observations. |
| strategy | Read permitted scouting data and maintain event strategy work.                    |
| admin    | Manage event membership, assignments, configuration, and authorized corrections.  |

Finalize the exact permission matrix before schema implementation. An admin is not automatically a global platform administrator.

RLS is the security boundary. Enable deny-by-default policies on exposed workspace tables, with membership/role checks for reads and writes and `WITH CHECK` constraints for inserts/updates. UI visibility and server authorization are additional defenses, never substitutes for RLS. Test unauthorized and cross-workspace access explicitly. Apply equivalent access policies to Storage objects and Realtime subscriptions/channels.

Use request-scoped server clients carrying the user's session. Validate identity using the supported Supabase server verification method; do not trust a raw cookie or session object as authorization. Session refresh belongs in cookie-capable request handling (including Next.js proxy when needed); each protected operation still checks authorization. Avoid shared caching of authenticated responses across users.

Privileged secret/service-role keys bypass RLS and must never be used for normal user operations. If a future maintenance task needs one, isolate and document it. No such key is required now. Public Supabase configuration may enter browser bundles; TBA credentials and all other secrets may not. Never serialize secrets into client props, responses, logs, or errors.

## Persistence model

Keep stable entities relational: identities/profiles, workspace membership, seasons, events, teams, event-team participation, matches, assignments, scouting submissions, and pit observations. Use foreign keys, uniqueness constraints, and indexes for shared invariants. This is a conceptual inventory, not an approved migration.

Store season-specific observations as typed JSONB tied to a game identifier and payload schema version. Keep ownership, event/team/match references, submission UUID, and timestamps in relational columns. Validate JSONB at runtime at the server boundary; TypeScript alone does not validate incoming data. Preserve historical payload versions and explicitly migrate or adapt them. Generate database types once a real schema exists.

## Game-module contract

`games/core` owns a generic `GameModule<MatchData, PitData, Metrics>` interface. Its planned contract includes a stable game ID, season, payload schema version, runtime parsers for unknown match/pit input, typed field descriptors, and pure metric derivation functions. Parsers return typed success/error results. The precise signatures will be implemented with the first game module.

`2026-rebuilt` implements that contract and owns all 2026 rules and data definitions. A future 2027 module implements the same contract in its own directory. Core infrastructure depends on the contract; a small registry selects implementations from the event season/game identifier. Core infrastructure must not accumulate year-specific conditionals. Game modules must not depend on Next.js request handling, Supabase clients, or provider adapters. Share pure validation and descriptors with offline clients without importing server modules. Unknown games or schema versions produce explicit unsupported-version states.

## Offline submissions

Generate a UUID on the client once per logical submission and persist it with the draft in a durable browser queue (planned IndexedDB). Retries reuse the same UUID and payload; never assign a new UUID on each network attempt. Partition queues by user/workspace, retain unsynced work across reloads, and prevent another signed-in user from sending it.

Synchronization calls a shared server submission service that validates the payload, identity, scope, and role, then performs an atomic idempotent upsert backed by a database unique constraint on the submission UUID. Scope and ownership are immutable across retries; RLS must protect both insert and conflict-update paths. A replay cannot replace someone else's record. A repeated accepted submission returns its existing result. Deliberate later edits require explicit revision/conflict handling so stale retries cannot overwrite newer work.

Remove/acknowledge queued items only after a committed server response. Distinguish pending, syncing, synced, conflict, and failed states; handle expired sessions and denied permissions without losing local work. Realtime updates complement persisted state and do not replace offline synchronization. Service-worker caching and final edit conflict policy are deferred.

## References

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
- [Supabase cookie-based SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase API key boundaries](https://supabase.com/docs/guides/getting-started/api-keys)

## Relational implementation

See [DATABASE.md](DATABASE.md) for the stable event/season schema and RLS matrix. Profiles plus twelve competition tables are defined in migrations; the competition migration has only been tested locally. The typed game-module contract, versioned registry, and REBUILT Zod schemas/metrics are implemented; see [GAME_MODULES.md](GAME_MODULES.md). Forms and persistence integration remain deferred. The current single-organization deployment uses application profile roles across events; event membership isolation remains future work.
