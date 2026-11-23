# MoboComPay — merchant card-transfer collection and reviewed settlements

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
