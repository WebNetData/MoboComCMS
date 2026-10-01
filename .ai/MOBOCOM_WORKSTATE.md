# MoboCom Work State

Goal: Complete the MoboCom 2.0 capability brief on `codex/mobocom-2`, then open and merge a GitHub PR.
Current milestone: Expose paginated shared reviews after hardening public review reads.
Risk: R4 program; public review API hardening is R3 and list UI is R2.
Owner/contracts: `reviews` owns rating and review state; `content` registry owns publication checks. Product feedback remains owned by `catalog`.

Decisions:
- Preserve the modular monolith, path-based public URLs, and the dark MoboCom visual identity.
- Reuse specialist records rather than replacing them with a generic list table.
- Keep private history scoped to the signed-in user and filter current publication state on reads.

Done (verified):
- Branch includes music directories, playlists/player/history/progress, collections, cinema progress/history, and account library feed through commit `6084265`.
- Recent views have a PostgreSQL migration, server write/read contract, authenticated API, shared detail tracker, private history page and library preview. Local connected and browser checks passed before this WorkState was written.
- Recent views were committed and pushed as `741b8e0`.
- Public review publication checks and bounded grouped ratings were committed and pushed as `727828f`.

In progress:
- Validate and commit the shared review list pagination UI.

Data/migrations:
- Both Prisma schemas contain `UserRecentView`. Migration `20261108120000_recent_views` was applied to the local Docker PostgreSQL database; production deployment remains pending.

Validation actually run:
- For recent views: `schema:check`, `source:check`, `arch:check`, `security:check`, `typecheck`, `build:postgres`, connected and browser checks passed on the local port 3000 stack.
- For review read hardening: 9 focused tests, `typecheck`, `source:check`, `arch:check`, `security:check`, and `build:postgres` passed after the final code change.
- For review list pagination: `typecheck`, `source:check`, `arch:check`, and `build:postgres` passed before a final client state sync adjustment; the affected type check will be rerun. Browser interaction has not been verified because the local development server has timed out.

Known blockers/failures:
- Local Next.js development requests are timing out; the connected review API test has not completed. Temporary seeded rows were removed. Production preview cannot run with the local HTTP URL because the production configuration correctly requires a public HTTPS hostname. Many capabilities remain incomplete. No PR exists yet.

Next concrete action:
- Validate review pagination, stage only its files, inspect the staged diff, commit and push. Recheck connected HTTP behavior when the local dev server responds.
