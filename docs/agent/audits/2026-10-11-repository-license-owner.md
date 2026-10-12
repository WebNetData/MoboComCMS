# Repository human-bound machine credential evidence — 2026-10-11

## Audited gap and owner

Existing vendor machine activation/check/deactivation and paid release download verified the license key/product/site, but never read its explicit human owner. Buyer HTTP guards and API keys already consumed current Identity. This slice extends `repository/server/vendor.ts` through its own `vendor/access.ts` and the existing canonical `resolveCurrentUser`; it creates no new identity, entitlement store, setting or client implementation. No schema migration or presentation changes.

An explicitly linked `RepoLicense.userId` needs current ACTIVE standing and no effective GLOBAL `identity.authenticate` denial. A module-only forum sanction does not affect it. A password reset alone does not revoke a long-lived machine key. A grant with null userId stays unbound even when its email matches a banned account. Free public downloads remain anonymous.

## Versioned HTTP compatibility

Existing `/api/repo/v1/licenses/{activate,check,deactivate}` request shapes and `/api/repo/v1/download/{slug}/{version}` key/site headers remain. Linked account denial now returns the existing error envelope with HTTP **423** and `reason: account-restricted`; no ACTIVE certificate, activation mutation, binary read or download count is granted. Existing clients classify 403/404 as permanent revocation, so using those for temporary account denial would permanently disable installed packages. The unchanged real client classifies 423 as `unreachable`, retains its stored certificate and installed state, and restores `active` after successful refresh. That state name is an existing compatibility compromise; no unsupported new client enum is introduced.

License/payment/provenance rows are not rewritten to REVOKED. Already installed contribution execution is not blanket-withdrawn by this vendor account policy. The existing check's signed REVOKED certificate and last-seen observation remain a narrow invalidation signal, requiring the same key/product/active-site proof. They grant no account or package access. Healthy authorized repository administrators retain existing repair/release controls; restricted owners get no general recovery exception.

There is no pre-existing Repository OpenAPI/Pact baseline in this fresh-main source. Actual existing consumer/provider compatibility is executed below; a complete external schema/consumer matrix remains unclaimed. Other independent clients must handle 423 as temporary denial and never treat it as a successful download.

## Executed local checks

All runtime checks used the existing owned disposable PostgreSQL fixture, Node 22.23.3/Prisma 5.22, uid 1000, without `.env`. No user production database or :3000 source was modified.

- `node scripts/run-pg-checks.cjs repository-license-owner current-account-consumers global-authentication`: native 0, all three pass, log `restrictions-1791700886089-45428.log`. New test uses real vendor/client/Identity functions, users, linked/unbound licenses, activation/release rows and namespaced release files; signing/settings/network/wallet boundaries are explicit doubles. Covers four denied actions with identical database snapshots/no signatures, overlapping/revoked/scheduled/expired GLOBAL, module isolation, full ADMIN, standing, password-independent keys, free download, unavailable restriction storage and REVOKED invalidation. Restores fetch and cleans only owned rows/files.
- Five deliberate fixture-only mutations failed as expected: activation owner bypass `1791700871705-30432`, ACTIVE certificate bypass `1791700872514-26032`, paid download bypass `1791700873268-26372`, GLOBAL bypass `1791700874033-3500`, and 403 permanent-revocation misclassification `1791700874757-38428`. Source restored in finally; the subsequent real PostgreSQL gate passed. This is scoped fault evidence, not an exhaustive mutation score.
- `npm run check`: native 0, 638 tests (581 site, 53 connected-unit, four backup), typecheck and existing architecture/security gates; log `restrictions-1791700633388-7188.log`.
- `npm run build`: native 0, compiled production application; log `restrictions-1791700633389-15500.log`. Existing autoprefixer start/end compatibility warnings remain.
- Compiled HTTPS Playwright, seven selected suites, retries 0: **20 passed, zero failed/skipped/retries**, 21.0s, log `restrictions-1791700986934-26220.log`. Existing Repository scenario now actually enables its installed package through the Admin API, links a fixture human, applies GLOBAL, verifies all four machine routes return423, real signed-client refresh retains enabled package/unchanged license/sites/product, free download works, and revocation restores active without changing enabled state. Existing genuine revocation still disables the package. Existing buyer wallet/idempotency/download, imports/current-account/forms/ads/security regressions also pass.
- Final `npm run typecheck` after the browser fixture corrections: native0, log `restrictions-1791701008218-28576.log`. Only test/document files changed after the passing production build; application source remained identical.

## Failed attempts retained

The new loader initially missed JSON manifest imports; native failure `1791700605792-30384`, corrected before the first passing PostgreSQL run `1791700620059-42532`. Error-envelope assertion uses the actual RepoError `meta`, not a guessed field.

First compiled run `1791700886160-45244`: 17 pass, one failure, two serial successors not run. The fixture incorrectly assumed installation defaults enabled; actual store defaults disabled. Test explicitly enables through the existing Admin API before asserting preservation. Second rapid run `1791700930828-35536`: 16 pass, one 429 failure, three successors not run because shared Redis secret quota remained consumed inside its existing minute window. Extra machine assertions now use a dedicated fixture caller IP; quotas were neither lowered nor cleared. The final full selected run above passed without retry. These failures are not counted as passing evidence.

## Remaining scope and rollout

The :3000/root rollout, wider resource/upload/context/realtime/user-acting job policy and Global Admin command/history workflow remain separate pending work. No guarantee of instantaneous cancellation across a transaction, offline certificate cache or independent installed runtime is made. Overall GLOBAL readiness stays PARTIAL. Source and test discovery use exact searches and existing owners; no token-saving percentage was measured. No GitHub Actions, push, PR, merge or deployment was performed for this slice.
