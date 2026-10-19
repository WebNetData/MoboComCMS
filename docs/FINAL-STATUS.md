# MoboComCMS Platform Refactor — Final Status

Date: 2026-09-20

This revision is the long-term platform foundation for MoboComCMS. The application is a modular monolith: Core business rules live behind module boundaries, Next.js App Router is delivery/composition, and plugins/themes depend on stable SDK contracts rather than private Core files.

## Implemented platform foundation

- Modular boundaries under `src/modules`, `src/platform` and `src/shared`; legacy `src/lib` is compatibility-only.
- App Router is database-free. Legacy DB-coupled route/page entry files were moved behind module-owned adapters and architecture checks reject new direct DB access from `src/app`.
- Exact-money primitives and integer minor-unit authoritative fields with explicit currency propagation; allowlisted Float fields remain compatibility mirrors only.
- Atomic multi-currency wallet operations, idempotent checkout/payment/renewal/reseller flows, webhook inbox claims, inventory reservations and retryable durable fulfillment jobs.
- PostgreSQL parity schema plus precision-safe SQLite snapshot export/import with row-count and canonical digest verification.
- Generated extension registries with manifest validation, Core compatibility checks and runtime activation/settings independent of Site Studio.
- Plugin SDK for namespaced API routes, typed events, durable jobs, settings, permissions, admin navigation and bounded KV storage.
- Extension RBAC merged into Core role management; server-side authorization remains authoritative.
- Stable UI slots plus trusted code-theme contracts for Header/Footer/Home with Core fallback and child-theme-style `extends` support.
- Central locale contracts. Persian and English dictionaries ship now; additional launch-market dictionaries are separate content work.
- Global request/correlation IDs through middleware and JSON structured logging with secret redaction.
- Append-only privileged admin audit trail with actor, target, request ID, source IP and sanitized metadata. `audit.view` gates the admin viewer.
- Production-safe seed behavior: no predictable credentials; demo identities/financial data require explicit `SEED_DEMO_DATA=true`.
- Security/money/audit/source/schema/architecture guards are part of the release check.

## PostgreSQL cutover rehearsal (2026-09-22)

The SQLite → PostgreSQL path was executed end to end against the local Docker
database (`deploy/compose.postgres.yml`, PostgreSQL 17 on `127.0.0.1:5434`):

1. `docker compose --env-file deploy/.env.postgres -f deploy/compose.postgres.yml up -d --wait`
2. `npm run db:migrate:postgres` — baseline applied to the empty target.
3. `npm run db:export:sqlite` — 136 rows across 37 models, snapshot SHA-256 emitted.
4. `npm run db:generate:postgres` then `npm run db:import:postgres` — importer reported
   “row counts and canonical digests match”.
5. Application restarted with `DATABASE_URL` pointing at PostgreSQL; catalog, plans,
   blog and admin pages all served from PostgreSQL.

Two defects found on this path were fixed:

- `scripts/import-postgresql-snapshot.mjs`: `pg_get_serial_sequence()` parses its text
  argument as an SQL identifier, so CamelCase tables (`"AuditLog"`) must be passed
  quoted; the sequence reset failed for every table before the fix.
- `scripts/backup-worker.cjs`: sqlite/unconfigured deployments printed a generic
  `BACKUP_WORKER_FAILED`; the specific code (`POSTGRES_REQUIRED`, …) is now surfaced.

Backup/restore was then verified against the live PostgreSQL database: a forced
worker run produced an encrypted dump (129 KB) with a passing automatic restore test
(`counts [3,16,3]`), and an in-place restore of that dump reverted a deliberately
inserted test row, created the pre-restore safety snapshot and kept the application
serving requests. Details: `docs/POSTGRESQL-BACKUPS.md`.

## Security hardening revision (2026-09-21)

A follow-up hardening pass closed the findings of an independent code audit:

- Global security headers from `src/proxy.ts` (CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, production-only `HSTS`); `/miniapp` keeps a Telegram-compatible frame policy.
- Same-site `Origin` enforcement for state-changing `/api/*` requests (webhook/telegram/internal/auth routes exempt because they authenticate with signatures or secrets).
- Shared bounded rate limiter (`src/platform/http/rate-limit.ts`) with proxy-aware client IP: login 30/10min per IP and 8/10min per account+IP, registration 5/hour per IP, forms 5/min, public API 120/min per key, Happ subscription 20/min, manual sync 10/min.
- Password policy raised to 8–128 characters (server + both client forms); profile name/phone/avatar inputs are length- and format-validated.
- API keys are stored as SHA-256 hashes, `?api_key=` is rejected, and pre-existing plaintext keys migrate on first successful use.
- SSRF guard in `src/modules/subscriptions/domain/subscription-content.ts`: loopback, private, CGNAT, link-local/metadata, `.internal`/`.local` hosts, credential-bearing URLs and IPv6 equivalents are refused.
- Subscription sync is throttled to rows older than 5 minutes (max 10 per request) instead of syncing every row on every dashboard load.
- Panel/gateway failure details stay in server logs; clients receive generic messages.
- Plisio webhook signature comparison is constant-time.
- SQLite connections enable WAL journaling and a 5s busy timeout.
- Client idempotency keys no longer fall back to `Math.random()` (`src/shared/security/idempotency.ts`).
- New regression tests in `scripts/connected.test.cjs` cover the SSRF blocklist, the shared limiter and the idempotency-key helper.
- The Telegram mini app shell (`src/app/miniapp/miniapp.css`) is fully token-driven again: surfaces, borders, text, accent and radii come from the site design tokens, so the Studio-selected design and the light/dark switch apply without extra work. The Telegram client chrome (header/background/bottom bar) is mirrored with `setHeaderColor`/`setBackgroundColor`/`setBottomBarColor` and refreshed on Telegram's `themeChanged` event.

## Local validation completed

The following checks pass in the supplied tree:

```text
extensions:generate       PASS — 2 plugins, 1 code theme
arch:check                PASS
source:check              PASS — 331 TS/TSX files parsed and internal aliases resolved
schema parity             PASS — SQLite/PostgreSQL model parity
money schema guard        PASS — legacy Float fields only on explicit allowlist
money primitive tests     PASS
money UI guard            PASS
security guard            PASS
audit/observability guard PASS
i18n audit                PASS — 590 used keys; 735/735 keys in en/fa; no missing keys
site regression tests     PASS — 8/8
connected regression      PASS — 7/7
money reconciliation      PASS — 0 errors, 1 historical warning
SQLite snapshot export    PASS — 164 rows across 34 tables; canonical snapshot checksum emitted
```

The one reconciliation warning is historical: user `9`, USD wallet account `5000` minor units, has no matching legacy `WalletTx` history. It is intentionally not auto-repaired because rewriting historical accounting data without an authoritative source is unsafe. Reconcile/document it before production cutover.

## Dependency-backed validation

The matching `package-lock.json` is committed. A clean `npm ci`, the full release
check (including TypeScript and backup tests), and the PostgreSQL production build
passed on 2026-09-22. Generated `node_modules` and `.next` output remain excluded
from release archives.

Repeat these checks before every deployment:

```bash
npm ci
npm run release:check
npm run build
```

For the PostgreSQL production build after cutover:

```bash
npm run build:postgres
```

See `docs/POSTGRESQL-CUTOVER.md`.

## Remaining production launch work

These are operational/release tasks, not hidden architecture debt:

1. Rehearse SQLite -> PostgreSQL cutover against a recent production-sized copy and require reconciliation/import digest verification to pass.
2. Resolve/document the single historical wallet-ledger warning before the authoritative cutover.
3. Remove legacy Float mirrors only after PostgreSQL is authoritative and reconciled for an agreed observation period.
4. Send structured JSON logs to a durable log/alerting backend; add service-level metrics/tracing/alerts for settlement, webhook, provider and fulfillment failures.
5. Move uploaded/media assets to object storage before multi-instance deployment.
6. Run dependency/framework upgrades as a separate tested release rather than combining them with the financial DB cutover.
7. Add locale dictionaries, localized legal/content/SEO rules and launch-market payment/regulatory configuration for each target region.

## Extension safety model

MoboComCMS deliberately does not execute arbitrary JavaScript uploaded from the admin panel. Code plugins/themes are trusted build/deploy artifacts. Runtime activation and settings remain admin-controlled. This preserves WordPress-like extensibility without turning a ZIP upload endpoint into remote-code execution.
