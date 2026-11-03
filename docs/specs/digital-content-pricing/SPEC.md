# Digital files and audience prices

Owner request2026-11-03. Continue main `43afc871`; preserve Store, Paywall, Account, Media and Identity owners.

## Existing evidence and gaps

Store already sells virtual/physical products with exact prices, wallet/gateway checkout, orders, group fixed prices and VIP prices. Paywall already sells post/software/game/title/album/track/link using ContentPurchase; do not replace it. Gaps: per-item percentage/amount/free group rules, Prompt integration, and private downloadable product attachments. Public Library assets are not private paid attachments.

## Contract

- Account owns pure adjustment math: PRICE, PERCENT, AMOUNT, FREE; integer minor money/basis points, no floats for decisions. Lowest eligible price wins; discounts never stack. Active unexpired custom groups and current VIP qualify. Purchased access persists independently of later group expiry; free group/VIP eligibility is live, not a permanent purchase.
- Existing ProductGroupPrice gains a mode, default PRICE; existing values are preserved. Product's optional VIP policy and PaidItem's optional policies default empty, falling back to current legacy prices. No duplicate catalogue, checkout, user, group, grant, wallet or payment system.
- Store owns FILES virtual products/attachment relations; Media owns private streaming/storage using the existing storage tree and Library size setting. Direct raw uploads never pass through public storage. Public Library copies must be explicit; their original public copy is not made private. Download always rechecks publication, section/module/maintenance, audience/account, current free eligibility or a current paid order line; refunds close paid-order eligibility. No public storage key/source URL projection. Runtime storage must also be excluded from production artifact traces; the build must refuse any residual runtime-data reference. Range/attachment/no-store/abort/byte-limit handling is mandatory.
- Paywall adds `prompt`; catalogue/detail/studio/generation paths redact paid source/defaults/examples before serialization. Protected content cannot be reconstructed via list APIs, RSC, studio state, generation or search cards. Public descriptions/sample previews remain public. Existing module-off semantics and canonical section/audience gates remain.
- `cms.products` controls product files/prices; each section's existing manager permission controls its content price (Prompt: `prompts.manage`). Authors cannot price. Writes require Origin and current transactional permission/audit; price and attachment edits use stale-write claims. Preserve callbacks, orders, existing grants, URLs and default-off Membership/Paywall activation.

## Interface

Shared themed pricing-rule editor: ordinary price/currency, audience, adjustment and computed example; native labelled fields, keyboard remove, no hidden stacking. Retain drafts on errors/conflicts. Product files panel provides named private files with size/type, explicit delivery mode and pending/error/success feedback. Buyer panel shows the actual current price or free/owned access and download action. Preserve wide layouts, Persian RTL, both themes, scoped semantic tokens, restrained hover/focus and reduced motion.

## Acceptance and rollback

Run pure monetary/multi-group/zero/expiry tests; fresh PostgreSQL pricing/audit/revision/checkout/order/refund/Prompt redaction/file-authority tests; deliberate pricing and download/redaction bypass mutants must fail. Actual Admin and buyer browser flows at1440/390 light/dark, forbidden direct requests, axe, React Doctor, source/architecture/schema/types/security and production build. Use isolated data; never claim a provider delivery was tested. Additive schema parity/manifest; no production migration or module activation. Roll back UI independently; disable selling/file delivery before removing guards, retain attachments and historical orders/grants.

Executed scope, current evidence, limits and rollback: [canonical continuation](../../agent/handoffs/DIGITAL_CONTENT_PRICING.md).
