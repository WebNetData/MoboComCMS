# Store order operations — 2026-11-14

Continue `.mobocom/platform-integration`, `feat/store-opening-controls-2026-11-14`
from sealed opening controls `faa556fb`. Owner approved all listed follow-ups;
do not restart existing capabilities or edit unrelated worktrees.

| Scope | Existing owner and bounded extension | Acceptance |
| --- | --- | --- |
| Opening catalog/settings | Existing Catalog quality/editor, Store setup and Site/Shipping/Gateway/Notifications Admin | Use supplied real SKU/catalog/contact/policy/provider data only; preserve current content and secrets. Missing owner data remains explicitly pending, never manufactured. |
| Controlled purchase | Existing canonical cart/Checkout/Billing/Store/Shipping/pickup/customer order | Mobile purchase through payment, staff processing and delivery/tracking with synthetic isolated provider; live money/messages require actual configuration. Run only necessary native/browser scenarios. |
| Delivery amendment | Store owned order + existing Shipping address/carrier quote | Customer requests owned saved-address snapshot before dispatch/waybill, manager approves/rejects with previous/new address and fees. Owner selected **fixed customer charge**: manager explicitly acknowledges the difference borne by Store; original invoice/money amounts stay unchanged. Request/review and dispatch share Order locking/state claims; unresolved request blocks dispatch, stale snapshot/quote rejected. |
| Exchange | Existing return/refund and ordinary counter sale | Original return and new sale/invoice remain separate linked documents. Manager-only link, same buyer/currency/source order; missing/stale/double link rejected atomically, failed replacement leaves completed return intact. Display refund/replacement/difference without hiding gross money records. |
| Return inspection | Existing location balances/movements and ReturnRequest | Physical RETURN receipt goes to quarantine; managers record healthy/damaged/incomplete and release only approved units through existing stock moves. Quarantine never allocated online/counter or selected as register stock. CANCEL reservation release stays ordinary. Historical restock is retained rather than inferred. |
| Packing/handoff | Existing Order/OrderLine/ProductDelivery/StorePickup | Typed stored checks for model/variant/quantity/device/accessories, actor/time/snapshot. Physical dispatch/pickup requires current complete check; immediate counter handoff requires explicit checklist confirmation and records actor. Failed/stale/access-denied save/dispatch has no stock/money effects. |
| Reorder | Existing owned order and canonical cart | Explicit preview/add, current public prices/stock/variant/quantity rules, meaningful unavailable/changed items; existing cart preserved. Never replay old payment, promotion, device serials, gift recipient or encrypted secret answers. Fresh cart review and checkout required. |

Actors: owned customer through current Identity/customer guard; Store managers
`orders.manage`; held-work specialists `store.orders.handle` through existing
assignment guard; Catalog/stock existing `cms.products` or authorized stock manager.
Module-off and current resource permissions apply to API and UI, Origin to writes,
strict transactional audit for new staff data/stock writes. No parallel identity,
settings, inventory, Billing, Support or refund system.

Additive schema/migration/manifest coordinated by root. New non-money workflow
states receive DB constraints; financial states/types remain the canonical ones.
Data-safe rollback retains workflow history and money documents. Existing public
URLs/designs preserved; new cards/forms use current MoboCom/SDS tokens, accessible
labels/focus/errors, RTL, light/dark and390 mobile. React Doctor plus actual
browser/axe evidence; no screenshot-only claim of persisted behavior.

Connected PostgreSQL scripts cover ownership, money/stock preservation,
missing/stale/concurrent claims, quarantine allocation/inspection replay,
exchange rollback/link replay, packing/dispatch and reorder refusal/persistence.
No `.env`, fresh migrated disposable DB, UID1000; use deliberate scoped guard
faults where meaningful. Reuse existing test owners, avoid broad release reruns.

Root owns Prisma, dispatch integration, shared spec/workstate/handoff and runtime;
separate agents own reorder, return/quarantine/exchange and address-amendment files.
Record actual commands/results, open owner-data dependencies and exact cleanup.
No push/PR/merge/deployment/hosted workflow or live provider send is authorized.
