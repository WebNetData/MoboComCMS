# Store experiences — 2026-11-14

Authorized continuation in `.mobocom/store-experiences`, branch `feat/store-experiences-2026-11-14`, base main `337831b3c0064ff6de3dfe50e556e2fd6271ee5a`. Owner requested all nine capabilities with focused verification. Existing owners remain authoritative; this document describes acceptance, not completion.

| Slice | Existing owner / intended extension | Acceptance |
| --- | --- | --- |
| Cancellation, returns, refunds | Store returns / Billing / Wallet | Eligibility and submission failures visible; controls stable during submission; truthful refund destination; existing atomic claim and refund retained. |
| Purchase funnel | Analytics collector/dashboard | Clearly labelled event counts and server-paid orders; no invented cohort conversion or client-paid claims. |
| Order desk | Store orders/order-work | Existing scoped assignment, mine/unassigned/delayed views; permissions apply to counts and records. |
| Catalogue quality | Catalog product editor/attributes/variants | Actionable missing photo/specification/price/variant findings; existing editing and revision ownership. |
| Procurement | Catalog receipts/location inventory | Supplier purchase with frozen quantities/costs; version claims; partial receiving and replay in one inventory/audit transaction; over-receipt rejected. |
| Device compatibility | Catalog relationships + explicit device evidence | Declared compatible/conditional/incompatible model and note; never infer fit from names alone. |
| Goods with services | Existing ProductBundle + isService | Existing bundle cart and common checkout/fulfilment; service distinction remains explicit. |
| Used/refurbished goods | Product condition + existing gallery/warranty | Typed condition/grade/health disclosure; feeds reflect actual condition; defaults preserve existing new goods. |
| Gift order | Store settings + Checkout order snapshot | Optional recipient/message/free wrapping; private buyer-authorized price-free receipt; financial invoice unchanged. |

## Invariants and rollout

Canonical UserId, existing section guards, module switches, URLs, SDS tokens, money/stock owners and audit remain. No second cart, accounting, queue or analytics system. Procurement constraints are additive and registered in the release manifest in both Prisma schemas. New gift settings default off; old orders remain readable. Idempotent receiving checks replay before terminal-state rejection; financial transitions use compare-and-set claims. Gift recipient is display data, never an authentication identity.

## Focused evidence

One shared connected PostgreSQL pass for new persistence/race/rollback behavior, scoped types/schema/architecture review, and actual browser checks on changed customer/Admin views. Avoid full release/test repetition. Record only executed evidence and incomplete work in the existing Store handoff and workstate. Owner merges and deploys; no hosted workflow dispatch or real provider contact is authorized.

## Same-process contract and implementation notes

- POST /api/admin/store/purchases uses op create/receive/cancel; create/receive carry UUID requestId, receive/cancel carry purchase version. cms.products and transactional strict audit apply; replay precedes terminal-state rejection. GET supports bounded listing/detail/validated product preselection.
- GET /api/admin/catalog/quality carries after/through integer cursors; each response includes rows,total,throughId,nextAfter,limit. cms.products is required. Filters are explicitly over loaded rows. Existing Store bulk editing remains the correction owner.
- POST /api/cart/checkout adds optional gift object; old clients omit it. Recipient/message/wrap are checked against current Store settings and physical goods, then frozen. No new money type/state.
- PATCH /api/admin/forms/submissions adds attachPaidServiceOrder:true plus id/orderId; Forms eligibility and orders.manage both apply. Existing FormSubmission.repairOrderId is the sole repair link; no second payment or workflow.
- POST /api/analytics/collect accepts controlled checkout event; successful cart events are recorded by the cart owner. Same-process browser consumers use additive typed responses/native integration tests; no independently deployed API or Pact boundary is introduced.
- Existing public comparison now shows physical condition/grade/health/warranty; no numeric winner is assigned to condition or health.

Implemented local scope and executed evidence are in the Store handoff, which remains authoritative for limits and rollout.
