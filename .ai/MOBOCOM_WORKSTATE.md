# MoboCom Work State

Goal: Complete the MoboCom 2.0 capability brief on `codex/mobocom-2`, then open and merge a GitHub PR.
Current milestone: Add helpful feedback to approved shared reviews.
Risk: R4 program; helpful votes are R3 because they add member-owned durable data and mutations.
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
- Paginated review UI and browser validation were committed and pushed through `199c7d3`.

In progress:
- Finish build and commit the helpful review vote slice.

Data/migrations:
- Both Prisma schemas contain `UserRecentView`. Migration `20261108120000_recent_views` was applied to the local Docker PostgreSQL database; production deployment remains pending.
- Both Prisma schemas contain `ItemReviewHelpful`. Migration `20261109120000_item_review_helpful` was applied locally; production deployment remains pending.

Validation actually run:
- For recent views: `schema:check`, `source:check`, `arch:check`, `security:check`, `typecheck`, `build:postgres`, connected and browser checks passed on the local port 3000 stack.
- For review read hardening: 9 focused tests, `typecheck`, `source:check`, `arch:check`, `security:check`, and `build:postgres` passed after the final code change.
- For review list pagination: `typecheck`, `source:check`, `arch:check`, and `build:postgres` passed; `typecheck` passed again after the final client state sync adjustment. Connected API and browser checks passed after a Docker restart, including dark visual inspection.
- For helpful votes: `schema:check`, `typecheck`, `source:check`, `arch:check`, `security:check`, `build:postgres`, local migration, connected API and browser checks passed.

Known blockers/failures:
- The local Next.js development server had transient long request delays; after restart, review API and browser tests passed. Production preview cannot run with the local HTTP URL because production correctly requires a public HTTPS hostname. Many capabilities remain incomplete. No PR exists yet.

Next concrete action:
- Stage only the helpful vote slice, inspect the staged diff, commit and push. Continue the capability map afterward.
