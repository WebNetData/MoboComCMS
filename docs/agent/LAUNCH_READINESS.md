# Launch readiness — current priority

Follow-up2026-11-02 after merged PR299/main `da11634c`: the scoped account-to-checkout continuation and shipping-read recovery batch has passed local unit/native PostgreSQL/browser/type/build gates on `fix/member-journeys-2026-11-02`. [Exact evidence, declared registration response double and boundaries](handoffs/PUBLIC_SECTIONS_QUALITY.md#account-continuation-and-checkout-recovery--2026-11-02). This strengthens local customer navigation; real configured registration/OTP, payment/delivery/return, exact final signed artifact and destination-host checks below remain pending. No release/deployment/hosted Actions ran for that batch. The following full-stack audit is historical evidence at its stated source, not certification of all later commits.

Current audit2026-11-02: the owner merged PR #297 as `8a5fa057`; its tree matches tested source `bd233371`. Follow-up `fix/public-readiness-2026-11-02` contains only the scoped Business colour correction and this evidence/continuation. Owner merges and deploys. Use [release checklist](../RELEASE-CHECKLIST.md) and [remaining gaps](REMAINING_GAPS.md); do not restart completed capabilities. Status: **local gates passed; destination-host verification remains pending**. This is an execution checkpoint, not a production certificate.

## Executed local release review — 2026-11-02

| Gate | Verified result | Boundary |
| --- | --- | --- |
| Full `npm run check` | Linux UID1000, committed-source archive, no `.env`, deliberately unreachable DB fixture:849 passes,0 failures,1 skip | The Linux certificate-helper case skipped because this development image lacks Python; no dependency/guard was weakened. Includes source/types/schema/release/money/security/audit/i18n and registered unit/mock-connected/backup/billing gates. |
| Fresh PostgreSQL | All committed migrations, baseline seed with demo disabled, all154 default registered native checks passed; owned database removed | No owner database was used for fixture mutations. The default excludes11 optional suites; two were run separately below. |
| First install / server operations | Optional `web-operations` and `installer-host-setup` passed on two additional freshly migrated, unseeded owned databases; both removed | Host/ACME boundaries are declared doubles, not real certificate issuance/systemd adoption. |
| Shared strict rate limits | Existing real Redis test passed across two limiter instances; temporary Redis had no published port and was removed | Does not certify the destination's Redis/network configuration. |
| Encrypted recovery | Canonical `backup-core.cjs` used real PG17 dump, AES-GCM encryption and isolated restore; counts/content hashes matched all229 public tables; tampered archive rejected | Source stayed stable during capture. Recovered DB/plaintext/test archive were removed. No live restore, media/off-host recovery or service rollback is claimed. |
| Public UI |44 real guest views:11 routes × light/dark ×1440/390. Final HTTP200, no overflow/runtime errors, main-scoped axe0 throughout | Initial Business light views failed contrast (activity link2.93:1, primary button4.01:1). Fixed only the scoped CSS to use semantic accent ink and the existing primary/on-primary pair; rerun44/44 passed. Private/provider/playback flows are not certified by these directory views. |
| Guest/security smoke | Root/readiness200; installed wizard/API404; private profile/Admin JSON401/403; env/runtime-storage paths404; CSP nonce/nosniff/frame headers present. Real guest Admin navigation reached login and visible label focus passed | Existing Admin client shell returns HTTP200 before the browser redirect; it is not a protected-data response. Local HTTP does not establish target HTTPS/HSTS. |

The homepage production build and scoped browser/Doctor/security evidence remain in [its handoff](handoffs/HOMEPAGE_DESIGN.md); the final Business correction is recorded in [its owner handoff](handoffs/BUSINESS_EXPERIENCES.md#launch-review-colour-correction--2026-11-02). Raw logs/hash reports are ignored under `.mobocom/pr-homepage-20261102`; no credentials, decrypted data, provider sends, payment or remote deployment were published.

The older before-homepage snapshot later showed changes in five existing FX-priced products' price/repricing fields. These live values were retained, not reset to make a comparison pass; the cause was not runtime-traced here. At the actual backup rehearsal all229 tables matched exactly before/after capture and in the recovered database. Validate the configured FX feed/update policy with the real checkout before launch.

## Next release artifact

GitHub already publishes `v1.6.1` from `a93c68e1`, including `.run`/`.mbrelease`/checksum/public key. It predates this PR. `package.json` still reads1.6.1 and the manifest has59 unreleased migrations. After owner merge, reconcile already-shipped1.6.1 migration hashes against that immutable source, prepare a new version (candidate1.6.2), update the lock/version and seal through the existing migration tool; never rewrite a shipped tag/migration or rotate the established publisher key casually. Build/verify the signed artifact from the exact merged commit, using the existing guide in [INSTALL-FA](../INSTALL-FA.md). No new release/asset was published by this audit.

## Required before public launch

1. Record the actual target: public HTTPS domain, deployment access, database origin (fresh/existing), persistent media locations and backup destination. No target or production credentials have been assumed.
2. Build/start the exact final artifact under the chosen deployment method with an unprivileged service user. Prove readiness, persistent media and diagnostic/backup tools on that host; verify the final Docker image separately if Docker is chosen. The [historical runtime packaging fix](audits/2026-10-12-launch-runtime-packaging.md) is not a current target-host smoke result.
3. Back up an existing destination database before migrations; rehearse its encrypted restoration and application rollback in isolation. Current local229-table recovery passed above; target/off-host/media/secrets/application rollback remains pending. Never substitute `db push`, seed demo data into production or revert an applied migration by editing it.
4. Validate main-domain public sections, login/recovery, section-manager access and content save. For enabled commerce, validate an actual configured payment, delivery and return path. Unconfigured external channels are not passing evidence; keep optional operations disabled until configured.
5. Verify HTTPS/Origin/CSP, shared strict rate limits, worker scheduling, readiness and operational alerts on the target. Deploy fenced upload writers to every instance before enabling reviewed recovery.

## Deferred for first launch

Optional reviewed-upload UI/quarantine refinements, advanced editor controls, extra search ordering and broader feature additions are follow-up work unless a launch scenario proves them necessary. Existing incomplete optional operations stay disabled using their existing Control Plane. Repository `archiveRecoveryEnabled` remains default false.

## Existing evidence

PR #148's hosted/compiled-HTTPS evidence is historical. PR #297 used `[skip ci]` under the owner's quota decision; no hosted run was created or dispatched. The current local results above do not certify the production target or every optional provider/module. Keep unconfigured optional operations disabled in the existing Control Plane; review production content/demo flags, contact/legal settings, SMTP/SMS, payments/returns, FX, workers, alerts and off-host backup before opening them publicly.
