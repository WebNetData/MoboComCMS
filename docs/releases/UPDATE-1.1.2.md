> سند تاریخی؛ راهنمای فعلی نصب و معرفی پروژه در [README](../../README.md) است.

# HappVPN 1.1.2 update guide

Release date: 2026-09-22

## What changed

- Fixed the USD → Toman fallback bug: a seeded database value of `usdRateToman=0` no longer masks a positive `FRENZYEX_USD_RATE_TOMAN` environment value.
- Fresh seeds use `FRENZYEX_USD_RATE_TOMAN` when supplied instead of always seeding `0`.
- Added customer-selectable **multiple active payment gateways**. `isDefault` now means “preselected/fallback”; it no longer prevents other active, usable gateways from being offered.
- Gateway selection is available for plan checkout, product checkout, dashboard wallet top-up, Telegram Mini App wallet/plans, and Telegram bot purchases.
- Added `GET /api/payment/gateways` for a sanitized customer-facing gateway list. Provider credentials are never returned.
- Explicit gateway choices are validated server-side against current active state and checkout currency.
- Duplicate DB/env configurations using the same provider credentials are collapsed; a different DB/env account can remain separately selectable.
- Plisio webhook verification is bound to the gateway recorded on the invoice, so multiple Plisio accounts can coexist safely.
- FrenzyEx keeps per-invoice gateway-secret verification and env fallback behavior.
- Preserved the production customer-list UX patch: clicking a customer's email/name opens `/admin/users/{id}`.
- Docker build now accepts `NEXT_PUBLIC_TURNSTILE_SITE_KEY` as a build argument; the Turnstile secret remains runtime-only.

## Database compatibility

There are **no new Prisma migrations in 1.1.2**. The migration set remains:

- `20260922000000_postgresql_baseline`
- `20260922120000_panel_adapter_config`

`prisma migrate deploy` should therefore report no pending migrations when upgrading from 1.1.1. Running it is still required as the normal production deployment gate.

## USD/Toman behavior

For USD-priced purchases through FrenzyEx:

1. A positive integer `usdRateToman` database setting wins.
2. If the DB setting is missing, invalid, or zero, a positive `FRENZYEX_USD_RATE_TOMAN` is used.
3. If neither is positive, checkout fails closed instead of silently calculating an invalid amount.

This means an existing production row such as `usdRateToman=0` no longer needs a manual SQL edit when the environment rate is configured.

## Multiple gateways

In Admin → Gateways, keep every gateway you want customers to use **Active** and make sure its required credentials/instructions are complete. You may keep one as Default; Default is only the preselected/fallback choice.

When more than one compatible gateway exists, the customer can select one. When there is only one, it is used automatically. The server revalidates the submitted gateway reference before creating the invoice.

If an old database FrenzyEx/Plisio row has stale credentials while the matching env gateway is the one you intend to use, deactivate the stale DB row. Do not leave broken gateway rows active just to preserve history.

## Production upgrade (direct Docker Compose deployment)

The following assumes the release ZIP is uploaded to:

`/opt/happvpn/releases/HappVPN-update-1.1.2.zip`

### 1. Back up first

```bash
cd /opt/happvpn
STAMP=$(date -u +%Y%m%d-%H%M%S)
mkdir -p "backups/update-$STAMP"
chmod 700 "backups/update-$STAMP"

docker compose exec -T postgres \
  pg_dump -U happvpn -d happvpn -Fc \
  > "backups/update-$STAMP/happvpn.dump"

tar -czf "backups/update-$STAMP/storage.tar.gz" storage
cp .env "backups/update-$STAMP/env.backup"
cp docker-compose.yml "backups/update-$STAMP/docker-compose.yml"
chmod 600 "backups/update-$STAMP/env.backup"
```

### 2. Verify and extract

Use the SHA-256 shipped next to the ZIP.

```bash
cd /opt/happvpn/releases
sha256sum HappVPN-update-1.1.2.zip

rm -rf .tmp-1.1.2 1.1.2
mkdir .tmp-1.1.2
unzip HappVPN-update-1.1.2.zip -d .tmp-1.1.2
mv .tmp-1.1.2/HappVPN-1.1.2 1.1.2
rmdir .tmp-1.1.2
```

### 3. Keep production environment values

Do not replace `/opt/happvpn/.env` with an example file. Keep all existing production secrets.

Set/update:

```env
APP_RELEASE=1.1.2
FRENZYEX_USD_RATE_TOMAN=<your-positive-toman-rate>
```

Do not rotate `PANEL_CREDENTIAL_KEY`, `NEXTAUTH_SECRET`, DB credentials, or other persistent secrets as part of this update.

### 4. Build the versioned image

`NEXT_PUBLIC_TURNSTILE_SITE_KEY` is public but must be present during the Next.js build when Turnstile is enabled.

```bash
SITE_KEY="$(grep -m1 '^NEXT_PUBLIC_TURNSTILE_SITE_KEY=' /opt/happvpn/.env | cut -d= -f2-)"

docker build \
  --pull \
  --build-arg NEXT_PUBLIC_TURNSTILE_SITE_KEY="$SITE_KEY" \
  -t happvpn-app:1.1.2 \
  /opt/happvpn/releases/1.1.2
```

The Dockerfile runs the full release checks and PostgreSQL production build. Do not deploy if the build fails.

### 5. Preflight and migrations

```bash
docker run --rm \
  --network happvpn-internal \
  --env-file /opt/happvpn/.env \
  happvpn-app:1.1.2 \
  node scripts/production-preflight.cjs

docker run --rm \
  --network happvpn-internal \
  --env-file /opt/happvpn/.env \
  happvpn-app:1.1.2 \
  npx prisma migrate deploy \
  --schema prisma/schema.postgresql.prisma
```

### 6. Switch the app, keep rollback image

```bash
docker tag happvpn-app:local happvpn-app:1.1.1-live
docker tag happvpn-app:1.1.2 happvpn-app:local

cd /opt/happvpn
docker compose up -d --no-build --force-recreate app
```

PostgreSQL does not need to be recreated.

### 7. Verify

```bash
docker compose ps
docker compose logs --tail=150 app

curl -fsS http://127.0.0.1:3000/api/health/live
echo
curl -fsS http://127.0.0.1:3000/api/health/ready
echo
```

Expected release in `/api/health/live`: `1.1.2`.

Then verify in the UI:

- more than one active compatible gateway produces a gateway selector;
- wallet top-up and plan/product checkout honor the selected gateway;
- FrenzyEx USD checkout works when DB `usdRateToman` is `0` and the env rate is positive;
- Telegram/Mini App purchase flows expose compatible gateway choices.

### 8. Make 1.1.2 the active source tree after successful verification

```bash
cd /opt/happvpn
STAMP=$(date -u +%Y%m%d-%H%M%S)
mv app "releases/1.1.1-source-$STAMP"
cp -a releases/1.1.2 app
```

## Rollback

Because 1.1.2 adds no database migration, application rollback to the preserved 1.1.1 image does not require a schema rollback:

```bash
docker tag happvpn-app:1.1.1-live happvpn-app:local
cd /opt/happvpn
docker compose up -d --no-build --force-recreate app
```

Also restore `APP_RELEASE=1.1.1` in `/opt/happvpn/.env` if you need the health endpoint to report the old release.

Never run `docker compose down -v` during a normal update.
