# MoboCom Work State

Goal: Complete the MoboCom 2.0 capability brief on `codex/mobocom-2`, then open and merge a GitHub PR.
Current milestone: Inspect Software release history and version-notification semantics before a new vertical slice.
Risk: R4 program; a Software release-history slice will be R3/R4 because it touches durable data, protected links, admin editing and scheduled publication.
Owner/contracts: `software` owns release/version semantics; `media` owns protected links and the generic CMS save; `notifications` owns the inbox.

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
- Account web-push preference was committed and pushed as `b4d3a6d`.
- Private unread inbox view was committed and pushed as `a82fa06`.
- Per-event SMS, email and browser-push preferences, with an SDS-aligned responsive dashboard matrix, were committed and pushed as `ac8ffbd`.
- The notification inbox now uses the same SDS-based dashboard composition, with compact activity rows and clear loading/empty states; committed and pushed as `6d1e040`.
- The account library overview now uses SDS-token cards, semantic icons, a balanced three-column desktop grid and responsive dark/light layouts; committed and pushed as `744179f`.
- The Store variant picker now aligns option availability with actual selection and preserves contextual sold-out combinations; committed and pushed as `1d0e42e`.
- Store stock alerts now gate on publication and variant availability, persist the deduplicated inbox event before marking the alert, and retry failures; committed and pushed as `707bcbe`.
- The private recently viewed page now uses a responsive SDS-token account composition in dark and light themes; committed and pushed as `71ca5ca`.
- The full project validation contract tests were refreshed and pushed as `887c721`.
- Public forum topic tracking into recent history was verified and pushed as `f8f9fff`.
- Durable notification delivery was verified and pushed as `36ffbf0`.
- Scheduled game update publication and direct download gates were verified and pushed as `991fadc`.
- Scheduled game update follower notices and their additive migration were verified and pushed as `baff9a1`.

In progress:
- Repository inspection found Software has only a current `version` and `changelog`, with no release history. `contentChanged` sends version notices through a best-effort hook; it does not check future `publishedAt` for Software. A safe next slice needs a release record, public/download gates and a durable release cursor together. No Software behavior has been changed yet.

Data/migrations:
- Both Prisma schemas contain `UserRecentView`. Migration `20261108120000_recent_views` was applied to the local Docker PostgreSQL database; production deployment remains pending.
- Both Prisma schemas contain `ItemReviewHelpful`. Migration `20261109120000_item_review_helpful` was applied locally; production deployment remains pending.
- Both Prisma schemas now contain `User.pushAlerts`. Additive migration `20261110120000_push_alert_preference` was applied locally; production deployment remains pending.
- Both Prisma schemas contain `UserNotificationMute`. Additive migration `20261111120000_notification_event_mutes` is applied to the local Docker PostgreSQL database; production deployment remains pending.
- Both Prisma schemas now contain `GameUpdateReleaseNotification`. Additive migration `20261112120000_game_update_release_notifications` is applied locally; production deployment remains pending. It backfills only future game updates, avoiding surprise notices for old releases.

Validation actually run:
- For recent views: `schema:check`, `source:check`, `arch:check`, `security:check`, `typecheck`, `build:postgres`, connected and browser checks passed on the local port 3000 stack.
- For review read hardening: 9 focused tests, `typecheck`, `source:check`, `arch:check`, `security:check`, and `build:postgres` passed after the final code change.
- For review list pagination: `typecheck`, `source:check`, `arch:check`, and `build:postgres` passed; `typecheck` passed again after the final client state sync adjustment. Connected API and browser checks passed after a Docker restart, including dark visual inspection.
- For helpful votes: `schema:check`, `typecheck`, `source:check`, `arch:check`, `security:check`, `build:postgres`, local migration, connected API and browser checks passed.
- For storefront publication: `typecheck`, `source:check`, `arch:check`, `build:postgres` and connected public listing/detail check passed.
- For search publication: `typecheck`, `source:check`, `arch:check`, `security:check`, `build:postgres` and connected stale-index test passed.
- For inbox idempotency: focused 20-request concurrent fanout test, `typecheck`, `source:check`, `arch:check`, `security:check`, and `build:postgres` passed.
- For push preference: `schema:check`, local PostgreSQL migration, focused preference test, `source:check`, `arch:check`, `security:check`, `build:postgres`, and an authenticated browser check on port 3000 passed. The browser check verified persisted opt-out across reloads and a dark page visually.
- For unread inbox: `typecheck`, `source:check`, `arch:check`, `security:check`, and browser check on port 3000 passed. The browser check verified 34 unread items across pages, read actions, immediate badge refresh, and the dark empty view. PostgreSQL build passed after the final code change.
- For per-event notification preferences: `schema:check`, `typecheck`, `source:check`, `arch:check`, `security:check`, focused push gate test, authenticated browser persistence/owner-scope/validation test, and `build:postgres` passed. Visual inspection covered dark desktop/tablet/mobile and light mobile; overflow checks passed at 1440, 768, 390 and 360 pixels. The deployment is Persian-only, so English LTR was not browser-tested.
- For inbox visual polish: `typecheck`, `source:check`, and the existing authenticated browser behavior test passed after the change. The browser test covered 34 unread items, paging, mark-read actions, dark desktop/mobile, light mobile, and horizontal overflow at 360, 390, 768 and 1440 pixels. The first visual attempt used stale development CSS; restarting the app and rerunning the test confirmed the final result.
- For library visual polish: `typecheck`, `source:check`, `arch:check` and the authenticated library feed browser check passed. The browser check verified recent playlist/collection items, dark desktop/mobile, light mobile, and no horizontal overflow at 360, 390, 768 or 1440 pixels. Final screenshots were inspected after the balanced desktop grid change.
- For Store variant selection: focused domain test, `typecheck`, `source:check`, `arch:check`, `security:check` and `build:postgres` passed. A local browser product check verified contextual sold-out state, fallback to an available combination, restored purchase state, dark desktop/mobile layout and mobile width after final CSS. Final mobile screenshot was inspected.
- For Store stock alerts: focused domain and simulated failure/retry/concurrent tests, `typecheck`, `source:check`, `arch:check`, `security:check` and `build:postgres` passed. A connected local PostgreSQL check verified pending approval, zero stock, failed inbox write retry, one persisted event and one final marker.
- For recent-history UI: `typecheck`, `source:check`, `arch:check`, `build:postgres` and authenticated browser check passed. The browser check covered item tracking, long mixed-script title, destructive clear action, dark desktop/mobile, light mobile and empty state, and no horizontal overflow at 360, 390, 768 and 1440 pixels. Screenshots were inspected.
- Full `npm run check` passed with Git Bash ahead of the Windows WSL stub on PATH. The first attempt exposed two stale source-contract tests: media now has five paywall-gated paths, and inbox PATCH returns the owner-scoped unread count. Their targeted tests and the full check passed after updating the assertions. Recent-history browser QA passed again after the committed layout.
- For forum recent views: `typecheck`, `source:check`, `arch:check`, `security:check`, `build:postgres` and authenticated browser test passed. The test verified a public listed topic is recorded and shown in private history, while a restricted topic visible to staff is rejected by the shared registry.
- For durable notification delivery: focused concurrent/rollback/provider-failure test and local PostgreSQL queue check passed. Full `npm run check` passed with Git Bash ahead of the WSL stub, and `build:postgres` passed.
- For scheduled game updates: `typecheck`, `source:check`, `arch:check`, `security:check`, 24 nearby tests, full `npm run check`, `build:postgres` and a local PostgreSQL/API check passed. The connected check verified a future update and its version are absent from rendered game content, its direct file link returns 404, the due update becomes visible without a deploy, and a future parent publication closes the link. The first connected attempt exposed Next dev script traces and a stale dev cache; rendered-content assertions and a restart resolved those test conditions.
- For game release notices: schema parity, both Prisma validations, local PostgreSQL migration, TypeScript check, full `npm run check`, `build:postgres` and a connected worker check passed. The worker check covered future and draft gates, opted-out and late followers, dedupe collision retry, cursor progress and independent channel job creation.

Known blockers/failures:
- The local Next.js development server had transient long request delays; after restart, review API and browser tests passed. Production preview cannot run with the local HTTP URL because production correctly requires a public HTTPS hostname. Many capabilities remain incomplete. No PR exists yet.

Next concrete action:
- Design and implement the smallest complete Software version-history path with scheduled publication and link gating, then connect release notices. Do not open a PR until the 2.0 brief is complete.
