# PostgreSQL Cutover Runbook

HappVPN keeps SQLite for local/single-node development and ships a schema-parity PostgreSQL definition for production cutover. Financial source-of-truth fields use integer minor units; legacy Float columns are compatibility mirrors only.

## Preconditions

- Take an immutable SQLite backup and record its checksum.
- Freeze writes for the final cutover window.
- Run every local release guard and money reconciliation.
- Resolve every reconciliation **error**. Warnings need an explicit operator decision and ticket/record.
- Target PostgreSQL must be empty for the snapshot importer.

```bash
python3 scripts/migrate-sqlite-exact-money.py prisma/dev.db
python3 scripts/migrate-platform-audit.py prisma/dev.db
python3 scripts/reconcile-money-sqlite.py prisma/dev.db
npm run schema:check
python3 scripts/export-sqlite-snapshot.py prisma/dev.db var/sqlite-export.json
```

Without Python (Windows-friendly), the Node twin exports the same
`happvpn-sqlite-snapshot-v1` payload — run it **while the SQLite Prisma client is
still generated**, before `db:generate:postgres`:

```bash
npm run db:export:sqlite
```

## Rehearsal / target preparation

Use a disposable PostgreSQL database first. Apply the committed PostgreSQL migrations to the empty target with migrate deploy. See POSTGRESQL-BACKUPS.md for Docker, encrypted backup scheduling and safe recovery.

```bash
export DATABASE_URL='postgresql://...'
npm run db:migrate:postgres
npm run db:generate:postgres
node scripts/import-postgresql-snapshot.mjs var/sqlite-export.json
```

The importer refuses a non-empty target, preserves integer precision, resets autoincrement sequences, then verifies both row counts and canonical table digests.

## Application cutover

Build the application with the PostgreSQL Prisma client, not the default SQLite development client:

```bash
export DATABASE_URL='postgresql://...'
npm ci
npm run release:check
npm run build:postgres
```

Run a smoke test against a staging copy before routing production traffic. At minimum verify login, plan/catalog reads, wallet balances in each currency, invoice reads, an idempotent test checkout, webhook inbox recording, fulfillment worker execution and admin audit-log access.

## Final cutover sequence

1. Enable maintenance/write freeze.
2. Stop background fulfillment/webhook consumers that can mutate SQLite.
3. Take the final SQLite backup and checksum.
4. Run reconciliation again; any error aborts cutover.
5. Export the final snapshot.
6. Recreate/empty the approved PostgreSQL target if this is the first authoritative import.
7. Import and require digest verification to pass.
8. Start the PostgreSQL-built application with production secrets.
9. Run smoke tests and compare key counts/balances.
10. Resume workers, then remove the write freeze.

## Rollback boundary

Rollback to SQLite is straightforward only **before** authoritative writes are accepted exclusively by PostgreSQL. After new PostgreSQL writes exist, never point traffic back to the old SQLite snapshot without an explicit reverse migration and reconciliation; doing so can lose orders, payments, wallet movements or provisioning state.

Keep the legacy Float mirrors until PostgreSQL has been authoritative and reconciled for a defined observation period. Their removal is a separate migration/release.
