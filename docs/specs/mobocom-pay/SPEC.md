## SMS-only card transfer and manual payout — 2026-11-27

Only a verified SMS source for the configured bank account can authorize
automatic card transfer. Authorize against the source version saved at quote
creation and claim the existing financial state exactly once. The retired
connector endpoint returns HTTP 410 and historical proof stays in the ledger.
Previously accepted quotes that lose their eligible source can submit receipts
for staff review. Restricted quotes without acceptance need a fresh checkout.
The admin records the external bank reference or transaction hash after making
the payout manually, subject to the existing approval policy.

## Checkout alignment, SMS amount and fee allocation — 2026-11-27

An active merchant can save the customer's share of the approved payment fee
from the payment workspace. A share from 0 to 100 percent applies to future
links and bot orders. A cleared preference follows the contract. Calculate the
fee with the existing rate, flat amount and cap, round the customer share down
to whole Rials, and deduct the remainder from the merchant. Record both shares
through the existing immutable total, fee and net. The public API retains the
legacy fee bearer values and adds the two exact amounts.

Show automatic card transfer first when an owner-authorized source and terminal
are ready and no link explicitly prefers another method. The internal gateway
atomically reserves a distinct bank total. Display its adjustment separately
from the contract fee. An authenticated in-window credit SMS with that total
settles one payment through the existing journal, including when a receipt or
another source is involved. Basic SMS Forwarder messages use server receipt
time and preserve the existing reviewed evidence requirement for locked USDT.
Both receipt dialogs center in the viewport and keep their scroll and focus
behavior on narrow screens.

Acceptance covers a 30/70 share, both endpoints, capped fees, historical
snapshots, distinct quotes with identical bases, an unmatched principal, an
exact SMS, and duplicate wallet credit prevention.

## Merchant responsive menu / support — owner2026-11-25

Continue local8fc1bf16. Reuse account/Admin ShellNav for grouped merchant links,
remember expansion and current-page state. At phone/tablet widths up to1100px,
header hamburger opens a styled native dialog side drawer; desktop keeps its
side menu. Escape/backdrop/close/navigation/history/desktop resize dismiss and
restore focus/scroll; finite180ms motion respects reduced motion. No horizontal
main-menu strip, separate AuthZ or unstyled states. Support menu opens a private
Pay presentation of the SAME canonical TicketCenter and ticket APIs/identity/
department permissions. Existing merchant gate still controls the Pay page.
Acceptance: real320/390/768/1024/1100/1440 light/dark browser/axe, focus/inertness/
group persistence/history tests, same ticket across account and Pay plus other-
owner denial, scoped PG/types/gates/Doctor; no production config or notifications.

## Generic webhooks and advanced settlement center — owner2026-11-25

Continue owner-merged PR489/main9b345399 in the existing Billing/Pay owner. The
owner accepted recommendation1 (signed general merchant webhooks) and2 (advanced
settlement center), including modern merchant/Admin UI under MoboCom/SDS tokens.
Operations queue, Wallet, Identity, AuthZ, Settings/Audit and existing quote/reserve/
review/completion remain canonical. No new shared queue or automatic live payout.

Webhook: terminal-owned public HTTPS endpoint, encrypted generated signing key
shown once; strict versioned config. Credit re-reads authoritative PAID Pay/Wallet
facts and stores one immutable payment.paid v1 raw JSON/hash/event ID and queued
delivery intent in the same transaction. Payload includes exact stored order,
invoice total, contract fee and merchant credit only, never early collection proof,
service-fee inference or payer private data. Existing bot callback stays compatible.
Sign timestamp+'.'+raw body with HMAC SHA256; stable event ID/body across retries,
new attempt ID each time. Durable attempts/leases, bounded exponential retries and
explicit audited versioned manual redelivery provide at-least-once delivery:
receiver deduplicates event ID. DNS public-answer validation/pinning/TLS and finite
limits reuse extracted bot transport; no redirects/proxies/credentials/query token.
Before attempts recheck current owner/User/module/API/terminal/section authority,
active endpoint and frozen config version. Changed configuration pauses old
bindings until explicit redelivery. Delivery never changes money or fulfilment.

Settlement: merchant-owned immutable asset/network/address profiles (label/active
CAS editable). Request copies profile destination/version/label; disabling or
renaming profile cannot retarget a prior request. Existing inline input remains.
Optional UTC scheduledFor up to30 days means reserve NOW with current accepted
quote/fees, become eligible for review at due time; no delayed reserve or automatic
external payment. Rejection before due releases original source exactly once.
New settings settlementApprovalThresholdRial defaults0 (disabled) and affects new
requests; snapshot threshold/Settings revision and dual flag from frozen Rial quote.
First high-value approval stays REQUESTED, second distinct current authorized
nonmerchant staff moves APPROVED. Claim status+row version; freeze approval identity/
times immediately in SQL. Old requests/default v1 flow retain existing states.
Group approve/reject max25 is per-item CAS/outcomes, never bulk-paid/status update.
Owner/staff-authorized HTML receipt uses persisted source/fee/payout/approval/proof,
is downloadable/printable and clearly distinguishes unpaid request from paid receipt.

New merchant routes/resources compose existing private shell and guards; Admin
queue has due/scheduled/second-review/approved phases, per-request actions and safe
batch feedback. Display real amounts and counts, native form/focus/RTL, both themes,
390 mobile, finite reduced-motion-aware effects, all error/empty/disabled states.
Versioned REST/event contracts are additive and documented in existing OpenAPI;
no schema-derived consumer contract or new identity. Module disable preserves data
and denies commands/jobs/delivery. Migration217 is additive, legacy-safe, in release
manifest; rollback disables endpoints/new requests and preserves money/evidence.

Acceptance: registered connected PG pay-webhooks/pay-settlement-center cases
cover transactional intent, replay/crash/leases/config/permission/SSRF/signatures,
exact reserve/release, stale/concurrent/dual approvals, schedule/profile races,
immutable facts, batch duplicates, receipt privacy/escaping, Audit rollback and
old flows. Deliberately bypass an application guard and require SQL denial.
Fresh/populated migration, relevant legacy Pay/bot/queue regressions, pure cases,
types/scoped gates, Hurl/Spectral/oasdiff, Doctor and actual1440/390 light/dark
merchant/Admin browser/axe flows. Fixtures never contact real endpoints, banks or
chains. Real receiver/account deployment and live delivery remain unverified.

## Merchant visual refinement — owner2026-11-25

Refine the existing private merchant experience under MoboCom/SDS identity:
distinctive IRR/USDT balance, precise gross/net/platform-fee hierarchy, real trend
and recent payments, compact mobile navigation, forms/filters and finite motion.
Reuse server projections and canonical private/API owners. Chart selection is
display-only; no money counters, fake activity or source readiness assertions.
Keep loading/empty/error/selected/disabled states readable in both themes and RTL,
native labelled controls, daily table fallback and keyboard content skip.
Acceptance is actual seven-route1440/390 light/dark plus state/functional browser,
axe, scoped Doctor/types/gates and existing connected financial checks; no backend,
dependency, migration, public theme or production deployment scope.

## SMS Forwarder three-field adapter — owner2026-11-25

Owner provides exact JSON `{sms:"{msg}",bank:"bankmeli",token:"generated"}`.
Add explicit per-source FORWARDER_V1 format and dedicated source-ID endpoint; keep
EXTENDED_V1 and its Bearer/four-field contract. Reuse generated encrypted source
credentials, Admin authority, bank/template binding, notice store and shared
invoice/Wallet/fee settlement. No global bank token or parallel payment path.

Forwarder input has no sender/message ID/original timestamp. Never fabricate those
facts: mark immutable server-receipt evidence, hash normalized decoded source/bank/
SMS for stable retries, exclude credentials/version/current time, retain original
first receipt forever. Accept only current verified operator-filtered fresh SMS
for the requested amount-only IRR policy. An unseen old SMS remains indistinguishable
from a fresh one; do not import history. For locked USDT acquisitions, this evidence
alone cannot establish payment time; existing Bale/extended SMS/approved receipt
proof remains necessary, enforced in commands and DB links. Valid intake is ACKed
without credit while waiting for such proof. No relaxed original-time claim.

Acceptance: exact JSON, generated token/clipboard/HTTPS, wrong bank/key/mode,
semantic/format retries, source version changes, preacceptance and expired notice,
SMS-first/Bale-first/manual-first/concurrent once-only principal and fee; USDT
exclusion in command/SQL; unchanged extended source. Connected PG, Hurl/contracts,
types/gates, affected Doctor and light/dark1440/390 browser/a11y. No actual phone or
bank delivery claim.

## Merchant approval workspace and fee isolation — owner2026-11-25

Continue merged PR488/main d7f15d6f. Admin controls automatic CARD_TRANSFER and
trusted server-owned Bale/SMS sources; merchant UI never receives account sessions
or webhook secrets. Add bounded server configuration for independent card-owner
Bale accounts while retaining the existing dedicated GoOmni intake and legacy env.
Original signed identity and current source authority remain mandatory. Matching
selects only a globally unique reserved amount on its bound destination; first
valid proof wins the existing invoice lock/CAS, never another credit.

Manual review after automatic confirmation returns explicit original method/source
and an already-paid message without a new payment/Wallet row. Repeated review is
idempotent after current reviewer authorization and no-self checks. Late SMS/Bale
and concurrent manual/automatic arrivals preserve the original method. Display
proof method and separate gross, contract fee, actually collected service fee,
rounding and merchant credit in the merchant ledger/Admin receipt queue. Pending
manual receipts remain UNDER_REVIEW in lists and filters after payment expiry.
No fee or random adjustment is included in customer top-up or merchant net credit.
Versioned machine APIs retain their closed PENDING/PAID/EXPIRED statuses; a held
receipt remains PENDING with additive `reviewStatus:UNDER_REVIEW` in v1/v2. Native
UI exposes UNDER_REVIEW. CSV serializes nested confirmation as JSON, and idempotent
create reads the same authoritative invoice/proof projection as payment polling.

Acceptance extends existing connected collection/shared checkout tests with both
orderings, concurrent source/reviewer races, exact Wallet amounts, explicit replay
responses and IRR/USDT fee projections. Source registry requires isolated HMAC,
current bound bank/owner and frozen instance proof; invalid config fails closed.
Full affected types/gates, Doctor and1440/390 light/dark browser/axe. No live
account login, provider sending, deployment or hosted workflow is performed.

## General channels / selected merchant USDT credit — owner2026-11-24

Continue Billing Pay, canonical Identity/Wallet/FX/Settings/Audit/Operations. Owner
wants website, bot, Instagram, channel and standalone link collection, plus selected
merchants whose payer purchases internal USDT credit for that named merchant.
Merchant chooses later Rial or supported-network payout, with independently
configured percentage/flat/cap fees and BSC/BEP20 suggested in the UI.

Public machine contract: `/api/v2/pay` reuses the same canonical API key and Pay
commands. Version1 retains its original three-rail overview and quote enum; new
BSC/Ethereum or USDT-source quote requests return `PAY_API_V2_REQUIRED` there.
The independent custom-bot adapter keeps its existing version1 address. Generic
consumers poll the stored payment result; no new outbound social/webhook service.

- Existing machine API and per-payment hosted URL already support ordinary sites.
  Add typed terminal channel metadata; non-web channels need no fictitious website
  or callback. Website/bot callbacks retain registered-origin guards; non-web return
  is only its validated channel link. Standalone links have no forced return URL.
- Admin-only versioned merchant `credit-mode` selects IRR(default) or USDT for
  FUTURE payments. Each payment freezes credit currency/minor units, approved FX
  rate/time/source and rounding remainder. Existing amounts, past credit and pending
  promises are not converted when settings change. Collection proof remains IRR.
- Canonical USDT already has two minor-unit decimals. Preserve that meaning for
  existing monetary rows; quote an exact0.01-USDT lot, rounding down and explicitly
  disclosing the Rial rounding remainder. Do not add a second wallet or silently
  reinterpret old USDT values. Network payout precision is separate from ledger
  precision and from a token contract's on-chain decimals.
- Before any instructions/provider start, a verified payer explicitly accepts the
  immutable USDT quantity, rate, named merchant recipient, fees/rounding and internal
  credit nature. Bind acceptance to its current payer proof and terms hash; server
  and deferred DB proof enforce it. Internal credit is not an on-chain transfer.
- Canonical verified collection credits one IRR/USDT `PAY_CREDIT` transaction with
  matching withdrawable provenance. Calls to Wallet use major decimal strings, not
  raw USDT cents. Overview shows separate currency accounts and a dated Rial value;
  stale/missing FX refuses a fresh acquisition and valuation is never a balance.
- Existing settlement quote/reservation/review handles explicit source currency and
  source minor amount. Old rows backfill IRR/old amount. Rejection releases exactly
  the original asset once, irrespective of later FX. Quote freezes fee policy/rates
  and source/payout quantities. Percentage+fixed amount capped per network has an
  explicit fee currency; original `feeRial` remains compatible. IRR history retained.
- Add disabled-by-default USDT BSC and Ethereum routes alongside existing TRON.
  BSC instrument is explicitly Binance-Peg BSC-USD, not a native-Tether claim.
  EVM and TRON destination formats differ. UI requires matching network and shows
  exact net amount/fee before reservation; Admin external-transfer record remains
  separate from collection. No private-key storage or live-chain sending in this
  slice. An entered transaction reference is an Admin record, not RPC verification.
- USDT acquisition expiry cannot be silently extended by automatic bank renewal.
  A timely held receipt retains its agreed terms through later review. After price
  expiry the merchant issues a fresh payment/order revision; preserve old proof.
  Offer only bank/manual collection for USDT acquisition: its original notice time,
  bank event time or timely submitted/approved receipt must substantiate collection
  before the locked purchase expires. Ordinary IRR online methods remain available.
- Incremental migration widens only supported Wallet currencies, backfills old
  quote/source fields under table locks and the owned immutable-quote trigger, and
  enforces immutable acquisition/source facts and exact currency/amount proof links.
  Runtime money state changes remain CAS claims; strict Audit is transactional.

Acceptance: extend existing Pay native financial harness with populated upgrade,
ordinary preexisting USDT preservation, fractional acquisition, consent/expiry/held
receipt, duplicate/concurrent credit/reserve/reject, stale FX, terms changes, direct
SQL invalid-credit/source proof, and Audit rollback. Public API additions are
OpenAPI/Hurl/Spectral/oasdiff covered; same-process Admin typed. Real RTL light/dark
1440/390 browser+axe and affected React Doctor required. No hosted workflows/deploy.
Rollback after USDT activity disables new acquisition while retaining upgraded
ledger and liabilities; never downgrade active reserves or revalue past credit.

## Compact bank checkout / display equivalent — owner2026-11-24

The collapsed bank checkout fits the verified normal mobile viewport without
page scrolling. Receipt fields open in a native dialog; fee and extra destination
details expand. Main financial information is not clipped to force a viewport fit;
zoom/keyboard/expanded content may scroll naturally. Existing canonical receipt
hold/settlement behavior remains authoritative.

Optional DTO usdt is an informational four-decimal equivalent of collectedRial,
using the canonical approved CurrencyRate USDT value (Toman per unit), not pending
rates or a checkout USD peg fallback. Display labels BSC/BEP20; no crypto address,
payment rail or on-chain proof is created. Missing/invalid/future rates give
UNAVAILABLE; automatic rates over24h give STALE without an amount. Manual/locked
rates are labeled with their persisted timestamp. Rial invoice amounts are fixed.

## Automatic card transfer — owner corrections2026-11-24

The existing CARD_TRANSFER gateway owns the autoVerify checkbox, SMS/BALE source
selection and dedicated bank account. Legacy MOBOCOM_PAY records remain compatible.
No phone application is built. Existing SMS Forwarder installations send authenticated
events to a server source; personal Bale uses the existing pinned server connector.
Gateway autoDisplay controls cardNumber/bankName/holderName/accountNumber/iban.
Card only is the default. Amount is mandatory; only card and amount expose copy
buttons. Hidden destination fields are omitted server-side, not merely CSS-hidden.

An immutable globally unique collectedRial permanently reserves the exact amount.
Quote times use server seconds immediately; bank text account/date/reference are not
payment conditions. CREDIT transfer amount is extracted from a configured trusted
source bound to the destination. Immutable source protocol/phone receive metadata
must be fresh and after quote acceptance, so delayed old deposits cannot match a
new quote. Source revocation/current canonical permissions remain authoritative.

The operator configures 5–120 minutes (default30). The payer sees mm:ss; EXPIRED
hides instructions and explicitly warns against further deposits. Explicit renewal
creates a new amount/time quote, preserving the old tombstone. PayPayment's original
external-bank-feed deadline stays immutable: an already-linked automatic checkout
continues with its bound payer ticket and its own quote deadline; it never reopens an
actually EXPIRED PayPayment. Full source/terminal/merchant guards are rechecked.

Successful receipt upload atomically claims PENDING→UNDER_REVIEW with a canonical
PaymentReceipt. The countdown and instructions disappear; expiry/VOID cannot close
the pending receipt hold. Receipt rejection retains proof and permits a fresh request.
Manual and automatic settlement share one Serializable canonical invoice claim.
Principal goes through markInvoicePaid/Pay credit/Wallet or fulfillment exactly once;
the disclosed addition is a separate IRR service journal, never merchant proceeds.
Manual principal-only receipts have no fee journal. Auto→manual, manual→auto and
SMS↔BALE races cannot duplicate either principal, fee or wallet credit.

Actual receipt Rial is stored on the collection; PaymentReceipt.amountMinor remains
the canonical invoice principal/currency (migration209 invariant). Financial state,
exact source proof, quote/receipt immutability and permanent tombstones are guarded
by incremental migration213. No production migration or live bank verification is
implied by local checks. Operator contract: tools/pay-bale-server/SMS_AND_COLLECTIONS.fa.md.

## Server-only Bale continuation — owner correction2026-11-24

The owner explicitly rejected an Android application and named @bam_bmi as the
bank arm in their personal account. All uncommitted phone-relay product changes
are withdrawn and preserved only in an ignored task archive. The committed pure
Melli parser remains. No phone dependency or device onboarding is part of rollout.

Extend Billing with an original-message intake adapter for a dedicated self-hosted
GoOmni2.4.2 account connection. This is an unofficial account-protocol connector,
distinct from official Bale Bot API and native wallet payments. The site receives
signed events from this service; no third-party cloud gets the personal session.
Pin configured alias + immutable instance + logged-in account + bank peer IDs.
Verify the peer belongs to @bam_bmi during operator setup; never trust a display
name or learn identity from an incoming notice. Reject outgoing/unknown/forwarded/
edited/partial/group messages and conflicting identity projections. Authenticate
exact bytes, reject duplicate JSON keys, persist minimal immutable evidence before
ACK, dedupe source-event/message and bank reference/time across connector restarts.
Disabled module/API/source refuses new ingestion. No raw personal chat, balance,
counterparty, credential or account number appears in normal Admin DTOs.

This bounded source slice records ORIGINAL_TRANSFER/IGNORED/REJECTED/DUPLICATE/
CONFLICT evidence, not a financial success. It does not invent targetPaymentId or
call reconciliation/Wallet/invoice settlement. Existing financial attribution
contract stays intact until the separate reservation/proof slice has adversarial
coverage. Random amount alone is insufficient. The eventual MOBOCOM_PAY provider
must use canonical Gateway/invoice settlement, not recursively create another
merchant PayPayment or credit a merchant twice. Register an explicit unavailable
provider until that collection adapter is complete; configuration never makes it
customer-visible prematurely. Admin may save its enable/default preference, but
public checkout intersects that preference with actual readiness.

Source acceptance: signed synthetic original @bam_bmi-shaped notice, exact body
replay/conflict, duplicate bank fact across source IDs, changed amount conflict,
wrong peer/account/instance/session/signature, forwarded/edit/unknown direction,
unknown templates/interest/debits, module/API/source off, immutable DB evidence,
strict-Audit rollback, unchanged all money tables, source status access denial.
Run disposable non-root PostgreSQL and existing Pay regression; no live bank or
personal account verification claim from synthetic checks. A future live trial
needs operator account login and read-only original-message identity validation.

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


## Melli notice parser — owner samples2026-11-24

Owner supplied eight National Bank notice shapes and confirmed delivery FROM the
bank's official Bale arm INTO the owner's personal account. That resolves the bank
and receiving-channel questions; personal-account reader API/auth remains unknown.
Samples include positive interest, negative purchase/fees/POS, and positive card/
PAYA/SATNA transfers. Other banks need their own verified samples/adapters; no
generic amount/sign approval fallback is authorized by the templates.

Implemented pure `billing/domain/pay-bank-notice.ts`: bounded single-message
National Bank template parsing, explicit IRR/sign/13-digit account/reference,
Persian/Arabic digits and spelling/Markdown normalization, type classification and
existing shared Jalali date conversion. Modern1402..1499 Tehran dates become a
half-open UTC minute interval; the text does NOT attest an exact second. Missing,
duplicate/batched/invalid/unit-ambiguous fields fail closed. Unknown transaction
types parse as review-only. Interest is non-payment credit; known debit types with
positive signs are inconsistent, not transfer candidates.

Every success is explicitly `UNVERIFIED_NOTICE`; a transfer is only a candidate.
No raw body, balance, description, branch or counterparty is returned. No source
authentication, bank-event creation, trusted targetPaymentId, amount reservation,
invoice approval or Wallet write is implemented/activated. No new settings/schema/
HTTP/UI surface. Real account/transaction values were not copied into fixtures:
only synthetic values with the supplied structural shapes are stored.

Six behavioral cases are included through the existing `pay-bot.test.cjs` suite.
Acceptance checks exact integer bounds above JS precision, all eight transaction
types, date rollover/invalid Jalali dates, malformed/duplicate units/fields, unknown
banks, escaping and privacy. Four deliberate classification/precision/time faults
must fail, then exact source is restored. Native Pay regression verifies the
existing financial pipeline remains sound, not a live Bale integration.
Next is the authorized personal-account receiving/proof adapter; a new bot token
alone does not establish access to another bank arm's personal-chat messages.

## Bale bank-notice verification design — owner2026-11-24

Status: DESIGN ONLY. Owner requests automatic recognition of incoming bank
transactions visible in Bale, using a small distinguishing amount or a stronger
method. Fresh main3679200b contains owner-merged PR485. Continuation checkout:
`.mobocom/pay-bale-verification`. No connector, schema, monetary policy or automatic
approval has been enabled by this design receipt.

Existing evidence: `server/pay/payments.ts` creates exact integer IRR obligations
and preserves replay/fee/expiry. `reconcile.ts` requires authenticated bank events,
independent trusted target attribution, assigned account, amount/reference/time
and payer proof. `credit.ts` converges on canonical invoice/journal/Wallet and bot
outbox under one transaction. Keep these owners, not a second shared payment,
wallet, queue, account identity or bot-delivery system.

### Source feasibility

[Official Bale docs](https://docs.bale.ai/), reviewed2026-11-24, document bot updates
via getUpdates/webhook, invoice payload/SuccessfulPayment and inquireTransaction.
Their current payment section says official bot collection is wallet-based; the
former card-transfer request method was removed. Native bot payment into the
developer wallet differs from bank-credit notices in a personal chat. Reading
another bot's bank notices in a personal account is not established by these docs.
Do not assume a normal bot token grants that access or invent bank endpoints,
webhook signatures or notification formats.

Asked owner: bank name, personal bank-bot chat versus official receiving API, and
an anonymized sample. No account/session/OTP/token is requested in chat. Establish
an authorized channel, stable source/account IDs and original bank reference,
transaction time, direction and unit before coding its adapter. A signed relay
authenticates the relay, not an arbitrary forwarded customer's bank claim.
If the channel cannot attest payment ownership, notices remain investigation
candidates; never fabricate trusted targetPaymentId. A native Bale wallet gateway
is a separate owner choice, not a silent substitute for direct bank collection.

### Proposed bank-notice flow

1. Existing hosted checkout/phone proof gets a fixed quote and assigned account.
   Prefer a bank-issued deposit/payment identifier tied to the invoice. If a small
   distinguishing amount is selected, reserve the exact FINAL amount atomically
   across ALL merchants using that account before display. Cryptographic choice
   selects a free slot; database uniqueness/claims prevent collision, including
   adjacent base prices and fees. Exhaustion fails explicitly, never live reuse.
2. Keep base, fee, distinguishing adjustment, final collection and merchant net as
   separate exact IRR facts with explicit Toman labels. Adjustment is visible
   before payment, fixed under refresh/replay and absent from older obligations.
   Range, expiry/reuse policy and financial ownership remain inputs, not an
   implicit platform fee. Never change a displayed amount or swap to an unadjusted
   invoice after an ambiguous initiation. No money constraints are weakened.
3. Receiver persists authenticated evidence BEFORE ACK/advancing polling cursor.
   Dedupe both source-update identity and bank-transaction identity. Customer text,
   copied/forwarded/edited messages are not original bank evidence. Bounded explicit
   templates normalize Persian/Arabic digits and parse original amount unit,
   CREDIT direction, account/time/reference. Unknown format, withdrawals or missing
   identity stay review-only; no LLM/OCR/approximate match authorizes credit.
4. Account+exact amount+original transaction time proposes a candidate. A small
   adjustment is a matching aid, not ownership attestation. Current trust contract
   still requires independently verified bank transaction/payment binding. No
   amount-only approval or customer-reference-derived target is enabled here.
   Once source can establish attribution, define its typed proof and the focused
   reconciliation change with adversarial tests before activation.
5. Valid proof uses existing invoice/Pay state claim, one Wallet credit, strict
   Audit and bot intent in the same transaction. Expired, partial, excess, unknown
   or ambiguous deposits keep their history and enter existing review operations.
   No extra financial credit or uncertain external-service automatic replay.

Historical reservations must survive expiry: a delayed notice must never bind to
a newer quote with the same amount. Trusted ORIGINAL time/provenance, immutable
assignment and bank-level dedupe matter; receive time/short cooldown alone do not
solve late reuse. Ambiguous time precision/history refuses automatic attribution.
Partial transfers cannot be summed without a separately defined atomic allocation;
overpayment/refund uses existing owner workflows.

### Operations and acceptance

Extend existing Admin `mobocom-pay.manage` guards/settings for selected source,
assigned accounts, bounded adjustment policy if chosen, enable/disable, redacted
review reasons, last successful ingestion/lag/backlog. Credentials remain encrypted
server-only; configured differs from live verified. Merchants never see personal
bank chats/OTP/full cards. Module/source off stops new effects and preserves data.

Prefer authenticated push IF supported; otherwise a leased long-poll receiver
through existing runtime/Jobs ownership. Indexed exact lookup, persist-before-ACK,
bounded backoff and gap/retention alarms prevent silent loss. Bale's finite update
retention is not a bank archive. Measure source→ingest, ingest→verified and
verified→bot independently. Initial internal P95 under3seconds AFTER valid-proof
receipt is a benchmark target, not a bank/Bale delivery promise. UI re-reads
committed state via current bounded polling or a verified faster signal.

After source/proof feasibility, implement receiver→evidence→reconciliation→credit→
current UI as one vertical slice. Additive migration/both schemas/release manifest,
no old money rewrite. Preserve Custom/SDS, OTP/method allowlist, RTL/light/dark/390px
and explicit waiting/expired/offline/review states.

Acceptance: isolated non-root/no-env PostgreSQL; concurrent same/adjacent amounts,
shared-account merchants, pool exhaustion, replay/crash-before-cursor, forged/user/
forwarded/edited notices, wrong account/unit/direction/reference/time, repeated bank
IDs across different updates, late arrival after reuse, partial/excess payments,
module/source-off/current merchant restrictions, one invoice/Wallet/bot intent,
strict-Audit rollback and upgrade preservation. Deliberate source/proof/dedupe
faults must fail. Anonymized verified parser samples and real HTTP/browser evidence
are required. Synthetic fixtures are not live bank/consumer certification.
No product tests were run for this docs-only design.

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
# Transfer operations and reconciliation desk — 2026-11-24

Owner authorizes recommendations1/2 after merging PR486 (main8a84ad1a).
Continue Billing Pay intake, collection settlement, canonical receipts/Audit and
Admin navigation; merchant bot-delivery operations remain their existing owner.

- `/admin/mobocom-pay/operations`: 24h observed source delivery/confirmation
  percentiles, current readiness, last receipt, rejected events, overdue requests,
  receipt holds and globally occupied immutable amount pools for recent principals.
  Quiet traffic is **unknown connectivity**, never an invented online/offline claim.
- `/admin/mobocom-pay/reconciliation`: paginated original CREDIT evidence needing
  attention, holds/rejected receipts, explicit invoice search/assignment, difference,
  receipt and canonical Audit history. Never infer payer identity from a nearby amount.
- `mobocom-pay.manage` gates all server operations; ordinary invoice receipt and
  financial decisions additionally require `invoices.manage`. No self approval.
  Requests require the existing authenticated Origin policy, bounded JSON and CAS
  version. Module-off/read and write denial remain canonical.
- A minimal PayTransferReview stores notice assignment and versioned decision;
  immutable notice facts remain unchanged. Decision notes/reviewer/time go to strict
  Audit in the same transaction. Dismiss closes an evidence case without money.
- Explicit confirmation is only for an accepted, same-bank, same frozen/current
  authenticated source, exact reserved amount, unpaid eligible invoice. Late exact
  notices may be admitted by an authorized reviewer with a reason. Under/over amounts
  remain nonfinancial cases for correction/refund handling; no partial credit or
  automatic refund is introduced. Old pre-quote evidence cannot be admitted.
- Confirmation shares invoice-first Serializable locking, markInvoicePaid,
  principal/adjustment journals, Wallet and fulfillment with AUTO/MANUAL. A database
  constraint requires the confirmed review for REVIEWED_NOTICE proof; terminal cases
  and settled collections are immutable. Concurrent receipt/auto/reviewer decisions
  cannot create a second Payment or Wallet credit.
- Additive migration214, both Prisma mirrors and release manifest. Existing data,
  source/gateway defaults, public checkout and approved theme remain unchanged.
  Rollback: disable auto/source/module, retain evidence/tombstones, forward-only DB.
- UI uses scoped SDS/MoboCom cards, tabular Rial, RTL/native forms, expandable
  case details, explicit errors/pending/results, focus and reduced-motion support.
  Acceptance: connected non-root empty/upgraded PostgreSQL; late/exact vs under/over,
  revocation/self/permission/version denial, notice reuse and receipt races; actual
  Admin browser light/dark/mobile, axe, errors and persisted decisions, React Doctor.
# Private merchant workspace and Admin lifecycle — 2026-11-24

Owner requests a separate professional merchant panel and full Admin control.
Continue merged PR487/mainb93879bc. Billing Pay retains Identity/Wallet/Settings/
Gateway/Jobs/Audit owners; no new authentication, database or subdomain deployment.

- `/pay/merchant` and known child views are the canonical private merchant workspace.
  Root `/pay` redirects there, removing public service promotion/enrollment. Legacy
  `/dashboard/pay` deep links redirect; valid `/pay/:id`, bank checkout, receipts,
  callbacks and machine API retain addresses. No public navigation entry for Pay.
- Server-side entry resolves current canonical session/module/section and merchant
  status. Only ACTIVE merchants see workspace/data; pending/suspended get a safe
  status view, guests use existing login with a fixed safe return. Session and API
  calls also enforce current ACTIVE merchant, not just hidden navigation.
- Public merchant enrollment is closed (403). Admin `mobocom-pay.manage` provisions
  PENDING records by existing UserId/email, then explicitly activates. No new User
  identity, invitations/secrets in URLs or self approval. Existing merchants/data
  preserved; no migration or money-state change needed.
- Existing Admin merchants view becomes paginated/searchable with exact account
  lookup/create, profile editing, active/suspend, fee override/reset, auto gateway
  grant, terminal active/auto flags and bot integration revocation. Current User
  standing/section, parent merchant version CAS, required reason and strict Audit
  gate mutations. Canonical owner/userId immutable; website change refused if it
  invalidates existing terminal/callback origins. No delete/purge or secret exposure.
- Financial settlement, receipts and original proof checks remain canonical.
  Suspension blocks new collection/settlement/bot calls; owner can still use Admin
  to investigate historical records. Existing callback recovery rules remain.
- Scoped SDS/RTL workspace, restrained opacity/transform transitions/reduced motion,
  semantic active navigation, 44px controls, explicit loading/error/denial/success.
  Acceptance: connected PostgreSQL (guest/ungranted/pending/suspended/other merchant/
  manager/settlement-only, self/CAS/revocation/history); actual browser light/dark/
  mobile, Admin create→activate→suspend, legacy redirects, public checkout unchanged,
  keyboard/axe and React Doctor. No hosted workflow/live bank/deployment authorization.
## Merchant and terminal gateway access

Billing supplies the same ready, currency-compatible gateway accounts used by
checkout. Portal administrators can inherit that catalogue, choose an ordered
allowlist, or stop new payments for a merchant and independently for each
terminal. A terminal can narrow the merchant's access. Automatic transfer
continues to require both existing grants and a ready source. Bot rules further
filter the effective methods and preserve their order. The first eligible method
is the checkout default. The customer can choose any eligible method when an
integration leaves the choice open.

The existing merchant detail owns policy editing. It requires
`mobocom-pay.manage`, the merchant administration target guard, a current policy
version, same-site Origin, confirmation and a reason. The change and audit
commit together. Saved references that leave the active catalogue do not become
eligible. The merchant console and v2 Bearer API can read only their own
terminal's eligible methods. The API exposes the reference, customer label and
method properties. Credentials and bank details remain in Billing.

`GET /api/v2/pay/terminals/{id}/gateways` optionally accepts `amountRial`.
Amount-aware discovery uses the customer total and exact provider precision.
`POST /api/v2/pay/payments` optionally binds an exact `gatewayRef` into the
idempotency fingerprint and the immutable payment snapshot. Clients that omit
it keep the existing fingerprint and hosted choice. The new grant is checked
for both issuance and the first checkout attempt. Previously created provider
invoices settle through their existing verified proof, and ambiguous attempts
keep the existing recovery policy.

Migration `20270418130000_pay_gateway_access` adds empty inheritance/pin
defaults, bounded settings and an immutable requested gateway constraint. It
does not rewrite historical payments. The connected suite `pay-gateway-access`
checks the effective grant, version claims, tenant scope, idempotency and
checkout enforcement. Existing checkout, bot, bank matching, credit and
webhook suites cover financial continuity.
