# MOBOCOM_MAP.md

Last verified revision: main `ee8f668` (2026-10-07, PRs through #116). Entries marked *(not re-verified)* were not opened in the sessions that wrote this file; check before relying on them.

Keep this file concise. Record only durable architecture facts that prevent repeated repository scans. Decisions and their reasons are in `docs/agent/PLATFORM_DECISIONS.md`; what each capability is and how it is verified is in `docs/agent/CAPABILITY_LEDGER.md`.

## Core
- **Stack:** Next.js 15 app router in `src/app`, domain code in `src/modules/<module>/{domain,server}`, shared infrastructure in `src/platform`, UI in `src/components`. Prisma with two schemas kept in parity: `prisma/schema.postgresql.prisma` (production, migrations in `prisma/migrations`) and `prisma/schema.prisma` (SQLite, no migration runner).
- **Module registry:** one manifest per plugin, `src/plugins/<id>/manifest.json` (id, `requires`, permissions, admin menu). `npm run extensions:generate` writes `src/extensions/generated/catalog.ts`. Stored and effective state (a module is off when something it requires is off): `src/extensions/server/state.ts`. Guards: `requireModule(id)` for pages, `moduleGuard(id)` / `whenModuleOn(id, handler)` for APIs, `isModuleEnabled(id)` for composing — all in `src/extensions/server/modules.ts`.
- **Settings registry:** `src/modules/settings/server` *(not re-verified)*; module settings through `getModuleSettings(id)`; forum settings in `src/modules/forum/server/community.ts` (`getForumSettings`), normalized by `normalizeForumSettings` in the forum domain.
- **Identity/AuthZ:** one `User`; `role` (`ADMIN` | `CUSTOMER`) and optional `roleId` → `Role.permissions` (comma-separated keys; `*` = everything). Staff without a role is full access. Keys and presets: `src/modules/identity/rbac.ts`. Request guards: `requireUser`, `requireAdmin`, `requirePerm` in `src/modules/identity/server/access.ts`; `adminGuard(req, moduleId, anyOfPermissions)` in `server/admin-guard.ts`. Who may change a staff account: `server/staff-guard.ts`. Section managers: `domain/sections.ts`, `server/section-managers.ts`. Public identity (username, follow, block, privacy): `server/profile.ts`, `domain/profile.ts`.
- **Event/outbox/jobs:** background queue and schedulers under `src/modules/notifications/server` (`jobs-scheduler.ts`) and per-module `server/jobs.ts`; content change events `src/modules/content/server/events.ts` *(not re-verified beyond these names)*.
- **Search/notifications/media:** search `src/modules/search/server/search.ts`; inbox notifications `src/modules/notifications/server/inbox.ts` (`createInboxEvent`), which sections an event belongs to in `notifications/domain/event-modules.ts`; shared media library and its admin API `src/modules/media/server/admin.ts` (per-type `perms`); picture upload `src/modules/site/server/http/admin/media/route.ts`; content item cards for any type `src/modules/content/server/registry.ts` (`itemCard`, `itemCards`).
- **Moderation overview:** `src/modules/moderation/domain/queue.ts` (`QUEUE_SOURCES`), each owner module exports `waitingForModeration(take)`.
- **Audit:** `auditAdmin({ req, actor, action, targetType, targetId, metadata })` in `src/platform/audit/server.ts`.
- **Extension/theme registry:** `src/extensions/{client,sdk,server}`, themes in `src/themes` *(not re-verified)*.
- **Public/mobile API:** `src/modules/public-api/server` *(not re-verified)*.
- **Tests/release commands:**
  - `npx tsc --noEmit -p tsconfig.json`; `npm run arch:check | source:check | schema:check | security:check | i18n:check`.
  - `npm run test:site` — unit suites `scripts/*.test.cjs` (run on Linux: some shell out to `sh`).
  - `npm run test:pg` — connected PostgreSQL checks `scripts/*.connected.cjs`, listed in `scripts/run-pg-checks.cjs` (46 at this revision).
  - `npm run integrity:report` — read-only findings on live data (`docs/INTEGRITY-REPORT.md`).
  - `npm run test:e2e` — Playwright specs in `e2e/tests`; GitHub workflow "Browser tests" runs on pull requests.
  - `npm run check` — the full gate; `npm run build:postgres` — production build; `npm run deploy:migrate` — apply migrations.
- **Local run:** `docker compose -f docker-compose.local.yml up -d` (app 3000, PostgreSQL 127.0.0.1:5435); `scripts/local-dev-start.sh` copies the tree into the container, so restart the app container after each change.

## Modules
| Module | Root | Canonical entities | Public contract | Notes |
|---|---|---|---|---|
| identity | `src/modules/identity` | `User`, `Role`, `UserProfile`, `UserFollow`, `UserBlock`, `AccessRestriction` (main schema) | `/api/me`, `/api/admin/users`, `/api/admin/roles`, `/api/admin/section-managers`, `/api/people/<username>/follow` (served by community) | One identity for every module. Follow/block and profile privacy are owned here. Global authentication and former raw-token HTTP consumers extend the existing guards; [bounded fresh-main evidence](audits/2026-10-11-current-account-consumers.md). Wider restriction workflow/rollout remains PARTIAL. |
| forum | `src/modules/forum` | `ForumCategory` (3 levels), `ForumThread`, `ForumPost`, `ForumReaction`, `ForumGroup`(+`Member`), `ForumCategoryPermission`, `ForumCategoryModerator`, `ForumProfile`, `ForumBadge` | `/api/forum/*` (handlers in `server/http/public.ts`), `/api/admin/forum` | Viewer = `viewerFor(userId)`; access = `categoryAccess` + `inCategory`. Pages listed in PLATFORM_DECISIONS §6. |
| community | `src/modules/community` | `CommunityPost`, comments, reports | `/api/people/*`, `/feed`, `/u/<username>` | The feed. Its profile parts are reused by the forum profile (`server/pages/profile-social.tsx`). |
| reviews | `src/modules/reviews` | `ItemReview`, `ItemReviewScore`, `ItemFavorite`, `ItemStat` | `/api/engage/*`, `/api/admin/reviews` | `recentReviews` feeds the forum's activity stream. |
| journal (magazine) | `src/modules/journal`, posts in `src/modules/site` | `Post`, `PostCategory`, `Comment`, `PostItemLink` | `/api/admin/cms?type=posts|postcats`, `/api/admin/comments` | Permission `cms.posts` only. |
| music / cinema / games / software | `src/modules/<name>`, shared `src/modules/media` | `MusicArtist/Album/Track/Playlist`, `CinemaTitle/Season/Episode`, `GameTitle`, `SoftwareTitle` | `/api/admin/media-library?type=…`, `/api/admin/<name>/*`, `/api/admin/taxonomy?tax=…` | Each its own `<name>.manage`. Cinema: episode calendar and air alerts. Music is filed two ways: albums under `music` categories, songs under `music-language`. |
| taxonomy | `src/modules/taxonomy` | `TaxonomyTerm`, `TaxonomyAssignment` | `/api/admin/taxonomy?tax=software|games|music|music-language|cinema` | One tree per taxonomy; one kind of item per taxonomy. Menus read in-menu terms (`navigation/server/megamenu.ts`). |
| store / catalog / orders / checkout / fulfillment | `src/modules/{store,catalog,orders,checkout,fulfillment}` | `Product`, `ProductDigitalCode`, `Order`, cart models | `/api/admin/cms?type=products`, `/api/admin/store/*` | Digital codes are delivered by the worker step `codeStock`; needs `STORE_DELIVERY_KEY`. |
| moderation | `src/modules/moderation` | none of its own | `/api/admin/moderation` | A view over what owner modules report as waiting. |
| vpn, reseller, marketplace | `src/modules/{providers,reseller,marketplace}`, plugins `vpn`, `reseller`, `marketplace` | — | — | Set aside by the owner; switchable off without data loss. |

## Protected UI
Preserve and enhance; do not redesign. The forum is **not** on this list.
- Homepage: `src/app/page.tsx` and the active theme's homepage blocks.
- Magazine: `/blog`, `/blog/<slug>` (`src/modules/site/server/pages/blog`), `src/app/journal-design.css`, `journal-liona.css`.
- Music: `/music/*`, `src/app/media-design.css`, the global player.
- Games: `/games/*`, `src/app/games-portal.css`.
- Movies and TV Series: `/cinema/*`, `src/app/media-design.css`.
The staff-only manage bar on these pages is not part of their public look.
