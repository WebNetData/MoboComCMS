# PostgreSQL deployment, backups and recovery

## Local Docker

Use `deploy/compose.postgres.yml` with an untracked `deploy/.env.postgres` containing
`POSTGRES_PASSWORD`. Run:

```sh
docker compose --env-file deploy/.env.postgres -f deploy/compose.postgres.yml up -d --wait
```

PostgreSQL 17 binds only to `127.0.0.1:5434`, persists in the named Docker volume,
and restarts with Docker. Never use `down -v` unless intentionally destroying data.
Set DATABASE_URL to `postgresql://happvpn:PASSWORD@127.0.0.1:5434/happvpn?schema=public`.
Do not commit or transmit the password, `.env`, or the backup encryption key.

## Real migration history

`prisma/migrations` contains the PostgreSQL baseline. New databases use:

```sh
npm run db:migrate:postgres
npm run db:generate:postgres
npm run build
```

`build` and `postinstall` select the correct Prisma provider from DATABASE_URL.
For existing PostgreSQL installations, first compare the live schema against the
baseline. Only an exact match may be marked with `prisma migrate resolve --applied
20260922000000_postgresql_baseline --schema prisma/schema.postgresql.prisma`.
Never mark a mismatched database as applied. Develop future migrations against a
disposable development database with `prisma migrate dev --schema
prisma/schema.postgresql.prisma --name NAME`; review SQL and deploy with migrate
deploy. Do not use db push for authoritative PostgreSQL.

SQLite cutover requires a write freeze and stopped workers. Preserve an SQLite
backup first, reconcile money, export with `export-sqlite-snapshot.py`
(or the Python-free twin `npm run db:export:sqlite`), then import with
`import-postgresql-snapshot.mjs` after applying migrations to an EMPTY target.
The importer is transactional and verifies row counts and canonical digests.
Retain the original SQLite database, but do not return to it after PostgreSQL has
accepted new writes without reconciliation.

## Backup settings

The Ubuntu host snapshot script (`deploy/ubuntu/backup.sh`) uses
`HOST_BACKUP_DIR` (default `/var/backups/mobocom`) for its database and upload
archives. `BACKUP_DIR` below belongs to the encrypted in-app backup worker and
must not redirect host snapshots into the application directory. An absolute
legacy `BACKUP_DIR` outside that directory remains accepted by the host script.

Admin → Telegram → PostgreSQL backups: enable backups, optionally enable Telegram,
enter the administrator's numeric Telegram user ID, and set retention. Bot token
and webhook installation remain in the same Telegram page. The recipient must
first start the bot. Webhook reception is independent of sending backup documents.
Bot token environment settings override admin values. Upload destination is fixed
to the official Telegram API, even if another API proxy is configured for login.

Required server environment:

```dotenv
BACKUP_ENCRYPTION_KEY=64_HEX_CHARACTERS_FROM_32_RANDOM_BYTES
BACKUP_DIR=storage/backups
BACKUP_SCHEDULER=true
# Local Docker only; omit to use native PostgreSQL tools in PATH:
BACKUP_PG_CONTAINER=happvpn-postgres
```

Keep an offline copy of the encryption key. Losing it makes every encrypted backup
unrecoverable. Do not rotate it without preserving previous keys. Native pg_dump,
pg_restore, psql, createdb and dropdb must match or exceed the server major version.
Docker mode uses the tools inside the named PostgreSQL container over its local
socket; this requires Docker access and a matching DATABASE_URL database/user.
The backup account needs CREATEDB for isolated restore tests; production should
run this worker under a dedicated operations identity, not expose Docker publicly.

The Node server checks once per minute. Every two-hour UTC slot is attempted at
most once, guarded by a PostgreSQL advisory lock and a durable attempt record.
Failed/uncertain Telegram sends are not retried automatically in the same slot.
The next slot creates a fresh backup. An interrupted RUNNING attempt requires
operator investigation; no success is inferred. A continuously running Node
server and accessible tools are required. For standalone output, deploy `scripts/`
alongside the application; the worker is not a bundled route. External schedulers
can run `npm run backup:run` with BACKUP_SCHEDULER=false.

Backups are pg_dump custom format, wrapped in AES-256-GCM (`HAPPBK01`, 12-byte
nonce, ciphertext, 16-byte authentication tag). Metadata records encrypted-file
SHA-256, size, restore results and Telegram message IDs. Plaintext temporary dumps
are removed after use; provision an encrypted filesystem to protect in-flight
temporary files and crash leftovers. Backup directories must be private and
persistent. Never serve storage/backups from HTTP.

Default retention: all snapshots for 7 days, then one snapshot per UTC day for
30 days. Cleanup follows successful local backup/test; failed runs do not purge
old recovery points. Telegram messages are NOT deleted by local retention.
Large encrypted files are split into 45 MiB documents, each with a SHA-256 caption;
join parts in numeric order before decrypting. No encryption key is sent.
Database dumps do not include `storage/covers`, environment secrets, or external
VPN provider configuration; these require separate backups.

## Restore test and real restore

The first successful backup each day is restored to a fresh random test database.
pg_restore must succeed in full; User, Setting and WalletAccount tables are queried.
The temporary database is dropped afterward. This verifies database restorability,
not VPN connectivity, payments, or application-level financial reconciliation.

```sh
npm run backup:restore-test -- storage/backups/backup-ID.dump.enc
node --env-file=.env scripts/restore-new-database.cjs storage/backups/backup-ID.dump.enc happvpn_recovered_20260922
```

Real restore creates a NEW database and refuses an existing target. After checking
the result, freeze writes, point DATABASE_URL at the recovered database, deploy
pending migrations and restart.
For Telegram multi-part backups, concatenate the `.part0001`, `.part0002`, … files
as binary data before invoking restore. Authenticate with the original key.

## Admin panel: manual backup and in-place restore

`/admin/telegram → PostgreSQL backups` exposes the same operations to the operator:

- **بکاپ دستی الان (manual backup)** — starts the worker immediately with
  `BACKUP_FORCE=1` (the two-hour slot guard is bypassed for that click only), sends
  the encrypted file to the configured admin chat id and lists the result.
- **آزمون بازیابی (restore test)** — per backup row: decrypts and restores into a
  throwaway database, then verifies row counts. Never touches live data.
- **بازیابی این بکاپ (restore in place)** — requires typing `RESTORE`. Sequence:
  1. a **pre-restore safety snapshot** is taken and encrypted first,
  2. other sessions are terminated (`pg_terminate_backend`),
  3. `pg_restore --single-transaction --clean --if-exists` runs — all-or-nothing,
     so a failure leaves the live database untouched,
  4. User/Setting/WalletAccount counts are verified and the result is written to the
     audit log (`backup.restore`) together with the safety snapshot id.

  After a successful in-place restore, **restart the application** so every pool and
  cache starts from the restored state. Prisma reconnects on its own, but a restart is
  the supported procedure.

Both actions are gated by `settings.manage` and audited. The CLI equivalents are
`npm run backup:restore-test -- <file>` and
`npm run backup:restore-live -- <file>` (the latter also requires `RESTORE_CONFIRM=1`
and refuses any archive outside `BACKUP_DIR`).
