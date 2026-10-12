# Launch readiness — current priority

Continue from PR #148; preserve completed work and approved public design. Use [release checklist](../RELEASE-CHECKLIST.md) and [remaining gaps](REMAINING_GAPS.md) as existing owners. This document is a short execution checkpoint, not another architecture.

## Required before public launch

1. Record the actual target: public HTTPS domain, deployment access, database origin (fresh/existing), persistent media locations and backup destination. No target or production credentials have been assumed.
2. Build and start the actual final image as a non-root user. Prove readiness, migrations, persisted storage and diagnostic/backup tools. First launch packaging gap is [reproduced and fixed](audits/2026-10-12-launch-runtime-packaging.md); full image validation is still pending.
3. Preserve an existing database with a verified backup before migrations; rehearse encrypted restoration and application rollback in isolation. [Owned local encrypted restore](audits/2026-10-12-launch-backup-rehearsal.md) matched all206 table counts/content and104 migrations; target/off-host/media/application rollback remains pending. Never substitute `db push`, seed demo data into production or revert an applied migration by editing it.
4. Validate main-domain public sections, login/recovery, section-manager access and content save. For enabled commerce, validate an actual configured payment, delivery and return path. Unconfigured external channels are not passing evidence; keep optional operations disabled until configured.
5. Verify HTTPS/Origin/CSP, shared strict rate limits, worker scheduling, readiness and operational alerts on the target. Deploy fenced upload writers to every instance before enabling reviewed recovery.

## Deferred for first launch

Optional reviewed-upload UI/quarantine refinements, advanced editor controls, extra search ordering and broader feature additions are follow-up work unless a launch scenario proves them necessary. Existing incomplete optional operations stay disabled using their existing Control Plane. Repository `archiveRecoveryEnabled` remains default false.

## Existing evidence

PR #148 merged; required hosted check, empty PostgreSQL/Redis and production build passed. Local compiled HTTPS batch51 passed with zero retries. Hosted browser stays manual and is not redispatched after local validation. These do not certify the production target.
