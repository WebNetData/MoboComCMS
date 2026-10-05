# MoboComCMS Release Checklist

## Required CI gate

With dependencies available:

```bash
npm ci
npm run release:check
npm run build
```

`release:check` regenerates extension/theme registries and runs architecture, source, Prisma parity, money schema/primitives/UI, security, audit/observability, i18n, connected regression, Site Studio and TypeScript checks.

Do not deploy if any gate fails.

## PostgreSQL behaviour gate

`release:check` runs without a database. The cart, checkout cleanup, stock holds, payment reconciliation selection, club points, abandoned-cart reminders, newsletter sending, background queue, announcement queue and source-trace cleaning are checked against a real PostgreSQL database by:

```bash
DATABASE_URL=postgresql://… npm run test:pg          # all checks
DATABASE_URL=postgresql://… npm run test:pg -- cart-merge-cap queue-jobs   # selected ones
```

Run it against a development or staging database, never production: each check creates its own namespaced rows and deletes them, and replaces e-mail, SMS, payment-provider and social channels with test doubles, but the cart-reminder, club-points, reconciliation, queue and scrub checks call jobs that are global, and they rely on test-only scoping to leave other rows alone.

On Windows the shell-based updater tests in `test:site` cannot run; the Linux run is the applicable one (`docker run --rm -v "$PWD:/app:ro" --tmpfs /tmp:exec -w /app node:24-bookworm npm run test:site`).

## Integrity report

`npm run integrity:report` is read-only and lists records that need a business decision (an order refunded for more than its total, duplicate gift cards, unpaid referral rewards, unrecorded seller sales, accounts provisioned for the wrong user and so on); see `docs/INTEGRITY-REPORT.md`. Run it against production after the release that introduces it and whenever one of the recovery steps of the order worker reports failures. A non-empty report does not block a release by itself; each finding says what happens automatically and what does not.

## Database / financial gate

Before a production database cutover:

```bash
python3 scripts/migrate-sqlite-exact-money.py prisma/dev.db
python3 scripts/migrate-platform-audit.py prisma/dev.db
python3 scripts/reconcile-money-sqlite.py prisma/dev.db
npm run schema:check
python3 scripts/export-sqlite-snapshot.py prisma/dev.db var/sqlite-export.json
```

Any reconciliation **error** blocks release. Historical warnings must be understood and documented before migration.

Follow `docs/POSTGRESQL-CUTOVER.md` for the full rehearsal/import/rollback sequence. Never use `prisma db push` as an ongoing production migration strategy after PostgreSQL becomes authoritative.

## Production seed safety

- Set `ADMIN_EMAIL` and preferably `ADMIN_PASSWORD` through secret storage before first seed.
- Keep `SEED_DEMO_DATA=false` in production.
- If no initial `ADMIN_PASSWORD` is provided on a new database, the seed generates a strong random password and prints it once; store/rotate it immediately.
- Never copy the bundled development SQLite database into production as the authoritative customer database.

## Extension/theme gate

- `npm run extensions:generate` passes.
- Every code plugin/theme declares a valid version and `requiresCore` range.
- No generated registry is hand-edited.
- Plugin/theme packages import only approved SDK/contracts, not Prisma/Core internals.
- New extension permissions are namespaced and enforced server-side.
- Secret settings are not exposed to public/client contexts.
- Long-running extension work uses durable jobs, not request lifecycle callbacks.

## Security / audit gate

- `NEXTAUTH_SECRET` is unique and present in production.
- `INTERNAL_JOBS_SECRET` is unique and present.
- Payment/webhook/provider credentials come from environment/secret storage.
- `npm run security:check` and `npm run audit:check` pass.
- The system admin role includes `audit.view`; support/accountant roles receive it only by explicit policy.
- Audit metadata contains no passwords/tokens/secrets; verify a privileged mutation appears in `/admin/audit` with its request ID.

## Hardening gates added in this revision

- Global security headers (CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, production `HSTS`) are served by `src/middleware.ts`; verify them with `curl -I https://<host>/`.
- Cross-site guard: state-changing `/api/*` calls must carry a same-site `Origin` (exempt: `/api/auth/*`, `/api/payment/*`, `/api/telegram/*`, `/api/internal/*`). Confirm a real browser flow (checkout, wallet top-up, admin save) still succeeds after a deploy.
- Login/registration are throttled per IP (login 30/10min, per account+IP 8/10min, registration 5/hour). If the site is behind a proxy, make sure the proxy appends (not replaces) `x-forwarded-for`.
- Passwords: minimum 8 characters. Re-check any custom client-side onboarding text.
- API keys are stored as SHA-256 hashes; `?api_key=` is rejected. Legacy plaintext keys migrate automatically on first successful use — confirm the API playground works, then rotate any key that was ever shared in a URL.
- Panel config fetch blocks loopback/private/metadata hosts (SSRF). If a legitimate panel lives on a private network, it must be reachable through a public hostname or the adapter API.
- Subscription sync is throttled (stale > 5 minutes, max 10 rows per request); admins can still force a sync with the per-subscription action.
- Internal panel/gateway errors are logged server-side only; make sure log aggregation is in place before launch.
- SQLite runs in WAL mode with a 5s busy timeout; for multi-instance or high-write production traffic use PostgreSQL (`docs/POSTGRESQL-CUTOVER.md`).
- In-memory rate limits are per-process guard rails. Put a shared limiter (Redis/edge WAF) in front before horizontal scaling.

## Operational gate

- Fulfillment worker invocation is scheduled and monitored.
- `x-request-id` is preserved by the reverse proxy/load balancer where possible.
- Structured JSON logs are shipped off-host with retention and alerts.
- Alert on repeated `fulfillment.failed`, payment/webhook settlement failures and provider degradation.
- Backups are restore-tested, not merely configured.
- Upload/media storage is shared/object storage before horizontal scaling.
- Health/smoke tests cover login, catalog, wallet, checkout, webhook inbox, fulfillment and admin audit access.
