# Buyer/return and compiled-runtime evidence — 2026-10-10

## Scope and baseline

Continued from merged PR #146 (`main` b98b40cdcde7d1b3ac6cdf4abe5983452f219d95), preserving pending architecture/devstack changes and the owner's four excluded files. Existing Store checkout/returns, billing, wallet, delivery, Identity/profile completion and section permissions remain the owners. No new money schema, state, service or production setting was introduced.

PR #146's CI browser gate passed with two retries. Its log shows a development-server memory restart interrupting `/music`, and the standalone section-manager helper used Playwright's default five-second assertion rather than the suite's twenty seconds. A cold local reproduction at two CPUs/seven GiB was aborted after an actual cgroup OOM killed Next; five cases had passed. That failed experiment is not release evidence, and its `onDemandEntries` change was reverted.

## Executed bounded scenario

The compiled, previously verified PR #146 application (Next 15.5.27) ran with production validation, a separate migrated PostgreSQL 17 database, local HTTPS at `e2e.mobocom.test`, uid 1000, two CPUs/seven GiB and no `.env`. Fixture credentials and delivery keys have no deployment use. The normal production preflight and 100 migrations succeeded; no setup-mode or validation exception was added.

`scripts/store-buyer-return.browser.cjs` passed against that actual application:

- Canonical required-profile completion, Admin return policy and wallet credit, encrypted code-pool administration.
- Customer product/cart/wallet checkout without response interception; persisted order/invoice amounts, one debit and same-key replay.
- Delivered code visible to its buyer; other customer gets no order/code, and customer/API ownership and visitor/staff restrictions hold.
- Customer return form, order-staff approval/refund, repeat refund refused with 409; exactly one refund credit and original monetary amounts preserved.
- Used code retains its order/return history and cannot re-enter stock.
- Returned order reopens correctly; light/dark at 1440 and dark at 390 screenshots were inspected, no horizontal overflow or captured JavaScript/console error.
- Fixture rows are removed and the prior return policy restored in teardown.

`scripts/section-manager.browser.cjs` also passed on that same compiled HTTPS/PostgreSQL application: magazine-only metadata/block save/reopen/revisions; other-section reads/writes and missing Origin refused; light/dark 1440 and mobile 390. Its assertion timeout now matches the existing suite, and HTTPS uses the canonical secure session-cookie name.

Both scripts exited successfully in `.mobocom/mobocom-runtime-1791644441693/runtime-final-result.json` (exit 0). Screenshots/raw logs remain in that ignored local evidence directory. Earlier fixture attempts failed because of a SQLite-generated client, incomplete required profiles, streamed-not-found status assumptions and an untrusted self-signed service-worker certificate; these were corrected in the fixture, without weakening application guards. Chromium now accepts only that disposable certificate's SPKI; this is not public TLS certification.

## Current integration and limits

The real buyer scenario is registered in the existing Playwright suite with explicit disposable-local guards. `scripts/e2e-production.cjs` runs that suite against the compiled app with a local certificate; it requires production preflight, the reserved fixture origin and explicit isolation. The existing browser workflow now uses migrated PostgreSQL/Redis, a production build and this same runner with zero retries. No additional workflow or GitHub Actions run was created/dispatched; its new CI execution is pending the next consolidated PR.

The first complete compiled-runtime attempt failed: 52 passed, two failed, seven skipped, two subsequent serial cases not run, zero retries. Maintenance exposed a fixture hostname mismatch: Next normalizes loopback IPs to `localhost`, so starting with `-H 127.0.0.1` caused its HTTPS middleware rewrite to be treated as a remote upstream. Starting the isolated server with `-H localhost` and IPv4-first DNS restored the actual maintenance scenario (503, owner notice, permitted admin preview). No middleware/config bypass or product change was needed. The repository client's self-signed TLS/private-address fixture required the existing private-repository test setting and trust of its generated certificate in the application process. That connection scenario then passed.

The fast compiled suite also exercised the shared repository IP bucket within its real one-minute window; the buyer got 429 rather than the intended insufficient-funds response. The financial case now waits for that existing window only in a disposable production fixture. No application throttle or assertion was changed. Adding Redis alone did not resolve this per-IP scenario; the failed attempts remain failed evidence.

Final full-suite local run (`node .mobocom/run-production-full-browser.cjs`, invoking `node scripts/e2e-production.cjs --retries=0`) exited 0: **56 passed, 7 skipped, zero failures/retries, 2.7 minutes**. It included the previously flaky `/music` and magazine-only manager, actual buyer/return, section maintenance, repository client and purchase, public pages and the editor suite. The seven skips remain the existing optional sample plugin/theme and music-media fixtures. Peak memory was not measured; observed runtime snapshots were about 1.2–1.5 GiB within the seven-GiB limit. This does not prove hosted CI memory/timing until that workflow runs.

Other executed checks: `npm run typecheck`; source syntax/import (1733 TS/TSX files); security invariants; architecture boundaries; engineering docs (62 documents/routers, eight domains ×21 dimensions); explicit fixture-TLS refusal checks (non-isolated, remote and plain-HTTP); offline zizmor on the changed browser workflow (no reported findings, four existing suppressions). Scoped test/harness workflow whitespace checks passed. Whole-worktree whitespace checking failed on the owner's pre-existing excluded CRLF package files; those files were left intact. No new application build was claimed in this slice: runtime used the previously successful exact PR #146 build and generated PostgreSQL client.

This is local production-runtime evidence, not `ProductionVerified`. Real gateway/webhook, SMTP/SMS/delivery channels, named staging/deployment/rollback evidence and the remaining roadmap stay outstanding. An observed UX gap remains: a fully refunded order's return panel says it was unpaid; inspect/fix the existing domain eligibility precedence rather than inventing another status system.
