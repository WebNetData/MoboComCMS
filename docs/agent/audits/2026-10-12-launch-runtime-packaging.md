# Launch preparation: diagnostic runtime packaging

Base: PR #148 merge `89d91a7824315245e8f22b5b830714bc82ca3b81`. Launch preparation now takes priority over optional Repository recovery UI. Existing routes, Identity, data and protected visuals remain unchanged.

Confirmed gap: final Docker runner copied scripts but omitted the canonical Repository purchase-recovery and archive-integrity CJS owners used by the read-only integrity CLI. Application/CI tests use the full source checkout and therefore did not prove these runtime files were packaged.

Reproduced with an actual child-process import in a temporary artifact-shaped directory assembled from runner COPY declarations. Baseline failed `MODULE_NOT_FOUND` for purchase-recovery: `.mobocom/restrictions-1791805413012-28596.log`, native1. Dockerfile now copies the two precise canonical files at their existing addresses, without creating another policy implementation. Installer test exercises the transitive imports, not merely file names.

Linux Node22, uid1000, no .env: actual installer/backup tests13 passed, native0, `.mobocom/restrictions-1791805424452-26192.log`. Actual integrity CLI against owned PostgreSQL from the artifact-shaped directory passed default17 and opt-in archives21, native0, `.mobocom/restrictions-1791805472599-43116.log`. Existing installed Prisma is provided by NODE_PATH for this probe; no full image or provider operation is implied. Temporary artifacts were cleaned. Diff check passed.

No schema, React, application behavior, provider sends, production database changes, image build, browser rerun or GitHub Actions were performed in this packaging slice. Final Docker image build/start, backup/restore rehearsal and target-specific production checks remain pending. Do not call the site launched from local evidence.
