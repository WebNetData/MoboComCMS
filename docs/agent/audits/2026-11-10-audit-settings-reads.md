# Audit 2026-11-10 — repeated Setting reads (owner item 3, conditional approval)

Owner condition: "Review the 14 settings reads but move only the safe ones to the existing cache. Security settings, permissions, secrets and sensitive data must not cause problems through an invalid or expired cache. Write tests for invalidation and concurrent requests."

## Evidence (before)

- The dev server's PostgreSQL logged every statement for a single warmed request (`log_statement=all` for a few seconds through a config reload, then reset to `none`; no restart and no data change).
- One home request made **15 Setting queries** (Prisma batches some `findUnique` calls into one `IN` query, so there were more logical reads):

| Read | Times per home request | Owner | Kind |
|---|---|---|---|
| Extension runtime, 40 module states + `storeEnabled` + `site.config.v1` | **5** | `extensions/server/state.ts` | decides which sections are open |
| `theme.templates.v1` | 3 (one batched) | `site/server/theme-index.ts`, `theme-templates.ts` | presentation |
| `storeEnabled` | 2 | `catalog/server/storefront.ts` | feature switch |
| `publicApiEnabled` | 2 | `public-api/server/availability.ts` | feature switch |
| `site.config.v1`, `seo.config.v1` | 1 each | already React `cache` | presentation |
| `site.code.v1`, `site.megamenu.v1`, `site.trust-seals.v1`, `page.builder.home`, `packages.index.v1`, `forwarder.v1` | 1 each | their owners | presentation / policy |
| `extension.forwarder.state.v1` + `site.config.v1` | 1 | forwarder policy (strict read) | policy |
| `telegramBotToken`, `telegramWebhookSecret`, `telegramBotUsername`, … | 1 | `notifications/server/telegram.ts` | **secret** |

## Decision

- **Safe, and moved:** the repeated reads within one render, now shared through React `cache`:
  - which reads: the extension runtime rows, the theme index row, `storeEnabled`, `publicApiEnabled`;
  - the scope ends with the request, so a save is seen by the next request without an invalidation step;
  - each caller parses its own copy of the shared rows;
  - transactions and code without a render scope (API route handlers, jobs) read fresh, so the public API's gate and every write path are unchanged.
- **Not moved to the 30-second shared cache (`cached('settings:…')`):**
  - their saves (section history, theme index transaction, mega-menu) do not drop `settings:`, so Admin would see stale values for up to 30 s, and longer on other instances without Redis;
  - the extension runtime opens and closes sections, so it must never lag a save.
- **Never cached:** Telegram's token and webhook secret, the security policy, permissions.
- **Possible follow-up (not done):** the home page reads Telegram's token and webhook secret only to show the bot link. A read of the public fields alone would keep the secrets out of the public render. Nothing is leaked today; the values stay on the server.

## Results (after, same method)

| Page | Setting queries | All statements |
|---|---|---|
| `/` | 16 → 10 | 57 → 48 |
| `/products` | 16 → 10 | 62 → 56 |
| `/blog` | 15 → 10 | 47 → 42 |
| `/software` | 17 → 10 | 64 → 56 |
| `/login` | 12 → 10 | 12 → 10 |

## Tests

- `scripts/settings-request-dedupe.test.cjs`: 6/6.
  - The request scope is modelled with `AsyncLocalStorage`, as Next scopes a render.
  - Covered: one read per render for five concurrent callers; no shared mutable result; secrets absent from the public runtime; a save seen by the next request; overlapping requests each consistent, with a save between them reaching only the later one; transactions and route handlers read fresh; a failed read closes modules for that request only.
  - With the request cache turned off the test fails (negative control: 5 of 6 fail).
- On a temporary migrated database (`mobocom_qa_dedupe_20261110`, dropped afterwards):
  - `connected.test.cjs` 53/53;
  - `extension-state`, `extension-state-integrity`, `module-availability` and `content-management` connected checks passed.
- Unit tests: `content-controls` 99, `media-admin` 34, `journal-item-links` 10, `frequently-bought` 3, `scale` 9 — all passed.
- Scoped `tsc` (changed files plus the layout, mega-menu and homepage settings) is clean; `arch:check` and `source:check` pass.
- **Not run:** a production build (owner: GitHub Actions or an isolated environment only), and a browser pass beyond HTTP 200 on the measured pages.
