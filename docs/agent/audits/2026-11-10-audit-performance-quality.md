# Audit 2026-11-10 — performance, engineering quality, release state (items 6–10)

Base: main `620472bc`. Measurements on the local preview (`mobocom-app`, Next 16 **dev** server, PostgreSQL 17, 28 CPUs, 11.5 GB for the VM).

A production build was **not** run. The dev server already uses 5.7 GB, and earlier local builds were stopped by WSL/Docker memory pressure, which would also take down the owner's preview and database. Numbers below that need a production build (minified CSS per route, FCP/LCP/CLS, throughput) are marked as such and remain operational checks.

## 6. Shared CSS — P1 — **confirmed by measurement, change deferred**

- `src/app/layout.tsx` imports **61 stylesheets**, about **1,757 KB raw / 350 KB gzip of source** (before minification), into every page. The earlier report's 289 KB is the minified build figure.

  | Stylesheet | Raw KB | Gzip KB |
  | --- | --- | --- |
  | `themes/generated.css` | 152 | 25 |
  | `media-design.css` | 151 | 28 |
  | `forum.css` | 131 | 22 |
  | `store-front.css` | 83 | 15 |
  | `forms-pro.css` | 61 | 12 |
  | `journal-design.css` | 60 | 12 |
  | `store-admin.css` | 59 | 11 |

  Admin-only files ship to public visitors: `store-admin.css`, `server-panel.css`, `invoice-desk.css`, `formbuilder.css`, `admin-uploads.css` and others.
- **Why not moved now:** `FRONTEND_QUALITY.md` records that a CSS import boundary alone is not enough (styles stay after client navigation, and shared portals use them). Moving a file needs:
  - per-file checks of which shells and portals use its selectors;
  - before/after Playwright screenshots across RTL, light/dark and themes;
  - a production build to measure the gain.

  A guessed move risks the approved design.
- **Plan (proposed slices):**
  1. Admin-only files (`store-admin`, `server-panel`, `invoice-desk`, `formbuilder`, `admin-uploads`) move to `src/app/admin/layout.tsx` after a selector-usage check. Expected about −140 KB raw per public page. Regression: `e2e/tests/admin-presentation.spec.ts` before/after navigation.
  2. Section bundles (forum, media, games/software portals, store) move to their section layouts, one section per PR, with screenshots and route CSS bytes from the build manifest.
  3. Measure CSS bytes, FCP, LCP and CLS on the production build before and after each slice.

## 7. Dynamic rendering, caching and server load — P1 — **confirmed by measurement, partly operational**

- Every page renders per request regardless of `force-dynamic` (469 route files). The root layout reads request headers (`x-nonce` for the per-request CSP nonce), cookies and the locale. Full-page static caching would defeat the nonce CSP, so the lever is data caching and the existing guest cache.
- **Database cost per warm request** (dev server; committed transactions on the app database, idle baseline ≈1):

  | Page | Transactions |
  | --- | --- |
  | `/` | ~104 |
  | `/products` | 91–108 |
  | `/blog` | ~64 |
  | `/login` | 4–15 |

  Table-scan breakdown of one anonymous home request: 58 scans. **`Setting` was read 14 times**, then `User` 7, `UserProfile` 7, `SoftwareTitle` 4, `CinemaTitle` 3.
- **Existing tool:** the guest page cache (`modules/performance`, Admin › performance) caches full HTML only for visitors without a session or cart, on listed public paths. Personal data, carts and permissions are never cached. It is **off** locally.

  | Load test 2026-11-02 (`LAUNCH_READINESS.md`, compiled build) | Result |
  | --- | --- |
  | Guest cache off | 56 pages/s; at 100 users p50 2.0 s |
  | Guest cache `balanced` | 600 pages/s; at 300 users p50 0.5 s |
- **Recommendation:**
  1. The owner turns the guest cache to `balanced` on production (setting only).
  2. Next code slice: find the 14 `Setting` reads per request (query logging around one request) and route them through the existing settings cache and invalidation (`getSettings`/`cached()`), with no new cache.
  3. Re-measure transactions and the load test on a production build.
- **Not run:** a load test on a production build; CPU per request.

## 8. Large files — P2 — **reviewed, no refactor**

| File | Lines | `any` |
| --- | --- | --- |
| `src/modules/media/server/admin.ts` | 958 | 2 |
| `src/app/admin/builder/inspector.tsx` | 736 | 0 |
| `src/app/admin/cms/MediaCrud.tsx` | 753 | 10 |
| `src/modules/forms/domain/forms.ts` | 675 | 0 |
| `src/modules/checkout/server/checkout.ts` | 631 | 0 |

No measurable benefit was shown for splitting these now. `checkout.ts` holds money and permission logic, which the brief forbids rewriting for tidiness. `media/server/admin.ts` lost its silent recount in #420. Candidate for later: typing the 10 `any` in `MediaCrud.tsx`, with React Doctor and a browser check of the media editors.

## 9. Tests and release state — P1 — **status recorded**

- **Hosted Checks:**
  - The last successful run was on `e60333c6` (2026-11-10 11:05). The run on `3cd657ec` (release 1.7.15) failed.
  - There is **no run on current main `620472bc`**. Workflows are manual-only by owner decision, so none was dispatched.
- **Local, this audit:**
  - `npm run test:site` in the dev container: 974–979 pass and 51–53 fail. Every failure is in one fixed set of installer/updater/bridge/proxy/Prisma-engine tests that need host tooling the dev container lacks (`curl`, the bridge and engine files). These are environment failures, identical on main. The dedicated check container (`mobocom-check`) no longer exists.
  - Each PR also ran its own unit tests, native PostgreSQL scripts, scoped `tsc` and `check-architecture.mjs` (see #419–#421).
- **Proposed light pre-merge control (owner decision, no workflow change made):**
  - Before a merge, run the manual Checks once on the PR head.
  - Locally, a PR touching auth, money or migrations runs its listed `*.connected.cjs` scripts and `release:migrations`.
  - Each PR body states the exact commit and environment of its evidence (as #419–#421 do).

## 10. Documentation and release readiness — P2 — **docs fixed, rest operational**

- **`docs/DEPENDENCY-AUDIT.md` was stale** (Next.js 15.5.25, React 19.2.8, "NextAuth blocks Next 16"). It now matches `package.json` and the installed packages: Next.js 16.4.6, React 19.3.1, NextAuth 4.24.15 (peer range includes `^16`), TypeScript 7.0.2, Prisma 5.22.0, Node 22.
- **Google migration:** `20270301120000_google_login` sorts after the last released migration (`20270228120000_variant_fx_markup`, release 1.7.15). It is listed in `unreleased`, and `release-migrations` reports OK (17 releases, 1 unreleased). It is additive and seals at the next release.
- **Still operational (cannot be closed from code):**
  - a real Google OAuth round trip with the owner's client, plus the root Xray helper re-applied for the `google` purpose on an Iranian server;
  - AI and Google egress checked separately (one passing proves nothing about the other);
  - backup/restore and application rollback rehearsal on the target (`LAUNCH_READINESS.md` item 3);
  - real payment, delivery and recovery paths with configured providers.
