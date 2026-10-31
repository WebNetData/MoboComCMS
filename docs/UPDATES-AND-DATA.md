# Safe updates and data ownership

Operator guide (Persian): [UPGRADE-FA.md](UPGRADE-FA.md). This page records the rules behind it.

MoboComCMS production state is split into four layers (Coolify locations shown; on Ubuntu see the operator guide):

| Layer | Location | Replaced on app deploy? |
|---|---|---|
| Application code | Git / Docker image | Yes |
| PostgreSQL records | Coolify PostgreSQL persistent volume | No |
| Uploaded files | `/app/storage` persistent mount | No |
| Secrets | Coolify environment/settings + offline recovery copy | No |

This separation is the rule that keeps customer/order/subscription data safe
when the source code is updated.

## Database rules

- Production uses PostgreSQL only.
- Never run `prisma db push` in production.
- Never delete/edit an already-applied migration.
- Add a new timestamped migration for every schema change.
- Use `prisma migrate deploy` on production.
- Run demo seed only on a fresh install, never as part of normal deployment.

For risky schema changes use an expand/contract sequence:

1. add new nullable/defaulted fields/tables
2. deploy code compatible with old and new data
3. backfill data in a bounded migration/job
4. switch reads to the new representation
5. only in a later release remove the old field

This allows rollback of application code without losing the old representation.

## Rollback

Application rollback: deploy the previous Git commit/image. Do not automatically
roll back database migrations. If a migration is destructive, restore from a
verified backup instead of attempting ad-hoc SQL under pressure.

## Before every release

- database backup exists off-server
- migrations reviewed for destructive SQL
- `npm run release:check` passes
- Docker build passes
- staging smoke test passes
- production readiness endpoint becomes healthy after deploy


## Provider credentials and key continuity

VPN-panel tokens/passwords are encrypted before persistence with AES-256-GCM
using `PANEL_CREDENTIAL_KEY`. Existing historical plaintext rows are encrypted
idempotently on container startup after migrations.

- Generate the key once with `openssl rand -hex 32`.
- Keep it in Coolify secrets and in a secure offline recovery record.
- Do not commit it to Git or place it in a database backup.
- Do not casually replace it during an update. A database restored with a
  different key cannot decrypt its stored panel credentials.
- If key rotation is ever required, ship a dedicated rotation migration that
  has access to both the old and new key; do not just overwrite the env value.

Fresh deployments keep `ALLOW_LEGACY_HAPP_PROXY=false`, so old shop-domain raw
profile routes cannot become the subscription source. Customer links remain
Happ `crypt5` links derived from the VPN panel's own public HTTPS subscription
URL.
