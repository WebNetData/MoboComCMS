# MoboComCMS — Production deployment with Coolify

This is the recommended deployment model for MoboComCMS. Code, database data,
application files and secrets are deliberately kept separate so application
updates can replace the container without replacing customer data.

## 1. Server

Recommended starting point for **Coolify + MoboComCMS + PostgreSQL on one VPS**:

- Ubuntu 24.04 LTS (fresh server)
- 4 vCPU
- 8 GB RAM
- 80+ GB NVMe
- public IPv4

The app is designed for one web replica initially. Horizontal scaling needs a
shared rate limiter/cache before adding more app replicas.

## 2. Install Coolify

Follow the official self-hosted installer. After installation, create the first
Coolify admin immediately and back up Coolify's own installation secrets.

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Before changing SSH/firewall rules, verify a second SSH session works. Never
close the only working SSH session while changing firewall or SSH settings.

## 3. Source control

For painless upgrades, put this directory in a **private Git repository**.
Deploy the repository from Coolify using the included `Dockerfile`.

Do not commit:

- `.env*` containing real secrets
- `storage/`
- PostgreSQL dumps
- `prisma/dev.db`
- `node_modules/` or `.next/`

The repository is code. Production data must never live in the repository.

## 4. PostgreSQL

Create a standalone PostgreSQL **17** resource in Coolify. Keep it private;
do not expose port 5432 to the public Internet.

Copy its **internal connection URL** into the application as `DATABASE_URL`.
The URL must end with the MoboComCMS database and may include `?schema=public`.

MoboComCMS applies committed Prisma migrations on container startup by default:

```env
RUN_MIGRATIONS_ON_START=true
```

Never use `prisma db push` against production. Every future schema change must
be a committed migration and production updates use `prisma migrate deploy`.

## 5. Application resource

Create an Application from the private Git repository:

- Build Pack: Dockerfile
- Dockerfile: `Dockerfile`
- Port: `3000`
- Health check path: `/api/health/ready`
- Domain: your real public HTTPS domain
- Initial replicas: `1`

Add persistent storage:

- Destination path: `/app/storage`

That mount contains uploads and optional encrypted application backups. The
container itself is disposable and can be replaced on every deploy.

## 6. Environment

Start from `.env.production.example` and configure values through Coolify's
Environment Variables UI. Do **not** upload a production `.env` file to Git.

Required values:

```env
NODE_ENV=production
NEXTAUTH_URL=https://YOUR_DOMAIN
NEXTAUTH_SECRET=<openssl rand -hex 32>
DATABASE_URL=<private Coolify PostgreSQL URL>
INTERNAL_JOBS_SECRET=<another openssl rand -hex 32>
# Generate once. Do not rotate casually; it encrypts VPN panel credentials at rest.
PANEL_CREDENTIAL_KEY=<openssl rand -hex 32>
RUN_MIGRATIONS_ON_START=true
SUBSCRIPTION_REMINDER_SCHEDULER=false
BACKUP_SCHEDULER=false
ALLOW_LEGACY_HAPP_PROXY=false
```

If FrenzyEx is enabled, also set:

```env
FRENZYEX_API_KEY=...
FRENZYEX_CALLBACK_SECRET=...
FRENZYEX_BASE_URL=https://frenzy.fastsnap.info
FRENZYEX_USD_RATE_TOMAN=...
```

If Telegram is configured through environment variables, set the Telegram
variables from `.env.production.example`. You may alternatively configure the
bot from Admin after first login.

## 7. First deploy and first admin

Deploy the application. The entrypoint runs:

1. production environment preflight
2. `prisma migrate deploy`
3. idempotent encryption of any historical plaintext VPN-panel credentials
4. `next start`

After the first healthy deployment, open the Coolify application terminal and
create initial data **once**:

```bash
ADMIN_EMAIL='you@example.com' \
ADMIN_PASSWORD='A-VERY-STRONG-PASSWORD' \
SEED_DEMO_DATA=false \
npm run deploy:seed
```

Do not make `db:seed` part of normal upgrades.

## 8. Background jobs

Keep in-process schedulers disabled and use Coolify > Application > Scheduled
Tasks so job history is visible separately from the web process.

Fulfillment/payment reconciliation — every minute:

```text
* * * * *
node scripts/run-internal-job.cjs fulfillment
```

Subscription reminders — every five minutes:

```text
*/5 * * * *
node scripts/run-internal-job.cjs reminders
```

Run each task manually once from Coolify and verify a successful execution.

## 9. Backups

Use Coolify's PostgreSQL scheduled backup as the primary database backup:

- daily backup at minimum
- keep several daily/weekly restore points
- upload a copy to an S3-compatible bucket on a different provider/server
- periodically restore a backup into a disposable PostgreSQL database and test
  the site against it

Also back up the `/app/storage` persistent mount. A persistent volume survives
normal container replacement, but it is **not** a backup by itself.

Keep the code repository, PostgreSQL backup and `/app/storage` backup separate. Also keep an offline copy of the production secret inventory (`NEXTAUTH_SECRET`, `INTERNAL_JOBS_SECRET`, `PANEL_CREDENTIAL_KEY`, gateway callback secrets, Telegram secret/token). `PANEL_CREDENTIAL_KEY` is especially important: without the same key, encrypted VPN-panel credentials cannot be recovered from a restored database.

With code + database backup + storage backup + secrets, the service can be rebuilt on another server.

## 10. External callbacks

After the final domain is live over HTTPS:

- FrenzyEx callback:
  `https://YOUR_DOMAIN/api/payment/frenzyex/webhook`
- configure/re-register the Telegram webhook from the Admin Telegram page

Never place API keys or callback secrets in browser code, Telegram buttons or
public URLs.

## 11. Smoke test before opening sales

Verify all of these on the production/staging domain:

```text
GET /api/health/live   -> 200
GET /api/health/ready  -> 200
```

Then test:

- admin login
- customer register/login
- Telegram link in both directions
- one low-value FrenzyEx payment
- repeated FrenzyEx callback does not double-credit
- fulfillment scheduled task
- VPN panel connection and provisioning
- encrypted Happ link only; no raw panel subscription URL in customer surfaces
- upload one cover/media file, redeploy the app, confirm the file remains
- create a test DB backup and perform a restore test

## 12. Update procedure

For every future release:

1. take/verify a current PostgreSQL backup
2. develop and test locally/staging
3. create Prisma migrations locally if the schema changes
4. commit code **and migrations** to Git
5. push the release
6. let Coolify build a new immutable image
7. startup applies `prisma migrate deploy`
8. verify `/api/health/ready` and core purchase flow

Do not overwrite production database files with files from the source archive.

The Persian operator summary is in [UPGRADE-FA.md](UPGRADE-FA.md#coolify-یا-docker).
