# MoboCom Work State

Goal: Complete the MoboCom 2.0 capability brief on `codex/mobocom-2`, then open and merge a GitHub PR.
Current milestone: Universal member library, followed by the next bounded platform slice.
Risk: R4 program; recent views are R3 because they add private durable data.
Owner/contracts: `content` owns published item references and recent views; specialist Music, Cinema, Games, paywall and reviews state stays with its existing owner. `dashboard/library` composes owner-scoped reads.

Decisions:
- Preserve the modular monolith, path-based public URLs, and the dark MoboCom visual identity.
- Reuse specialist records rather than replacing them with a generic list table.
- Keep private history scoped to the signed-in user and filter current publication state on reads.

Done (verified):
- Branch includes music directories, playlists/player/history/progress, collections, cinema progress/history, and account library feed through commit `6084265`.
- Recent views have a PostgreSQL migration, server write/read contract, authenticated API, shared detail tracker, private history page and library preview. Local connected and browser checks passed before this WorkState was written.

In progress:
- Review and commit the recent views slice; then continue the capability map.

Data/migrations:
- Both Prisma schemas contain `UserRecentView`. Migration `20261108120000_recent_views` was applied to the local Docker PostgreSQL database; production deployment remains pending.

Validation actually run:
- For recent views: `schema:check`, `source:check`, `arch:check`, `security:check`, `typecheck`, `build:postgres`, connected and browser checks passed on the local port 3000 stack.

Known blockers/failures:
- No current blocker. Many capabilities in `docs/MOBOCOM-2-CAPABILITY-MAP.md` remain incomplete. No PR exists yet.

Next concrete action:
- Stage only the recent views slice and WorkState, inspect the staged diff, commit and push; then select the next evidence-based vertical slice.
