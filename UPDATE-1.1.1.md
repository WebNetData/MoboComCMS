# HappVPN 1.1.1 — Server Update Guide

This package contains application source only. It intentionally excludes `.env`, databases, backups, uploaded files, build output, and `node_modules`.

## Before updating

1. Create and verify a PostgreSQL backup.
2. Back up the persistent `storage` volume/directory.
3. Preserve the production environment variables and these existing secrets:
   - `NEXTAUTH_SECRET`
   - `PANEL_CREDENTIAL_KEY`
   - `BACKUP_ENCRYPTION_KEY`
4. Keep the existing database and storage volumes attached during deployment.

## Standard deployment

Run these commands from the extracted project directory:

```bash
npm ci
npm run deploy:preflight
npm run deploy:migrate
npm run release:check
npm run build:postgres
npm run start
```

Restart the application through your process manager after a successful build. For Docker/Coolify, build and redeploy the image with the existing persistent volumes and environment variables. `deploy/docker-start.sh` can apply migrations at startup when `RUN_MIGRATIONS_ON_START=true`.

## New production settings

Cloudflare Turnstile protects login and registration when both keys are configured:

```env
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your_site_key
TURNSTILE_SECRET_KEY=your_secret_key
TURNSTILE_EXPECTED_HOSTNAME=happvpnproxy.com
```

For website login with Telegram:

1. Configure `happvpnproxy.com` as the login domain in BotFather.
2. Configure/install the Telegram bot from the HappVPN admin panel.
3. Confirm that the bot username and webhook are shown as active.

## Behavior in 1.1.1

- English is the default for new visitors and Telegram users. Existing saved language preferences remain active.
- Administrators can manually add a service to a user and adjust wallet balance.
- Login and registration support Cloudflare Turnstile.
- Website login can use a verified Telegram identity.

The release checks completed successfully before packaging: 37 site/control tests, 25 connected-service tests, 4 backup tests, TypeScript, security, schema parity, architecture, audit, and localization checks.
