# MoboComPay — merchant card-transfer collection and reviewed settlements

## Custom bot adapter and Pay presentation — owner2026-11-24

Continue fresh merged main deb80549 in .mobocom/pay-bot-integration,
feat/pay-bot-integration-2026-11-24. Owner supplied the bot's custom gateway
request/verify contract and authorized choosing a compatible implementation when
the bot name and acknowledgement example were unavailable. Preserve the selected
MoboCom Custom theme and unrelated public visuals; refine only Pay surfaces.

Existing Billing/Pay/Gateway/Wallet, canonical human Identity, encrypted provider
credentials, strict Audit and Operations queue remain owners. A terminal-scoped
integration receives a dedicated generated hashed create credential (not a human
identity or a full-account API token). Body api_key authenticates only the exact
terminal adapter. Public API/module/maintenance, active current merchant/User and
terminal are checked again inside the transaction. Request amount is integer
Toman, converted exactly to IRR by BigInt*10; unsafe/fractional numbers refuse.
order_id is the stable terminal-local external identity and idempotency source.
Changed amount/type/external user claims on replay refuse409; other bot-supplied
history/balance claims never establish bank attribution or canonical User identity.
Both {url} and {links:[{text,url}]} shapes are supported; the same hosted checkout
offers actual compatible methods without creating multiple financial obligations.

After genuine PAID credit, an immutable terminal/order delivery intent is queued
in the same financial transaction. Its separate encrypted Token goes only to the
configured same-origin HTTPS /api/payment endpoint, body
{order_id,actions:'custom_payment_verify'}. Network I/O is outside transactions.
DNS results must be public and pinned into the HTTPS connection, TLS hostname
verification remains, redirects refuse, deadline/response bytes are bounded,
tokens/bodies never enter logs. PAID/Wallet credit does not depend on bot reply.

The provider's successful response was not supplied. Therefore enablement requires
an explicit acknowledgement policy: JSON ok===true, JSON status==='success', or
HTTP2xx as a consciously selected contract. No default policy silently certifies
this unknown bot. Unknown/malformed/negative answers and timeouts remain UNKNOWN;
a SENDING lease after interruption becomes UNKNOWN without sending again.
There is no automatic retry of ambiguous external effects. A merchant may explicitly
confirm external delivery or resend after acknowledging duplicate-delivery risk;
both actions use fresh ownership, version/state claim and strict Audit. Config
rotation pauses stale snapshots until an explicit reviewed retry binds current
credentials. Disabling preserves payment/delivery/audit history and stops egress.

Additive typed integration/delivery models and constraints preserve all prior
payments. UI: connection setup with one-time key, separate callback secret,
clear contract/readiness, payment-vs-order delivery statuses and operator recovery.
Checkout gets a clear progress/state hierarchy, attractive scoped brand effects,
RTL/responsive, keyboard, focus and reduced motion. No new global palette/theme,
external bot call, bank/SMS send or live activation is authorized by local testing.

Acceptance: pure hostile parser/amount/ack tests, native PostgreSQL concurrent
create/replay/mismatch/rotation/authority/Audit rollback, PAID+delivery atomic intent,
no send before PAID, exact-once internal credit, late callback uncertainty and
explicit retry, public/private/DNS-rebinding/redirect/timeout transport probes.
Contract/OpenAPI and real ready-state browser1440 light/dark+390 with original
Custom theme, keyboard/axe and React Doctor. Independent unknown bot remains
Unverified until its actual acknowledgement and idempotency are tested.
Rollback disables adapter/egress while retaining canonical payments and intents;
never reset PAID, repeat Wallet credit or blindly replay an uncertain bot action.

## Shared hosted checkout continuation — owner 2026-11-23

Supersedes the original bank-only collection path below. Reuse Billing's active compatible Gateway catalog and its real provider callbacks through an explicitly typed `Invoice.kind=PAY_COLLECTION`; this document has no customer User, Order, product, wallet credit applied or Store fulfillment. A unique immutable PayPayment→Invoice relation connects the real charge and its receipt/provider proof to exactly one merchant credit in the same transaction. Core financial/provider configuration is not copied. Future providers joining canonical create/verify/settle work through the same invoice boundary; supported currency/precision still applies. FrenzyEx's Telegram-bot fallback is disabled for Pay; the hosted checkout URL is the only entry supplied to a merchant bot.

Clarified fees: each merchant chooses MERCHANT (base total, net=base-fee) or CUSTOMER (total=base+fee, net=base). Fee=min(ceiling(base*bps/10000)+flat, cap) when cap>0; zero means no cap. Cap is on the complete fee, not payment size. Existing min/max payment validation remains, with no newly invented payment/day cap. Fees and total are immutable per-payment snapshots; changing terms affects new payments only.

The guest first sees merchant/order/base/fee/total, then verifies possession of a phone through canonical SMS OTP and human-check. The challenge binds payment and browser; a HttpOnly scoped ticket, encrypted phone, last4 and verification time are stored on the payment. This is phone possession proof, not a legal identity/KYC assertion or a global login. Only the verified browser can view card/instructions, start a provider charge or upload its receipt. No new customer identity is created. Invalid/replayed/cross-payment/cross-browser OTP or proof is denied; failed attempts persist.

Canonical card-transfer receipt storage accepts a guest solely for this Pay collection invoice. Image validation/size bounds/storage are reused. Manual review requires current `mobocom-pay.manage`, cannot approve one's own merchant, claims the receipt, and atomically settles the canonical invoice/Pay/Wallet/journal/audit. Signed bank evidence may also settle the linked collection; an SMS/device adapter must supply trusted payment attribution and may not trust a customer's claimed reference alone. Unmatched deposits remain investigation-only.

Provider initiation uses a durable STARTING claim and exact gateway/ref/amount/phone snapshot. Only a definite FAILED may retry; lost/ambiguous provider answers remain UNKNOWN/STARTING for investigation, no blind create. Provider verification/callback must match the invoice/gateway and exact total; return navigation never verifies payment. Existing provider callback URLs remain. Public hosted return remains `/pay/:id`; the verified result is exposed through owner-authenticated v1 payment GET. Merchant bot/site owns idempotent fulfillment after matching PAID/id/externalId/amount. A normal URL button or a permitted Telegram Web App button opens the MoboCom checkout; no MoboCom→Telegram request or merchant bot token is required. No outbound financial webhook is claimed.

Additive migration `20270326120000_pay_shared_checkout` preserves old amounts/bank evidence, adds fee/proof/initiation snapshots, widens canonical Invoice kind/null-customer constraints only for Pay, and protects invoice/ledger/proof relationships. Native PostgreSQL checks must prove fee sides/caps/terms snapshots, guest privacy/OTP attempts/replay/isolation, active gateway reuse, receipt rejection/approval races, automatic bank receipt match, provider callback replay and no double journal/Wallet credit. Actual browser flows cover OTP-before-card, receipt upload/review/success, online provider return, fees administration, RTL/theming/mobile and module/permission denial. Fake provider/SMS boundaries are test evidence only; real bank/SMS delivery and additional networks remain integration prerequisites.

Owner request 2026-11-23. Checkout `.mobocom/mobocom-pay`, branch `feat/mobocom-pay-2026-11-23`, fresh `origin/main` bcdfbdc7. This is implementation scope, not a live-service readiness claim.

## Decisions and existing owners

The owner selected replaceable bank-feed integration, automatic incoming verification, and administrator-reviewed payouts. Initial assets: IRR, TRX/TRON, USDT/TRON; additional networks await the owner's names. Incoming funds are IRR; the crypto amounts are settlement quotes, not incoming crypto deposits. The product is MoboComPay.

Billing already owns bank accounts, card-transfer receipts, payment orchestration and financial history. Wallet owns currency accounts and atomic integer movements. Public API owns hashed/revocable API keys. Identity owns users/current standing/permissions; Settings owns versioned configuration/history; Audit and Notifications retain their existing transaction/outbox owners. Extend those addresses. No new authentication, shared wallet, job queue or settings registry.

## Actors and access

- Existing signed-in User enrolls a merchant profile. Initial PENDING status cannot collect or settle. Only an administrator with `mobocom-pay.manage` approves/suspends merchants and changes Pay settings.
- The same user manages only their terminals/payments/quotes/settlements. Machine access uses the existing API-key system and requires an explicit bearer key, current ACTIVE user and merchant, strict rate limit and the enabled public API. It never falls back to cookies.
- `mobocom-pay.settle` independently allows settlement decisions. No self-approval. All financial writes repeat current module/user/merchant/settings/permission checks inside the transaction.
- Anonymous checkout uses a cryptographically random payment capability and reveals only that payment and its assigned canonical bank account. A customer can report a transfer reference; this is never evidence of receipt.
- Bank bridge uses timestamped HMAC over bounded raw body, constant-time comparison, an environment-owned secret and configured provider identity. No browser credentials or merchant key can attest a bank event.

## Data and money rules

Typed Billing-owned PayMerchant, PayTerminal, PayPayment, PayBankEvent, PaySettlementQuote and PaySettlement reference the canonical User, BankAccount and WalletTx. FKs restrict deleting history. All amounts are BigInt minor units; API strings are exact; incoming/withdrawable liability is IRR. Rates are explicit administrator-entered IRR per whole asset, snapshotted with asset/network/decimals/fee and expiry in a short-lived quote. Never infer a market rate or network.

An authenticated bank event is unique by provider/reference, with an immutable exact-body hash. Automatic credit requires a trusted `targetPaymentId` attestation, matching assigned bank account, exact IRR amount, customer-reported transfer reference and event occurrence inside its payment window. The provider adapter must derive attribution from bank-attested payment-specific evidence, not the customer reference. Unbound events remain unmatched even when the amount/reference match. Reconciliation works in either arrival order. Retries cannot credit twice. Late/unmatched events stay visible for investigation and never silently credit another invoice; no manual override of this proof is shipped.

Withdrawable proceeds are an exact subset (`WalletAccount.withdrawableMinor`) of the canonical IRR balance, with immutable delta/after facts on WalletTx. Ordinary credits do not grow it; a purchase consumes ordinary funds first and then proceeds. A later top-up cannot replenish spent withdrawability. A request debits both subsets under the canonical account lock. Pending reserves cannot be spent in Store. Rejection atomically refunds once and restores provenance; approval retains reservation; marking PAID requires external bank reference or chain transaction hash and never sends money by itself. Full failed-checkout/VOID credit reversal links its original PURCHASE once and restores exactly its consumed proceeds; the invoice closes before the refund so a stale bank callback cannot count returned credit. General merchandise refunds remain nonwithdrawable. Database checks/triggers constrain state transitions, positive amounts, immutable quote/payment facts and terminal settlement rows. Unique references prevent duplicate recording. Financial commands compose strict audit; verification/settlement decisions compose existing inbox notifications in the same transaction. Verified collections also enter Billing's canonical Payment journal with no top-up invoice/recovery path.

## Surfaces and contracts

Module manifest `mobocom-pay` is opt-in; disabling preserves all rows and closes its APIs/pages. Add the public section to canonical maintenance/access registration. `/dashboard/pay` is the merchant console; `/admin/mobocom-pay` manages merchants, reconciliation, settlements and typed settings. `/pay/:paymentId` is the public payment screen. New routes delegate to Billing's public `server/pay` and `server/http/pay` addresses. Existing protected pages/URLs/visuals remain.

Session API `/api/pay/:resource`; stable machine API `/api/v1/pay/:resource`; signed feed `/api/payment/mobocom-pay/bank-events`. Creation/reservation uses Idempotency-Key and binds a normalized request fingerprint; different payload with the same key returns 409. Public checkout reports never claim success. A return URL is registered per terminal and shown only after persisted success; merchant fulfillment must verify by authenticated GET, never trust URL status. First release uses reliable polling/verify, not Telegram API calls or arbitrary outbound callbacks. A Telegram bot hosted anywhere calls ordinary HTTPS and sends its customer the checkout URL; MoboCom's Iran server does not call Telegram. Provider selection and connectivity remain deployment dependencies.

## UI direction and acceptance

Apply local Unslop under MoboCom/SDS constraints and OpenDesign's brief → design-system prototype → inspect/refine workflow. Persian RTL, existing type/tokens, calm financial chrome and a meaningful cashflow chart; precise money labels, fee disclosure and quote expiry. Distinguish request/approval from completed transfer. Loading/empty/error/retry, disabled service, merchant suspension, mobile tables, keyboard/focus, 1440 light/dark, 390 and reduced motion are required. All reports come from persisted rows; no fabricated metrics. Paginated searchable payment/settlement lists and CSV export must enforce identical owner scope and neutralize spreadsheet formulas.

## Verification, rollout and remaining integration

`scripts/mobocom-pay.connected.cjs` on an owned empty PostgreSQL database: canonical identity/owner denial, module off, merchant standing, exact bank match, either arrival order, duplicate/conflicting events, concurrent credits/withdrawals, quote expiry, immutable facts, insufficient wallet vs entitlement, audit rollback, reject-once, admin separation and terminal states. Deliberately break matching/idempotency/reserve checks and prove failure. Extend an existing test:site file with domain/security units; register native PG script. Run schema parity, manifest/generated/architecture/source and relevant security/audit/money gates. React Doctor + actual themed/mobile Playwright/axe evidence; no hosted workflow dispatch. No live bank, real payout, deployment or full service completion claim without selected-provider verification.

Incremental migration `20270325120000_mobocom_pay` is listed under unreleased; preserve existing migration hashes/data. Disabling preserves rows and Core spending. After any withdrawable activity, retain the upgraded Wallet-compatible binary and migration, disable Pay and forward-fix/reconcile reservations; an older Wallet binary cannot maintain the new subset invariant. Never drop financial history. No private keys, real card details, secrets or customer data in fixtures/docs/screenshots. Executed evidence and integration limits live in [the handoff](../../agent/handoffs/MOBOCOM_PAY.md).


## Routing and operational follow-up — owner2026-11-24

Owner authorized both confirmed platform repairs (CRM department metadata/current
playlist audience/CRM IRR projection) and Pay routing/operations from merged PR484
main bd6a218a, in `.mobocom/pay-routing-operations`. Existing canonical owner guards
and money primitives repair projections; saved content relations and stored money
are preserved. No Support race redesign or unrelated audit backlog is implied.

Pay keeps Billing/Gateway/Wallet/Jobs/Identity/Audit owners. Browser-only merchant
configuration stores up to12 ordered typed rules on the terminal integration.
First enabled AND match chooses1..5 canonical gateway refs by exact Toman amount,
order type and optional merchant-claimed payment count/membership. Claims never
authorize identity or prove payment. Missing history cannot satisfy positive
thresholds. No match retains the existing compatible methods; a matched rule with
no available method fails closed, not a silent wider fallback. No arbitrary URLs,
JavaScript or separate gateway credentials. Disabled methods remain hidden.

Each bot payment snapshots the selected rule and method allowlist in its existing
delivery identity. Replay keeps that snapshot across rule/history/config changes;
financial amount/user/type conflicts remain. Routing has its own `routingVersion`
claim, separate from the callback configuration version: a rule-only edit does
not invalidate pending callback delivery. Both use strict Audit. Existing records
with an empty snapshot keep legacy behavior. Both
schemas and an additive migration widen metadata only; the database prevents
snapshot replacement. Multiple bot links point to the SAME payment id with a
method preference; query strings never create an invoice, bypass OTP or expand the
snapshot. Availability is intersected with the snapshot and the server checks the
allowlist again before gateway admission. LINKS without a matched rule retains the
single legacy link. Existing
single-invoice STARTING/UNKNOWN and exact-once credit guards remain authoritative.

Merchant operations gets full-history search, terminal/status/payment-state filters,
25-row pagination, persisted queue/review/overdue/paid-undelivered/credit-issue counts,
and owner-scoped detail (rule/methods, safe job status, allowlisted audit fields).
No raw queue errors, secrets, customer names or unscoped other-merchant data.
Summary counts cover the merchant's full history, independent of list filters.
Credit comparison checks the linked DONE IRR PAY_CREDIT's owner, exact amount and
withdrawable delta against the payment's net amount; it is a consistency indicator,
not an independent bank audit. Age-based overdue is not proof of worker liveness.
UNKNOWN/BLOCKED keep explicit confirm/retry; SENDING at least 120 seconds old can
be marked UNKNOWN without another send; QUEUED at least five minutes old can
re-enter the canonical deduplicated queue. Every action claims
the current version, requires explicit acknowledgment and changes no financial row.

UI extends current Pay/SDS cards and native fields, Persian RTL, both themes,
responsive tables, keyboard/focus and reduced-motion behavior under Unslop guidance.
Preserve approved MoboCom Custom/public sections. Loading/empty/error/saved/stale
and missing-method states are explicit. No live provider call/merge/deploy is part
of this development authorization. Local evidence does not certify a live worker,
bank connection or merchant bot.

Acceptance: new native CRM and playlist checks, native Pay routing/operations
concurrency/privacy/allowlist/immutable snapshot/pagination/recovery/audit rollback,
existing Pay regressions, routing pure tests, current static/type/schema/contract
checks and real1440 light/dark plus390 browser/axe/React Doctor evidence. Mutating
scripts use Origin. Deliberate faults must fail and source must be restored.
Apply the additive migration before code. Disable routing/integration for new
orders to pause; existing decisions/history remain. Forward-fix after activity;
do not delete financial or delivery evidence to roll back.
