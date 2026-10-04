# Development

Current status: the app, authentication, event cache, provider adapters, and admin workspace are implemented. Supabase is linked and migrations through `20260927000000_admin_workspace.sql` are applied. See [admin operations](ADMIN_WORKSPACE.md) for account creation, security, and current verification. Earlier prompt-specific setup sections below record the original setup history.

## Preflight findings

The initial working directory `C:\Users\dhspr\OneDrive\Desktop\frc26_scout` contained zero entries. It was not a Git repository. There was no framework/version, package manager, TypeScript setup, styling system, source organization, Supabase configuration, or Vercel configuration. No applicable ancestor AGENTS.md was found in the checked parent chain.

Installed tools observed during preflight: Node.js v24.21.0, npm 11.19.0, Git 2.55.0.windows.3. No packages were installed. There are no existing architecture conflicts to resolve.

## Original initialization plan (completed in Prompt 2)

1. Prompt 2 authorized initialization of Next.js 16 and the placeholder shell.
2. Use npm, App Router, strict TypeScript, Tailwind CSS, ESLint, a `src/` directory, and the `@/*` import alias. Resolve a supported Next.js 16 patch and record installed versions and a compatible Node runtime. Do not silently upgrade to another major.
3. Preserve this README, docs, and .env.example. Since this directory is now nonempty, scaffold into a temporary sibling directory, inspect it, and merge the generated files deliberately. Do not blindly run the generator against this directory or overwrite documentation.
4. Planned generator command, after approval, using a confirmed unused staging directory:

   ```powershell
   npx create-next-app@16 frc26-scout-staging --ts --tailwind --eslint --app --src-dir --use-npm --import-alias "@/*" --disable-git
   ```

5. Review generated defaults and scripts. Commit package-lock.json when local Git is established. Ensure `.gitignore` excludes node_modules, build outputs, `.vercel`, and local environment/secret files, while permitting `.env.example`.
6. Local Git is sufficient; a GitHub URL is optional. Do not create a remote GitHub repository, add a remote, or push without explicit permission.
7. Add Supabase clients only when integration begins. Their purpose is typed Supabase access and cookie-based sessions. Do not implement product features as part of initialization.

CLI options are documented in the [Next.js create-next-app reference](https://nextjs.org/docs/app/api-reference/cli/create-next-app). Verify options against the chosen 16.x generator when running it.

## Environment setup (deferred)

After ignore rules exist, copy `.env.example` to `.env.local` and populate only values needed for the work underway. Never commit real credentials. These variables are planned, not consumed by any code today:

| Variable                             | Visibility                    | Needed when                                 |
| ------------------------------------ | ----------------------------- | ------------------------------------------- |
| NEXT_PUBLIC_SUPABASE_URL             | Public                        | Supabase integration begins.                |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Public; RLS remains mandatory | Supabase integration begins.                |
| TBA_AUTH_KEY                         | Server only                   | Authenticated TBA requests are implemented. |

Statbotics configuration will be established when its adapter is implemented; no credential requirement is assumed now. No Supabase privileged key or Vercel token is required. Validate environment inputs in the appropriate client/server boundary when those integrations exist.

## Coding rules

- Enable strict TypeScript. No `any` unless an adjacent comment justifies why it is necessary; prefer `unknown` with runtime narrowing for external input.
- Split large files when a clear domain or responsibility boundary exists. Avoid arbitrary abstractions and duplicated business logic.
- Never duplicate API fetching logic. Centralize each provider's transport and normalization in its server-only adapter.
- Never expose secrets in client bundles, props, logs, or responses. Only explicitly public configuration may use `NEXT_PUBLIC_` names.
- Do not scatter direct database mutations through UI components. Use shared typed domain services/repositories through validated Server Actions or Route Handlers.
- Enforce identity, permissions, validation, and RLS on every protected operation. A hidden button is not authorization.
- Prefer Server Components for read-heavy pages and small Client Components for interaction. Use React local state and server state until a demonstrated need justifies more.
- Explain large dependencies before adding them: purpose, alternatives, maintenance, and client bundle impact. Use existing platform capabilities where sufficient.
- Provide clear loading, empty, error, permission-denied, and offline/sync states as applicable. Do not disguise an error as empty data.
- Use semantic forms and buttons, associated labels, visible keyboard focus, accessible names, correct button types, and errors associated with inputs. Support keyboard operation and sufficient contrast; never rely on color alone.
- Keep game-specific fields, validation, and metrics in game modules. Keep stable relational operations in domain services/repositories.
- Add schema/RLS changes through reviewed migrations in `supabase/migrations`; regenerate types after schema changes. Do not make undocumented dashboard-only changes.

## Verification

The shell provides npm run lint, npm run typecheck, npm run format:check, and npm run build. All passed during Prompt 2. No test framework was added for placeholder pages. HTTP smoke checks covered all four routes, the SVG favicon, and a 404 response; browser inspection covered desktop and responsive layouts. Next.js 16 builds do not run the linter automatically; keep lint as a separate check ([installation documentation](https://nextjs.org/docs/app/getting-started/installation)).

Add meaningful tests with the behavior they protect: game payload validation and calculations, role/RLS isolation, idempotent retries and stale-edit conflicts, and core submission flows. Check forms with keyboard interaction and review loading/empty/error states. Do not add a test framework merely to test documentation placeholders.

## Current setup after Prompt 2

Initialization is complete with Next.js 16.3.6, React 19.2.8, TypeScript 5.9.3, Tailwind 4.3.3, and Node 24.x. Prettier was added as a development-only formatter to keep shared TSX and documentation consistent, with an empty default configuration. No UI or state-management library was added. Git is not initialized and no remote exists. GitHub, design assets, and Supabase/Vercel credentials are not required for the next prompt. See README for current commands. The scaffold uses ESLint 9; npm reports that major as out of support, so a compatible ESLint major upgrade is deferred rather than changing the Next.js template baseline during shell setup.

## Handoff convention

Every prompt must end with these exact eight sections, even when a section has no changes:

1. **What I changed**
2. **Files created/modified**
3. **Database migrations/schema changes**
4. **Environment variables added/required**
5. **Commands/tests run and results**
6. **User action required before the next prompt** — explicitly say `None` if nothing is needed.
7. **Known limitations / deferred work**
8. **Ready for next prompt?** — answer yes/no and why.

## Supabase foundation (Prompt 3)

SSR clients, environment validation, the Next.js proxy, and a profile migration now exist. See [Supabase setup](SUPABASE.md) for exact connection steps, role decisions, and offline tests. The service-role key is optional until admin operations exist. No remote is linked or migrated. Run npm test for environment security checks; SQL checks use a disposable local PostgreSQL container.
