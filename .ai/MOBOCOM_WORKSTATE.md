# MoboCom Work State

Goal: Complete the MoboCom 2.0 capability brief on `codex/mobocom-2`, then open and merge a GitHub PR.
Current milestone: Finish the account web-push preference slice, then continue the capability map.
Risk: R4 program; account push preference is R3 because it adds a User field and affects delivery.
Owner/contracts: `identity` owns account preferences; `push` owns web-push delivery; `notifications` owns the private inbox.

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
- Helpful shared review votes were committed and pushed as `7f69148`.
- Storefront approval filtering was committed and pushed as `fe4b83e`.
- Search publication guard was committed and pushed as `ab977bf`.
- Inbox concurrent dispatch dedupe was committed and pushed as `7602612`.

In progress:
- Review, commit and push the account web-push preference slice.

Data/migrations:
- Both Prisma schemas contain `UserRecentView`. Migration `20261108120000_recent_views` was applied to the local Docker PostgreSQL database; production deployment remains pending.
- Both Prisma schemas contain `ItemReviewHelpful`. Migration `20261109120000_item_review_helpful` was applied locally; production deployment remains pending.
- Both Prisma schemas now contain `User.pushAlerts`. Additive migration `20261110120000_push_alert_preference` was applied locally; production deployment remains pending.

Validation actually run:
- For recent views: `schema:check`, `source:check`, `arch:check`, `security:check`, `typecheck`, `build:postgres`, connected and browser checks passed on the local port 3000 stack.
- For review read hardening: 9 focused tests, `typecheck`, `source:check`, `arch:check`, `security:check`, and `build:postgres` passed after the final code change.
- For review list pagination: `typecheck`, `source:check`, `arch:check`, and `build:postgres` passed; `typecheck` passed again after the final client state sync adjustment. Connected API and browser checks passed after a Docker restart, including dark visual inspection.
- For helpful votes: `schema:check`, `typecheck`, `source:check`, `arch:check`, `security:check`, `build:postgres`, local migration, connected API and browser checks passed.
- For storefront publication: `typecheck`, `source:check`, `arch:check`, `build:postgres` and connected public listing/detail check passed.
- For search publication: `typecheck`, `source:check`, `arch:check`, `security:check`, `build:postgres` and connected stale-index test passed.
- For inbox idempotency: focused 20-request concurrent fanout test, `typecheck`, `source:check`, `arch:check`, `security:check`, and `build:postgres` passed.
- For push preference: `schema:check`, local PostgreSQL migration, focused preference test, `source:check`, `arch:check`, `security:check`, `build:postgres`, and an authenticated browser check on port 3000 passed. The browser check verified persisted opt-out across reloads and a dark page visually.

Known blockers/failures:
- The local Next.js development server had transient long request delays; after restart, review API and browser tests passed. Production preview cannot run with the local HTTP URL because production correctly requires a public HTTPS hostname. Many capabilities remain incomplete. No PR exists yet.

Next concrete action:
- Stage, inspect, commit and push only the push-preference slice. Then inspect the next bounded capability gap; do not open a PR until the 2.0 brief is complete.
