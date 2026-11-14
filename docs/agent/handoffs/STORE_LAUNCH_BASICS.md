# Store opening basics — 2026-11-14

Owner authorized the existing launch essentials after explicitly deferring the
advanced proposal backlog. Continue the authoritative checkout
`.mobocom/platform-integration`, branch `feat/platform-integration-2026-11-14`,
base `68746778` (owner-merged Store PR467), after local platform commits
`96ac5736` / `a3821468`. This slice is local; no push, PR, merge, deployment,
hosted workflow, real payment/provider test or customer message was performed.
Preserve unrelated root/autonomous-foundation/repair/bank worktrees and every
saved proposal in [the platform handoff](PLATFORM_INTEGRATION.md).

## Implemented slice and ownership

- Store domain `sellableStock` now supplies the same existing aggregate cap to
  public Catalog cards and the Admin product list. Parent stock3 and variant
  stock5+5 show3, including the unlimited-variant case. Admin distinguishes
  minimum active-variant price from base price. No public price rule changed.
- Existing Billing gateway POST/PATCH wrap default clearing and the resulting
  insert/update in one transaction. Invalid minimums and failed writes keep the
  previous default. Existing `gateways.manage`, secret masking and Origin guards
  remain authoritative. The form starts minimum amount at0: the previous blank
  value was rejected by the server even on a normal first save.
- `/admin/gateways` distinguishes initial read failure, pending, genuine empty
  state and saved state; explicit retry/refresh, abort fencing and synchronous
  pending lock prevent stale reads/duplicate UI submissions. Failed writes keep
  the draft and explain uncertain network results. No provider call is automatic.
- `/admin/shipping-carriers` retries failed initial reads, retains failed-save
  edits, locks controls while saving, and accepts Persian/Arabic digits through
  the existing shared digit converter. Inactive carrier text keeps full opacity
  after the actual light-theme contrast failure; existing tokens/layout remain.
- `/admin/store/registers` shows location loading/error/empty states and blocks
  opening until an active location is known. Default-option copy describes the
  existing shop-or-main-warehouse selection. Backend location invariants remain.
- The old `store-counter.connected.cjs` fixture now opens through the real
  register API so it obtains the required location. It no longer creates an
  invalid locationless register directly. No financial guard was weakened.

No schema, migration, dependency, API shape, shared owner or protected URL was
added. Eight runtime source files changed; helpers/fixtures are scoped tests.
[Opening guide](../../STORE-OPENING-FA.md), [spec](../../specs/store-launch-basics/SPEC.md).

## Executed evidence

Fresh disposable PostgreSQL `mobocom_launch_test_20261114`, all200 migrations,
private Prisma client, no `.env`, UID1000, isolated Next preview3118 and synthetic
staff/products/settings only; the owner's app/database were not test targets.

- `store-launch-basics.connected.cjs`: real guards, invalid minimum, injected
  insert/update failures, retained default and product/variant price-stock
  projections; passed. Initial fixture incorrectly inherited USD, so100 minor
  units read as1; explicit IRT corrected the fixture, not the money conversion.
- Existing `content-management`, `store-counter`, `repair-invoice` and
  `return-refund-integrity` connected scripts passed. This includes catalog
  persistence/revisions, actual cash/mixed counter sales/invoices/stock and
  replay/race/refusal/rollback paths, repair invoice/handover gates and duplicate
  refund protection. Their console summaries remain bounded to these scripts.
- `node --test scripts/store-v2.test.cjs`:17 passed as UID1000 without `.env`.
- Removed both default-gateway transactions only in the disposable source;
  the native test failed on default preservation. Restored the exact source and
  reran successfully. Final TypeScript7 `--noEmit --incremental false` and source
  syntax/import check2872 TS/TSX passed; architecture and security gates passed.
  The host source check lacked `typescript-api`; the successful source check
  ran against the installed container toolchain instead.
- Actual `store-launch-basics.browser.cjs`: gateway failed read/retry, pending
  lock, failed save retained draft, one persisted manual gateway; shipping failed
  read/retry and failed save retention, Persian250 and persisted origin/weight;
  failed location read prevented register opening, retry opened one register
  with a real default inventory location. No provider test button was clicked.
-12 actual captures: four changed surfaces at1440 light/dark and390 dark;
  scoped axe0, horizontal overflow0 and page errors0. Four representative images
  were visually inspected. The first runner used an ambiguous alert selector,
  then wrongly expected an empty install despite the seeded CARD_TRANSFER;
  both fixture assumptions were corrected. Real first save then exposed the
  blank minimum bug. Shipping contrast failed3.72:1 before the opacity fix.
  Successful gateway/shipping operations were retained when resuming captures;
  this is combined evidence, not an uninterrupted full-suite claim.
- React Doctor on the four affected pages: exit0, no blocking errors,
  14 reviewed warnings (complexity/size, existing repeated lookups and numeric
  parsing; loading resets are already in abort-aware `finally`; mutation bodies
  are parsed to read errors then HTTP status is checked). Connection-test
  success now also checks HTTP status. No diagnostic was suppressed.
- Final proof matched all8 runtime hashes to the validated source, one manual
  gateway and one location-bound register; orders/invoices/payments all0 after
  native cleanup. Receipts/screenshots live in ignored `var/launch-20261114/`;
  tracked scripts retain reproducible scenarios, never private session values.
- Scoped Semgrep local rule:7 TS/TSX files,0 findings; only an existing rule-path
  compatibility warning. Redacted Gitleaks scanned the complete22-file changed
  payload,0 findings. `git diff --check` and generated14-document knowledge
  consistency passed. Shared workstate history and deferred proposals survived.

Earlier physical-goods cart → checkout → invoice → shipment/tracking and bank
stand-in browser evidence remains attributed to
[Store continuation](STORE_ADVANCED.md); customer login evidence remains in
[Identity continuation](PASSWORDLESS_ENTRY.md). They were not rerun here.
The current browser checked setup/register operations, not a new whole-customer
purchase, real repair intake or printer. Existing owners were reused throughout.

## Next continuation and rollback

Task preview's3 exact-cwd processes and the verified host tunnel were stopped;
only the named disposable database/runtime/private client/env/sessions/TLS and
archive were removed. Host private fixture and TLS files were removed as well.
Original app readiness and auth-session endpoints both returned200. Cleanup
receipt is ignored `var/launch-20261114/cleanup.json`.

Use the opening guide with real intended catalog and deployment settings:
verify provider credentials, domain/TLS, actual delivery/printer/message paths
and a separate restore drill. These operator checks remain unverified; synthetic
success is not production readiness. Do not reopen the advanced backlog as the
next task or create a second readiness/configuration system.

Rollback this bounded source/test slice through Git; retain every customer,
product, stock, invoice and settings row. No reverse migration or database
snapshot restore is needed. Owner merges and deploys.
