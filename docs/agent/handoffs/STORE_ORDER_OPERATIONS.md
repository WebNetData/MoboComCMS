Published on owner request2026-11-14: [PR469](https://github.com/WebNetData/MoboComCMS/pull/469), OPEN/non-draft, `feat/store-opening-controls-2026-11-14` → `main`; verified MERGEABLE at publication. Covers opening controls e7811335/faa556fb and order operations24c38b15/0ef60815,112 files. Reviewed source head0ef60815360f0d55a0c21e21dbc2ba4ab30f9996; complete-range redacted Gitleaks0 and Semgrep72 targets0. Existing local PostgreSQL/browser evidence is recorded below; no rerun of runtime tests or hosted workflow dispatch for publication. This documentation-only receipt follows the reviewed source. Owner merges/deploys; real opening data and live provider/printer/restore checks remain pending.

# Store order operations — active continuation 2026-11-14

Owner authorized opening catalog/settings + a controlled purchase, delivery
amendments, connected exchange, return quarantine, packing/handoff checklist and
reorder. Authoritative checkout `.mobocom/platform-integration`, branch
`feat/store-opening-controls-2026-11-14`, base sealed opening controls
`faa556fbdfe1f92afcbb12ca9f7d3d77767f85e9`. This batch is **locally implemented and verified**.
Implementation/evidence commit: `24c38b1592b3d4fff25c5c5221152aec27e56fe0`
(66 files); the worktree was clean after that commit. This status-only receipt
follows it. No publication or deployment is authorized by this continuation.
Preserve other checkouts and prior `e7811335`/`faa556fb` receipts.
[Compact spec](../../specs/store-order-operations/SPEC.md) ·
[Operator guide](../../STORE-OPENING-FA.md).

## Owner decision and missing inputs

Owner explicitly selected: **original customer payment stays fixed for an address
change; manager acknowledges the shipping quote difference borne by Store**.
Approval never introduces a supplemental charge, wallet move or paid-invoice
rewrite. Real opening SKU/content, contact/hours/approved policies and provider
names were requested and have not been supplied. Continue with actual owner data;
synthetic acceptance does not establish live provider readiness.
No live gateway/payment, provider send, push/PR/merge/deployment or hosted workflow
occurred in this batch.

## Implementation and ownership

| Scope | Current owner and persisted behavior |
| --- | --- |
| Data | Both Prisma schemas and registered additive migration `20270319120000_store_order_operations` (202nd migration): `OrderDeliveryChange` open claim/history/quote snapshots/canonical actors, `OrderPackingCheck`, ReturnRequest inspection and unique replacement Order link, non-sellable `StockLocation.isQuarantine`. Existing financial states, amounts and history remain authoritative. |
| Packing/handoff | Store `domain/packing.ts`, `server/packing.ts`, private HTTP/API and Admin `PackingPanel.tsx` record five per-line checks, device snapshot, verifier/time/revision. Existing order, pickup and Shipping dispatch share the Order lock and require a current complete check with no pending address request. Shipment/order transitions commit together. Immediate counter handoff requires explicit packing confirmation and stores its verifier. |
| Address amendment | Store `domain/delivery-changes.ts`, `server/delivery-changes.ts`, `server/http/delivery-changes.ts`, customer/Admin API aliases and panels compose saved-address ownership and the real Shipping validator/quote. One unresolved request; immutable before/after snapshots; manager review/current quote acknowledgment; no change after dispatch/waybill. Approval keeps customer money fixed. |
| Reorder | Store `server/reorder.ts`, private HTTP/API and `components/store/ReorderPanel.tsx` use the canonical Cart owner and current public product/variant/pricing/stock rules. Preview shows changed/unavailable lines; existing cart rows remain. Fresh required service inputs are entered again; old answers, device identifiers, gifts, promotions and payments are not replayed. |
| Return custody/inspection | Existing Store Returns and Catalog location/movement owners (`returns/inspection.ts`, `returns/refunds.ts`, `catalog/server/{locations,location-admin}.ts`) put physical RETURN receipts in quarantine. Managers record healthy/damaged/incomplete segments whose total equals each returned line. Only healthy approved units move to an active sellable destination; damaged/incomplete custody remains. Late physical receipt is separate from an already-completed refund. CANCEL reservation release and prior restock history remain unchanged; first quarantine creation preserves finite, variant and unlimited sellable stock. |
| Exchange | Existing counter sale/return owners, `ExchangePanel.tsx` and `ExchangeSummary.tsx` link a refunded source return to one ordinary replacement sale, with manager-only same-buyer/currency/source checks in the transaction. Refund and replacement invoice/payment/tender remain separate gross records. A failed replacement leaves the completed return intact; the summary explains the arithmetic and requires receipt of the full new invoice amount. |

Existing `orders.manage`, held-work `store.orders.handle`, Catalog stock authority,
canonical Identity and module guards remain the access owners. New writes retain
Origin validation and strict transactional Audit. No parallel inventory, refund,
Billing, cart, settings, support or identity system was added.

## Executed local evidence

Fresh disposable PostgreSQL `mobocom_orderops_test_20261114`, private source/client
`/tmp/mobocom-orderops-20261114`, preview3121:202 migrations, no `.env`, explicit
synthetic environment, UID1000. The owner's database was not modified. Maintained
checks are registered in `scripts/run-pg-checks.cjs`; task runners/receipts are
ignored under `var/orderops-20261114/`.

Executed through the isolated UID1000 runner:

- `node scripts/store-packing.connected.cjs`: missing/incomplete/stale checklist,
  customer/unheld specialist refusal, device/verifier snapshot, unresolved address
  request blocking dispatch and successful dispatch without money/stock writes.
- `node scripts/store-delivery-changes.connected.cjs`: saved-address ownership,
  one open request, immutable snapshots, fixed customer charge, explicit Store fee
  acknowledgment, stale real carrier quote refusal and withdrawal history.
- `node scripts/store-reorder.connected.cjs`: owned-order scope, real current price
  and stock, price changes, inactive variant/fresh-input refusal, canonical cart
  persistence with prior rows retained and no old answers/payment.
- `node scripts/store-return-inspection.connected.cjs`: real counter/standalone
  refunds; finite/variant/unlimited legacy stock preservation; quarantine exclusion
  from allocation/register/transfer/count/receipt; complete mixed dispositions;
  stale/replay/late-receipt refusal and strict-audit rollback; manager-only exchange
  with independent gross invoices/payments/tenders and one replacement link.
- `node scripts/store-counter.connected.cjs`: guest/linked mixed sale, exact money,
  stock/codes, audit/replay/key conflicts/races and rollback/permissions/module/DB
  guards, with explicit packing confirmation in the existing fixture.

The root agent's read-only PostgreSQL proof `persistence.log` confirms: wallet
purchase Order69 has exactly one WALLET payment1100, PAID invoice1100 and remaining
wallet998900; amendment Order68 keeps original/invoice1100 while its shipping
quote changes100→200, with the approved Isfahan address/plaque normalized1 retained;
reorder persisted current cart quantity1. Counter sale70 retains gross2000,
payment/tender2000 and separate CASH refund2000; replacement71 retains gross1000
and payment/tender1000. Return16 releases1 healthy unit, keeps1 damaged unit in
quarantine, and sellable balance is17 after the replacement. Values are isolated
fixture minor units, not production prices.

A deliberate fault bypassed `assertOrderPacking` only in the private container.
The native check failed with `Missing expected rejection`; the original source
was restored byte-for-byte and packing passed again. This is actual guard
sensitivity evidence, not a source-only assertion.

## Browser evidence and final visual rerun

`scripts/store-order-operations.browser.cjs` executed real UI writes against the
isolated database: mobile wallet purchase69, packing/dispatch, buyer tracking and
reorder; customer address request/manager approval on68; sale70 → Return16,
inspection of1 healthy +1 damaged unit, and linked replacement71.

The initial mobile checkout at390 dark passed and is captured in
`browser/mobile-checkout-dark-390.png`. A resumed receipt in
`browser/progress.json`/`browser/result.json` records19 views: mobile tracking
plus customer amendment, reorder, Admin amendment, packing, inspection and
exchange at1440 light/dark and390 dark; its scoped axe/overflow/error counts are0.
The checkout capture precedes that receipt and is not part of the19 count.
Visual inspection found the completed inspection summary inherited the ordinary
three-column thumbnail row and squeezed its only child into48px. A scoped
`rt-inspection` single-column override now preserves the ordinary return rows.
The final resumed run after that correction passed all19 views with scoped axe0,
overflow0 and pageerrors0. The390 dark and1440 light screenshots were visually
reviewed and confirm readable, full-width summaries. No browser errors were
filtered as passes.

Earlier failures remain history: delivery initially stubbed the real Shipping
validator; reorder initially used a fake DB/old variant contract; inspection
fixture initially omitted the exact cash-refund register movement. They were
corrected to current owners and the native checks above passed. Intermediate
type errors were corrected and final integrated typing passed. Initial
browser attempts timed out at the inspection destination selector and old
register label during/resuming local preview compilation; current controls were
corrected and the same persisted journey resumed. This is not an uninterrupted
first-run claim.

## Final checks and cleanup

- Final full TypeScript `tsc --noEmit --incremental false`, delivery and reorder
  native checks passed after the last backend contract/privacy corrections.
- Source syntax/import2901, architecture boundaries, Prisma parity, money schema,
  release manifest, security, Audit, money UI2903 and money primitives passed.
- React Doctor scanned12 affected TSX files with0 blocking errors and30 warnings;
  no rule/config suppression. Remaining warnings include existing page complexity,
  async effects with explicit abort/generation guards, client formatting and
  read-only list indices; this is not a warning-free claim.
- Scoped Semgrep covered39 changed/new TS/TSX targets with0 findings; redacted
  Gitleaks included the full changed/new content with0 findings. Final diff check
  passed. Canonical AI knowledge regenerated and its14-document check passed.
- 57 final source/script/schema files matched the private runtime byte-for-byte.
  The generated knowledge bundle is a data-only addition after browser acceptance.
  The staged diff check subsequently required removing surplus blank lines at
  the end of `returns/inspection.ts`; that whitespace-only normalization follows
  the hash receipt and does not change the executed code.
- Read-only persistence proof passed again after browser replay: no second purchase
  or refund; sellable17 and quarantine1 remain exact.
- Exact task cwd/process/path/DB guards stopped3 task preview processes, removed
  task-only source/client/env/sessions/TLS and named archives, dropped the named
  disposable database, stopped the owned TLS tunnel and removed host private files.
  Original app3000 readiness200 and session200 were actually rechecked.

Earlier preview restart/chunk/fetch failures are retained in ignored logs. They
were not accepted as passing runs; the final stable19-view receipt has no errors.
Maintained scripts use explicit isolated fixtures; generated cookies, private
credentials and local TLS material are not committed.

## Continuation and rollback

1. Review the local commit receipt and preserve this verified implementation.
   Publish a PR only on owner request; owner merges and deploys.
2. When owner supplies real catalog/contact/hours/policy/provider data, configure
   it through existing Admin owners and verify the actual opening journey in the
   intended environment. Do not manufacture business or legal promises.
3. Real bank/provider delivery, messaging, printer, production-domain and restore
   checks remain operational follow-ups, not completed by local synthetic proof.

Rollback retains new workflow history, stock movement/custody and financial links;
revert application code together while preserving additive data. Inspect pending
requests/checks before switching versions. Never drop quarantine balances, reverse
inspection by rewriting history or edit paid invoices to reverse the release.
