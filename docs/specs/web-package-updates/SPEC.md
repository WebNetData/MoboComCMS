# Git-independent installation and web updates

Owner request2026-10-31: one-command bootstrap, finish in browser, update in browser without GitHub/Git credentials. Continue existing Installer/Updater/Server Panel/backup owners. The existing wizard is GOOD; custom feed metadata already exists but executable updates are Git-only (DISCONNECTED from package deployments).

## Contract

- A publisher builds one signed `.mbrelease` source package and an optional self-contained `.run` bootstrap from reviewed tracked source. Git is a publisher convenience only; the destination never needs it for package install/update. No GitHub URL, account, release API or token in this path. OS/npm dependencies still require their package servers.
- `.run` is uploaded to the VPS or hosted on the owner's HTTPS download origin, then invoked with one `sudo bash ... --domain ...` command. It installs prerequisites and the existing services, pins the publisher's Ed25519 public key and opens the existing first-owner web wizard. The signing private key is never shipped or stored on the destination.
- Existing fresh Server Panel unlock + `settings.manage`, same-origin guard and bounded rate-limited stream protect private package upload. A package is verified before it is offered for confirmation and reverified by the detached service-user worker. No arbitrary URL download/SQL/root-shell API.
- Existing `/api/admin/server/updates` gains package apply; package files use a child route and existing update state/lock/history. Additive capability/method fields preserve old clients, Git/tag updates and Docker/hooks. Package mode makes no implicit GitHub feed request.
- Worker verifies signature, payload hash/length, archive paths/types/limits and manifest/payload version before executing code. Root-owned verifier/trust anchor and fixed root helper survive app updates. New source is built separately. Successful current backup is mandatory before stopping/replacing code. Existing storage/var/env/.git are never bundled or replaced; rollback restores code only. Data migrations keep their established owner and compatibility policy.
- Keep previous code private for recovery; automatic rollback on build/adoption/restart/health failure. DB changes are never automatically undone. Shared lock is never stolen by age. Process death/power loss is operator recovery, not a filesystem+DB transaction guarantee.
- Use existing ServerShell/SDS Admin tokens. RTL card with file input, pending/error/verified version/hash, explicit confirmation and running progress; keyboard/focus, light/dark/390/1440 and axe checked. No protected public redesign.
- Root trust keys and privileged helper adoption remain explicit operator actions; normal Admin settings cannot replace the executable trust anchor. This slice uses manual signed-package upload, not a second release-feed/configuration service.

## Acceptance

Crypto tampering/wrong key/truncation/extra bytes rejected; malicious archive never escapes staging; no runtime/secrets in payload; backup failure leaves code/data unchanged; actual artifact update and failed-health code recovery on isolated Linux/PostgreSQL; native route authorization/unlock/origin/body bounds; actual browser upload/refusal/confirmation/progress; full check/build, scoped Doctor/security. Record exact executed scope and destination-only limitations in the handoff. No production restore/deploy or hosted workflow dispatch.
