# Web installation and server operations — 2026-10-31

Continue existing Installer, Server Panel, Notifications backup and Updater owners. Preserve pending editor/team work and all production content. No production deployment, live DNS/ACME issuance, workflow dispatch or database reset is authorized by this implementation task.

## Audit and target

| Slice | Existing implementation | Real gap / implementation |
| --- | --- | --- |
| Header mega menu | NavigationBranch portal, MoboCom PriorityNav moving highlight | Link offsetLeft is relative to its new nested heading, not the rail; measure both rectangles in the same coordinate system. Verify hovering several real menus never highlights the last item. |
| Web setup | `/install` wizard already asks PostgreSQL, site/domain, owner and modules; generates secrets/migrates/locks | Production must never expose first-owner creation without an installation secret. Bootstrap a private one-time token, fail closed, preserve existing installed/outage behavior and add cross-process install claim. |
| Database | Existing gated table browser/read-only SQL/CSV and encrypted PostgreSQL backups | Add manual backup/status directly in the existing Server Panel database screen; reuse the worker/settings/restore owners, no public Adminer or second database system. |
| SSL | Gated domains UI, Nginx/webroot and encrypted Cloudflare DNS credentials | Explicit HTTP, DNS and standalone choices, including DNS without wildcard. Validated PEM certificate/private-key upload through the same restricted helper. Match key/SAN/expiry, private staging, atomic publication, renewal limitations and safe errors. |
| Safe updates | Existing release feed, backup-first helper, migrations, health check and app rollback | Refuse dirty worktrees and downgrades, use exclusive shared directory lock without age-based takeover, resolve release to immutable commit, never force-reset owner changes. Keep data/config outside code and never automatically restore an older database. Surface operations under Server Panel. |

## Security and contracts

Installer is closed once installed and during database outages; strict rate limit, same-origin writes, private install token and serialization protect fresh installs. Server operations keep server.manage, environment opt-in, allowlist, password/TOTP unlock and origin checks. No arbitrary shell/SQL write execution or new identity/credential store. Certificates/private keys are never audited or returned; uploads are bounded, validated before privileged use and deleted after adoption/failure. DNS uses the existing restricted Cloudflare credential owner. Standalone requires free port80; do not silently stop another service. Imported certificates require manual replacement; Certbot-owned certificates retain scheduled renewal.

## Acceptance and rollback

Implemented and locally validated. [Executed evidence and remaining host activation](../../agent/handoffs/WEB_OPERATIONS.md); [operator instructions](../../WEB_SETUP_AND_SERVER.md). These results are scoped; they do not certify real ACME issuance or a release on the target server.

Run scoped unit/native PostgreSQL negative tests, actual browser/theme/RTL checks and relevant Linux helper tests in owned disposable directories. Exercise wrong secret/origin, installed/outage denial, concurrent first owner, invalid/mismatched/expired PEM, wrong SAN, unsafe names/paths, dirty updates, failed backup/build/health and lock contention. Never run certificate issuance, update checkout or restore against the owner's live environment. Record executed evidence separately from live-server activation limits. Rollback preserves content, identities, runtime secrets, uploads, backups and schema; code rollback does not rewind money or data.
