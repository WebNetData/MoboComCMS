## Merchant dashboard redesign — 2026-11-28

- Worktree `.mobocom/pay-private-api-access`, branch
  `feat/pay-merchant-dashboard-redesign`, based on `origin/main` at
  `16cfa69a`.
- The merchant shell uses the canonical MoboCom profile portrait in the top
  bar, desktop sidebar and mobile drawer. The sidebar adds a direct link to
  the payment form. The native drawer returns focus when dismissed.
- Merchant headers, form and panel surfaces cover the overview, payments,
  settlements, terminals, bot operations, reports, API guide and webhooks.
  Merchant support keeps the shared TicketCenter and uses the merchant theme.
  Public checkout and Admin keep their existing surfaces.
- Local Edge with a migrated PostgreSQL fixture opened all nine pages at
  1440 px in both themes, 390 px dark and 320 px light. Verified active desktop
  navigation, payment shortcut, profile image, mobile Escape and focus return,
  and no horizontal document overflow. Scoped axe returned zero violations on
  all nine desktop content regions and the mobile drawer.
- TypeScript, architecture and source checks, React Doctor and the connected
  `pay-shared-checkout`, `pay-private-api-access` and `pay-settlement-center`
  checks passed. Browser verification used synthetic records and triggered no
  real transfers. Local screenshots are under `playwright-report/pay-merchant-*`.
- Rollback is a revert of the dashboard commit. The slice has no migration or
  payment/API contract change.

## Statement preview and operations follow-up — 2026-11-28

Continue `.mobocom/pay-private-api-access` on
`feat/pay-statement-receipt-preview` from `9f6a2d47`.
The Admin receipts screen compares an operator-selected destination account's
CSV of deposits with pending IRR receipts. Use the sample header
`reference,amount_irr,occurred_at` and an ISO timestamp with a timezone.
The preview treats repetitions as one row, refuses conflicting entries and
withholds proposals for ambiguous or already used references. Suggestions
respect account, amount, timestamp window and known receipt reference.
The CSV is used only during comparison. Settlement remains the canonical
authorized receipt action with its original financial and audit claims.

Operations shows pending receipt age starting at 30 minutes. The Admin payment
desk shows sanitized delivery status separately from payment and can filter paid
orders with blocked or uncertain bot delivery. The merchant keeps existing
delivery recovery actions. This slice adds no database migration.

Connected coverage exercises manual quotes, duplicate and cross-account CSV,
previously approved references, age thresholds and the admin bot projection.
Edge coverage uses real receipt/statement/operations APIs at desktop and mobile
widths and a synthetic unknown bot-delivery response for the filter rendering.

## Bot checkout, terminal administration and unique transfer amounts — 2026-11-28

Continue `.mobocom/pay-private-api-access` on
`fix/pay-bot-checkout-terminal-controls` from `e2589e82`.
Verified paid bot checkouts omit the return URL even for older website terminals
associated with a bot delivery. The delivery destination stays in the server
snapshot. Ordinary web checkouts keep their return link.

The existing merchant administration permission and version claim now cover
creating, editing and archiving terminals. Archive rejects open payment,
receipt and delivery work, stops the terminal and keeps historical financial
relations. Migration `20270418150000_pay_terminal_archive` adds an optional
archive timestamp and enforces that an archived terminal is inactive.

The smart transfer checkbox enables the existing unique amount reservation for
Pay transfers with an active general bank destination even without a chosen
dedicated destination or an SMS source. The SMS path still requires its
verified current source and receipt. With empty SMS bindings, the same quote
can be settled from the canonical admin receipt workflow.

Connected tests use PostgreSQL for two equal-principal unique reservations, the
manual receipt and the bot result projection. Gateway-admin integration
verifies add/edit/archive, permission denial and refusal for an open payment.
Edge uses the real admin API for terminal changes and settings persistence and
a synthetic paid bot result for presentation. Desktop light/dark and mobile
dark passed scope-level axe and viewport checks.

## Required receipt and invoice deadline — 2026-11-28

Pay merchant card transfers require the canonical uploaded receipt for financial
settlement. Receipt submission, SMS matching and reconciliation use the same
invoice state and journal. A timely SMS can arrive before the receipt; upload
stores durable rematch intent and runs the same matcher after commit. Read-only
notice receipt and replays leave the ledger unchanged until both proofs exist.
The provider-hosted online checkout keeps its verified provider evidence.

The existing Admin payment minutes field now identifies the Pay invoice
deadline. New automatic quotes inherit the issued payment deadline, including
the allotted time already elapsed before choosing a method. A renewal cannot
extend the original Pay deadline. General site invoices retain the separate
SMS deadline. Existing quotes, wallet amounts and audit history need no
migration. [Operator guide](../../MOBOCOM_PAY_SMS_FORWARDER.md) and
[release notes](../../releases/1.7.29.md).

## Receipt fallback when SMS is unavailable — 2026-11-28

Continued `.mobocom/pay-private-api-access` on
`fix/pay-private-api-access-2026-11-28` from `b13dc3bf`.
An accepted, active IRR merchant quote can receive a receipt for an earlier
transfer after the payment deadline, within the existing verified payer
session. The same server predicate drives checkout eligibility and upload.
Checkout withholds bank destination after expiry and separates the receipt
action from creating a fresh quote. Renewed older requests and locked
USDT purchases retain their former receipt rules.

Uploaded evidence enters the existing receipt review queue. The manager
verifies bank receipt and reference through the existing approval command.
Payment, audit, wallet, and duplicate protection continue within the
canonical invoice transaction. There is no migration.

Connected PostgreSQL checks ran as a non-superuser database owner with
automatic matching disabled and an expired quote. They cover verified
payer scope, refusal on the older renewed quote, manual confirmation by
the full-access owner and later SMS replay with stable money. Edge at
390 dark and 1440 light exercised the expired checkout and keyboard receipt
dialog. The desktop run sent a real multipart request to the local preview.
Scoped axe, overflow, TypeScript, architecture and security checks passed.
The work is local, and live bank/phone delivery remains a destination check.

## Percent fee fields and smart transfer switch — 2026-11-28

Continued `.mobocom/pay-private-api-access` on
`fix/pay-private-api-access-2026-11-28` from `b13dc3bf`. The owner asked
for understandable percentage, fixed and maximum fee inputs and an explicit
automatic transfer switch with a zero-ending detection amount.

- Pay defaults, merchant overrides and settlement rails share a labelled
  percentage / fixed / maximum input. Persian decimal input converts to
  integer basis points at submit. Fixed and maximum retain the stated
  currency, zero maximum means no cap, and stored fee contracts and past
  invoices keep their financial semantics.
- The smart transfer panel uses the existing automatic SMS policy checkbox
  with advanced limits behind a disclosure. Initial activation of receiving
  checks the proposed SMS policy against the ready gateway catalogue within
  the settings transaction. A configured automatic gateway can now be the
  only active route when receiving and SMS matching are first enabled together.
- The existing unique amount allocation uses ten-rial steps. Checkout
  discloses the zero-ending random part separately from up to nine rial of
  rounding for a non-aligned principal. The payable bank amount still ends in
  zero. No migration, new API fields or financial-history rewrite are required.

Edge at 1440 light and 390 dark verified invalid percentage feedback, Persian
digits, fixed/cap save and reload, and initial automatic activation with only
one automatic gateway. The merchant override saved through its browser form.
An odd-principal customer checkout displayed the two adjustment parts and
the correct final amount. Scoped axe and overflow checks passed. Five
collection unit cases and connected collection, gateway access and settlement
regressions passed on PostgreSQL 17. TypeScript, architecture and security
checks passed. Deployment and live phone/bank commissioning remain open.

## Single financial posting across SMS and manual approval — 2026-11-28

Continued `.mobocom/pay-private-api-access` on
`fix/pay-private-api-access-2026-11-28` from `b13dc3bf`. The owner requested
verification of both orderings and concurrent receipt/SMS confirmation.

A real four-request race initially returned HTTP 503 from an SMS request.
PostgreSQL reported a serialization failure on the invoice lock. Pay
transactions now retry Prisma's raw SQL representation of serialization and
deadlock conflicts within the existing bounded policy. If attempts are
exhausted, the HTTP adapter returns the existing retryable conflict response.
The existing journal and Wallet state claims remain authoritative.

Connected merchant fixtures use the SMS Forwarder HTTP handler and canonical
receipt review. Manual confirmation followed by late SMS and replay, SMS
followed by manual approval and replay, and a four-request race check the
original confirmation method, one principal, one bank adjustment, one Wallet
credit, one financial audit event, and stable wallet and report totals. Exactly
one request wins the concurrent settlement. In the SMS-first case, manually
reviewing the still-pending receipt changes the receipt review status only.
The expanded collection suite passed three times after the fix.
Shared checkout, bot and webhook regressions passed on an empty PostgreSQL 17
database migrated and exercised as a non-superuser owner. TypeScript,
architecture and security checks passed. No UI change or migration is involved.
Live bank/phone commissioning remains a destination check. This is a local diff.

## Card-transfer reliability and gateway catalogue — 2026-11-28

Continue `.mobocom/pay-private-api-access` on
`fix/pay-private-api-access-2026-11-28` from `b13dc3bf`. The owner requested
review and further implementation of manual and SMS card transfer, and
confirmed that Pay must offer eligible active MoboCom gateways.

- The canonical transfer matcher requires server receipt of bank evidence by
  the original quote deadline. Late exact evidence requires review. A receipt
  held for manual verification remains pending and actionable. Replay keeps
  the first receipt time. Approval and reconciliation retain invoice-first
  locking, canonical journal, Wallet, and audit.
- The reconciliation case projects independent approval and rejection authority
  from the existing Pay guards. A full-access Admin can approve their own
  merchant receipt. Required bank reference is entered directly in the case
  and sent through the canonical receipt command. Other self-review guards
  remain in force.
- The canonical Billing catalogue keeps eligible active gateways available
  when a separate card-transfer configuration is malformed. The existing
  gateway Admin endpoint lists the invalid row as incomplete and supports
  repair through an explicit valid replacement. SMS readiness verifies the
  template bank code against the source before offering the automatic method.
  Merchant / terminal policies, requested method and exact amount checks all
  remain in the existing Pay catalogue owner.

All 233 migrations applied to a fresh PostgreSQL 17 database. The collection
and catalogue suites also passed as a non-superuser database owner.
PostgreSQL connected checks cover late and timely SMS, manual approval,
restricted and full-access review, invalid source and gateway configuration,
and continued active method availability. Shared checkout, terminal keys and
bot regressions also ran. Edge at 390 dark and 1440 light verified the bank
reference field and action states, with scoped axe and viewport checks. The desktop case submitted through the
real browser endpoint and the connected fixture observed the persisted result.
TypeScript and architecture/source/security gates ran. React Doctor showed
one complexity advisory for the case. Scoped Semgrep found zero issues. The
OpenAPI comparison found no breaking schema change. Spectral showed one
existing warning for the retired Bale endpoint.

The implementation is a local diff with no migration. Live phone delivery and
a real deposit through the destination setup remain unverified. Revert this
code slice without changing settled rows or stored evidence.

## Operational workspaces and financial reporting — 2026-11-28

Continue `.mobocom/pay-private-api-access` on
`fix/pay-private-api-access-2026-11-28` from `b13dc3bf`. This local slice
implements the owner's request for professional Admin and merchant
workspaces, integrated guides, and financial reports.

- Admin overview counts the full receipt, merchant and settlement queues
  in PostgreSQL and links to the existing operational desks. Payment search
  filters the full list by payment ID, order ID, merchant name and canonical
  status, with 25 rows per page. Settlement-only staff keep their existing
  settlement permissions. The financial report opens from the overview
  inside the existing Pay workspace. Menu definitions and merchant shell
  are preserved.
- Settings has direct links to its sections, save feedback, and an operator
  guide for merchant setup, SMS Forwarder, reconciliation and settlement.
  The merchant overview shows collection readiness and active terminals.
  The developer guide includes first collection, key scopes, integration,
  Telegram setup, troubleshooting and report access.
- The financial report defaults to 30 days and allows up to 90 inclusive
  Tehran calendar days. Paid totals come from the recorded payment, paid
  bank adjustment and immutable Wallet credit. The report keeps gateway fee,
  bank service fee, rounding, IRR and USDT separate. Settlement cohorts use
  request date, current status and source currency. Daily amounts and
  settlements export the selected range to CSV. The existing merchant
  transaction-list exports remain available.
- The CSS uses checked-in MoboCom SDS tokens and existing RTL typography.
  Scope includes keyboard disclosure, theme contrast, mobile reflow and
  reduced motion. No live Figma file was compared.

All 233 migrations applied to disposable PostgreSQL 17. Native
`pay-bale-collection` verified admin search, queue and receipt permissions,
local-day report totals, bank adjustment, Wallet credit and invalid ranges.
`pay-settlement-center` verified exact settlement cohorts and cross-merchant
isolation. Shared checkout, private API access, terminal keys and bot
regressions passed. TypeScript and repository source, architecture and
security checks passed. React Doctor scanned eleven affected files with
zero errors and four maintainability/performance advisories.

Edge browser runs at 1440 light and dark, 768 light and 390 dark exercised
the queue beyond its old 200-row list, settings save with reload, payment
filter/reset, keyboard guide navigation, both date filters, CSV and restricted
role. Scoped axe and overflow checks passed. An additional connected Edge run
confirmed the chart and day picker with an actual settled fixture of ten
million rial. Form, report, guide and chart captures are in ignored
`playwright-report/`. Prototype dark contrast failures were corrected.

No migration is required for this slice. The work is local. The scoped UI and
read models can be reverted without changing financial rows. Live external
bank and SMS behavior, and reporting capacity on a production-size ledger,
were outside the completed checks.

## Manual own receipt approval and SMS Forwarder save — 2026-11-28

Continue `.mobocom/pay-private-api-access` on
`fix/pay-private-api-access-2026-11-28` from `b13dc3bf`. The owner asked to
approve receipts for their own merchant manually and reported that the SMS
Forwarder source form did not save.

The Pay receipts screen uses one review policy for the merchant card-transfer and
automatic-collection receipt paths. A current full-access Admin can approve
their own merchant receipt with the same verified transfer reference, financial
claims and Audit as an independent reviewer. The Audit entry includes
`selfReview`. Restricted staff cannot approve their own receipt. Own settlement,
own generic invoice or wallet receipt review, own receipt rejection and
own confirmation of bank evidence in reconciliation retain their existing rules.

The source form shows the dedicated bank-account requirement, the validation
error or saved state, and the current version for repeated edits. A full-access
Admin can edit another Admin's source. Concurrent edits claim the stored version.
The source owner, destination and encrypted token stay intact on edit. Saving
identical settings preserves the version used by accepted checkouts. A disabled
bank allows pausing its existing source. An invalid stored template can be listed
and replaced. Creating a source requires the server's `PANEL_CREDENTIAL_KEY`;
missing configuration returns a targeted error and a new token is issued only
on creation. [Operator setup](../../MOBOCOM_PAY_SMS_FORWARDER.md).

All 233 migrations applied to disposable PostgreSQL 17. The shared checkout
and collection suites exercise own approval, denial for restricted staff, bank
reference and exactly-once credit. The collection suite also tests SMS source
ownership, missing encryption key, stale and unchanged edits, disabled bank,
invalid template repair and synthetic automatic settlement. Pay bot, terminal
keys, private API access, and settlement center regressions passed. TypeScript,
architecture, source, and security checks passed. Scoped Semgrep ran one rule on
five files with zero findings.

Edge at 1440 px light and 390 px dark exercised create, invalid template feedback,
update and durable reload. The desktop flow also exercised the missing-bank
state. Both form scopes passed axe and viewport checks. React Doctor returned
zero errors and one complexity advisory for the existing source component.
Local ignored form captures are in `playwright-report/`.

The changes require no migration or production configuration change on an
already-configured instance. Live phone delivery, HTTPS setup on the target
site, and a real bank deposit are still to be verified. Rollback can revert the
policy and form code while retaining saved sources and recorded financial history.

## Private account API access and bank SMS review — 2026-11-28

Continue in `.mobocom/pay-private-api-access` on
`fix/pay-private-api-access-2026-11-28` from merged main `b13dc3bf`. The owner
requested hiding general API surfaces while retaining Pay machine access and
asked about automated bank SMS settlement and the manual self-review refusal.

The general account and public menu omit the API entry. Live personal-key
management is available through the Pay guide for an active, eligible merchant
and by direct URL for staff. The page and key list/issue endpoints share the
eligibility check. Existing key owners retain direct authenticated revocation.
Examples for general REST endpoints are removed from the browser component.
The global `publicApiEnabled` setting retains its existing meaning for bot,
terminal, legacy machine, webhook and bank SMS routes.

The key owner endpoint projects display metadata, emits the new secret once
with private/no-store and requires same-site Origin for issue and revoke.
An atomic owner-scoped claim prevents changes to another account's keys.
Quota checks and insertion share a Serializable transaction. Generic API
authorization uses canonical session authority and rejects inactive and erased
key owners. Existing working key types, namespaces and hashes are preserved.

The later owner decision above allows full-access Admins to approve their own
merchant's Pay receipt manually.
The existing bank SMS intake authenticates the source and the matcher uses
an accepted, exact reserved amount and bank destination, a valid time window
and a single settlement claim. Phone configuration and an actual deposit
remain destination checks. See the
[operator guide](../../MOBOCOM_PAY_SMS_FORWARDER.md).

On an empty disposable PostgreSQL 17 database with 233 migrations,
`pay-private-api-access`, `global-authentication`, `pay-bot`,
`pay-bale-collection`, `pay-terminal-keys` and `pay-shared-checkout` passed.
The SMS suite uses synthetic sources and messages. Scoped Semgrep, TypeScript,
architecture and security gates passed. This is a focused review of API key,
Pay integration and SMS boundaries.

Edge at 1440 px light and 390 px dark confirmed the ordinary account's menu
and direct key endpoints are hidden, an active merchant can follow the Pay
link, and the scoped key form has no axe or overflow finding. The early
browser fixture hit the installer gate before an Admin fixture existed
and the install probe cache expired. The completed run used the ordinary
authenticated routes and captured the form in ignored `playwright-report/`.
React Doctor reported no errors in the key form and one existing advisory
about locale-dependent date formatting.

Rollback reverts the browser and personal-key policy code. Existing keys,
settings, permissions and payment records remain in their current tables.
No schema change or production deployment is involved. The implementation
is a local worktree diff.

## Terminal API credentials and release rehearsal — 2026-11-28

Continue the existing gateway control branch from main `07583c07`. This slice
adds named `mcpterm_` credentials for one terminal. They can discover that
terminal's methods, create its payments and read their status through v2.
Payment replay stays in the same terminal namespace across a rotation.
The separate hash store, route allowlist and owner predicates enforce the
boundary. Administrators with the existing Pay merchant authority issue,
rotate and revoke with a reason, explicit confirmation and revision checks.
Issue and rotate return the secret once. PostgreSQL stores its digest and
display prefix. Audit contains the command and reason.

Migration `20270418140000_pay_terminal_api_keys` adds the credential table.
A disposable PostgreSQL 17 database built from the released `v1.7.27` schema
contained a merchant, a terminal and an unpaid payment. A custom-format dump
restored into a second database and the candidate migrated it through 233.
The original amount, fee, net, status and fingerprint were retained. An
isolated `v1.7.27` checkout owner with its original generated Prisma schema
read that payment afterward. This rehearsal used synthetic records, not a
destination environment, provider or release installer.

Twelve native PostgreSQL suites passed. They include the terminal credential
lifecycle with cross-terminal, revoked, rotated, legacy and settlement denial,
gateway access, checkout, bot, bank collection, webhooks, Mellat and merchant
access. The first release-gate run surfaced three older test expectations from
the merged management, support and stock changes. The corrected tests follow
the current Magazine-only mapping, canonical ticket reply owner and actual
PostgreSQL stock lock.

The final Linux Node 22 gate exited zero. It ran 1,170 site tests, 53 connected
tests, 4 backup tests and 14 billing tests, as well as TypeScript and the
static gates. A separate PostgreSQL 17 on Windows reran the updated credential
case and confirmed that repeating the same request after key rotation returns
the original payment. The changes are in [PR #518](https://github.com/WebNetData/MoboComCMS/pull/518).

Four Playwright runs passed against the local production preview and its
loopback PostgreSQL 17. Light and dark themes were each tested at 1440px
and 390px. Each run covered creation, one-time reveal, rejected requests
for a different terminal and settlement access, payment creation and lookup,
rotation with payment replay, and revocation. The scoped axe and page-error
checks passed. The Windows package trace check flagged paths in existing
routes. The Windows build was used for local browser verification.

Provider commissioning in the destination environment still requires a real
bank SMS, a merchant bot and controlled verification with the destination
provider credentials.

## Merchant and terminal gateway access — 2026-11-27

Continue `.mobocom/pay-terminal-gateway-control` on
`feat/pay-terminal-gateway-control-2026-11-27` from merged main `07583c07`.
Billing enforces the combined merchant and terminal policy at order creation,
hosted checkout and the existing bot flow. The catalogue comes from existing
ready Billing accounts. Administrators can inherit it, limit and order it, or
pause new attempts. The merchant console and v2 API can pin a permitted
account. Scope, order, current readiness and an optional amount are checked by
the same owner. Provider credentials stay in Billing. Gateway pinning is part
of idempotency only when supplied. A policy change preserves started invoices,
proof and callback ownership.

Migration `20270418130000_pay_gateway_access` adds default inheritance and
an immutable optional gateway reference. It preserves historical records.
PostgreSQL 17 passed all 232 migrations on an empty disposable database and
the 231-to-232 upgrade with an existing merchant, terminal and unpaid record.
The upgrade preserved amount, fee, net, status and fingerprint. Eleven suites
passed on the clean database. They cover the new gateway policy, shared
checkout, bot routing and delivery, SMS/Bale collection, base Pay, webhooks,
USDT equivalent, Mellat callback, private merchants and merchant account.
The run used Node 22 as UID 1000 with no repository environment file.

Production webpack build, TypeScript, runtime traces, source, architecture,
security, schema parity and the registered-migration gate passed. OpenAPI
Spectral retained the pre-existing Bale warning, and oasdiff detected no
breaking changes. All eight Hurl requests and 52 targeted unit tests passed.
Edge exercised both the admin and merchant flows at 390 and 1440 pixels in
light and dark themes. The administrator ordered the merchant's catalogue
and narrowed the terminal grant. The merchant created a link pinned to an
eligible gateway. The eight views passed scoped axe, viewport and browser error
checks. Scoped Semgrep and redacted Gitleaks reported no findings. Graphify
verified the calls from payment creation and hosted start to the policy
projection. Provider, SMS and bank calls in scope used disposable fixtures.
Rollback can restore the previous application and keep the additive columns.
Earlier application versions restore catalogue-wide availability for new
initiations. Pause affected terminals through the existing control before a
rollback if a narrowed grant must stay enforced.

## Custom bot numeric fields and SMS checkout — 2026-11-27

Continue `.mobocom/pay-gateway-contract`, branch
`fix/pay-gateway-contract-2026-11-27`, from merged main `0d3332a5`.
The exact reported 422 was reproduced on the base with optional numeric claims
sent as strings. Billing now normalizes numeric and canonical decimal-string
Toman, customer IDs and optional numeric claims. Explicitly empty optional
fields are treated as absent. Invalid optional integers report the field name.
Only normalized counts and days can affect routing. Order identity, exact Rial
conversion, request size, credential scope, receipt evidence and settlement
claims remain governed by the existing owners. No migration is required.

- The existing connected collection suite now creates a bot order through the
  actual HTTP owner and settles it via the three-field Forwarder HTTP owner.
  It checks equal-price orders reserve distinct amounts, the invoice-only
  amount cannot approve a quote, and an exact SMS replay leaves one merchant
  credit and one delivery job. The companion routing suite verifies that
  string claims meet the same thresholds as numbers.
- On a disposable PostgreSQL 17 database with all 230 migrations, the
  `pay-bale-collection`, `pay-bot`, `pay-routing-operations`,
  `pay-shared-checkout`, `mobocom-pay`, `pay-usdt-equivalent` and
  `pay-webhooks` connected suites passed. The non-root Node 22 runner ran
  48 targeted unit tests and TypeScript successfully.
- The local Next runtime returned both URL and LINKS. All ten
  `bot-smoke.hurl` requests passed. oasdiff found no breaking changes.
  Spectral reported the same retired Bale route warning before and after.
  Scoped Semgrep reported zero findings on the two changed product files.
- The webpack production build passed after allocating a 7 GiB V8 heap to
  the isolated build process. Runtime trace checks excluded storage.
  On loopback HTTPS, production returned the bot button URL and handled
  authenticated terminal creation and lookup of a payment via v2.
  Playwright opened the returned link by keyboard at 390 and 1440 px in
  both themes. The checkout showed the matching amount and phone gate;
  bank details were withheld before verification.
- Integration settings and examples are in the existing Pay, external bot
  and SMS Forwarder guides. Operational acceptance requires the customer's
  real bank SMS, phone forwarding and merchant bot acknowledgement. A code
  rollback restores the original integer-only parsing for these inputs.

## Custom bot customer ID compatibility — 2026-11-27

The owner reported HTTP 422 from the external bot's custom gateway and asked for
a payment button under the bot message. The fix is in `.mobocom/pay-bot-string-user-id`,
branch `fix/pay-bot-string-user-id-2026-11-27`, based on main `92133a8d`.

- The Billing bot parser accepts a positive decimal-string `user_id` in the same
  safe-integer range as a numeric ID. Both forms use the existing customer hash.
  A different customer still conflicts. The request shape, amounts, callback
  contract and authentication retain their existing checks. There is no migration.
- The setup guide shows the existing `LINKS` mode. Without a routing rule it
  returns one labeled button URL. The external bot renders the returned links.
  Existing `URL` consumers continue to receive one `url` field.
- The focused test reproduced the original 422 on the base parser. On the fix,
  all 22 tests in `scripts/pay-bot.test.cjs`, TypeScript and the `pay-bot`,
  `pay-routing-operations` and `pay-shared-checkout` PostgreSQL 17 checks passed.
  The local Next.js HTTP run covered both response modes, mixed-form replay,
  changed customer 409 and five invalid IDs returning 422. All eight Hurl
  requests passed. oasdiff found no breaking change. Spectral reported the same
  existing Bale retirement warning on base and fix.
- Playwright activated the returned link with the keyboard at 390 and 1440 px.
  The local checkout opened the matching synthetic order and phone verification.
  Deployment and the external bot's renderer still need the owner's environment.
  The owner should replace credentials that appeared in the support exchange.
  A code rollback needs no database action.

## SMS-only card transfer and manual payout — 2026-11-27

The owner retired the personal Bale connection. The old POST returns 410 with
`PAY_SOURCE_RETIRED`. The connector settings and admin status endpoint were
removed. Queued Bale notices cannot settle and previous confirmations remain
in the ledger. This slice introduces no migration.

Admin activates SMS matching and selects the dedicated bank account in the
gateway. Set up a verified SMS source for that account and enable automatic
collection on the merchant and terminal. Test the template against a sample
in settings before enabling it. The existing Forwarder and timestamped
contracts remain available. Only the stored SMS source and version can
confirm the unique amount. Accepted requests that lose their eligible source
can submit a receipt during their original pending window.

The administrator makes the outbound settlement externally and records the
bank reference or transaction hash in the existing settlement desk. Its
authorization, review thresholds, receipt evidence and balance claims apply.
The phone-to-production forwarding path requires testing with a real message.

Verified in Docker Desktop with a clean PostgreSQL database and a non-root
runner without an `.env` file. The production build and five connected Pay
suites passed. They cover matching, duplicate handling, delayed events,
historical source retirement, manual settlement, and asset and bot flows.
Edge exercised the SMS template tester, HTTP 410, checkout and receipt review,
and the admin settlement page. Scoped axe, architecture, source, schema and
money checks passed. React Doctor reported zero errors and five advisories.

## SMS checkout and fee allocation — 2026-11-27

The customer screenshot showed the manual card path. On new eligible checkouts,
the automatic method is primary unless the link specifies a different method.
Admin controls source, destination and terminal eligibility. A manual
selection remains explicit and keeps its original invoice. The automatic
quote reserves an exact amount and shows its adjustment alongside the
contract fee shares. Existing settlement still claims the invoice once.
Basic SMS Forwarder can confirm a Rial payment. Locked-rate USDT still
requires timestamped evidence or staff review.

The merchant's payment workspace saves the customer share of the contracted
fee or clears it to the contract default. The allocation applies to new Pay
and bot orders. The whole-Rial remainder goes to the merchant's fee share.
Existing total, net and fee columns are the immutable snapshot. Legacy API
feeBearer values remain available with additive exact shares.

Executed on the local Docker Desktop app: clean database migrations,
four connected PostgreSQL suites, architecture/source/schema/money gates,
OpenAPI comparison, React Doctor (zero errors, five advisory findings) and
production build. Connected cases proved a split fee, distinct bank amounts
for equal orders, a principal-only SMS refusal and one net wallet credit on
an exact SMS plus replay. Twelve browser scopes on a synthetic HTTPS preview
verified receipt centering, both submissions, documented mobile dimensions,
receipt permissions and the existing ledgers. A separate mobile browser
check verified saving and reloading the merchant fee preference.
No live provider delivery was exercised.

## Compact checkout and receipt review — 2026-11-26

Owner reported unreadable details in both payment tables, hard-to-open receipt
images, and a long mobile checkout. Continue .mobocom/pay-receipt-checkout,
fix/pay-receipt-checkout-2026-11-26, based on main cd1f6aae (released 1.7.24).
The shared PaymentTable expands a full-width row with grouped amounts and facts.
The Admin projection includes up to 20 recent receipt IDs per payment and counts
pending receipts independently. Merchant projections omit receipt IDs and the
original image route continues to enforce its permission.

Hosted and automatic bank checkout share a compact destination card, exact
Rial clipboard action and a two-field receipt dialog. OTP, exact amount consent,
current account visibility settings and review hold remain in the original
owners. Customers supply the source cardholder name and bounded image. Historic
receipt payloads are still supported. The automatic form uses the exact server
quote when no amount is sent. The reviewer checks the amount against the bank;
upload time is not stored as payment time. Staff records the verified bank
reference when approving an unpaid Pay receipt submitted without one. The
existing approved-reference unique index and invoice claim protect duplicate
credit. The Finance review entry forwards the same reference to Billing.
No migration is added.

Executed local checks in isolated Node 22 and PostgreSQL with no .env:
typecheck, architecture, source, money and money-UI gates; pay-shared-checkout,
pay-bale-collection, pay-assets and pay-bot. Tests covered missing customer
metadata, staff reference requirement and case-insensitive duplicate refusal,
one credit on repeated approval, automatic quote amount, Admin image authorization
and absence of receipt IDs in merchant results. oasdiff reported no breaking
changes. Scoped React Doctor reported zero errors and 63 advisory warnings.

Edge/Playwright verified seven checkout scopes, including 320x568 dark and light
views with no document scroll, real clipboard contents, Escape and focus return,
and actual receipt submission on both payment paths. Five Admin/merchant views
verified the expanded ledger at 390 and 1440, internal width, the guarded image
response, anonymous denial and inline image decoding. The tested scopes passed
axe. Early narrow-view overflow and contrast failures were corrected and rerun.
Owned preview, tunnel, PostgreSQL databases, role and private fixture credentials
were removed. The shared local app returned HTTP 200 after cleanup.
No hosted workflow or release for this slice. Roll back the app and API together
if necessary. Retain all receipt images and payment history.

### Docker Desktop preview — 2026-11-26

The owner asked for build and preview work in the local `mobocom-app` service
on port 3000. The production build of bafe63e9 and `npm run check` passed
inside that container as UID 1000 without a .env file. The built app passed
the seven checkout and five Admin/merchant browser scopes over isolated HTTPS
with synthetic data. The isolated resources were removed afterward.

The local Compose override in `var/pay-receipt-checkout/compose.checkout.json`
points the same app service at this checkout. The existing database and
storage were retained. A local dump was verified before the 16 pending
migrations ran. Pay was enabled for local review, seed was skipped, and
background schedulers were paused. The usual HTTP development preview on
`http://localhost:3000/pay` returned 200 in Edge and the running checkout,
destination card, payments table and receipt owner matched bafe63e9. No real
bank transfer or upstream delivery was exercised.

## Gateway availability and operations alerts — 2026-11-26

Owner requested implementation after the gateway review. Continue in
.mobocom/pay-reliability, fix/pay-gateway-availability-2026-11-26 from main23ce5433
with existing local guidance/audit commits. Billing now commits automatic card
checkout selection, invoice, bank quote and URL together. Pool exhaustion returns
an actionable capacity error and leaves a fresh payment free to choose another
allowed method. A legacy interrupted local start can resume on its own unpaid
invoice. External provider work keeps its existing ambiguity rules. Invoice
authorization, terminal route snapshot, amount history and settlement claims
remain in the existing owners. No new migration.

Transfer monitor uses the allocator's whole-Toman range. The existing Operations
Monitor has an aggregate MoboCom Pay signal for paid bot deliveries requiring
attention and overdue bank reviews. Alert delivery follows the monitor's existing
configuration. These signals are independent of collector connectivity.

Executed in Docker Node22/UID1000 with no .env and owned NOSUPERUSER PostgreSQL:
fresh migration deployment, npm run check, pay-bale-collection, pay-shared-checkout,
pay-bot and pay-routing-operations. The collection test exercises exhaustion
rollback, normal fallback, concurrent quote reuse and legacy recovery. Restoring
the old checkout implementation in the disposable runtime fails the new capacity
assertion; restored the fixed source and reran the four suites. Actual Chromium
390 dark and1440 light verified capacity error → manual fallback, automatic URL
and loaded fee-consent screen. Scoped axe, width and page-error checks passed.
Earlier fixture-only failures were corrected without relaxing database rules.
The disposable preview, tunnel, two databases, role and private session files
were removed. The shared local app responded HTTP200 after cleanup.

Production commissioning remains pending: real owner-side SMS/Bale session,
production queue and merchant response contract. The amount pool is finite by
design; a trusted bank/provider transaction identifier is needed for sustainable
attribution at high volume. Automatic external payouts, independent source
heartbeat and merchant-side order status verification have external dependencies
and are outside this implemented slice. Roll back code and alerts together if
needed. Keep invoices, bank notices, amount reservations and delivery history.

## Gateway launch gap review — 2026-11-26

Owner asks what the actual gateway lacks. Read-only product-source review on
docs/claude-frontend-guidance-2026-11-26, main23ce5433 plus d1017e18; no runtime,
schema, UI or financial behavior changes. Separate existing capabilities from gaps:

- Amount-only attribution has a finite, globally reserved lifetime pool. In
  bale/collection-create.ts the occupancy query includes all historical rows;
  prisma/schema.prisma makes collectedRial globally unique. Default policy10..9990
  Rial, step10, gives999 candidates for a whole-Toman principal; overlapping ranges
  can consume them sooner. Paid/expired requests do not release slots, including
  across different cards. This is the existing late-message safety decision, not
  permission to recycle old amounts. Existing monitor exposes LOW/EXHAUSTED.
  A sustainable capacity/attribution policy is needed for volume; preserve history
  and delayed-message correctness rather than removing the unique constraint.
- transfer-operations/monitor.ts distinguishes configured-ready from a notice
  observed in the last15 minutes. collection-context.ts admits by configuration
  and authority, not an authenticated collector heartbeat. No heartbeat-specific
  admission/alert implementation was found in the inspected Pay/Operations paths.
  Quiet banking activity is not proof of disconnection; add liveness through the
  existing Operations/Notifications owners, independently of financial notices.
- Personal Bale installation/login/verified bank peer and actual recovery remain
  external commissioning, documented in tools/pay-bale-server/README.fa.md; the
  repository's tools folder provides setup documentation, not an installed session.
- Three-field SMS has no independent original-message time. Locked-rate USDT
  acquisition requires trusted timed evidence or review; do not silently loosen it.
- Bot delivery deliberately leaves uncertain post-send results UNKNOWN. Explicit
  reviewed recovery exists; automatic reconciliation additionally needs a merchant
  status/idempotency contract absent from the supplied create/verify-only guide.
- Settlement decisions record external references/tx hashes with review; the
  inspected command does not itself initiate bank/on-chain payout. This does not
  block a consciously manual settlement service.

Evidence is source inspection and existing test inspection only; PostgreSQL,
browser, real bank/Bale/SMS and merchant callbacks were not rerun for this review.
Corrected the operator guide's stale final migration number222 to current223.
Priority: deploy matching code/migration, commission SMS/Bale/worker and the real
merchant ACK, run one controlled exact-once end-to-end payment; then implement
heartbeat/alerts and the capacity policy before increasing traffic. Continue the
same Billing/Operations/Notifications owners. Rollback this documentation slice
only; no data or deployed behavior has changed.

## Shared Claude frontend guidance — 2026-11-26

Owner requests Claude's frontend design skills after preferring its visual work.
Continue .mobocom/pay-reliability on docs/claude-frontend-guidance-2026-11-26,
from main23ce5433 (PR497 merged). Read the installed Anthropic frontend-design
and existing Unslop guidance; canonical ENGINEERING_SKILLS/FRONTEND_QUALITY now
explicitly pair them for new compositions and visual reworking. Existing approved
visual identity, fluid specialist layout, Persian typography and task-specific
OpenDesign/UI Skills remain authoritative. No vendored payload, application UI,
model/client configuration, dependency or database changes.

Executed: offline sync verification17 skills/422 files,0 copies; canonical AI
knowledge regenerated and checked, scoped whitespace reviewed. PostgreSQL,
React Doctor and browser checks are not rerun for this instruction-only change;
their previous Pay evidence below is historical, not new visual verification.
Next frontend slice must inspect its actual approved reference, state/review a
compact direction, implement within existing owners and verify real rendered
desktop/mobile, both themes and accessibility. No site-wide redesign is started.
Rollback: revert this documentation/derived-knowledge slice; runtime is unchanged.

## Integrated payment reliability audit — 2026-11-26

Delivery: [PR497](https://github.com/WebNetData/MoboComCMS/pull/497) targets main;
integrated readiness `1e4d5854`, pending-migration alignment `a75e04b9`, final
repair/evidence `a9a63861`. Open for owner review, not merged or deployed.

Owner asks that the payment service work according to the existing external-bot,
manual/SMS/Bale, fee/net, expiry/review and merchant-ownership requirements, and
that existing Claude skills feed the shared engineering/architecture workflow.
Authoritative checkout .mobocom/pay-reliability, branch
fix/pay-reliability-2026-11-26, base main 595fa493 (merged PR496). Continue the
existing unmerged readiness 7e6b1ae9 as 1e4d5854; do not rebuild those capabilities.
Latest wide Pay/Cloud presentation and initial-terminal repair remain included.
No release, production deployment or live financial/provider call is performed.

Verified findings and changes:
1. The old readiness implementation was not in 1.7.23. Its accepted SMS/Bale
   evidence now commits the existing pay.transfer-match recovery job in the
   same transaction, with immediate matching retained. The job invokes the same
   exact-once settlement; it does not mint another Wallet/payment or credit fees.
   Hosted BOT callbacks, explicit boolean ACK, dedicated Admin-owned Xray purpose
   and fail-closed route selection are integrated from that source.
2. Generic Admin invoice settlement could bypass an automatic collection, and
   Admin360 could repeatedly credit an already-paid WALLET_TOPUP. Billing's
   internal genericManualReview command takes a portable conditional no-op Invoice
   write lock before checking collections; collection creation takes the same
   row lock. Open automatic quotes return 409 with review guidance. Invoice Admin,
   Orders Admin and Admin360 all use settleInvoiceManually. Generic top-ups credit
   exact invoice principal through the canonical Wallet row/stable key inside
   the invoice transaction; failure rolls back, paid replay returns before credit,
   and the old nontransactional Admin360 credit is removed. Platform fee/amount
   distinction remains untouched. Existing qualified receipt/automatic collection
   settlement retains its own path and separate adjustment journal.
3. Bot payment creation/delivery used cached section authority; both now demand
   fresh fail-closed access. A stale open cache or unreadable authority cannot
   create a payment or send an irreversible callback.
4. Direct transport treated even proven pre-POST connection failures as UNKNOWN.
   Both direct and selected-proxy transport now establish pinned public TLS and
   verify the original host before constructing HTTP. The existing bounded
   safe-retry path applies only before POST; lost replies/unknown ACK remain
   UNKNOWN and require review, never automatic replay. Public-IP/DNS/port/redirect
   restrictions and encrypted distinct merchant callback Token remain.
5. Eleven relevant .agents/.claude SKILL.md pairs were byte-identical. Existing
   ENGINEERING_SKILLS and ARCHITECTURE now explicitly route both clients through
   the same audit/develop/conditional-contracts/release owners and evidence.
   File parity does not claim Claude discovery/execution, a live model change or
   a second client-specific architecture. No tool config/dependency was changed.

Migration compatibility: the old, never-published ACK migration sorted before
Cloud's already-shipped 20270409 migration. Rename only that unpublished directory
to 20270410120000_pay_bot_boolean_ack, leaving its SQL and every released migration
unchanged. All 25 released manifests/hashes match main; manifest validation passes
with one unreleased migration. This is migration 223 on the current baseline.
Run it with the matching application on the next rollout; do not edit/reseal the
immutable 1.7.23 release. Older numbered migration 222 references below are the
historical branch evidence, not the current install order. No Prisma column
or financial-state migration is introduced by this audit repair.

Executed local evidence:
- Linux Node 22, UID 1000, no .env and a dedicated NOSUPERUSER role. Full canonical
  npm run check passed in 97s: 1170 site/53 connected-source/4 backup/14 Billing
  tests, generated knowledge/extensions, architecture/source/schema/money/money-UI/
  security/audit/i18n and TypeScript gates. Final 39 Pay/proxy units also passed.
- Eighteen scoped real PostgreSQL suites passed in 77s:
  mobocom-pay, pay-shared-checkout, pay-bot, pay-routing-operations, pay-bale-server, pay-bale-collection, pay-usdt-equivalent, pay-private-merchants, pay-assets, pay-webhooks, pay-settlement-center, pay-merchant-account, pay-public-account, account-control, money-state-rules, invoice-void-settle, mellat-callback, order-closure.
  Final pay-bot/pay-bale-collection reran after fault restoration; the collection
  suite reran again after adding the real quote-creation lock race, passing in 9s.
  Existing scenarios cover manual-first/auto-first/SMS+Bale competition/replays,
  fee vs principal/merchant net, USDT evidence, expiry/receipt review and enqueue
  crash recovery. New tests cover all three Admin surfaces, repeated/concurrent
  Admin360 and ordinary top-ups, overpayment isolated from credited principal,
  current section refusal/read failure, and no duplicated Wallet/journals.
- A deliberately uncommitted quote is invisible to the helper's precheck. The
  regression observes the generic settlement actually waiting on the Invoice
  lock via pg_stat_activity, commits the quote, then verifies 409 with the invoice
  still UNPAID, quote PENDING and zero credit/payment rows.
- Fresh current schema deployed223 migrations. Separately deploy baseline 222,
  populate an existing valid bot integration, prove the old constraint rejects
  JSON_STATUS_TRUE, deploy 223, compare the prior row byte-equivalent through JSON,
  then prove the new ACK is admitted. Remove the owned fixture afterward.
- Real local TLS/CONNECT tests verify exact Host/Token/body, pinned direct and
  proxied paths, certificate/name failure and connection refusal with zero HTTP
  construction/POST, no fallback, no redirect follow, and lost-response uncertainty.
  Deliberate mutations of the generic guard, fresh bot authority and pre-send
  classification each fail the expected behavioral assertion; all restored.
- Actual Chromium/Playwright: four merchant and four unlocked Admin 1440/390
  light/dark captures pass scoped axe, overflow and page-error checks. Real
  merchant integration save and a cookie-free server-to-server creation request
  use the supplied bot body/Toman conversion, stable replay URL and JSON error
  contract. Merchant source/proxy APIs deny 403. Dedicated callback route is
  visible in Admin and disabled for an absent/old helper, without installing or
  applying any root configuration. Screenshots were inspected.
- React Doctor on affected bot form/proxy page: 0 errors, 5 reviewed existing
  state/form/complexity warnings, no suppressions. Scoped Semgrep 0 findings/errors
  and redacted Gitleaks 0 findings. Actual validated runtime matched 34 changed
  source/script/deploy/schema inputs after temporary routing was restored.

Test limitations and corrected setup failures: Docker-copied generated JSON needed
UID 1000 ownership; a preview-only native-control-plane rewrite exception initially
leaked into a concurrent full check (that check correctly failed), then source was
restored and the full canonical check passed. Only after that check, owned browser
Admin calls were routed to this preview's own unchanged guarded API; routing was
restored before final source comparison. The real machine request must omit the
browser session cookie; its first cookie-bound no-Origin probe correctly received
403. The manual browser fixture initially used a dedicated bank purpose; the DB
correctly refused mutating that immutable purpose, so a distinct owned GENERAL
account was added. No financial/source guard was weakened. Installed Node typings
do not admit signal in TLS ConnectionOptions; explicit abort handling is used
and final typecheck passes. A first inner-error mutation was neutralized by the
outer pre-send classifier; mutating the actual classifier then failed as intended.
The inventory reservation preceding manual settlement can still reserve stock
before a concurrent quote causes 409; this is an existing reversible reservation
side effect, not a financial claim or credit. SQLite execution was not rerun;
the new generic lock uses the established portable Wallet no-op-write pattern.
Historical notice backfill and real bank/chain/provider fulfillment are not claimed.

Operational acceptance still required on the owner's server:
- Configure Admin-owned receiving card, per-terminal grant and CARD_TRANSFER
  automatic policy; the merchant never receives SMS/Bale secrets or controls.
- Bind a verified SMS source/phone sender filter and the server's personal Bale
  connector to the immutable owner/account and original bank sender. The guide
  does not install/log in a live collector. Simple sms/bank/token messages lack
  independent payment-time evidence and cannot alone auto-settle locked-rate
  USDT acquisition; use trusted extended/Bale time or canonical receipt review.
- Confirm the actual merchant panel's successful/repeated JSON ACK, configure its
  separate payment Token privately, run the real queue and perform one controlled
  end-to-end canary. If proxy egress is selected, upgrade/configure the installed
  root helper first; direct and selected-proxy transport never silently substitute.

Cleanup verified: owned preview/tunnel stopped, both owned databases/role/private
runtime and synthetic session/TLS/source archives removed, shared app3000 HTTP 200.
Other worktrees, existing schemas/data/keys and released assets are preserved.
Raw safe receipts/screenshots stay ignored under var/pay-reliability.
Rollback as one application slice, deselect pay_callbacks before reverting helper,
retain widened constraints and all payment/UNKNOWN history; never reset balances
or replay an uncertain external financial action.

## External merchant bot and durable bank matching — 2026-11-26

Owner clarifies this is another merchant's Telegram bot; supplied panel is
`bot.webnetdata.ir`. Continue merged PR492/main`c9355792` in
`.mobocom/pay-bot-readiness`, branch`feat/pay-bot-readiness-2026-11-26`.
Local implementation; no new release/PR/deploy or hosted workflow requested.
[Scenario](../../specs/pay-bot-readiness/SPEC.md) and
[Persian operator guide](../../MOBOCOM_PAY_EXTERNAL_BOT.md).

Billing retains terminal-scoped creation keys, Toman conversion, stable order IDs,
canonical settlement and distinct encrypted panel payment Token. BOT destinations
may use a hosted panel on another public origin without requiring a merchant
website; WEBSITE destinations retain their registered-origin restriction.
The integration form distinguishes the two APIs/keys and BotFather. Explicit
JSON_STATUS_TRUE accepts literal boolean status only; explicit negative status
overrides positive fields. Additive migration222 widens the existing integration/
delivery checks, listed unreleased; no existing financial rows or Prisma columns
change. Run it before deploying the corresponding application.

Existing Social egress/Server Panel owns pay_callbacks. Root builder4 adds a
separate loopback10810 inlet in the same Xray service: IP-only public443, private/
reserved denial and catchall drop. Existing10809 domain-scoped rules stay intact.
Billing validates all DNS answers, pins the selected IP, then CONNECT/TLS verifies
the original panel hostname before constructing POST. Redirects are not followed;
Token remains inside TLS. Selected proxy/config failure cannot fall back to direct.
Settings are fresh and fail closed. Old helpers refuse the new purpose until the
owner upgrades through the existing installer. The Admin TLS probe sends no order.
Only guaranteed pre-POST failures use capped five-attempt backoff in existing
delivery/Operations; any possible POST/unknown acknowledgement stays UNKNOWN
without automatic replay. Current identity/merchant/module/permission checks stay.

SMS and Bale intake now enqueue pay.transfer-match in the same transaction as
accepted ORIGINAL_TRANSFER/CREDIT evidence, including valid duplicate intake.
Inline matching remains the immediate path. A worker recovering an interruption
calls the same Billing matcher/claims; it cannot credit fees, add a second Wallet
entry or bypass module-off/time evidence guards. Locked-rate USDT lacking trusted
payment time remains review-required. No new queue, matcher, identity or Wallet.
This closes future intake's commit-to-match gap; historical notice backfill is
not implemented. Existing manual/SMS/Bale once-only settlement remains authoritative.

Executed evidence so far: fresh222 migrations under an owned NOSUPERUSER role and
UID1000, private generated Prisma client; full npm run check passes before the
final durable-match addition (1148 site/53 connected/4 backup/14 Billing tests).
Final source TypeScript and eight scoped architecture/source/schema/money/money-UI/
security/audit/i18n gates pass. Final39 Pay/proxy units pass, including actual
trusted TLS-through-CONNECT, exact Host/Token/body, rejected certificates, redirect,
lost-response uncertainty, CONNECT/config failure before POST and no direct leak.
Final six native suites pass: pay-bot, pay-routing-operations, pay-bale-server,
pay-bale-collection, pay-private-merchants and pay-shared-checkout. They include
both source crash/replay recovery, module-off denial, manual/automatic competition,
principal/fee isolation, explicit boolean ACK, hosted BOT vs WEBSITE origins and
safe callback backoff/exhaustion/recovery. Final types and39 units reran after
aligning application reserved-IP denial with the root callback rules.

Actual Edge/Playwright verifies real merchant save and exact external creation
POST body, replay URL and JSON errors. Merchant bank-source/proxy APIs deny403.
Four merchant and four Admin1440/390 light/dark captures have no overflow, page
error or scoped axe violations; mobile-dark and desktop-light screenshots inspected.
The guarded Admin API exposes the dedicated purpose but rejects old-helper selection.
Owned preview keeps engineering background scheduling suppressed; for the browser
only, its native-control-plane rewrite is disabled in disposable runtime source
so Admin requests reach this preview's own guarded API, never the shared app3000.
No guard was bypassed. A safe temporary runtime-only guard trace was restored.
Initial failures were fixture/setup issues: manual fixture used dedicated instead
of GENERAL account purpose; old native-control-plane routing hit the shared app;
an unselected profile was needed to display the existing route editor; dev memory
restart interrupted a reload. Final Admin capture ran separately after restart.
A browser/native synthetic card collision was isolated without weakening the DB
identity constraint; all six native suites then passed together. Earlier actual
TLS test caught custom socket's wrong default Host/port; explicit443/Host fixed it.

Pinned real Xray26.10.31 archive hash verified; run-test accepts builder4 output.
Running actual Xray with a recording local upstream routes publicIP443 only,
rejects private/metadata/IPv6-reserved/port80/arbitrary-host CONNECT, and keeps the
old inlet from inheriting this capability. No external provider traffic.
Deliberate removal of the recovery enqueue fails the new native crash assertion;
removal of negative-status rejection fails units. Both restored; focused units pass.
Scoped Semgrep (one repo rule) and redacted Gitleaks report0 findings; this is not
a claim of a comprehensive security audit. Doctor two components0 errors and four
reviewed existing form/state/complexity warnings; no rule suppression.

Operational boundary: public GET to the supplied panel returns403 JSON
`status:false,msg:token invalid`; proves reachability only, not successful ACK.
No financial POST, real token, real bank/SMS/Bale account or external fulfillment
was exercised. Actual callback success profile, root helper upgrade, live queue,
phone filter/forwarder, private GoOmni2.4.2 account login and verified original
numeric @bam_bmi identity still require secure server commissioning and a small
real canary. A link to GoOmni is not a bundled live collector/login. Three-field
SMS cannot independently attest sender/time and cannot alone settle locked-USDT
purchase without valid time evidence. First successful shared financial claim
wins; strict upstream chronological arrival ordering is not promised.

Rollback: deselect pay_callbacks before reverting helper; roll back application
as one slice, retain widened222 checks and all payment/unknown-delivery history.
Never re-send UNKNOWN simply because the worker restarted. Safe ignored evidence
and helpers are in var/pay-bot-readiness; no credentials belong in Git.

Cleanup verified: stopped the preview as its own UID after root could not inspect
its /proc/cwd, then removed only the resolved owned runtime, NOSUPERUSER database/
role and named setup/archive helpers. Verified their absence. Verified Windows
tunnel command line before stopping it and deleting private fixture/TLS/archive
files. Safe reports/screenshots remain ignored. Shared app3000 HTTP200; no shared
data, other checkout, production setting or installed root helper was changed.

## Admin-owned bank sources and setup guides — 2026-11-26

Owner asks for an actionable SMS Forwarder POST/URL/body guide, exclusive Admin
control of automatic approval, and a discoverable way to connect their personal
Bale account on the server. Continues7812d969 in `.mobocom/pay-account-domains`,
same feature branch; no new schema, dependency, release or live connection.

- Admin Settings adds source-guide navigation and clarifies platform-owned cards,
  fee terms and once-only shared confirmation. `sms-forwarder-guide` is always
  visible, including empty sources. Selected existing/new sources determine the
  exact HTTPS `/sms-forwarder/{sourceId}` URL and bank code. POST, application/json,
  literal `{msg}`, JSON copying, source selection, sender filtering and phone
  permissions are documented. The existing one-time new secret is reused only in
  memory; existing secrets are never retrieved, stored in browser storage or put
  in URLs. EXTENDED/Bearer remains distinct; its timestamp-free/USDT limitation is
  retained. [Operator guide](../../MOBOCOM_PAY_SMS_FORWARDER.md).
- Merchant terminal UI now shows read-only automatic status. Creating a terminal
  defaults to false; any merchant/machine attempt to send `baleEnabled`, including
  false, is rejected403 `PAY_AUTO_ADMIN_ONLY` on create/update. Terminal active
  control remains available. Existing Admin merchant/terminal commands (current
  permission, exact ownership/version, note and strict audit) alone change those
  flags. Existing persisted settings and financial history are preserved; no
  blanket production disable. Deploy updated clients/server together: cached old
  create payloads containing the removed flag are intentionally refused.
- `bale-setup` explains private GoOmni2.4.2 installation/login, immutable account
  binding, original @bam_bmi numeric sender verification, per-source signed webhook
  destination and server environment template, then Admin gateway/grant setup and
  live acceptance. Admin-only bale-status adds optional safe panel navigation via
  `MOBOCOM_PAY_BALE_PANEL_URL`: HTTPS without credentials/query/fragment. No server
  fetch or management proxy is added. Missing/invalid/unknown panel state is explicit;
  merchant endpoints never expose it. This is a link to an installed private
  connector, not embedded personal login or automatic connector provisioning.
  [Pinned upstream contract](https://github.com/mimalef70/goomni/blob/v2.4.2/README.md)
  and [server guide](../../../tools/pay-bale-server/README.fa.md).

Actual evidence: fresh221 migrations in an owned NOSUPERUSER DB, private generated
Prisma client and nonroot TypeScript pass. Native pay-private-merchants,
pay-bale-server and pay-bale-collection pass, including forged owner toggles,
Admin control, safe panel URL/permission, SMS/Bale/manual races, replay and fee
separation. Restoring the old merchant self-toggle implementation deliberately
fails the new rejection assertion; source restored and all3 suites pass again.
47 related units pass with no .env/DB credentials; eight architecture/source/schema/
money/money-UI/security/audit/i18n gates pass. Semgrep/Gitleaks scoped scans0 findings.
Doctor six React files0errors/five warnings: existing Bale status complexity/
duplicated table, small settings lookup/form semantics and guide conditional state
complexity reviewed, no rule suppression.

Real Edge/Playwright proves empty guide, source creation and one-time JSON clipboard
content, exact existing HTTPS URL/code, no old-secret recovery, configured panel
link and fixture-simulated missing-panel state. Four1440/390 light/dark view pairs
have no overflow/page error and eight scoped axe checks0 violations; screenshots
inspected. Merchant has no automatic controls; forged toggle and direct source/
Bale status GETs all403. Initial exact-label locator and synthetic session claims
were corrected; light surface text/dark badge contrast defects found by axe were
fixed. A browser transport-mock DNS error exposed only a disposable synthetic
cookie in tool output; isolated signing secret/sessions were rotated immediately,
mock changed to a captured safe fixture, final complete flow passed. No real secret
or provider account was involved. A scratch mutation .ts file was removed before
the final generated-client typecheck. Detailed ignored reports: `var/pay-auto-setup/`.

Live phone forwarding, real Bale login/bank identity, signed bank traffic and
outage recovery remain commissioning steps. No hosted workflow, production build,
PR, deployment or provider send was run. Rollback only this slice's UI/server
controls together; keep prior219–221 migration/history. Owned synthetic database,
NOSUPERUSER role, runtime, preview, verified tunnel and private fixture/TLS files
were removed; absence verified. Named source archive cleanup finished separately
after the UID1000 cleanup's archive permission error. Safe reports/screenshots stay
ignored locally; shared app3000 HTTP200, other checkouts/data unchanged.

## Public Pay and account control — 2026-11-26

Continuation after806b8ed0 in `.mobocom/pay-account-domains`, same feature branch.
Owner explicitly supersedes the public-Pay/enrollment closure and empty-only
account deletion. Chosen erasure policy preserves shared financial facts without
personal details. [Scenario and boundaries](../../specs/pay-public-account-control/SPEC.md).

Public `/pay` now composes the existing Site theme header/footer with a scoped
MoboCom/SDS product page, services, process and FAQ. `/pay/apply` accepts an existing
canonical signed-in account's business name, optional HTTPS website and note into
PENDING only. Management still activates; request creation grants no terminal,
key, payment or wallet credit. Existing module settings expose title, description,
SEO and application availability. The existing Site menu editor can add the Pay
preset; saved operator menus are not silently overwritten. Public `/pay` can be
indexed; capability/private subpaths remain private/no-store/noindex. The merchant
layout checks access before rendering the shell: guest, denied, pending and
suspended receive a standalone, responsive access card, not a disabled dashboard.

Identity owns `admin-account`, `account-erasure` and their small domain/erasure
parts. `/admin/users/[id]` adds mobile/name/optional email edits, explicit Admin
phone verification, new/generated password, five per-user login switches and
all-device revocation. Every mutation uses current staff hierarchy/permission,
Origin, strict secret rate limit, reason, exact account revision/CAS and strict
transactional audit. Old/new contact aliases' outstanding OTPs and reset links
are invalidated. Every provider and current session rechecks policy. Recovery
finalization rechecks current global/per-user policy and claims its challenge and
password update together; self lockout is refused. Existing passwords never leave
storage; generated passwords are returned once and never audited.
Existing second-factor verification precedes final recovery commit: a later
policy/conflict refusal may consume that TOTP step/backup code, requiring a fresh
proof; it cannot authorize a refused password reset. No provider delivery was tested.

Explicit deletion is full-access-only, refuses self deletion and requires a fresh
server-authenticated impact preview, exact identifier, reason and acknowledgement.
It terminally erases account PII/credentials/profile and owned private activity,
scrubs retained order/invoice/receipt/form/customer facts and merchant delivery
credentials, deactivates merchant/SMS endpoints, and preserves exact financial
states, amounts, paid proofs, hashes and other customers' balances. A banned,
nonlogin reference User remains for shared FK/provenance; this is intentional,
not physical deletion of financial history. DB guards prevent reactivation,
new owner insertion/rebinding and stale form/order/invoice PII restoration.
Money guards allow only narrowly defined erased-owner redaction, never arbitrary
state/amount changes or no-delete bypass. Files use a committed manifest and the
existing queue; shared references survive, symlinks fail closed and retries keep
the manifest. Local cleanup failure returns `cleanup:QUEUED` after committed erase.

Unreleased additive219–221 are listed in the release manifest and both schemas;
deploy with their writers after a verified coherent backup. No version/1.7.22
seal changed. Roll back presentation/account commands independently only while
retaining these data-safe columns/guards; an erased account needs a coherent
pre-erasure DB/file restore, not an old binary. Pause account/merchant writes and
outbound workers while commissioning these changes. An already dispatched external
request cannot be recalled. Domain/provider resources and operator-provisioned
Bale connection secrets require existing operational decommissioning; historical
unlinked files/backups follow existing retention and are not claimed purged.

Executed local evidence so far (isolated DB/runtime, UID1000/NOSUPERUSER): fresh
219/220 plus221 on populated owned fixtures; generated-client TypeScript; canonical
`npm run check` without `.env` or DB credentials1142/53/4/14; eleven native PG checks
(`account-control`, `account-erasure-files`, `pay-public-account`, `admin-users`,
`global-authentication`, `identity-otp`, `google-login`, `pay-private-merchants`,
`pay-merchant-account`, `pay-settlement-center`, `pay-webhooks`). Audit rollback,
stale/Origin denial, old/new OTP aliases, disabled recovery, terminal/rebinding,
paid merchant/settlement preservation and callback snapshot removal are exercised.
Deliberately broken policy and retained private recipient each fail the native
check; source restored and passing checks repeated. File checks use synthetic
temp files only, including shared reference, symlink refusal and retry.

Actual Edge/Playwright public/access/request tests pass1440/390 light/dark, no
overflow/page errors; eight scoped main axe checks have0 violations/incomplete.
Account profile/policy/password/generation/revoke and stale409/draft recovery pass
in the browser;1440 both themes,390 both themes and768 dark checked. Account and
deletion-preview scoped axe0; Enter/Space/Escape and focus restoration checked.
Native dialog Tab did not focus background controls; full focus-visible probe was
inconclusive, so no blanket accessibility certification. React Doctor eight files
has0 errors/eight warnings: existing loading flag, guarded async-dialog lifecycle,
intentional error-body reads/form preventDefault and component complexity reviewed.
Scoped Semgrep0 findings/errors. Redacted Gitleaks reports the already tracked RFC
6238 Base32 test vector in account-security.test.cjs; no new credential found.
Ignored detailed reports/screenshots: `var/pay-public-accounts/`. Final browser
activation of the pending application returned200 and ACTIVE customer saw the
mobile merchant workspace. Exact deletion preview/acknowledgement of an additional
synthetic customer with Order/Invoice returned200, navigated to users and detail
GET returned404. Initial final-navigation attempt had a preview transport failure
after DELETE200; retained fixtures/owned preview were restarted and the full flow
passed. No production transport claim. Follow-up native check proves stale form
PII restoration is refused and explicitly owned BusinessPurchaseProof rows vanish
without deleting another customer's review; file test proves proof blobs removed.
The existing Admin menu editor's Pay preset adds to its draft in the browser,
with visible feedback and no overflow; it was not published in that probe.
The only new HTTP contracts are same-process: application POST returns the
existing apiOk `{ok:true,data:{status}}` envelope; Admin account GET/PATCH returns
its typed view/revision (generated password only in that password response), and
deletion preview/DELETE uses the existing Admin response envelope. Unknown fields,
stale revisions, permission and Origin failures are covered by native integration
tests. Public/mobile v1/v2 payment contracts and events are unchanged; no second
Identity, Pact/provider or OpenAPI surface is introduced.

Cleanup completed: verified owned synthetic DB/role/runtime absent, task preview
and verified Windows tunnel stopped, named private sessions/TLS/source files
removed. Cleanup used UID1000 to inspect its own process (root lacked /proc read
permission); named archive cleanup was finished separately and absence verified.
Shared app3000 remains HTTP200. Screenshots/redacted reports remain ignored locally.
No production build, release upgrade proof, live send/delete, PR or deployment.

## Merchant account and section hosts — 2026-11-26

Authoritative `.mobocom/pay-account-domains`, branch
`feat/pay-account-section-domains-2026-11-26`, based on merged mainbac9e4aa/PR491.
This is a new local feature slice after stable1.7.22; no released assets/version
were rewritten, hosted workflow dispatched, destination deployed or provider called.

- Existing Billing merchant administration now permits canonical current
  full-access Admin to provision/activate/configure their own PENDING merchant.
  Restricted `mobocom-pay.manage` staff cannot self provision/manage. Notes,
  version claims, strict audit and current Identity/AuthZ checks remain; payment,
  receipt and settlement own-review refusals are unchanged. Enrollment never
  credits a wallet. `merchant-admin/access.ts` owns this narrow membership rule.
- `merchants.ts` accepts exactly one selector: normalized `phone`, `self:true`,
  compatible `userId` or exact `email`. Identity's existing readonly
  `findPhoneCustomer` accepts a transaction reader; missing/ambiguous accounts
  fail409. No user, OTP/verification claim or second identity is created.
- Admin directory/detail DTOs add phone; creation/search/list/detail present
  mobile instead of synthetic phone email. Full Admin receives a server-derived
  self checkbox. Existing Pay/SDS classes, typography and layouts are retained.
- Optional public first-party section hosts compose Site's existing routing
  owner and `/admin/sections`. [Routing details and limits](PERMALINK_MANAGEMENT.md#optional-first-party-section-hosts--2026-11-26).

Executed local evidence on isolated Linux Node22 UID1000, owned PostgreSQL
`mobocom_pay_test_accounts_20261126`/non-superuser role/all218 migrations:
`pay-merchant-account`, `section-hosts`, `pay-private-merchants`, `pay-bot`,
`pay-shared-checkout`, `pay-settlement-center`, `permalink-routing`,
`section-maintenance`, `current-account-consumers` passed. New account suite covers
self setup/activation/BOT integration, Persian/local/E.164 lookup, duplicate/missing
selectors/accounts, legacy lookup, no enrollment credit/new identity, restricted
staff/revocation and real own-settlement approval/completion refusal. Two older
suites initially failed because the private harness forced HTTPS cookie selection
on their HTTP fixtures; unsetting that harness override restored both unchanged
suites. Product assertions and security policy were not weakened.

`npm run check` passed without `.env`/DB credentials:1141 site,53 mock-connected,
4 backup and14 billing tests plus types/source/architecture/money/schema/security/
audit/i18n/migration gates. Seven initial proxy unit failures were missing new
owner exports in test doubles; those mocks were updated without changing assertions.
Scoped Semgrep/local rule and redacted Gitleaks on named changes each exited0,
zero findings. Independent read-only security review found partial host-form
commit and alias auth reachability; dedicated host-only save/auth guard fixed
both and real PG/browser cases exercised them.

Actual Windows Edge/Playwright against private TLS preview3142 and the owned DB:
full Admin self create/activate; Persian phone create; own BOT terminal and saved
integration/API endpoint; hostname syntax disable, foreign-host422/preserved draft,
valid save/reload; real alias root/main paths/private/auth boundaries. Eight views
(merchant form and host settings,1440/390,light/dark) had no horizontal overflow
and zero scoped WCAG A/AA/2.1 axe violations; screenshots were visually inspected.
Restricted Pay staff had the phone form without self toggle; keyboard Tab reached
business name, direct self enrollment and section-host writes both returned403.
Its initial browser fixture incorrectly stored permissions as JSON rather than
canonical CSV; correcting only that synthetic role restored the expected UI.
Page exceptions were zero. Main session absence was checked on the actual browser
request Cookie header: Playwright's `context.cookies(alias)` suffix filter included
the host-only main cookie and was not a valid transmission assertion. Initial
automation also assumed201 creates were200 and exact labels excluded wrapped
select option text; corrected fixtures/locators, not application behavior.
React Doctor on four affected components exited0; new handler-only state warning
was fixed with a ref, and section recheck retained only two pre-existing complexity
warnings (the detail panel retains its existing complexity warning).

Private logs/screenshots/reports are ignored under `var/account-domains`; no real
bank, SMS, Bale, Telegram callback or customer transaction was exercised. DNS/TLS/
same-app virtual host commissioning remains an operator task. No production build
or destination upgrade is claimed for this feature. Rollback removes optional
host assignments and reverts this additive slice; preserve all Identity and money
history. Owner merges/deploys; no PR is implied by local completion.

Final continuation: regenerated/checked the14-document shipped AI knowledge;
AI/navigation/content-controls246/246 passed after that documentation sync.
Final scoped Semgrep and redacted Gitleaks again exited0/zero findings. Verified
owned preview process group/TLS tunnel, synthetic DB/role, runtime and private
credentials were removed; local ignored screenshots/logs retained. Runtime and
DB absence were checked; preserved shared app3000 returned HTTP200. Other root/
worktree changes, released1.7.22 assets and destination data were untouched.

## PR490 publication receipt — 2026-11-25

Owner explicitly requests a PR for all work to this point. Fetched current
origin/main9b345399 and proved it remains an ancestor. No existing open PR for
the branch; pushed feat/pay-webhooks-settlement-center-2026-11-25 and opened
[PR490](https://github.com/WebNetData/MoboComCMS/pull/490) targeting main, ready for
owner review. Product commits are f53945dd,8fc1bf16 and879848b3, followed by this
documentation receipt. The PR body records scope-specific local evidence,
migration217's matching-writer/backup/write-pause requirement, at-least-once
receiver dedupe and unverified live receiver/bank/chain/full-build boundaries.

Publication-only verification: clean aggregate git diff/check, main ancestry and
redacted Gitleaks on77 committed named files; .serena, ignored fixtures and private
artifacts excluded. Existing native/type/browser evidence was inspected, not
rerun or represented as production acceptance. GitHub connector transport failed;
the installed gh CLI created and verified the PR. No source change, hosted workflow
dispatch, merge, deployment, provider action or reviewer message performed.

## Merchant drawer and canonical support — 2026-11-25

Owner requests phone/tablet hamburger-opened side menu like account/Admin,
professional grouped merchant navigation, support tickets and lasting engineering
rules. Continue8fc1bf16 in authoritative .mobocom/pay-bale-verification,
feat/pay-webhooks-settlement-center-2026-11-25. Local implementation only; no
PR/push/deploy/hosted workflow, real financial/provider or notification action.

- MerchantShell retains private presentation and canonical session. Shared
  ShellNav/useShellGroups render the menu from merchant-menu's typed entries;
  flat PayNavigation derives the same entries for compatibility. No copied
  permission resolver or group renderer. Finance/business/integration groups,
  support and account footer use scoped SDS/MoboCom styling, icon tiles, selected
  links, persistent expansion and current-link scrolling. Registered the shared
  menu SVG icon in the existing typed icon catalog (not a second icon system).
- At<=1100px the persistent sidebar hides, header has a44px named hamburger,
  expanded/controls/dialog state and a right-side native modal. Larger screens
  keep the272px sidebar. Drawer supplies independent scrolling/safe-area padding,
  named close/Escape/backdrop handling, page inertness and overflow restoration;
  route/history changes and desktop resize close it. Native focus restoration
  and containment are used, no manual trap. Browser chrome can receive boundary
  Shift+Tab focus; attempts to focus background content remain blocked. Motion
  is finite180ms opacity/transform, disabled under reduced motion; no large blur.
- /pay/merchant/support passes existing MerchantEntry/module/merchant gate,
  then composes canonical TicketCenter. Tickets/messages/UserId/Support APIs and
  department staff permissions are shared with /dashboard/tickets. Copy explains
  shared history and selecting the appropriate configured department. No ticket
  schema, duplicate inbox, login, financial guard or API changed. A MOBOCOM_PAY
  department was created ONLY in the disposable test DB to exercise existing
  configurable departments; no production department was provisioned.
- Actual reuse exposed global CSS collisions: generic admin toggle span flex
  stretched icon tiles; scoped merchant rules fix32px tiles and active glyph
  contrast. Canonical ticket small-ID/selected-filter colors were too weak in
  light mode. Existing dashboard-tidy blanket button.is-active colored selected
  tickets bright blue and obscured their metadata; exclude TicketCenter from
  that generic rule so its owner retains its presentation. Two narrowly scoped
  canonical ticket text rules improve contrast in both entry points. No account/
  Admin shell structure or protected public visual/URL was replaced.
- FRONTEND_QUALITY now records the owner's required hamburger/side-menu pattern,
  complete styling for every affected state, existing menu/permission owners,
  keyboard/focus/resize acceptance and supported native controls. Architecture/
  decisions/map/ledger/spec/workstate updated together; no parallel design guide.

Executed evidence (ignored var/pay-bale-20261124/pay-menu-*; isolated copied
Next3140, synthetic canonical accounts, NOSUPERUSER task PostgreSQL, UID1000 and
own generated Prisma217 client; no project .env):
- Fresh all217 migrations PASS (no new migration). Registered
  pay-private-merchants + support-page-problems native PG checks PASS.
  Final TypeScript PASS;8 scoped architecture/source/schema parity/money schema+
  UI/security/Audit/manifest gates PASS. Seven affected React files: Doctor0
  errors/1 reviewed warning about an onClick on native dialog. It handles only
  the native backdrop; Escape and a named close button provide keyboard access.
  No rule suppressed or interactive role incorrectly added to the dialog.
-41 actual browser captures: closed shell and open drawer at320/390/768/1024/
  1100 light/dark and desktop1440 light/dark; eight additional merchant views at
  1440 light/390 dark, owned Support thread, same ticket in account and return
  navigation. Main or active dialog WCAG2A/AA/2.1AA axe0, no viewport overflow or
  page errors. Desktop/mobile menu and support screenshots visually inspected.
  Existing custom-mobocom presentation SHA remains
  be7ebaf639a6969952b96bf4c30a22957f7556a48e4e654528ac8468543ac1df.
- Real native modal open/close, Escape/backdrop, focus restoration, blocked
  background focus, group persistence across reload, link navigation and desktop
  resize/scroll recovery PASS. Separate normal-motion/browser-history check
  verifies180ms duration, back navigation closes and restores page scrolling.
  Extra desktop probe verifies the active support link and exact32px icon tile.
- Same persisted owned ticket/message read from both Pay and account, other
  user's ticket absent/403-or404, anonymous tickets401 and private Pay support
  guest gate verified. Seeded messages use DB fixture writes, never notification
  commands. Ticket creation/reply delivery not newly certified; owners unchanged.
- Earlier harness assumed boundary Shift+Tab must stay in document; Chromium
  correctly moved focus to its chrome. Corrected the assertion and separately
  proved background inertness. Real CSS collisions/contrast failures were fixed
  and full browser checks rerun, not ignored. Icon registry omission was caught
  by TypeScript and fixed in the canonical catalog.

Rollback: revert this presentation slice while retaining8fc1bf16/f53945dd and
migration217's financial writer. Existing tickets/data/settings are preserved;
Pay support is an additional presentation only. Optional dedicated support team
is configured through current Admin departments/roles. No whole-site rollout,
email/SMS delivery, production verification or new financial capability claimed.
Scoped security PASS: local one-rule Semgrep10 affected TS/TSX files and redacted
Gitleaks21 named feature files, no findings; no whole-repository certification.
Cleanup completed: verified task Next3140 group and TLS tunnel stopped; exact
task DB/role removed, private session/env/body/presentation/TLS fixtures/archive
cleaned and dedicated builder stopped. Shared original app readiness/session200.
Screenshots/redacted reports retained ignored locally; no private fixtures staged.

## Financial data presentation repair — 2026-11-25

Owner supplies the prior settlement screenshot and rejects the flat, apparently
unstyled information grid; requests consistent visual quality across the platform.
Continue local f53945dd, authoritative .mobocom/pay-bale-verification,
feat/pay-webhooks-settlement-center-2026-11-25. Local frontend repair only;
no push/PR/deploy/provider action, API/financial owner or migration change.

Verified audit/direction: the CSS was loaded, but eight unrelated facts shared one
auto-fit grid, tiny same-weight values, no clear destination/review grouping and a
bare receipt link. Merchant settlements lacked PaymentLedger's labelled mobile
rows; separate raw receipt IDs duplicated the list. Prior axe/overflow success
was insufficient aesthetic evidence. Product: merchant settlement operations;
character: precise/calm; world: financial ledger; moments: source/fee/net and the
two independent reviews; signature: distinct net-transfer cell. Existing SDS/
MoboCom tokens, Persian type, public theme and protected presentation retained.

Implementation:
- SettlementDesk retains the existing command/loading/filter/batch owner and
  public address. Its internal card/approval/actions parts show a clear identity/
  status header, three separated money facts with isolated amount+asset, wallet/
  schedule panels, actual approval IDs/times and a distinct action footer.
  Full destination remains visible in its own monospace LTR block. Selected
  requests receive a visible border. Completed/rejected rows cannot be selected
  for an inapplicable batch; server authority and state/version claims unchanged.
- SettlementDesk.module.css replaces the flat grid with scoped semantic surfaces,
  consistent spacing, explicit row/cell borders and 760px/600px layouts. Existing
  finite200ms transform/opacity hero entrance/reduced-motion handling retained;
  no animation library, gradient/theme replacement or financial counter effects.
- Pay.module.css styles only Pay tables/details: readable headers, aligned values,
  44px disclosure controls and grouped dt/dd panels. PaymentLedger.module.css gives
  financial tables a consistent header/edge/row rhythm, value wrappers and mobile
  label/value composition. SettlementTable now uses the same supported responsive
  table pattern. Existing explicit table/row/cell roles preserve semantics when
  CSS switches visual layout; they are not new interactive widgets.
- Merchant receipt/report download is a styled action INSIDE that settlement's
  details, with exact request ID in its accessible name. Removed the duplicate raw
  ID link list and its dead CSS. Existing private GET attachment path unchanged.
- FRONTEND_QUALITY records the owner's platform-wide quality requirement for
  future continuations: a border around a flat grid is not sufficient, expanded/
  selected/error/empty states require visual inspection. No assertion that the
  whole platform has already been audited; this slice reviews all18 Pay routes.

Executed evidence (ignored pay-ui-* under var/pay-bale-20261124; copied private
Next3140, own synthetic identities/data, native NOSUPERUSER PG and UID1000, no .env):
- Fresh217 migration setup PASS; registered pay-settlement-center and
  pay-shared-checkout connected checks PASS. No backend/money edits after these.
- Final types PASS,8 architecture/source/schema parity/money schema+UI/security/
  Audit/manifest gates PASS. React Doctor4 affected files:0 errors/53 reviewed
  warnings. Baseline original tables alone32 role warnings; current tables49
  (same intentional explicit native table semantics extended to the mobile
  settlement table);4 existing settlement form complexity/preventDefault warnings.
  Extracted card/approval/actions and Desk have0 diagnostics. No rule suppression.
- Actual44 final browser captures: Admin settlement and merchant settlement/
  payment expanded-detail pages1440/390 light/dark; remaining15 merchant/Admin
  pages1440 light/390 dark; queue error/retry and empty states. All relevant main
  surfaces axe WCAG2A/AA/2.1AA0 violations, no viewport overflow or page errors.
  Admin card desktop/mobile/light/dark crops and expanded merchant ledger visually
  inspected against owner screenshot. Presentation SHA remains
  be7ebaf639a6969952b96bf4c30a22957f7556a48e4e654528ac8468543ac1df.
- Real synthetic requested/scheduled/awaiting-second/approved/paid/rejected facts
  rendered. Keyboard Tab/Shift+Tab focus and selected border verified; same first
  reviewer denied, independent second approved, recorded reference completed via
  the new card callbacks. Available wallet balances unchanged after completion;
  pending reservation projection correctly decreases by the completed1 USDT.
  Final read-only continuation verifies persisted approver IDs/status/reference;
  financial actions were NOT replayed after a development HMR reload. Merchant
  and denied staff direct Admin calls403. Download links retain per-row context.
- Corrected two real contrast regressions found by axe: muted secondary money
  on a focused gray row, and empty-state secondary text on the page surface.
  Keep text on supported surfaces; no blanket token darkening. Earlier harness
  assumptions about programmatic mouse focus, reserved projection remaining after
  PAID and the global Next route-announcer were corrected. Failed runs were not
  counted as successful full validations; actual successful phases retained.

Rollback: revert only this presentation slice; f53945dd and its migration217/
financial writer remain. No full build, live financial transfer or outside-Pay
visual acceptance claimed. Next continuation follows the same evidence-driven
quality bar on each affected platform owner, preserving protected public designs.
Scoped security PASS: local one-rule Semgrep4 affected TSX files and redacted
Gitleaks13 named feature files, no findings; not a full security certification.
Cleanup completed: verified task Next3140 group/TLS tunnel stopped, exact private
DB/role removed, session/env/body/presentation/TLS fixtures/archive cleaned and
dedicated builder stopped. Shared original app readiness/session both200. Screenshots
and redacted reports remain ignored locally; no fixture credentials are staged.

## Generic webhooks and settlement center — 2026-11-25

Scope: owner accepted recommendations1/2 after PR489. Authoritative checkout
.mobocom/pay-bale-verification, branch feat/pay-webhooks-settlement-center-2026-11-25,
base owner-merged main9b345399. This is local implementation; no push, PR, deploy,
hosted workflow or real provider/chain action. Prior records below remain historical.

Owners and files:
- Billing domain/pay-webhooks and server/pay/webhooks/{admin,delivery}, credit,
  outbound and thin bot transport retain one financial owner. PAID+paidAt+Wallet
  facts are re-read before an immutable payment.paid v1 raw JSON/hash/event ID
  and Operations job intent are committed with credit. Exact stored order/total/
  contract fee/net credit only; no early collection proof or payer private fields.
- Per-terminal encrypted generated key is shown once on creation/rotation; URL
  and version are claimed. Worker uses HMAC-SHA256(timestamp+'.'+raw body), stable
  event/body, unique attempt ID,8 attempts per cycle, exponential delay,120s lease
  and125s durable recovery. UNKNOWN history retains interrupted deliveries;
  an old completion token cannot overwrite a subsequent attempt. No delivery
  command changes money or fulfillment. Receiver MUST deduplicate event ID.
- Current module/API/merchant/User/terminal/global standing/section/maintenance/
  endpoint authority rechecked before each claim. Account's canonical section
  resolver accepts an opt-in fresh read which fails closed on read failure;
  no new AuthZ resolver. DNS all-answer public check and pinned HTTPS/TLS transport
  extracted from bot: no redirect/proxy/query credential,5s DNS/12s request/16KiB
  response bounds. Remote body/errors and credentials never enter history/Audit.
- Changed config pauses old bindings. Explicit redelivery requires current
  delivery AND endpoint versions plus replay acknowledgment. Same immutable event
  rebinds current URL/key; each completed attempt retains its historical target.
  Admin may pause/replay under mobocom-pay.manage, never read a signing secret.
  Independent25-row endpoint pagination and current delivery-binding projection
  avoid losing access past the original100-row directory bound; last20 attempts
  are displayed while all attempt rows remain stored.
- Existing settlements address split into quotes/request/decisions/validation;
  settlement-center parts own profiles, queue/batches and receipts. Profile
  address/asset/network/owner immutable; label/active version-claimed. Requests
  snapshot profile ID/version/label and exact destination. Legacy inline requests
  and idempotency fingerprint are preserved without optional new fields.
- UTC scheduledFor up to30 days reserves the source asset immediately at accepted
  quote/fees. Before due: approve/pay denied, reject releases original asset once.
  New Settings settlementApprovalThresholdRial defaults0 and applies to new
  requests only, freezing threshold/revision/dual flag from quote Rial amount.
  First dual approval stays REQUESTED; a different currently authorized staff
  member moves it APPROVED. No merchant self-review. SQL freezes approval IDs/
  times and schedule/profile/policy facts; state+version claims fence races.
- Admin due/scheduled/second/approved queue, max25 unique per-item approve/reject
  results, individual paid reference, owner/staff-only JSON or escaped HTML
  attachment. Receipt distinguishes unpaid state from recorded transfer; nonce
  CSS, private no-store, sandbox CSP and print styles; it never executes payment.
- Merchant/Admin route/navigation/settings/UI use existing SDS semantic tokens,
  Persian typography, scoped CSS and both themes. Native labelled forms, explicit
  reserve-now/fees/network review, local-time→UTC schedule validation and live
  quote expiry; safe one-time-key clipboard feedback. Finite200ms opacity/transform
  entrances respect reduced motion. Protected public presentation retained.
- Both Prisma schemas + manifest add217, new registered pay-webhooks and
  pay-settlement-center native fixtures; standalone pay-center-upgrade.connected
  requires an EMPTY disposable database. OpenAPI1.10 adds signed callback schema,
  session-only operational routes and existing settlement optional fields.

Executed local evidence (ignored reports under var/pay-bale-20261124/pay-center-*
and pay-webhooks-*; isolated copied Next3140, synthetic canonical users, UID1000,
NOSUPERUSER PostgreSQL, own generated Prisma5.22, no project .env):
- Fresh all217 migrations PASS. Standalone pay-center-upgrade.connected PASS on a
  second exact disposable database: deploy216, seed requested/approved/paid legacy
  settlements and reserved IRR/USDT balances, deploy217. All prior columns/amounts/
  states byte-equivalent; no invented approvals, old approved request completable.
- Registered pay-webhooks PASS: atomic intent/HMAC, private key and remote-body
  exclusion, duplicate paid event, immutable payload and attempt targets,
  acknowledged replay/current-config race,8 retries, fresh cross-client section
  revocation/Admin pause, crash/unknown lease and stale completion fencing;
  deliberate Audit exception after intent proves credit+intent rollback. Final
  added directory pagination verifies nonoverlapping pages/current bindings.
- Registered pay-settlement-center PASS: immediate reserve/schedule/idempotency,
  stale profile/ownership/immutability, direct SQL before-due denial, exact once-only
  rejection release, concurrent first approvals/independent second review in app
  and SQL, changed policy preserves old snapshot, individual completion/reference,
  legacy no-version approval, receipt privacy and batch per-item stale outcomes.
  Final legacy pay-assets/pay-shared-checkout/pay-bot PASS; earlier same-slice
  pay-bale-collection PASS. Existing bot+SMS pure32 tests PASS; no live DNS receiver
  or bank mock result is represented as external acceptance.
- Final TypeScript noEmit and8 architecture/source/schema parity/money schema+UI/
  security/Audit/release-manifest gates PASS. Spectral0 findings, oasdiff reports
  no breaking changes; tracked center-smoke.hurl12 actual HTTPS requests PASS:
  secret-free overview, schedule queue, owner receipt JSON/HTML headers, visitor/
  staff/merchant denial, replay acknowledgment, bad Origin/private URL and no
  bulk-paid command. Browser also verifies one-time key/reload, profile rename,
  real scheduled USDT reserve, independent two-Admin approval and paid receipt.
- Actual19 functional themed/mobile/state captures plus16 final four-route
 1440/390 light/dark captures: main WCAG2A/AA/2.1AA axe0, no viewport overflow or
  page errors. Final screenshots visually inspected. Existing custom-mobocom
  presentation SHA be7ebaf639a6969952b96bf4c30a22957f7556a48e4e654528ac8468543ac1df
  retained. No Storybook project exists; no new preview framework installed.
- React Doctor9 affected components:0 errors,8 reviewed warnings. Existing Admin
  branch complexity/settings array lookup; settlement component complexity and
  intentional client API form preventDefault; incidental metrics/table JSX
  similarity across separate views. New hydration-time/clipboard/selection-loop
  warnings fixed without suppression. One-rule scoped Semgrep and redacted named-
  diff Gitleaks clean; this is not a whole-repository security certification.
- Earlier harness failures corrected: migration IF/CASE syntax, fixture IBAN/
  nonexistent historical paidAt column, Audit fault hook action, API guide YAML
  flow-comma quoting, Hurl expected receipt title/default422, directory synthetic
  channel and coexistence counts. A failed command was not counted as passing.
  Graphify source graph was absent; source/Serena evidence used, no graph proof.

Release/rollback limits:217 adds state guards requiring the matching settlement
writer, so an old application-only rollback is NOT safe for settlement writes.
Owner release must pause settlement writes/workers, take a verified backup, apply
manifest migration and deploy matching source before resuming. Disable webhook
endpoints/new scheduling/dual-threshold to halt new work; retain all money/events/
profiles and the compatible writer. Full downgrade requires coordinated restore
or a separately reviewed forward compatibility migration, never drop money rows.
No real receiving service, Bale/SMS source or chain payout is commissioned here.
An already claimed outbound HTTP request cannot be retracted by later revocation;
at-least-once handling is mandatory. Receipt records staff-entered reference, not
independent bank/chain verification. Next step is owner review/PR, then private
deployment and synthetic receiver/retry/receipt commissioning with real secrets
kept outside Git/chat.

Cleanup completed: verified private Next3140 process group and task TLS tunnel
stopped; exact task DB/role and second upgrade DB removed. Session/env/body/source/
presentation/TLS fixtures and archive cleaned, public SQL scratch removed, dedicated
builder stopped. Shared original app readiness/session both200; shared database
and protected presentation preserved. Scoped security scanned38 source targets and
61 named feature files, no findings. No live credentials or screenshots with keys
are staged.

## Publication receipt — 2026-11-25

Owner explicitly requested a PR for all work to date. Fetched origin/main at
d7f15d6f, confirmed base ancestry and clean aggregate diff, then pushed
feat/pay-approval-workspace-2026-11-25 and opened
[PR489](https://github.com/WebNetData/MoboComCMS/pull/489) targeting main, ready for
owner review. It includes7c85cdfa (approval/fees/multi-Bale),41b8ec46 (SMS Forwarder)
and aa6489b3 (merchant UX), plus this publication record. Scoped executed evidence,
reviewed warnings, migration216 and live commissioning boundaries are in the PR
and the slice records below. No source changed or tests rerun for publication.
No merge, deployment, provider action or hosted workflow dispatch performed.

## Merchant panel visual upgrade — 2026-11-25

Owner explicitly requests a more professional, attractive merchant panel with
advanced styling/motion. Continues local41b8ec46 in .mobocom/pay-bale-verification,
feat/pay-approval-workspace-2026-11-25; local implementation, no PR/push/deploy.

Audit/direction: existing financial owners and visual identity are sound; equal
weight summaries, dense controls and weak balance/action hierarchy limit scanning.
Use the existing MoboCom/SDS semantic tokens and Persian typography: a distinctive
asset balance, quiet precise financial summaries, real daily receipts and accessible
merchant actions. Native controls, existing statuses/URLs and private shell remain.
No theme replacement, financial/business rule, API, dependency or migration change.

- MerchantShell/WorkspaceHeader retain their public addresses; header additions are
  merchant-only. Sidebar gains clearer selected state; mobile has scrollable44px
  navigation targets. Skip-to-content now actually focuses main (tabIndex=-1).
- Dashboard.module.css scopes forms, responsive auto-fit fields, aligned search/
  status/CSV and pagination to the merchant. Loading is a static structural skeleton
  with status; errors offer real retry and never show fabricated balances.
- Overview delegates balance, trend and recent payments to three focused parts.
  The main asset balance preserves separate IRR/USDT values and valuation age,
  prominent create/settle actions and a restrained static ledger-ring texture.
  Gross, pending, actual net and platform fee remain distinct server projections.
  Latest5 payments use actual status, customer collection and net credit; pending
  credit is explicitly estimated. No invented performance percentages or activity.
- Chart selection is local display state with native labelled day select, exact
  Rial values/counts and accessible daily table. SVG is decorative; BigInt scales
  only a bounded quotient to chart coordinates. Zero/empty and single-day shapes
  are guarded. Two finite200ms opacity/translate entrances plus short press/hover
  feedback respect reduced motion; no loops, scroll handlers, blur or money tween.
- Existing Unslop, baseline/accessibility/motion, UI/UX and selected Vercel guidance
  were applied under MoboCom/SDS identity. No Storybook configuration or stories
  exist in this checkout; actual page/state browser evidence is used rather than
  installing a second preview/component framework.

Executed evidence: isolated copied Next preview, synthetic canonical merchants and
NOSUPERUSER disposable PostgreSQL; reports/screenshots ignored under
var/pay-bale-20261124/merchant-style-*.

- Fresh216 migrations and registered pay-assets/pay-shared-checkout native checks
  PASS. UI flow creates a persisted pending payment and copies its actual URL;
  USDT/BSC quote shows fee and requires network acknowledgement. Neither action
  writes another credit: balance and paidCount unchanged before/after UI actions.
- 36 final captures cover all7 merchant routes at1440/390 light/dark, empty active
  IRR merchant, daily table, created-link feedback, quote review and Admin settings;
  plus2 loading/error/retry captures. Relevant main surfaces axe WCAG2A/AA/2.1AA
  zero violations, no viewport overflow or page errors. Theme/layout screenshots
  inspected against4 actual before captures. Original custom-mobocom presentation
  SHA be7ebaf639a6969952b96bf4c30a22957f7556a48e4e654528ac8468543ac1df retained.
  Chart day selection/focus/table, native labels, keyboard skip, reduced-motion
  contexts and finite normal animation verified. Headless native dropdown arrow
  selection was unreliable; only actual focus/Tab and selectOption result are
  claimed, not a fabricated keyboard arrow-selection pass.
- Anonymous overview401 and merchant Admin overview403 verified. Existing guards
  remain owners. Initial harness broad text/heading selectors, unsupported/wrong
  Admin request verbs and native-select assumptions were corrected; the real skip
  target defect was fixed and rerun. Read-only reviewer found no concrete blocker.
- Final TypeScript and8 scoped architecture/source/schema parity/money schema+UI/
  security/Audit/manifest gates PASS. React Doctor10 components:0 errors,39 reviewed
  warnings. Baseline HEAD copies also39: overview complexity warning eliminated;
  form handlers, settlement complexity/Date.now and intentional table roles retained.
  A project-analysis duplicate-table-header candidate matches unchanged existing
  tables across unrelated modules; no cross-domain abstraction or rule suppression.
  New balance/trend/recent parts have no diagnostics. CSV download anchors retained.
- Scoped local one-rule Semgrep10 TS targets and redacted Gitleaks19 final named
  feature files clean. No whole-repository security/build certification claimed.

Cleanup completed: verified private Next group/TLS tunnel stopped, exact task DB
and role dropped, synthetic session/source/body/env/TLS/presentation/private files
and source archive removed, dedicated builder stopped. Shared readiness/session200.
Remaining: owner review/merge/deployment; no production or live-provider acceptance
claimed. Rollback is the UI commit only; existing financial rows, source config,
API contracts, module enablement, migration216 and prior commits are preserved.

## SMS Forwarder three-field intake — 2026-11-25

Continues local7c85cdfa in authoritative `.mobocom/pay-bale-verification`, branch
`feat/pay-approval-workspace-2026-11-25` / owner-merged main d7f15d6f. Owner supplies
exact `{sms:"{msg}",bank:"bankmeli",token:"generated"}` and requests simultaneous
SMS/Bale/manual once-only credit. This slice is local; no push/PR/deploy/workflow.

- Billing owns the additive `POST /api/payment/mobocom-pay/sms-forwarder/{id}`.
  Strict duplicate-key-safe three-field UTF-8/body validation, current per-source
  constant-time encrypted credential, bank/mode/operator/module/availability gates,
  Origin and strict source/IP limits feed the existing durable notice/matcher.
  Source ID plus normalized decoded bank/SMS hash excludes token/version/time;
  retries preserve the first immutable receipt timestamp even after source edits.
- `domain/pay-sms-source` stores explicit FORWARDER_V1 in a version2 wrapper in
  existing templateJson. Plain six-field old storage remains EXTENDED_V1; old
  Bearer/four-field endpoint and create/PATCH callers retain their contract.
  Admin returns a generated token only on creation, plus fixed bank code, HTTPS
  URL and exact JSON copy controls. No token in query, GET list, Audit or storage
  outside existing encryption. Accounts/templates/flags use existing Admin owner.
- No fabricated sender, phone message ID or original bank/device timestamp.
  Immutable SMS_FORWARDER_* notice codes and Audit SERVER_RECEIPT distinguish the
  evidence. Review detail labels server receipt accurately. Delivery/confirmation
  timing excludes forwarder notices, including debit/rejected notices; unavailable
  time is null, never a zero-latency delivery claim.
- SMS/Bale/manual converge on existing invoice lock, state claims, Serializable
  settlement and Wallet idempotency. First valid approval wins; later proof/review
  cannot add another principal, platform fee, top-up, merchant credit or fulfilment.
  Customer top-up is principal only; adjustment and merchant fee remain separate.
- Locked USDT acquisition still requires original-time proof: collection command,
  credit guard and migration216 exclude SMS_FORWARDER_CREDIT alone. Valid simple
  intake ACKs received/reviewRequired/PAY_PURCHASE_TIME_REQUIRED without money.
  Bale/extended SMS or an independently approved timely receipt can resolve it.
  Migration `20270402120000_pay_sms_forwarder` only replaces the existing deferred
  links function; manifest updated, no model/column/data rewrite or history reset.
- Operator must filter exact bank sender in the phone app and forward fresh
  incoming messages only. A previously unseen old SMS has no distinguishable
  original timestamp in this contract; unique amount tombstones cannot prove the
  age of an unrelated historical deposit. This limitation is explicit in UI/docs.

Executed local evidence (task-owned copy, synthetic accounts, NOSUPERUSER isolated
PostgreSQL; ignored reports/screenshots under `var/pay-bale-20261124/smsf-*`):

- Fresh full216 migrations PASS. Registered native `pay-bale-collection
  pay-shared-checkout pay-assets` PASS after final source changes: exact3 auth/bank/
  key/mode/schema, JSON/whitespace retry, version-independent original timestamp,
  preacceptance/expired notices, debit/rejection, time-basis/null latency, SMS-first,
  Bale-first, manual-first and concurrent3-way single principal/fee/top-up; USDT
  exclusion and legacy four-field/multi-Bale/merchant exact-once regressions.
- Pure SMS/template/collection13 tests PASS. Final TypeScript noEmit PASS; scoped
  architecture/source/schema parity/money UI+schema/security/Audit/manifest8 gates
  PASS. Spectral0 findings; oasdiff no breaking changes (OpenAPI1.9 additive).
  Tracked `sms-forwarder-smoke.hurl`6 actual HTTPS requests PASS (first/retry, wrong
  bank/key/schema/Origin). Playwright actual HTTP additionally checks permission,
  no-secret GET, mode preservation and normalized retry.
- Browser6 actual captures: setup light/dark1440/390 plus mobile monitor/review.
  Axe WCAG2A/AA/2.1AA scoped surfaces0 violations, no overflow/page errors. Generated
  URL/token/JSON clipboard checked; screenshots mask token and JSON. Images inspected
  locally; same approved custom-mobocom presentation SHA be7ebaf639a6969952b96bf4c30a22957f7556a48e4e654528ac8468543ac1df.
  Initial harness locator/preset/Windows clipboard-newline failures corrected;
  no product financial behavior was weakened to pass them.
- React Doctor3 affected components:0 errors,1 reviewed existing high-complexity
  TransferReviewCase warning (only time label changed there). Scoped local one-rule
  Semgrep15 TS targets clean and redacted Gitleaks31 final named files clean; this
  is bounded evidence, not comprehensive security certification.
- Deliberate removal of the application USDT notice-code guard in owned runtime:
  migration216 constraint rejects the simple-only proof, transaction rolls back,
  original runtime bytes restored with SHA checks. Prisma5 deferred-COMMIT handling
  did not surface the expected rejection in the first harness; forcing constraints
  IMMEDIATE inside the test exposed SQL23514 and the corrected fault run passed.
  Unmodified app rejects earlier with PAY_PURCHASE_PROOF. Do not describe the first
  failed fault assertion as a production money write.
- Populated215-function→216 migration replay PASS with actual reconciled legacy
  USDT Wallet credit and synthetic invoices/payments/sources/notices/collections:
  byte-identical history, new proof guard installed. This is a function upgrade
  check, not a simulated deployment or whole-schema production upgrade.

Remaining: owner deployment applies migration216; real Android app sender filter,
`{msg}` JSON escaping, foreground/background delivery, actual Bale account login
and live bank receipts have not run. No real provider/chain or shared production
DB changed. Next commissioning uses new source/token copied securely in Admin,
enables both sources on the card-transfer gateway, then controlled fresh SMS/Bale/
manual order and replay checks. Never forward SMS history or share tokens in chat.
Rollback: disable source/auto incoming via existing Admin, preserve all rows/amount
reservations and richer sources; do not reverse216 or downgrade to code that
cannot read version2 templateJson. Feature removal needs a forward compatibility
change. Cleanup completed: verified owned Next process group and loopback TLS
tunnel stopped; exact task DB/NOSUPERUSER role removed; one-time synthetic source
credentials, body/env files, browser/presentation fixtures, TLS keys and source
archive removed; dedicated builder stopped. Shared readiness/session both200.

## Merchant approval workspace and fee isolation — 2026-11-25

Owner requests more professional merchant UX, centrally operated automatic Bale/
SMS confirmation, explicit duplicate-approval feedback and platform-only fees.
PR488 was owner-merged as main d7f15d6f. Current checkout remains
`.mobocom/pay-bale-verification`, new branch `feat/pay-approval-workspace-2026-11-25`.
Local implementation; no new PR/push/deploy or hosted workflow in this slice.

- Existing Billing/Pay invoice lock, Serializable transaction, state claims,
  canonical Wallet and separate adjustment journal remain the financial owner.
  Automatic matching now re-reads the collection after its invoice lock. Receipt
  review/replay returns original confirmation method/source and explicit Persian
  already-paid feedback after current permission/no-self guards. Reviewing a paid
  receipt records its review without another credit; repeating it is idempotent.
- New `pay/payment-view` centralizes the existing projection and held-receipt
  filters. Manual pending receipts remain UNDER_REVIEW after expiry in lists,
  counts and checkout. The actual PAID quote outranks a newer unpaid renewal;
  canonical bank journal proof is labelled BANK, reviewed notice BANK rather than
  automatic staff action, and automatic SMS/Bale preserves its original source.
- Displayed customer amount includes actually collected service fee; principal-only
  manual approval does not invent that fee. Contract fee, collected service fee
  and USDT rounding are separate from merchant credit. Overview shows credited
  Rial cost and platform fee separately, preserving legacy statistics. Native
  cases prove credited amount plus platform fees equals customer collection and
  that only principal reaches customer top-up/merchant proceeds.
- `domain/pay-bale-sources` adds bounded server-owned `MOBOCOM_PAY_BALE_SOURCES`
  (1..32, duplicate-key-safe, <=64KiB) with explicit per-source instance/account/
  numeric bank peer/destination/operator/signing key/flags. Ambiguous IDs/instances/
  alias-account or bank mappings fail closed. New query `?source=ID` selects ONLY a
  configured source; its HMAC and original-message identity are still verified.
  Legacy env/endpoint remains supported. Current authority and frozen quote binding
  are rechecked through context/proof; ingress, gateway readiness, status and
  monitoring use the same registry. Secrets and personal sessions are never exposed
  to merchant UI or stored in Gateway credentials. No new identity/service/table.
- Pay receipt queue gains real bounded counters/filter, gross/fee/net and original
  proof details, paid-review guidance and server feedback. Merchant ledger uses
  readable mobile rows and exact fee/credit breakdown. Overview separates platform
  share; Admin lists each server source safely with its dedicated path/readiness.
  Finance receipts also displays the canonical already-paid message. SDS tokens,
  existing theme/shell/motion and protected public surfaces remain authoritative.
- Versioned machine APIs retain closed PENDING/PAID/EXPIRED statuses. Held payments
  return PENDING plus optional `reviewStatus:UNDER_REVIEW` in v1/v2; native UI keeps
  UNDER_REVIEW. Idempotent payment creation uses authoritative invoice projection;
  CSV encodes structured confirmation as JSON. OpenAPI1.8/Hurl updated additively.
  No schema change or migration beyond existing215.

Executed evidence:

- All215 migrations on an empty disposable NOSUPERUSER PostgreSQL; UID1000 runtime,
  no `.env`. Final registered native suites `pay-bale-server`, `pay-bale-collection`,
  `pay-shared-checkout`, `pay-assets`, `pay-bot` all pass, including after populated
  browser fixtures. Two independent Bale sources, wrong endpoint key, missing ID,
  disabled/malformed registry and source privacy; bound-bank and changed-instance
  denial; old quote approved after renewal; manual/automatic/late/concurrent/replay
  paths; exact principal top-up, USDT rounding, strict Audit rollback and no second
  Wallet/payment. Sixteen scoped pure cases pass in Linux; host lacked
  `typescript-api`, so no dependencies were installed to fake a host pass.
- Full TypeScript and eight architecture/source/schema/money/security/Audit/release
  gates pass. TLS Hurl8 verifies two-source status/privacy, isolated signatures,
  late manual-first notice, repeated auto-first receipt and forbidden reviewer;
  v1/v2 held-state compatibility passes. Spectral0 and flattened oasdiff explicitly
  reports no breaking changes (exit0 alone was not treated as absence of findings).
- Actual Playwright22 responsive light/dark captures at1440/390: overview, ledger,
  held filter, receipt queue/review feedback, two-source configuration and Finance
  receipts. Axe0, horizontal overflow0 and final page errors0. Real Admin review
  and replay leave merchant balances/paid count unchanged. Finance's development
  reload interrupted one capture pass; its remaining four views and interaction
  were completed in a fresh browser context against the warmed route.
- Doctor5 affected components:0 errors/44 reviewed warnings.32 concern explicit
  table/row/cell roles retained for the mobile display:block accessibility tree;
  other warnings cover existing Finance locale/fetch/image-dialog behavior,
  component complexity, repeated financial markup and native CSV anchors. No rule
  suppression; actual browser/a11y checks complement the diagnostic review.

Fixed findings rather than waiving them: receipt-filter contrast, a worker's
encoding-corrupted new Persian strings (restored with UTF8-safe patches), fixture
dedicated-card alias/update refusal, an old connected test's empty-history count
assumption, winning-quote/source/gross display issues, and closed machine-status
enum compatibility. Existing ledger states/amounts were preserved. Graphify has no
local graph; Serena initial-instructions request did not complete, so exact source
and local architecture gates supplied the navigation evidence.

Guidance applied: repo MoboCom audit/spec/develop/contracts, Unslop/UI Skills,
UI/UX Pro Max and selected Vercel rules under SDS/FRONTEND_QUALITY. No new runtime
dependency or independent financial platform. Native logs, screenshots and reports
are ignored under `var/pay-bale-20261124`.

Operational boundary: this is a server-owned GoOmni integration, not an Android
app or a claim that bot tokens can read personal chats. Real card-owner account
login, original numeric @bam_bmi identity, delivery/recovery and SMS Forwarder
payload must still be commissioned privately on the actual server. The updated
operator guide describes multiple connections and distinguishes configuration
readiness from live delivery. No live bank/Bale/SMS or chain transfer was run.
Rollback: disable automatic sources/gateways first, preserve all evidence, quotes,
amount tombstones and credit history; reverting UI/adapter code never deletes or
recredits money. A return to single-source configuration needs explicit mapping.
Final safety evidence: two deliberate runtime-only faults (crediting gross including
service fee, accepting a replaced frozen source instance) were detected by the
connected collection suite. Exact source bytes were restored and its baseline
passed again. Scoped one-rule Semgrep21 source files and redacted Gitleaks41 named
files report no findings; not a whole-product security certification.

Cleanup completed for the verified private Next group, Windows TLS tunnel, exact
disposable DB/NOSUPERUSER role, sessions/API-key env/signed bodies/TLS files and source
archive; dedicated builder stopped. Initial shared readiness/session check hit its
6s warmup timeout; the separately recorded30s retry returned200 for both endpoints.
No production build/live source test or hosted workflow dispatch. Screenshots,
reports and redacted fault logs remain ignored; root/autonomous work is preserved.

## General channels and selected merchant USDT credit — 2026-11-24

Owner authorizes website/Instagram/channel/standalone collection beyond bots and
selected merchants receiving purchased internal USDT, with later Rial or crypto
settlement and independently configurable network fees. Continues local56a0b7a6
in `.mobocom/pay-bale-verification`, `feat/pay-private-merchants-2026-11-24`,
base mainb93879bc. This slice is local; no push/PR/deploy or hosted workflow.

Implemented owners and contracts:

- Billing `domain/pay-channels` and existing merchant/terminal commands add six
  channel types. Instagram/channel/standalone merchants need no artificial website;
  website/bot return-origin guards remain. Standalone checkout has no forced return.
  Existing generic machine API and polling serve all channels. The merchant creates
  a per-order link, sees the amount/credit and copies it without entering checkout.
  This is not an evergreen multi-customer page or an outbound social publishing API.
- Admin `credit-mode` requires current version, reason, acknowledgment and existing
  management/no-self guards; applies to future payments only. Canonical Wallet owns
  both IRR and USDT withdrawable provenance. USDT's existing two-decimal meaning is
  explicit; legacy ordinary USDT is preserved and never becomes withdrawable.
- Billing `pay/assets` uses approved canonical FX only, with configurable age,
  immutable quantity/rate/time/source/beneficiary/rounding/terms snapshots. The
  verified payer explicitly accepts internal credit for the named merchant before
  instructions. Rounding down to0.01 USDT and retained Rial remainder are disclosed.
  Strict canonical credit and DB links require exact currency/amount/provenance and
  consent; Audit rollback and concurrent/repeated proof cannot mint a second credit.
- Acquisition expiry is not renewable. USDT uses bank/manual collection with timely
  attested event/notice or a timely submitted approved receipt; held receipts remain
  under review after expiry. Online methods lacking trusted payment-time evidence
  are not offered for USDT; ordinary IRR provider checkout retains existing methods.
- Existing quote/reserve/review/release flow carries explicit source asset and an
  immutable fee/rate snapshot. Separate Wallet balances/reserves and dated Rial
  valuation appear in merchant/Admin views. Stale valuation is unavailable, never
  another spendable balance. Per-rail fee currency/percentage/flat/cap is explicit.
  BSC (Binance-Peg BSC-USD) and Ethereum routes default off; EVM destinations need
  explicit network acknowledgment. Quote precision6 is separate from ledger2 and
  BSC contract18; no raw-chain decimal reinterpretation, private keys or RPC sender.
- `/api/v2/pay/[...resource]` is a thin adapter to the same owner and key. New
  networks/source assets use v2; v1 keeps its three-rail catalog/closed quote enum,
  returning `PAY_API_V2_REQUIRED` for new quote types. Bot adapter remains v1.
  OpenAPI1.7 and `assets-smoke.hurl` describe the connected contract.
- Migration215 `20270401120000_pay_channels_assets` is listed in the release manifest
  and both Prisma schemas. Locked incremental backfill retains prior payment/quote/
  reservation amounts, legacy writer defaults, money-state constraints and owned
  immutable-row triggers. New immutable credit/source fields and deferred exact
  Wallet/collection links extend the existing financial constraints.
- UI stays within Pay SDS tokens: selected asset balance, source/network/fee quote,
  explicit purchase summary and acceptance, shareable order link, channel forms and
  Admin controls. Protected public themes and compact bank-checkout CSS unchanged.

Executed evidence (disposable PostgreSQL, NOSUPERUSER / runtime UID1000, no `.env`):

- All215 migrations fresh; populated214-to215 upgrade preserves ordinary2.35 USDT,
  IRR proceeds/reservation/quotes and immutability; old-writer default checks pass.
- Registered `pay-assets.connected.cjs`: real canonical sessions/channel guards,
  exact12.34 USDT acquisition and5678 Rial remainder, consent/SQL proof denial,
  settings/rate change snapshot retention, strict Audit rollback, duplicate and
  concurrent credit, BSC fee cap/network/address, competing source reservations,
  idempotent rejection, separated balances and stale FX. Timely manual receipt
  approved after expiry credits exactly once at the agreed quantity.
- Extended `pay-bale-collection.connected.cjs`: USDT consent/expiry cap, SMS notice
  and receipt hold/replay produce exactly200 minor USDT once; previous IRR cases
  remain. Existing `pay-shared-checkout`, `pay-bot`, `pay-private-merchants` pass.
  Twenty-seven routing/bot units pass. Three runtime-only faults (100x USDT amount,
  removed fee cap, bypassed consent) are detected; original bytes restored.
- Full TypeScript and eight architecture/source/schema/money/security/Audit/
  release gates pass after the v2 adapter. Actual TLS Hurl12 requests pass, including
  v1 catalog/rejection, v2 standalone purchase/poll, unauthenticated denial,
  BSC/USDT quote, missing network acknowledgment denial and actual1.00 USDT reserve.
  Spectral0 errors; flattened oasdiff0 breaking changes. Unflattened four allOf
  optionality warnings disappear after merging the response branches.
  JSON Schema examples also validate exact decimal input, required source-specific
  amount and independent quote response fields; an over-escaped v2 amount pattern
  found in final review was corrected before the final contract lint/diff pass.
- Actual Playwright33 responsive captures at1440/390, light/dark: merchant asset
  views, channel creation, BSC quote/reserve, Admin settings and persisted currency
  change, public purchase/acceptance and copied real checkout link. Axe0, document
  overflow0, final page errors0. Final Doctor15 components:0 errors/21 reviewed
  complexity/draft/native-form/CSV warnings; no suppression. Scoped one-rule Semgrep
  (41 source files) and redacted Gitleaks (61 named files) have no findings (not a
  full security audit). Final focused browser check proves editing a destination
  clears network acknowledgment and disables submission; v2 API guide is visible.

Initial test issues were corrected, not waived: migration record-field branch,
populated upgrade's concurrent-index runner, premature collection-proof lookup,
duplicate purchase price presentation, settlement detail's accidental undefined
payment link, browser readiness selectors and v1 enum compatibility. Source-only
Graphify was unavailable in this checkout; source/owner/static gates were used.
An old screenshot was detected during final review; the owned Next preview was
restarted and all33 final captures were rerun against current copied source. The
focused acknowledgment assertion now waits for action completion rather than
reading the still-busy submit button immediately.
Raw logs, Doctor reports and33 captures remain ignored under `var/pay-bale-20261124`.
No production build, live bank/Bale/SMS/bot traffic or real on-chain payout tested.

External transfer still requires staff review and an actual out-of-platform transfer
before its reference is recorded; a reference alone is not chain verification.
Commissioning needs approved FX, per-network configuration and live-source testing.
Rollback before activity may revert this slice; after USDT activity disable new
acquisition and retain the upgraded ledger, obligations and active reservations.
Never downgrade to IRR-only runtime or revalue past USDT at a replacement rate.
Final cleanup passed: verified private Next process group and Windows TLS tunnel
stopped; exact disposable DB/NOSUPERUSER role, private sessions/API-key env/TLS files
and source archive removed; task builder stopped. Existing shared app readiness
and auth-session endpoints both200. Ignored screenshots/reports/helpers remain.

## Merchant workspace visual refinement — 2026-11-24

Owner requests a more professional merchant/Admin appearance using Unslop,
Open Design, Figma SDS, MengTo and Taste guidance. Continues local1e96aa10 in
`.mobocom/pay-bale-verification`, `feat/pay-private-merchants-2026-11-24`,
base mainb93879bc. Local code/documentation commit in Git; no push/PR/deploy.

Direction: a Persian financial workspace; available proceeds lead the page;
neutral SDS surfaces with the existing accent; aligned ledger figures and clear
units; short functional motion. Protected public themes are outside this slice.

- MerchantShell now uses a quieter header, explicit active navigation, compact
  scrollable mobile navigation, sticky desktop sidebar and readable private-area
  note. Existing login/logout/theme/account/skip-link behavior remains. Page
  headings show the actual business name instead of repeating the brand mark.
- Overview uses a primary balance surface, grouped financial ledger, existing
  payment/terminal/report shortcuts, a real-data chart with its accessible daily
  table, useful zero-data state, settlement stages and configuration status.
  Numbers retain exact BigInt formatting; currency is visually separate. Calendar
  formatting explicitly uses Persian locale/Tehran timezone. No synthetic figures
  are inserted into product UI, and configured bank feed is not claimed live.
- Admin merchant directory/detail are parallel on desktop and sequential on mobile;
  selection has an explicit jump link. Provisioning closes its native form after
  success; profile/fee editing uses native progressive disclosure and retains its
  version-keyed reset. Required reason/ack, all existing actions and Audit history
  remain. Corrected statistic-label contrast on the new surface.
- Owned files: `components/pay/{merchant-shell,workspace-header}` plus scoped CSS,
  `dashboard/{index,overview,Overview.module.css}` and
  `admin/{merchants,merchant-detail,Merchants.module.css}`. No server/API/AuthZ/
  financial state/schema/dependency change; same Billing/Wallet owners.

Actually executed: all214 existing migrations on disposable NOSUPERUSER PostgreSQL,
`pay-private-merchants.connected.cjs` with real canonical sessions, full TypeScript,
architecture/source/schema/money/security/Audit/manifest gates and whitespace check
pass. React Doctor6 affected components:0 errors/3 reviewed warnings (existing
detail complexity and two native CSV download anchors; no suppression). Actual TLS
Playwright19 lifecycle/isolation/legacy/public-checkout captures +15 populated/
profile/report/recovery/keyboard captures +4 final authenticated theme/motion
captures: axe0, document overflow0, final page errors0. Viewports1440/1024/768/390/320;
both themes at1440/390. Verified200ms single entrance and no entrance under reduced
motion. Populated fixture used canonical bank reconciliation for3 payments/Wallet
credits and1 reserved settlement, after its explicit synthetic OTP boundary; no
live provider/SMS/Bale/bot traffic. Initial contrast/definition-list/link-affordance
findings were fixed; test selectors were scoped to actual API/render readiness.

Ignored before/after evidence: `var/pay-bale-20261124/private-*.png` (prior slice),
`visual-{browser,detail-browser,final-review}.json`, `visual-final-*.png` and
`visual-admin-selected-*.png`; raw Doctor/type/native logs alongside them. Preview,
verified tunnel, exact DB/role, private session/TLS/config files and source archive
removed; builder stopped. Shared app readiness/session both200 after a first6s
warmup timeout. No production build/live rollout or whole-site certification.

Guidance actually adapted: installed Unslop/UI Skills and selected Vercel render
rules; [Open Design dashboard](https://github.com/nexu-io/open-design/blob/5fdcc3db1e31bd4fa70f673041b78e87977507c3/design-templates/dashboard/SKILL.md)
for region hierarchy; [SDS semantic tokens](https://github.com/figma/sds/blob/05525f75192a3aa5d5690c5e41277ebd19d2efe1/src/theme.css);
[MengTo animation systems](https://github.com/MengTo/Skills/blob/e7df6eb7124095d6c7fbc71c8909f8896d061850/agent-skills/web-design/animation-systems/SKILL.md)
for restrained feedback; [Taste](https://github.com/Leonxlnx/taste-skill/blob/6c0b5c78f5d31776e2210305abaa210cdc0030bf/skills/taste-skill/SKILL.md)
for equal edges, real product data and browser inspection. No upstream app,
marketing-page template, random palette, external scripts or new UI framework was
installed. Local MoboCom architecture and validation override generic demo rules.

Rollback: revert this presentation commit, retaining1e96aa10 private-access and
Admin lifecycle behavior; no database rollback. Next: owner review/PR publication
when requested; live-source commissioning remains the earlier handoff's boundary.

## Private merchant workspace and Admin lifecycle — 2026-11-24

Owner asks to separate/private the merchant experience and retain full Admin
control, with deliberate professional RTL presentation. Continues owner-merged
PR487 (mainb93879bc), `.mobocom/pay-bale-verification`, branch
`feat/pay-private-merchants-2026-11-24`. Local implementation, no push/PR/deploy or
hosted workflow dispatch. The coherent code/documentation commit is recorded in Git.

### Behavior and owners

- `/pay/merchant` and its existing six named views are the canonical independent
  workspace. Scoped MerchantShell has its own header, navigation, responsive body,
  theme controls, account/logout and keyboard skip link; existing Pay components
  retain payment/terminal/report/bot behavior. Same canonical MoboCom login/session,
  no new identity/app/subdomain/database. SDS/MoboCom tokens, native controls and
  brief opacity/transform entry with reduced motion. No public visual redesign.
- Public `/pay` introduction/enrollment is removed and redirects to private entry.
  `/dashboard/pay` and known child URLs redirect to their new equivalent. Next may
  stream a redirect as200/meta; actual browser navigation is verified. Ordinary
  AccountShell no longer advertises Pay. Root menu/footer composition recursively
  removes merchant entry links (including same-origin absolute URLs); saved theme
  configuration is preserved. Payment capability URLs are retained. Robots/private
  headers/no-store include Pay, and the workspace metadata is noindex.
- Billing `merchantPortalAccess` uses current Identity/session/module/section and
  stored PayMerchant status on EACH page. Guests get a safe sign-in link to existing
  `/login?next=/pay/merchant`; ungranted/pending/suspended get safe status screens.
  Only ACTIVE merchants receive dashboard data. Merchant reads/commands and
  machine reads enforce active membership; hiding a menu is not the guard. A failed
  overview refresh clears stale dashboard data and offers retry.
- Public POST `/api/pay/merchant` explicitly refuses403 PAY_ENROLLMENT_CLOSED.
  Existing `enrollMerchant` is now Admin-only provisioning to an exact existing
  UserId/email, creates PENDING, forbids self provisioning, validates current
  active/unrestricted account/section and records strict Audit. No new user or
  money rows. Existing merchants and pending requests are preserved for review.
- Existing Admin merchants tab composes `merchant-admin` behind Billing Pay's
  public address: `merchant-directory` GET(page/q/status or id), POST(provision),
  PATCH(id/version/action/note). It supplies25/page search/status filters, profile,
  activation/suspension, default/override fee terms, auto-source grant, terminal
  active/auto flags, bot key/integration stop and last50 management Audit events.
  Owner UserId stays immutable. Origin/strict rate/body/session and the exact
  `mobocom-pay.manage` permission are canonical; settlement-only staff cannot manage.
- Each Admin mutation requires a reason, exact parent merchant version CAS and
  strict Audit in the transaction; UI additionally asks explicit acknowledgment.
  Source/terminal/bot controls retain original grants and bot version fencing.
  Stopping a bot replaces its old key hash with an undisclosed random capability;
  even reactivation cannot revive the old key. The owner explicitly rotates for
  a usable replacement. No plaintext replacement is returned to Admin or Audit.
  Profile domain edits cannot invalidate existing return/callback origins. No
  delete/purge, secret display, arbitrary callback destination or financial write.
  Parent merchant fencing composes current merchant commands/concurrency. Existing
  payment and fee snapshots/Wallet/settlement/proof remain their canonical owners.
- `src/plugins/mobocom-pay/manifest.json` adds the already-implemented monitor and
  review desk to the existing Finance menu. No new registry/navigation framework.
  No schema/migration/dependency changes. Public checkout/OTP/bank/callback and
  machine API URLs stay unchanged; ungranted overview and public enrollment are
  intentionally closed. OpenAPI description/operator docs reflect provisioning.

### Actual executed acceptance

- Disposable NOSUPERUSER PostgreSQL with all214 existing migrations, no .env:
  new registered `pay-private-merchants` passes with real signed sessions and
  current Identity/permissions: guest/ungranted/pending/suspended/other merchant,
  scoped manager versus settlement-only, self provisioning denial, exact lookup,
  duplicate refusal, stale version, strict Audit rollback, fees/reset, invalid
  domain, terminal scope/auto grant, bot revocation, user suspension/module off and
  zero new Payment/Wallet rows. Pure public navigation filtering is also exercised.
- Existing pay-bot, pay-routing-operations, pay-shared-checkout and
  pay-bale-collection connected checks pass. Legacy mobocom-pay passed separately
  on its required empty-settings disposable DB. Its fixtures now provision through
  Admin rather than self enrollment; financial assertions remain. No actual
  bank/SMS/Bale/outbound bot traffic or production DB touched.
-61 native unit cases pass across Pay bot/routing, navigation and SEO. Full
  TypeScript, architecture/source/schema parity/money-schema/money-UI/security/
  strict Audit/release-manifest gates pass. Extension registry generation verified;
  byte-only/generated unrelated changes were restored, no baseline reset. Final
  `generate-extensions.mjs --check` matches all7 registry files.
- Actual TLS Playwright19 final responsive/axe captures:1440 light/dark and390;
  Admin create→pending→activate, merchant portal, real terminal create, Admin stop
  terminal→suspend, ordinary and guest refusals, old deep-link redirect, no public
  account Pay links, unchanged bank checkout. New merchant shell (including header,
  sidebar/footer) and affected main views have0 axe findings/overflow/page errors.
  Extra390 browser check: failed overview hides stale panel, retry recovers,
  native keyboard skip link and full-shell axe0. Two final mobile captures verify
  guest versus authenticated header controls (logout only for a current session)
  with full-shell axe0. This is local synthetic evidence.
- Hurl private-merchants smoke7 requests pass (guest/section denial, safe/no-store
  directory, closed public enrollment, foreign Origin refusal, private/noindex
  workspace); Spectral0, oasdiff0 breaking schema changes. Enrollment/access policy
  intentionally tightened as requested, not described as unchanged behavior.
- React Doctor9 components0errors/14 reviewed warnings: existing AccountShell
  fetch/complexity, existing Admin complexity/table resemblance, new detail rendering
  complexity and keyed profile draft state. Profile key includes merchant.version,
  so saved/reloaded versions remount fields; no suppression. Final existing
  one-rule Semgrep over34 source targets and redacted Gitleaks over53 named files
  report0 findings; these are scoped checks, not comprehensive certification.
- Browser fixture corrections: proper heading level/terminal label and current
  compact-bank title; waiting for actual activation completion (PENDING already
  offered suspend); streamed legacy redirect asserted by navigation rather than
  assuming307. Initial dev preview restarted at its3GB threshold while compiling
  account routes; only the private preview was restarted with5GB, final run passed.
  Full-shell axe exposed low-contrast sidebar/footer text; scoped tokens corrected
  and rechecked. No global token/theme changes. Custom config hash remains
  be7ebaf639a6969952b96bf4c30a22957f7556a48e4e654528ac8468543ac1df.

### Limits and rollback

No production build/whole-site certification, real bank/Bale/SMS, native mobile
hardware or deployment claimed. Login uses existing Identity; this slice adds no
invitation-email sender or separate credentials. New admin controls do not send
funds, reset a user or reveal bot/provider secrets. Live source activation/recovery
remains the operational continuation after owner merge/deploy.

Rollback is an app revert or existing module disable; all merchant/financial/evidence
data remains. Returning to the old app also restores its public enrollment policy,
so keep that service closed operationally if reverting. Test-only source/runtime,
sessions/DB cleanup status is appended at completion. Root/autonomous work preserved.

Completion cleanup ran: verified private Next process group and host tunnel stopped;
exact test/legacy DBs and NOSUPERUSER role removed; private TLS/session/Hurl files
and source archive removed; builder stopped. Shared app readiness/auth-session
returned200. Synthetic captures/redacted logs remain ignored under
`var/pay-bale-20261124`. No production state was changed.

## PR487 publication — 2026-11-24

Owner requested publication of the completed monitor/reconciliation slice.
[PR487](https://github.com/WebNetData/MoboComCMS/pull/487) is open against `main`,
head `feat/pay-monitor-reconciliation-2026-11-24`, product commit16728f9c.
The following publication record changes documentation only. Local evidence and
live bank/Bale/SMS limits are preserved below; no tests were rerun for this record.
Owner merges/deploys; no merge, deployment or hosted workflow dispatch performed.

## Bank operations monitor and reconciliation desk — 2026-11-24

Owner authorizes recommendations1/2 after owner-merged PR486, verified merged
at main8a84ad1a. Authoritative checkout remains `.mobocom/pay-bale-verification`,
new branch `feat/pay-monitor-reconciliation-2026-11-24` from that main. This is a
local development slice; its resulting commit is in Git. No push/PR, hosted
workflow, production migration or deployment was performed.

### Implemented owners and behavior

- Billing `server/pay/transfer-operations` behind the existing Pay address owns
  the Admin monitor, evidence queue/search/detail and versioned decisions. Existing
  merchant bot-delivery operations/recovery, Settings, Identity, Audit, Gateway,
  Invoice, Wallet, receipt storage and fulfillment retain their authority.
- `/admin/mobocom-pay/operations` shows current SMS/Bale readiness, current binding
  last receipt and15min observed traffic,24h receipt/rejected counts, delivery p95,
  bank-backed confirmation p50/p95, review age/overdue requests and globally occupied
  permanent amount ranges for12 recent principals. Occupancy includes all banks and
  principals; expiry never frees capacity. Remaining capacity<=10% warns; zero
  refuses new allocation through the existing allocator. Manual confirmations
  without a bank notice have no invented latency. Quiet traffic is UNKNOWN live
  connectivity, never an online/offline assertion. No connector heartbeat introduced.
- `/admin/mobocom-pay/reconciliation` has independent25/page evidence/receipt queues,
  closed-case history, exact invoice-number lookup, explicit assignment, exact
  integer under/over difference, canonical receipt image/review and last50 Audit
  events. Client action forms require a reason and explicit financial acknowledgment.
  Admin layout, semantic SDS tokens, RTL, light/dark and scoped short motion are kept;
  no public checkout/theme design or dependency changes.
- Same-process typed Admin GET `transfer-operations`; GET `transfer-reviews` supports
  page/closed/receiptsPage, id, id+invoice, or collection. PATCH accepts exactly
  noticeId/version/action(assign|dismiss|confirm)/note and optional collectionId.
  `mobocom-pay.manage` gates all; ordinary invoice detail/decisions additionally
  require `invoices.manage`. Self confirmation is forbidden. Session/Origin/body/
  strict-rate limits reuse the existing HTTP/Identity policy. No machine/public API.
- Minimal PayTransferReview is an evidence disposition with CAS version, immutable
  terminal decision and restricted notice/collection/reviewer relations. Strict
  canonical Audit records notes/reviewer/time inside the same transaction. Dismiss
  has no money/refund effect. Under/over cannot settle; the operator records and
  pursues correction/refund externally. No guessed payer/partial credit/auto refund.
- A reviewed exact late notice may settle only an accepted, unpaid, eligible invoice
  with the same destination, frozen/current original source, current gateway and
  merchant/terminal grants. Evidence predating the quote/acceptance is refused.
  Existing `collection-proof` is shared by matcher and reviewer, including current
  CARD_TRANSFER auto/source revocation. REVIEWED_NOTICE uses the same invoice-first
  Serializable transaction, markInvoicePaid, principal/adjustment, Wallet/Pay net and
  fulfillment as AUTO/MANUAL. Migration214 widens only that proof and requires a
  confirmed exact non-self review; a deferred SQL constraint requires the review
  and payment to commit together. Migration DDL is transactional. Existing
  journal/time/binding guards remain.
  Existing213 data and global amount tombstones are preserved in both schema mirrors.

### Actual executed evidence

- Empty disposable NOSUPERUSER PostgreSQL applied all214 migrations. A separately
  isolated populated213→214 upgrade compared User/Bank/Gateway/Invoice/immutable
  quote/notice rows unchanged and found no fabricated review. No production DB used.
- Extended `pay-bale-collection.connected.cjs` passes: late admission, repeated
  refusal, Wallet TOPUP once, under/over application AND SQL refusal, immutable
  decisions, orphan-confirmation SQL refusal, stale CAS, source/module revocation, self confirmation, pre-quote
  evidence, pay-only role versus invoices.manage, exact-once receipt/reviewer/auto
  race, pool occupancy/latency/closed projections. Existing pay-shared-checkout,
  pay-bot, pay-routing-operations and pay-bale-server regressions also passed.
- Full TypeScript plus architecture/source/schema-parity/money-schema/money-UI/
  security/Audit/release-manifest gates pass. Doctor six affected components:
  0errors/3 reviewed warnings (existing Admin complexity/table resemblance and case
  rendering complexity). No full build/whole-site suite or live-bank test claimed.
- Real local TLS Playwright:11 responsive/axe captures at1440 light/dark and390;
  zero page errors/overflow/axe findings on final captures. Actual assignment of
  underpayment hides financial approval; dismiss, exact late confirmation and
  receipt approval persist. Scoped permission/foreign-Origin calls refuse. Extra
  browser check covers both SMS/Bale observations, failed refresh hiding stale data,
  retry recovery, empty/closed cases, no repeat financial action, keyboard and axe0.
  Screenshot review corrected stacked selection rows/contrast and meter meaning
  (remaining capacity, not a green full-occupied meter). Existing theme hash remains
  be7ebaf639a6969952b96bf4c30a22957f7556a48e4e654528ac8468543ac1df.
- `operations-smoke.hurl`9 requests pass: guest/section denial, safe/no-store reads,
  persisted confirmed state, cookie-only/foreign Origin denial and stale decision409.
  Scoped existing one-rule Semgrep0 findings and redacted changed-file Gitleaks0;
  no comprehensive security certification or new dependencies.
- Validation fixture corrections: Wallet status is DONE, source IDs must be native
  numeric/hash shapes, and an exhausted-pool fixture needs a one-slot policy. Initial
  browser selector used the wrong Persian thousands separator; corrected. Contrast
  failure on selected receipt text was fixed in scoped styles and rechecked.

### Remaining limits, continuation and rollback

Live personal-account Bale session/peer binding, SMS Forwarder payload/latency,
actual bank deposits/recovery and production rollout remain UNVERIFIED. Observed
traffic/readiness is not a transport heartbeat. This slice does not add partial
settlement, refund transfer or a real USDT collection rail. Operator activation
and live acceptance remain the next work after owner merge/deploy.

Rollback: turn off automatic source/gateway/module, preserve evidence, reviews and
amount tombstones; do not down-migrate or reuse old amounts. Local private runtime
and fixture cleanup is recorded below at completion; redacted logs/synthetic
captures remain ignored under `var/pay-bale-20261124`. Root/autonomous work preserved.

Completion cleanup ran: verified private preview/tunnel stopped; exact test and
upgrade DBs/NOSUPERUSER role removed; private session/TLS/Hurl files and source
archive removed; builder stopped. Shared app readiness and auth/session returned200.

## Pull request handoff — 2026-11-24

Owner requested publication through the current slice. [PR486](https://github.com/WebNetData/MoboComCMS/pull/486)
is open against `main` from `feat/pay-bale-verification-2026-11-24`. Product code
through5a86b7e1 includes the parser, original Bale intake, automatic card transfer,
SMS sources, receipt holds, destination controls and compact mobile/USDT display.
The subsequent handoff commit changes documentation only. Validation and live-source
limits remain as recorded below and in the PR. Owner merges/deploys; no merge,
deployment or hosted workflow dispatch was performed.

## Compact mobile checkout and USDT display — 2026-11-24

Owner asks for a professional exchange-style bank checkout whose normal mobile
view needs no vertical scroll, and a USDT equivalent labeled BSC/BEP20. Continues
local `feat/pay-bale-verification-2026-11-24` from2c9bea6e. No new schema migration.

### Current implementation

- `components/pay/bank-checkout.tsx` remains the address/controller; private
  `bank-checkout/{view,receipt-dialog}.tsx` owns the compact presentation and native
  accessible receipt dialog. Scoped `BankCheckout.module.css` uses existing MoboCom/
  SDS tokens, safe-area spacing, 44px actions and brief opacity/transform effects
  with reduced-motion support. Global theme/routes remain protected.
- One panel contains the exact Rial total, exact Toman equivalent, USDT equivalent,
  countdown/progress and primary destination. Invoice reference truncates, money
  wraps rather than clips. Fee details and optional configured destination details
  expand on demand. Only Rial amount and raw card have copy controls; visible
  "کپی ریال" and copy feedback identify the unit. Customer acceptance is retained.
- Receipt form opens in a native modal with focus containment/Escape/focus return.
  Closing during an upload leaves the request running and prevents another submit;
  successful persistence switches to UNDER_REVIEW and removes the timer. Main
  payment instructions/copy controls hide on a failed status refresh until retry.
- Canonical FX owner adds read-only `currentCurrencyRate`: approved stored USDT
  rate/source timestamp only, excluding held pendingRate; no provider call on the
  checkout path. Billing `domain/pay-usdt-equivalent.ts` converts the full collected
  Rial total using the existing Toman/unit contract and exact BigInt arithmetic,
  four decimal display rounding and a sub-0.0001 marker.
- Checkout DTO adds optional `usdt` (OpenAPI1.6), displayOnly=true, assetUSDT,
  networkBSC, standardBEP20, rateToman/asOf/manual/status. Missing/invalid/future
  rates give UNAVAILABLE; automatic rates over24h give STALE with no invented
  amount. Explicit manual/locked rates retain their timestamp and manual label.
  Existing `/admin/store/currency` remains the rate configuration owner. This is
  informational conversion, not a new crypto collection/settlement rail. Invoice,
  wallet, fee and payment proof amounts are unchanged.

### Executed evidence

- Disposable NOSUPERUSER PostgreSQL with213 existing migrations: new
  `pay-usdt-equivalent` and existing `pay-bale-collection` connected checks pass.
  Approved versus held rate, staleness and exact conversion tested; prior exact-once
  money/receipt/renewal/merchant-net regression remains passing with the new DTO.
- Dedicated USDT cases and aggregate Pay/parser cases pass (29 executions,
  27 distinct cases because the dedicated USDT file was also included by the
  aggregate wrapper). Final full TypeScript and architecture/source/schema-parity/
  money/security/Audit/release-manifest gates pass. No production build/whole-site
  suite or production/live-bank test in this slice.
- Actual TLS Playwright preview:12 scoped axe/responsive captures, no page errors,
  no horizontal overflow and exact viewport-height normal views:360×640,
  320×568,390×844 dark,1440×900. Configured extra destination fields collapsed,
  rate details, stale/missing rates, receipt hold and expiry also fit checked sizes.
  Clipboard values verified exactly; modal Escape returns focus; real receipt
  upload persists; failed status GET hides old payment instructions and retry
  recovers. Additional delayed-upload test verifies close remains available,
  repeat submission disabled, then receipt hold. Final320×568 capture checks both
  Rial/card clipboard values and two copy controls.
- Scoped Doctor0errors/5 reviewed warnings: guarded async/finally heuristics and
  view branching complexity. Spectral0 findings, oasdiff0 breaking changes;8 Bale
  HTTP regression requests plus1 new USDT-display Hurl request pass. Scoped
  existing one-rule Semgrep0 and redacted changed-file Gitleaks0.
- Initial browser findings corrected: grid min-content horizontal overflow, primary
  blue text contrast, narrow card-number wrapping and one-pixel all-fields overflow.
  Final no-scroll assertions compare scrollHeight≤innerHeight without tolerance.

Normal collapsed views were measured, not forced with page overflow:hidden.
Expanded details, the receipt form, keyboard, text enlargement or exceptional long
amounts retain natural scrolling/wrapping for accessibility. Native keyboard/real
mobile hardware and live rate-provider delivery are not claimed verified.
Synthetic source/rate values only; Custom presentation hash remains
be7ebaf639a6969952b96bf4c30a22957f7556a48e4e654528ac8468543ac1df.

Rollback: revert this presentation/read-only FX slice; existing payment/receipt
state and data remain. Owner merges/deploys; no push/PR/hosted workflow/deployment.
Task-only preview, DB/role and private fixtures are cleaned at completion;
ignored screenshots/redacted logs remain in `var/pay-bale-20261124`.

Completion cleanup ran: task preview/tunnel stopped, exact DB/role removed,
private TLS/session/Hurl files removed, builder stopped; original app readiness
and auth/session both returned200. Final diff check passes.

## Automatic card transfer, receipt hold and destination controls — 2026-11-24

Local implementation in `.mobocom/pay-bale-verification`, branch
`feat/pay-bale-verification-2026-11-24`, base main3679200b plus prior local
design/parser/source commits. Continues Billing/Pay/Wallet/Gateway, not a second
financial system. Owner corrections supersede the older source-only notes below.
No push, PR, hosted workflow, production migration or deployment in this slice.

### Implemented behavior and owners

- Existing CARD_TRANSFER has autoVerify, SMS/BALE selection, dedicated destination
  and autoDisplay. Only card is shown by default; bank/holder/account/IBAN are
  independently configurable. Amount is mandatory; only card and amount have copy
  buttons. Disabled destination fields are blanked server-side. A configured
  destination must actually exist before this gateway is offered.
- Billing `domain/auto-transfer.ts`, `pay-bale-collection.ts`, bounded SMS literal
  templates and `pay-bale-amount.ts` own validation. Melli old text dates/accounts
  do not select a payment; authenticated source binding plus exact CREDIT transfer
  amount does. Interest/debits cannot approve. No owner bank values copied into
  source/fixtures. Original strict parser is retained for optional bank dedupe.
- `server/pay/bale/collection-*` owns immutable globally unique amount allocation,
  disclosure acceptance, server deadline (default30, configurable5–120 minutes),
  immediate instructions and explicit fresh-amount renewal. Old tombstones never
  delete/reuse; a bounded amount pool can exhaust and refuses safely. Invoice
  validity can shorten its quote. PayPayment external-feed expiry stays immutable;
  only an already-linked automatic checkout with a valid scoped ticket continues
  through its separate quote deadline. A stored EXPIRED payment is not reopened.
- `server/pay/sms/*` plus existing personal-Bale intake persist immutable minimal
  evidence before matching. SMS has versioned operator-owned encrypted sources,
  stable message IDs, exact sender/template and original phone receipt UTC time;
  first delivery must be within5minutes. Bale checks original protocol time.
  Exact replays are acknowledged later; old first deliveries cannot steal a new
  quote. Source/owner/module/API/merchant/terminal revocation is checked currently.
- Receipt upload uses canonical PaymentReceipt/image storage and invoice-first
  Serializable locks: PENDING→UNDER_REVIEW, countdown and bank instructions hidden.
  Pending receipt holds survive deadlines and atomically block invoice VOID.
  Reject retains history; a new request can be issued. Manual/automatic approval
  share `collection-settle.ts` and markInvoicePaid/Pay credit/Wallet/fulfillment.
  Principal and separate IRR adjustment are journaled exactly once. Manual
  principal-only receipt records no phantom adjustment. Actual receipt Rial lives
  on the collection; canonical PaymentReceipt amount remains invoice principal.
- Gateway/account Admin, Pay settings/source manager, merchant grant and terminal
  opt-in extend current owners. Finance reports separate service-fee totals;
  merchant net remains unchanged. Pay and ordinary invoice views show receipt hold.
  Existing manual card transfer, compatible gateway callbacks and bot delivery
  remain canonical. Legacy MOBOCOM_PAY records remain compatible.
- Migration213 `20270330120000_pay_bale_collection` is registered, mirrored Prisma
  schema includes source/collection relations. SQL guards exact principal/fee/
  notice or reviewed receipt proof, global tombstones, immutable facts, source
  version claims and final receipt holds. Existing defaults remain GENERAL/off.
- OpenAPI1.5, Bale/SMS Hurl scenarios and Persian
  `tools/pay-bale-server/SMS_AND_COLLECTIONS.fa.md` document the operator contract.
  Existing Custom theme config hash stayed
  `be7ebaf639a6969952b96bf4c30a22957f7556a48e4e654528ac8468543ac1df`.

### Actual local evidence

| Check | Executed result |
| --- | --- |
| Native PostgreSQL | Empty212 then populated212→final213 under NOSUPERUSER task role. All preexisting User/Bank/Gateway/Invoice/Merchant/Terminal/Pay fields compared unchanged; new defaults off. No production DB used. |
| Final regression | `node scripts/run-pg-checks.cjs pay-bale-collection pay-shared-checkout pay-bot pay-routing-operations pay-bale-server`: all5 pass on final migration. Includes SMS↔Bale race, manual↔auto ordering/race, Wallet top-up once, principal-only fee waiver, global reservation across banks, late old notice and renewal, Pay scoped-ticket continuation after original deadline, review hold and exact merchant net credit once. |
| Pure/types/static |20 scoped cases pass; final full TypeScript passes. Architecture, source, schema parity, money schema/UI, security, strict Audit and migration-manifest checks pass. No full production build or whole-site suite. |
| HTTP contracts | Spectral0 findings; oasdiff0 breaking changes versus main base; Hurl8 Bale requests and5 SMS requests pass against private TLS preview. SMS source creation via real Admin POST also passes. |
| Browser |16 checkout/SMS settings captures plus3 final card-only light/dark/mobile captures pass overflow and scoped axe checks. Real consent, mm:ss, receipt upload→hold without timer/instructions, expiry→fresh amount, Admin visibility save/reload and API masking verified. Additional ordinary invoice hold and real SMS source create-form/endpoint render pass; secret screenshot masked. No page errors in the main checkout/visibility runs. |
| React/security | Doctor11 affected React files0errors/29 reviewed warnings initially; final focused pass0errors/19 warnings (guarded async/finally heuristics and existing Gateway/Invoice complexity/metadata/key patterns). Scoped existing one-rule Semgrep0 and redacted changed-file Gitleaks0; not comprehensive certification. Independent read-only financial review found no additional blocking duplicate-credit path before final display controls. |

Fixture failures corrected during validation: old next-minute expectations; old
account-text rejection expectation (now duplicate evidence); test fake-clock/DB
receipt-time mismatch; SMS Admin endpoint shape and missing POST route export;
test locator emoji/copy-label mismatches; nullable optional minute-pair SQL check.
Final native checks use the corrected exact migration, not the first draft.

### Remaining operational work and rollback

Live Bale personal-account login/peer identity, SMS Forwarder payload mapping,
live-bank delivery/recovery and server deployment remain UNVERIFIED. No phone app
was built. Operator must configure the current source, destination/card, templates,
trusted sender, original receipt timestamp and secrets privately, then exercise
live deposit/retry/outage behavior. Source settings readiness is not liveness.

Rollback: disable automatic verification/source or module; preserve all data and
amount tombstones. Forward-only migration; never delete payment/notice history.
Task-only preview/DB/role/private fixture cleanup is recorded at handoff completion;
synthetic screenshots and redacted check logs remain ignored under
`var/pay-bale-20261124`. Shared root/autonomous-foundation work is preserved.

Completion cleanup actually ran: verified task preview and tunnel stopped, exact
task DB/NOSUPERUSER role dropped, TLS/session/Hurl/SMS private fixtures removed,
builder stopped. Shared app readiness and auth/session returned200 after a transient
warm-up timeout. Final source-order normalization regression and scoped units pass.

## Server-only Bale intake and dormant shared gateway — 2026-11-24

Owner explicitly rejected the phone application and requested direct SERVER access
to the original bank arm in the personal account, then named `@bam_bmi`. They also
require the method in the canonical platform Gateway registry, eventually usable
both for site payments and merchant Pay checkout. This supersedes the earlier
device-availability assumption; no Android app is delivered or required.

Authoritative checkout remains `.mobocom/pay-bale-verification`, branch
`feat/pay-bale-verification-2026-11-24`, main3679200b + design137689da + parserb53b7332.
The source below is a new LOCAL development slice; Git records the resulting
commit. PR485 is already owner-merged. No new PR/push/deploy/hosted workflow/live
provider action. Root/autonomous-foundation/IDE work is preserved.

The rejected uncommitted phone slice (38files) was copied with exact SHA256
verification to ignored `var/pay-bale-20261124/withdrawn-phone-source`, then only
its tracked edits were restored and its new files removed.26 stale private runtime
files were removed by exact manifest. Old phone test/browser/APK evidence applies
ONLY to that withdrawn experiment; do not cite it as the current deliverable.
The committed pure National Bank parser remains. No device endpoint/model/phone
onboarding or Android project is in the active diff.

Implemented owners and boundaries:

- Billing `domain/pay-bale.ts` pins the dedicated account alias, immutable GoOmni
  instance, logged-in account, original bank peer and canonical site bank/UserId
  from deployment configuration. Exact username→peer verification is an operator
  setup/live acceptance requirement, not a lookup falsely claimed to have run.
  Strict UTF8/unique decoded JSON keys/bounded depth/body and aligned envelope/
  payload/native-content facts reject sender confusion, partial/edit/forward/
  reply/unknown direction. All provider IDs remain exact strings.
- `server/pay/bale/{access,intake,status}.ts` receives a dedicated self-hosted
  GoOmni2.4.2 signed webhook, not a new official bot or a personal-session token
  given to a cloud service. Fresh canonical Identity standing/permission/2FA/
  section policy, module/API switch and active13digit bank account are enforced.
  `currentAdminHasPermission` is extracted from existing requirePerm, preserving
  no-role full access and empty assigned-role denial; no second AuthZ resolver.
- `server/http/pay-bale.ts` + `/api/payment/mobocom-pay/bale-events` apply strict
  IP limit,24000-byte body, exact HMAC/header identity and explicit foreign-Origin
  denial. Source event and message identities dedupe durably before ACK; immutable
  bank reference/minute fingerprint survives source event/instance changes.
  Conflicting signed facts are recorded separately, not overwritten. Raw body,
  balance, description and counterparty are never stored in the notice table.
- Additive212 `20270329120000_pay_bale_server`, both schema mirrors and release
  manifest: minimal `PayBaleNotice` with restricted BankAccount/self FKs, exact
  BigInt IRR, duplicate links, state/minute/privacy constraints, immutable UPDATE
  trigger and source/date/history/bank indexes. No financial states/types/amounts
  are changed. Canonical bank-account save/delete now preserves this history,
  including notice-only accounts; retirement deactivates instead of swallowing FK
  failure and claiming deletion.
- Source-only states are ORIGINAL_TRANSFER/IGNORED/REJECTED/DUPLICATE/CONFLICT.
  Original bank peer is stronger provenance than a phone notification; it still
  does not attest which merchant/invoice owns a deposit. No targetPaymentId is
  fabricated; no reconciliation/Wallet/invoice/fulfillment/bot job is called.
  API explicitly returns `financialApproval:false` and `collectionReady:false`.
- `MOBOCOM_PAY` is registered in the existing Gateway metadata/Admin form as
  Rial/Toman, with no account-token fields and an explicit preparation hint.
  Admin saves its preference through the existing registry. Usability is false;
  even an active/default row is excluded from ordinary checkout and Pay methods.
  Invocation/test fail explicitly instead of falling through to Plisio. Personal
  credentials are rejected/cleared for this provider. This is NOT a finished
  selectable customer payment rail; method-specific reservation/settlement is open.
- Existing Pay settings gains a scoped SDS card with source readiness, safe
  last-received/history,25/page and Tehran times, translated states, loading/error/
  retry and keyboard controls. Off/replaced sources retain historical safe rows.
  Configuration readiness does not claim live session/recovery. Current Custom
  theme, public pages, CSS/tokens/dependencies and existing settings save are kept.
- Operator setup and limits: `tools/pay-bale-server/README.fa.md` and blank
  `server.env.example`; OpenAPI1.4 and `bale-smoke.hurl` extend the existing contract.
  External GoOmni credentials/OTP are never normal Gateway configuration.

Executed current evidence, ignored `var/pay-bale-20261124`:

| Scope | Actual result |
| --- | --- |
| Runtime | Node22.23.3, PostgreSQL17, UID1000/NOSUPERUSER, no .env, private copied source/private Prisma5.22 client; original app/dependencies untouched |
| Database | Final212 migrations on an empty disposable DB pass. New registered `pay-bale-server.connected.cjs` uses real canonical JWT/Identity/permissions and PostgreSQL (only source-independent React cache and late Audit fault injection controlled); original-source/HMAC/replay/conflict/parallel receipt/privacy/history/source+API+module+bank+owner denial/immutable evidence/constraint rejection/audit rollback/unchanged all money rows pass |
| Upgrade | Separate211 DB seeded complete User/Bank/Gateway/Invoice/Merchant/Terminal/PENDING PayPayment;212 preserves every old field, new table starts empty. Source native + existing mobocom-pay/pay-shared-checkout/pay-bot native suites pass there; owned upgrade DB dropped. Subsequent change only adds two indexes; final empty212/native covers final SQL |
| Fault strength | Four deliberate private faults: HMAC bypass, sender pin bypass, current-permission bypass, bank-history bypass each fail a behavior assertion; exact source restored |
| Units/types/static |19 scoped units pass (15 bot/parser/Bale +4routing), final full TypeScript passes. Architecture/source/schema parity/money schema+UI/security/Audit/release manifest gates pass. New index-only schema change gets final parity/native recheck. No full build/site suite |
| Contracts | Spectral0 diagnostics, oasdiff vs3679200b no breaking changes;8 actual Hurl requests pass Admin denial/privacy, signed original/replay/bad signature/bad peer/foreign-Origin denial. No live independent consumer certification |
| Browser |13 accepted current captures: source empty/history/page2 and canonical gateway create/save;1440 light/dark +390RTL. Scoped axe0/document overflow0/page errors0, keyboard refresh/page navigation, real27 signed HTTP events/privacy, anonymous401/staff403, saved dormant provider omitted from customer list. Representative captures visually inspected; old phone screenshots are not current evidence |
| React/security | Doctor0.9.17 over3 affected React files:0 errors/9 reviewed warnings, all existing Gateway complexity/size/response/input branches or Settings lookup; no BaleStatus finding. Scoped existing one-rule Semgrep0, redacted changed-file Gitleaks0; not comprehensive certification. Delegated source-review attempts failed due agent usage limit, so no independent completed review claim |
| Presentation | Original Custom configuration SHA256 stays `be7ebaf639a6969952b96bf4c30a22957f7556a48e4e654528ac8468543ac1df` |

Harness failures corrected before accepted runs: missing required strict Audit actor
was fixed by explicitly binding/rechecking the canonical source owner, not a fake
system user; stale generated Next phone-route types removed only from the stopped
private cache; one duplicate-message test built two millisecond timestamps and was
made deterministic. Spectral found an unquoted YAML comma. Hurl exposed the generic
payment callback proxy exemption; this new adapter now enforces foreign-Origin
denial itself. PostgreSQL nullable CHECK logic was tightened and tested on final
empty212; these are actual corrections, not ignored diagnostics.

Open work / exact continuation:

1. Set up the dedicated server account connector and verify current @bam_bmi
   numeric identity, original event shape (including possible bank templates),
   recovery/gap behavior and stable session lifetime using an authorized real
   account. Current evidence is synthetic, not a live integration. No account
   token/login/phone/OTP was accessed or requested in chat.
2. Define and implement an immutable, atomic distinguishing-amount reservation
   across shared accounts/all merchants; disclose separate base/fee/adjustment/
   collection/net and choose its accounting owner. Preserve minute precision,
   late-history reuse safety, exhaustion, wrong/partial/excess payments and proof
   gating. Source-only evidence must not be promoted just because amount matches.
3. Complete the MOBOCOM_PAY provider's canonical invoice initiation/settlement for
   BOTH platform bills and Pay collections. Do not recursively create a second
   merchant payment, double-credit Wallet, bypass OTP/method snapshots or weaken
   the trusted targetPaymentId contract silently. Only then enable usability and
   test one invoice/Wallet/bot intent under replay/races, upgrade and live source.

Apply212 before code. To pause, disable the server source/module; retain evidence
and bank rows. Financial processing is unchanged. Prefer forward fixes; never drop
history to roll back. Final27 changed source/check/schema/operator-config SHA256 hashes match the
tested private runtime exactly. Exact task preview/tunnel, fresh DB/role and
upgrade DB were removed; task TLS/cookies/setup/Hurl private files/source archives
and rejected host APK were removed. Task Android builder is stopped; its fixture
TLS/session-reference APK/debug signing key were removed. Original localhost3000
readiness/session both200 afterward. Hash-verified withdrawn SOURCE archive and
nonsecret evidence remain ignored. Git records the local product commit; no PR or
deployment. Do not infer production readiness from this source-only slice.

## Melli notice parsing and personal-account clarification — 2026-11-24

Continuation remains `.mobocom/pay-bale-verification`, branch
`feat/pay-bale-verification-2026-11-24`, main3679200b plus design137689da. Owner
supplied eight National Bank shapes, then explicitly confirmed they arrive from
the bank arm in the owner's PERSONAL Bale account. Earlier missing bank/channel
inputs below are now resolved. Reader availability/proof is still unverified;
device availability was asked to choose an appropriate read-only receiving path.
No personal account login/token/session was accessed or requested in chat.

Implemented `src/modules/billing/domain/pay-bank-notice.ts`, synthetic
`scripts/pay-bank-notice.cases.cjs`, included in existing `scripts/pay-bot.test.cjs`.
The parser extracts exact signed IRR/account/reference, normalizes bounded spelling/
digits/Markdown, and returns a Tehran half-open MINUTE interval using shared
Jalali conversion (modern1402..1499). Single National Bank template only; duplicate,
malformed, conflicting/batched/oversized inputs fail closed. Interest, withdrawals,
fees, positive debit-type inconsistencies and unknown types are not transfer
candidates. Other banks require verified templates, never a permissive fallback.

Text is always UNVERIFIED_NOTICE, never a trusted bank event/target attestation.
No live receiving connector, endpoint, adjustment, schema, auto-approval, Wallet
write, UI/theme or setting changed. Raw body/balance/counterparty/description are
not projected. The owner's real values were NOT persisted in source/fixtures/logs;
only constructed structural examples are used. Independent source review found no
actionable issue in this scoped parser and explicitly did not verify original
sample fidelity or run tests. Lead checked all eight supplied kind/sign shapes.

Executed isolated Linux evidence (`var/pay-bale-20261124`, ignored):

- Node22.23.3, UID1000, no `.env`, private copied source/Prisma5.22 generated client;
  no writes to the running original app/dependencies. Host attempt initially failed
  because this fresh worktree has no `typescript-api`; validation moved to the
  existing Linux dependencies without installing/changing them.
- `node --test scripts/pay-bot.test.cjs`:11 pass, including6 notice cases and5
  prior bot parser/ACK/egress checks. Same final suite passes after fault recovery.
- Four deliberate private-source faults (interest as transfer, inverted direction,
  unsafe Number amount conversion, wrong Tehran offset) each fail behavior
  assertions. Exact parser bytes restored; raw reports retained.
- Disposable NOSUPERUSER PostgreSQL17 database migrated all211 existing migrations;
  `scripts/pay-bot.connected.cjs` passes prior current-authority/idempotency/
  uncertain callback/Wallet/Audit/recovery regression. No live Bale/bank inference.
- Full TypeScript and architecture/source gates pass. Existing local one-rule
  Semgrep0 findings and changed-file redacted Gitleaks0; scoped evidence only.
- SHA256 of all3 changed source/check files matches the tested runtime exactly,
  including the restored deliberate-fault parser. Task source archive removed.
- Exact owned database/role removed; original localhost3000 readiness/session200.
  No preview/background receiver was started. No browser/build run because this
  slice changes no UI and has no live connector. No new migration/dependency/PR.

Continuation: implement only after choosing a legitimate read-only personal
receiver that can bind the ORIGINAL bank peer/message identity, handle replay and
recover gaps. Display name/pasted/forwarded text alone cannot authenticate a bank.
The unique-amount quote/financial attribution slice remains specified, unimplemented
and inactive; this parser must not be mistaken for completed automatic payment.

## Bale verification investigation and design — 2026-11-24

Owner asks for automatic bank-transfer recognition using Bale notices and a small
distinguishing amount or better method. PR485 verified MERGED as
`3679200b41a1a05986036318bc8195c54acb8ab1`. Continuation checkout
`.mobocom/pay-bale-verification`, branch `feat/pay-bale-verification-2026-11-24`,
starts from that fresh main; previous Pay/root/autonomous work is preserved.

Read actual payments/reconciliation/credit, schema and fee/expiry contracts.
Existing HMAC bank bridge and canonical invoice/Wallet/job transaction are reused;
unbound deposits intentionally do not credit. [Official Bale docs](https://docs.bale.ai/)
and Context7 `/websites/bale_ai` reviewed: bot updates, native wallet payload/
success/query are documented; personal bank-notice chat access via official bot
API was NOT established. Wallet collection is distinct from card-transfer notices.

The existing [Pay spec](../../specs/mobocom-pay/SPEC.md#bale-bank-notice-verification-design--owner2026-11-24)
records the bounded proposal: durable authenticated ingestion/bank-level dedupe,
optional atomic unique final amounts across merchants, immutable late history,
separate adjustment accounting, proof-gated reconciliation and latency metrics.
Random amount alone never creates trusted targetPaymentId. Native wallet is an
alternative requiring an explicit choice, not an implemented substitute.

Missing integration input: bank name, actual receiving channel and anonymized
template; owner asked asynchronously. Do not invent sender IDs/signatures/parser/
bank APIs. Adjustment range/accounting remains a proposal, not adopted policy.
No product source/schema/runtime changed, provider/account action, PR/deploy or
money movement. Docs-only checks cover whitespace/local reference targets; no
DB/browser/build test run. Next: establish source/proof feasibility from the
answer, then implement the receiver/reconciliation slice with specified tests.

## Routing PR preparation — owner2026-11-24

Owner now explicitly authorizes push and a pull request to `main`, retaining
merge/deploy. This supersedes the local-only status below. Current branch is
`feat/pay-routing-operations-2026-11-24`; unchanged product `b45cfd0f` plus receipt
`6b05817a`. Fresh origin/main is still `bd6a218a` (0 behind/2 ahead before this
publication receipt), working tree was clean and aggregate diff whitespace check
passed. No existing PR for this head was found. Existing native PostgreSQL,
upgrade, scoped units/types/contracts/browser/security evidence below is reused
for unchanged product source; no additional test/build run is implied.

Publication includes additive211 and explicitly records the opt-in response
maxItems1→5 oasdiff diagnostic, preserved Custom theme and unverified live bank/
bot/worker rollout. GitHub is authoritative for the resulting PR URL/state.
No hosted workflow dispatch, automatic merge, deploy or live send is authorized.

## Routing, operations and confirmed platform repairs — 2026-11-24

Local product commit: `b45cfd0f` (`feat(pay): add routing rules and operations with
scoped platform repairs`). The following receipt changes documentation only;
executed evidence covers that product source. Aggregate diff whitespace check
against bd6a218a passed; no publication was requested in this development slice.

Owner authorized development items1+2. Authoritative checkout is
`.mobocom/pay-routing-operations`, branch `feat/pay-routing-operations-2026-11-24`,
from fresh owner-merged PR484/main `bd6a218a469a631cb6129e259d7cb43d19120b7c`.
This section supersedes the older single-button/latest100/no-routing descriptions
below. Product changes are local; no new push/PR, build, hosted workflow, live
financial send, merge or deployment was performed. Root/autonomous-foundation/IDE
work was preserved. Existing canonical owners and Custom presentation remain.

Implemented:

- Existing Livechat CRM snapshot/profile/chat projection now consumes canonical
  Ticket department scope. Missing actor projects no tickets; full staff and
  department managers retain their access. Subjects/status/timeline/counts use
  the same scope. CRM IRR/IRT totals aggregate exactly with BigInt before the old
  numeric Toman DTO boundary; USD is excluded and stored orders are untouched.
  Owners: `livechat/server/livechat.ts` and its existing HTTP facade.
- Existing Music personal-playlist list count and detail recheck current track
  publication/date plus canonical track and parent-album audience for the current
  user. Relationships remain saved so restored access restores visibility. This
  does not invent a new parent-album publication policy or change public styling.
- Billing Pay `domain/pay-routing.ts`, `server/pay/bot/routing.ts` and existing
  creation/checkout owners add up to12 ordered, enabled AND rules for integer
  Toman amount, purchase/renewal/balance type and minimum payment/member history.
  Missing/invalid history cannot satisfy a positive threshold. These are untrusted
  merchant routing claims, never Identity/payment proof. First matching rule
  selects1..5 currently compatible canonical methods. No match keeps legacy
  behavior; matched-with-no-available-method fails rather than bypassing the rule.
- The selected rule and method names/refs freeze in one delivery/payment snapshot.
  Replay never changes financial identity or that snapshot. LINKS returns several
  buttons for that same obligation; URL mode stays one link. Checkout intersects
  with current availability and repeats admission inside the invoice transaction.
  `?method=` is a suggestion, never an automatic charge or OTP bypass. Competing
  methods still claim a single canonical invoice/Wallet effect.
- Rule saves claim independent `routingVersion`; callback/key changes still claim
  `version` and retain exact delivery fencing. A rule-only edit does not revoke a
  previously snapshotted callback. Both saves are strict-Audit transactions.
- Billing Pay `domain/pay-operations.ts`/`bot/operations.ts` provides owner-only
  complete history at25/page, order/payment search, terminal/delivery/payment-state
  filters, review/overdue filters and merchant-wide queue/review/paid-undelivered/
  exact net-Wallet-credit mismatch metrics. Spent balance is not a credit mismatch.
  Details expose only safe job timing/status and allowlisted Audit fields; raw job
  errors/results, callback credentials and foreign records are omitted. New GET
  responses inherit canonical `Cache-Control: no-store`.
- Explicit recovery retains version/status/paid-Wallet guards: stale SENDING can
  become UNKNOWN without sending; stale QUEUED can repair its deduplicated job.
  UNKNOWN/BLOCKED confirmation/retry retains explicit acknowledgment. No recovery
  writes money rows. Age metrics describe persisted work, not worker liveness.
- Existing Pay navigation gains `/dashboard/pay/operations`. Existing terminal
  setup gains compact keyboard-operated rules; shared Pay styles, AccountShell,
  RTL/light/dark/mobile and reduced-motion behavior are retained. Details return
  focus to the current row even after a table refresh. Old latest100 component is
  removed; its compatibility API remains. No dependency or global-theme change.

Migration `20270328120000_pay_routing_operations` is additive, release-registered
and in both schemas: rules/default`[]`, independent routingVersion/default1,
delivery snapshot/defaultempty, bounded JSON checks, snapshot immutability trigger
and history index. No financial amount/state is rewritten. Apply211 before code;
retain all money/delivery history and forward-fix after activity. Disable rules/
integration for new orders to pause; review already claimed outbound attempts.

Executed evidence (ignored `var/pay-routing-20261124`):

| Scope | Actual result |
| --- | --- |
| Environment | Node22.23.3, PostgreSQL17.11, UID1000/NOSUPERUSER, no `.env`, isolated copied source/private generated Prisma5.22 client; all211 migrations on empty DB |
| CRM + Music native | Registered optional `crm-scope-currency` and `playlist-audience` pass two departments/current actors/no actor, chat/profile/count metadata,101IRT+255IRR=126.5Toman, excluded USD/unchanged orders; current track+album group change/restoration, draft/future, foreign ownership and preserved relationships. Final CRM fixtures create real non-hardcoded staff IDs |
| Pay native | Registered optional `pay-routing-operations` passes two active merchants, single-payment2links, immutable replay, OTP/method admission, concurrent one-invoice winner, owner/version denial, late strict-Audit rollback,104-order old-history pagination/search, safe detail despite injected raw job error/result, exact Wallet credit, stale/fresh recovery races and queue dedupe. Rule-only save followed by real synthetic bank settlement and mocked successful callback reaches SENT without changing callback version |
| Upgrade/regressions | Separate DB migrated210, seeded a complete PENDING payment plus callback integration and WAITING delivery, migrated211 and compared every old field unchanged; defaults empty/1/empty. Existing `mobocom-pay`, `pay-shared-checkout` and `pay-bot` native suites then pass on it. No new paid-history upgrade fixture claim |
| Fault strength | Five deliberate private source faults (old CRM scope, old playlist visibility, wrong Rial scale, bypassed method admission, conflated callback/routing versions) each fail a behavior assertion. Source bytes restored and final CRM/Pay routing checks pass; playlist restoration checked by browser and exact source manifest |
| Units/types/static |61 scoped units pass including4 pure routing tests and existing Pay/SMS/Mellat/invoice/Livechat/Music checks. Final complete TypeScript passes after private Next JSX config restored. Architecture/source/schema parity/money schema, UI and primitive/release/security/Audit invariants pass. No full build/site suite rerun |
| Contracts | OpenAPI1.3.0 Spectral0 diagnostics. oasdiff against bd6a218a reports response maxItems1→5 as one breaking diagnostic even though its process exits0; this is explicitly opt-in rules+LINKS, default legacy behavior preserved by native regression. Actual `routing-smoke.hurl`10 requests pass2links/replay/conflict/pre-OTP privacy/direct method denial/owner page+search/foreign active merchant404/anonymous denial. No independent live consumer/Pact certification |
| Browser |36 accepted scoped captures across setup/empty history/phone/methods, operations history/page2/search/explicit UNKNOWN confirmation, paid result, CRM and both playlist audiences. Final compact/expanded rules supersede earlier expanded-editor captures.1440 light/dark and390 RTL, scoped WCAG axe0/document overflow0. Actual keyboard open/close, focus restoration after decision, blank-number validation, draft survival across callback save and persisted confirmation checked. Runtime errors0 in accepted runs; synthetic payer ticket and bank data, no live SMS/bank/bot send |
| Review/security | Independent final source security review found no concrete remaining blocker and verified separate version consumers; it ran no tests. Doctor0.9.17 over12 files:0 errors/15 reviewed warnings (existing AccountShell effects/complexity, bounded Pay branches/table resemblance, cancellation-controlled checkout effect, tiny method-list lookup advice). No suppression. Existing scoped one-rule Semgrep0 and redacted changed-file Gitleaks0, not comprehensive certification |
| Source/presentation/cleanup |4252 source/check/schema/config hashes match runtime exactly; no unexpected source. Original Custom config SHA256 remains `be7ebaf639a6969952b96bf4c30a22957f7556a48e4e654528ac8468543ac1df`. Exact task preview/tunnel, both owned databases and private role removed; private cookies/keys/config copies removed. Original localhost3000 readiness/session both200 afterward |

Earlier harness failures were corrected before the accepted runs: literal synthetic
ciphertext failed the old integration constraint (changed to its valid encrypted
prefix for the upgrade fixture); a wrong regression filename was corrected; CRM
text locator included a ticket prefix; the existing translation prompt was
dismissed normally. Browser testing found and fixed detached-row focus restoration.
An initial YAML indentation error was corrected before final Spectral/Hurl checks.

Remaining: real bank attribution adapter and production-host OTP/provider/worker
checks, and the actual bot's successful/duplicate acknowledgment contract. No real
external bot response was invented. Whole-site Support claim race, CRM global
segment pagination and older failing fixtures remain outside this bounded slice;
the three confirmed read/projection defects above are repaired. Next work follows
those existing owners, not a second queue, wallet, CRM or routing authority.

## Pull request preparation — owner2026-11-24

The owner explicitly requested publishing the completed custom-bot/Pay UI slice
as a PR and retains merge/deploy. Authoritative branch remains
`feat/pay-bot-integration-2026-11-24`; product commit `6b28b406` is clean and fresh
`origin/main` remains `deb80549` (0 behind/1 ahead before this receipt).
Aggregate `git diff --check origin/main...HEAD` passed. The existing PostgreSQL,
upgrade, scoped units/types/contracts/browser and security evidence below is
reused for the unchanged product source; publication does not rerun those tests.
The PR targets `main` and includes the additive migration, preserved Custom theme,
exact implemented bot contract and explicit live-provider/ACK limitations.
This owner-authorized push/PR step supersedes the earlier local-only status;
GitHub is authoritative for the resulting PR URL/state. No hosted workflow,
merge, deployment, provider send or live financial configuration is authorized.

## Custom bot adapter and Pay polish — 2026-11-24

Authoritative checkout `.mobocom/pay-bot-integration`, branch
`feat/pay-bot-integration-2026-11-24`, fresh owner-merged PR483/main `deb80549`.
The owner supplied the custom-gateway JSON protocol, requested advanced Pay and
scoped professional styling, and authorized implementation without an unavailable
bot name/acknowledgment sample. This section supersedes historical statements
below that Pay has no outbound merchant callback. Polling remains compatible.
Root/autonomous-foundation and the IDE configuration were preserved.

Implemented boundary and files:

- Billing Pay owns `domain/pay-bot.ts`, `server/pay/bot/*` and the dedicated
  `POST /api/v1/pay/bot/{integrationId}` route. Integer Toman becomes exact IRR;
  integration/order identity remains stable across key rotation. Concurrent replay
  returns one canonical payment; changed amount/user/type conflicts. Optional
  names/history/balance are validated, discarded and never treated as bank proof
  or canonical Identity. Response is unwrapped `url`/`links` or `ok:false,message`.
  LINKS currently contains one hosted payment button with the existing compatible
  methods inside checkout; no user-history routing engine or multiple obligations.
- Terminal-scoped `mcpbot_` creation keys are shown once, hash-only at rest, with
  browser-only owner configuration/rotation. The separate bot payment API key
  uses existing encrypted provider credentials and requires PANEL_CREDENTIAL_KEY.
  Callback is merchant-origin HTTPS `/api/payment`, Token header, exact
  `order_id`/`actions=custom_payment_verify`; no Telegram client/token. Public API,
  module, maintenance, terminal, merchant and current canonical account restrictions
  still apply. No second AuthZ/Identity/Wallet/settings/queue owner.
- `createPayPayment` can share a supplied transaction with the immutable delivery
  identity/snapshots. `creditPayPayment` claims payment/Wallet and queues delivery
  atomically, before strict Audit/inbox. Operations adds only `pay.bot-delivery`.
  Delivery states WAITING→QUEUED→SENDING→SENT/UNKNOWN use claims/versioning.
  A durable existing-queue reconciliation job turns an interrupted send UNKNOWN;
  no automatic repeat after an uncertain effect. Configuration/restriction changes
  block pending sends. Each attempt/result/block/interruption/recovery is audited.
- Outbound transport resolves once, rejects private/mixed DNS answers, pins the
  chosen address while preserving TLS hostname checks, bypasses proxies and never
  follows redirects. DNS/request deadlines and a 16KiB response bound apply. Raw
  response, credential and transport error are not retained in delivery/Audit.
  Acknowledgment defaults UNCONFIGURED; active setup requires explicit JSON_OK,
  JSON_SUCCESS or operator-accepted HTTP_2XX. Explicit negative JSON is refused.
  Unknown real-bot success/replay semantics are not invented or certified.
- Merchant owner can review UNKNOWN/BLOCKED, explicitly confirm external success
  or accept duplicate risk and resend with current configuration. Foreign active
  merchants, stale versions and unconfirmed actions fail. None recredits Wallet.
  Delivery list is explicitly latest100 and shows expired waiting payments truthfully.
- Pay-only `bot-integration`, `bot-deliveries`, checkout progress/result and API
  guide compose the existing account/Admin/checkout/SDS components. Field guidance,
  persistent errors/statuses, keyboard recovery focus, RTL, light/dark/mobile,
  restrained transform/opacity entry and reduced-motion support are implemented.
  A paid link opened without its payer ticket gives a truthful same-browser notice
  rather than an OTP form that cannot issue a post-payment challenge. Bot result
  remains hidden without payer proof. Existing approved MoboCom Custom is retained;
  no global theme/homepage/public-section replacement or new UI dependency.

Migration `20270327120000_pay_bot_delivery` is additive, registered under unreleased,
and reflected in both schemas. New tables constrain state/encrypted snapshots and
ownership; database triggers reject pre-credit sends and identity replacement.
Existing financial states/amounts are unchanged. Apply the migration before the
new code; after any activity retain schema/history and forward-fix. Disable the
integration/terminal/module to stop new optional effects; inspect already claimed
external attempts before recovery. Never drop money or delivery rows for rollback.

Executed local evidence (ignored raw `var/pay-bot-20261124`):

| Scope | Actual result |
| --- | --- |
| Environment | Linux Node22.23.3, PostgreSQL17.11, UID1000, NOSUPERUSER role, no `.env`, private copied source/client;210 empty-database migrations |
| Native bot | Registered optional `pay-bot` passes exact Toman, concurrent replay, wrong customer/amount/key, foreign active merchant privacy, current authority/module/maintenance blocks, DB pre-credit denial, late Audit rollback, one Wallet credit, ambiguous no-auto-retry, rotation, stale/interrupted claim, explicit resend/confirmation and expired display |
| Upgrade/regression | Separate owned DB migrated209, seeded an existing PENDING payment, then210; entire row/amount/fee/net/total retained and new tables empty. Existing `mobocom-pay` and `pay-shared-checkout` checks then passed on it. Does not claim a new paid-history upgrade fixture |
| Fault strength | Deliberately accepting an unknown ACK in stopped-preview private source failed the native SENT-versus-UNKNOWN assertion. Exact source restored; final native check passed. No shipped fault switch |
| Units/types/static |40 scoped tests pass: bot parser/ACK/transport, payments/SMS/Mellat and invoice rules. Full TypeScript, architecture, source, both-schema parity, money schema/UI/primitive, release manifest, security and Audit checks pass. Unit is in test:site; native remains optional/disposable |
| Contracts | OpenAPI1.2.0 Spectral0 diagnostics; oasdiff versus deb80549 finds no breaking changes; actual Hurl8 requests pass creation/replay/conflict/wrong key/fractional Toman/anonymous proof privacy/config-recovery denial. No external consumer/Pact certification |
| Browser |29 accepted scoped views across setup, pending phone, UNKNOWN recovery, SENT checkout, paid-other-browser notice, API guide, merchant overview and Admin overview/settings.1440 light/dark and390 RTL; scoped WCAG axe0, no document overflow/runtime errors, reduced-motion and actual keyboard/operator confirmation persisted through reload. Original public logo/config used; representative images inspected. Final review also disables switching terminal/order during a save; those two pending-control props received a subsequent TypeScript check, not a new browser run. Phone ticket and bank data are synthetic fixtures; real OTP is covered by the existing native regression, not a live SMS send |
| React/security | Installed Doctor0.9.17 over7 affected components:0 errors/5 reviewed warnings (bounded branching; abort-controlled async effect; generic table-header resemblance; existing JS form submit). No suppression/policy relaxation. Scoped existing local Semgrep dynamic-code rule0 findings/errors and redacted changed-file Gitleaks0; not comprehensive security certification |
| Source/cleanup |4241 source/check/schema/config SHA256 hashes exactly match the verified runtime. Next dev's private JSX config rewrite was inspected, canonical config restored and TypeScript passed. Exact preview trees/tunnel and both owned DBs/role removed; private fixture credentials/config copies removed. Original localhost3000 readiness/session both200 afterward |

Design guidance actually applied: installed Unslop, accessibility/motion guidance,
existing SDS/MoboCom primitives, selected Vercel parallel-fetch rule and OpenDesign
[restrained motion follow-up](https://github.com/nexu-io/open-design/blob/main/skills/emilkowalski-motion/SKILL.md).
No OpenDesign app/provider, source upload or competing visual system was installed.
Serena/Graphify current-checkout discovery was unavailable; bounded exact source
inspection was used, not presented as graph/runtime proof.

Remaining activation dependencies: real merchant/bot credentials and public HTTPS,
operational queue worker, actual bot success/duplicate responses, and a controlled
real provider/SMS/bank checkout on its destination host. No live bot/SMS/bank send,
production build/deployment, hosted workflow or new PR was performed. Refunds/
chargebacks, additional crypto networks, automated market rates, history-based
multi-link routing and delivery history beyond the latest100 UI remain separate.
The unrelated three findings from the whole-site prebuild audit remain open.
[Merchant setup/operations guide](../../MOBOCOM-PAY-FA.md#اتصال-به-ربات-دارای-درگاه-سفارشی),
[scenario](../../specs/mobocom-pay/SPEC.md),
[OpenAPI](../../specs/mobocom-pay/openapi.yaml),
[Hurl](../../specs/mobocom-pay/bot-smoke.hurl).

## Integration with Extensions and Solution Packs — owner2026-11-23

Owner-merged PR481 / main e2b6c51b is combined locally with package lifecycle,
manager polish and Solution Pack tip f6429ce7 in `.mobocom/package-lifecycle`,
`feat/pay-extension-sync-2026-11-23`. Pay source/schema/provider contracts remain
unchanged; default-off Pay is in the shared catalog, explicit pack activation
does not enable incoming or grant financial permissions. Native Pay/shared-checkout
and compound provisioning checks passed; exact integration/browser/final receipts
and rollback limits are in [the shared commercial handoff](COMMERCIAL_MODULARITY.md#mobocompay-synchronization--owner2026-11-23).
This is local branch synchronization, not hosted-main merge or live deployment.

# MoboComPay — merchant collection and reviewed settlements

## Pull request preparation — owner request 2026-11-23

The owner explicitly requested publication of the complete feature as a pull request and retains merge/deploy ownership. The authoritative branch is `feat/mobocom-pay-2026-11-23`; feature tip before this documentation receipt is `db6dcbaa`. Fresh `git fetch origin main` found no missing upstream commits (0 behind / 4 feature commits); the feature tree was clean and aggregate `git diff --check origin/main...HEAD` passed. Publication includes the original merchant/wallet/settlement slice, navigation and verified shared-gateway checkout, with both additive migrations under unreleased. Existing local PostgreSQL/browser/static/contract evidence is recorded below; tests were not rerun for this publication-only step. The PR targets `main`; live-provider configuration, extra crypto networks and production validation remain pending. No hosted workflow, merge or deployment is requested by this step. GitHub is the authoritative record of the resulting PR URL/state.

## Shared gateways and verified-payer checkout — owner continuation 2026-11-23

Authoritative checkout remains `.mobocom/mobocom-pay`, branch `feat/mobocom-pay-2026-11-23`, continued from `e317a80e`. The owner requested reuse of active MoboCom gateways, phone OTP before payment, card instructions/receipt upload with existing approval paths, and delivery through the merchant's own Telegram bot. Clarifications: fee bearer is selectable per merchant; the requested cap applies to the entire fixed-plus-percentage fee, not to payment size. This section supersedes the original bank-feed-only checkout below. Local implementation only; no deployment or live SMS/bank/Telegram certification.

Implemented boundaries:

- Billing's canonical Gateway catalog and `createGatewayInvoice` remain the provider owner. Pay selects active, usable IRR-compatible methods; no copied credentials/configuration registry. A real `Invoice.kind=PAY_COLLECTION` is uniquely linked to PayPayment, with exact total and no User/Order/product/wallet application. Canonical `markInvoicePaid` composes Pay credit inside the same transaction after its journal; manual receipt, signed bank evidence and existing provider callbacks converge there. This is a collection document, not a fabricated customer order/top-up. Mellat/installment browser returns resolve the hosted Pay page; verified callbacks retain their existing bank verification and reversal behavior. FrenzyEx IRR conversion must be exact and its bot fallback is disabled for Pay.
- Merchant contract fields select MERCHANT or CUSTOMER plus percentage bps, fixed IRR and total-fee cap (0 = uncapped). Ceiling percentage+fixed is capped once, then immutable base/fee/net/customer-total/bearer snapshots are stored. Existing payment min/max validation remains, with no new payment/day cap. Reports now distinguish order amount from customer payment and gross=fee+net, including customer-paid fees.
- Canonical SMS OTP/human-check owners supply payment-and-browser-bound challenges; no new User or global login. An opaque HttpOnly path-scoped ticket gates methods, card details, gateway creation and receipt/image submission. Pay stores encrypted phone, last4/time/hash; production requires existing `PANEL_CREDENTIAL_KEY`. Canonical OTP/SMS storage retains its existing retention/phone behavior; do not imply the entire SMS database was encrypted by this change. Failed attempts persist, five failures burn a challenge, and replay/cross-payment/browser claims fail.
- Canonical `PaymentReceipt`/bounded image reader/storage is extended for a guest only on a collection invoice. One pending receipt and unique approved bank/reference proof protect duplicate processing. `mobocom-pay.manage` review is separate from payout `mobocom-pay.settle`; self-review is denied. Review claims receipt, invoice, journal, Wallet and strict audit atomically. Finance receipts share the same owner and hide Pay receipts from staff without Pay management. Direct Admin invoice edits of a collection are refused; receipt images repeat current guards/module state.
- Gateway creation claims STARTING before network I/O, snapshots provider/ref and binds one canonical invoice. Only an unambiguous FAILED can retry that same method. STARTING/UNKNOWN never blindly create another provider charge. Investigate provider status before issuing a replacement link; no automatic reset of an uncertain transaction is shipped. Compatible providers joining the canonical invoice lifecycle can be offered through this boundary; arbitrary unsupported currencies/providers are not claimed operational.
- Guest checkout now provides price/fee disclosure → phone → method → receipt/hosted provider → persisted result. Admin adds receipts and per-merchant fee contracts; existing SDS/Unslop-scoped RTL/themes/responsive primitives remain. Merchant tables/CSV show base, paid total, fee, net and bearer. No protected unrelated page was restyled.
- A merchant bot uses an ordinary HTTPS URL button, or its permitted Web App button, pointing at MoboCom checkout. The merchant backend polls bearer `GET /api/v1/pay/payments/:id`, matches stored ID/terminal/order/base/total/net and schedules idempotent delivery using the payment ID. `examples/integrations/mobocom-pay.mjs` is a tested server-side consumer/button example; it does not send Telegram messages or implement the merchant's product fulfillment. No outbound financial webhook, merchant bot token or MoboCom→Telegram call is present. Official button reference is linked in the Persian guide.

Data/compatibility: additive `20270326120000_pay_shared_checkout`, listed under unreleased, widens canonical Invoice kind/null-customer constraints only for collection documents, adds immutable fee/phone/provider/initiation/link fields and receipt proof/guest checks. Both schema mirrors agree; old shipped migrations remain untouched. Existing paid Pay rows backfill total=base and keep their original bank/Wallet evidence; no phone proof is fabricated. Disabling preserves data. After collection activity keep Wallet/Pay-compatible code/schema and forward-fix; no destructive down migration. Partial refunds/chargebacks and arbitrary manual correction remain outside this slice.

Executed evidence on private copied Linux source, UID1000/no `.env`, private Prisma5.22 client/read-only shared dependencies:

| Scope | Actual result |
| --- | --- |
| Native PostgreSQL | All209 migrations on an empty owned DB; original registered `mobocom-pay` checks and new registered `pay-shared-checkout` pass. Tests exercise fee sides/cap/snapshot, gross=fee+net, real OTP+SMS-record owner with transport double, encrypted Pay phone/no User creation, wrong/replayed/cross-ticket/burned codes, hidden pre-OTP data, active gateways, canonical guest receipt/reject/resubmit, strict-audit rollback, approval races, signed bank auto-match of the same receipt, real Mellat SOAP parser/callback/replay, one journal/Wallet credit, ambiguous no-retry, suspended-merchant reversal and module-off |
| Upgrade | Populated208→209 preserved a paid Pay row, trusted bank proof and exact1,000,000 gross/990,000 net/common Wallet/withdrawable values; total backfilled and payer proof left null. First attempt exposed PostgreSQL pending deferred-trigger events before ALTER; migration now flushes only the existing PayPayment proof events before further DDL, then restores deferred mode. Corrected upgrade passed; failure receipt retained |
| Fault strength | Removing the fee cap or bypassing the payer guard in private stopped-preview source each failed a meaningful native assertion; source restored and the native check passed again. No shipped mutation/test switch |
| Static/regression | Full TypeScript; source/import, architecture, security, audit, money primitives/schema/UI, schema parity and migration manifest passed;180 scoped navigation/payment/account/invoice/Wallet-related tests passed. No full production build claim |
| Browser | Actual PostgreSQL-backed Edge/Playwright, SMS/bank transport boundaries only doubled: per-merchant capped customer fee, phone before card/methods, HttpOnly ticket/no global login, image upload/pending/manual approval/PAID, authenticated merchant query, actual Mellat start/form/provider-only simulated page/callback/PAID. Final29 accepted scopes at1440 light/dark and390 light/dark cover checkout, receipts, fee forms, API guide and base/customer/net report details; all scoped axe0/overflow0/page-errors0 and relevant frames visually reviewed |
| Permissions/HTTP | Real section-only manage/settle roles: receipt list/image allowed only to manager; module-off denied receipt/image/public checkout and was restored. Foreign-Origin mutation and anonymous image read denied. Actual example consumer refused pending/mismatched orders and produced a stable delivery key from authenticated PAID; no service/Telegram send was claimed |
| Contracts/scans | OpenAPI1.1.0 Spectral0 diagnostics; actual Hurl7 requests (create/query/replay/foreign ownership, anonymous privacy and proof-required writes) passed. Installed React Doctor over10 files:0 errors,9 reviewed warnings (abort-controlled fetch, existing/small complexity/JSX/lookup, keyed editable form defaults and native form submission). Scoped local Semgrep dynamic-code rule0 findings/errors and redacted changed-file Gitleaks0; not a comprehensive security certification. No hosted workflows, Pact/live independent bot or breaking-change production gate claim |

Browser harness corrections are recorded as failed attempts, not product successes: duplicate heading/wrapped-select locators, private preview memory/HMR GET retries, missing UTF-8 on the simulated bank page and keyboard focus on overflowed API examples. The real Mellat start-page nonce/form worked; the fake bank encoding problem did not require a production gateway bypass. Bank/SMS network was blocked/doubled only in the ignored private preview preload. No fake OTP/provider flags were added to product source.

Remaining activation: configure real SMS and encryption key, enable compatible canonical gateways/module/incoming, and verify the real host/domain/callback paths. SMS-bank or statement automation still needs the selected trusted adapter to attest payment-specific attribution; a customer reference/receipt alone never credits. Late/ambiguous/restricted cases require operator investigation. Additional crypto networks remain unnamed. Owner merges/deploys; no real bank transaction, SMS, external merchant bot delivery, new hosted workflow, push/PR/merge/deploy occurred. Raw receipts are ignored under root `.mobocom/pay-collection-qa/`; final hashes/cleanup/local commit are recorded there and in the final delivery note.

Final local delivery receipt: 52 changed product/schema/test/example files matched SHA-256 against the verified private runtime. Both Pay native checks are registered as optional isolated checks, not added to the default database suite. Cleanup removed only the task container (ID beginning 802d44ee35ab), its three explicitly owned collection databases and private fixture cookies/keys; shared dependency volumes were retained. Original application readiness and session endpoints returned HTTP200 afterward. Source is retained on the authoritative local branch for owner review/merge/deploy; no remote operation was performed.

## Independent payment gateway navigation — owner continuation 2026-11-23

Continued the same authoritative `.mobocom/mobocom-pay` checkout and local feature branch, from `005f1346`. The owner requested an independent, polished «درگاه پرداخت» menu/submenu experience. This is a presentation/navigation slice; Billing/Wallet financial rules, database schema and provider readiness are unchanged.

- AccountShell now uses the existing ShellNav disclosure group «درگاه پرداخت», separate from Orders/Billing. The canonical Wallet entry stays there. Six exact account links: `/dashboard/pay` (overview), `/payments`, `/settlements`, `/terminals`, `/reports`, `/api` below that prefix. The existing module switch filters the entire group.
- The existing Pay module manifest registers an independent Finance group «درگاه پرداخت»: overview, merchants, settlements, payments, bank events and settings. Existing manage/settle permission keys filter each entry; backend authorization remains authoritative. Settle-only staff see overview/settlements, cannot render settings controls on a direct settings URL, and receive no private bank/config records. Manage-only staff can read settlements but cannot approve them.
- Whitelisted `[view]` pages preserve both old root addresses and require the existing module guard. The page key resets route-local filters/drafts on navigation so a payment status never leaks into settlement filters. No new API or page router was introduced.
- Scoped Pay navigation uses real links, exact `aria-current`, shared Icon primitives and SDS semantic surfaces. Headers describe each selected view. All six links remain visible in a two-column phone layout. Existing ShellNav owns collapse state, mobile closure and Escape/focus return. Pay dashboard/Admin roots are sections inside their existing shell's main landmark.
- Reports use actual existing overview/trend data and CSV endpoints, with the existing 1000-row/page limit stated. Admin overview counts explicitly describe the currently displayed, bounded lists. The overview explains that withdrawable proceeds are part of the same canonical Wallet and links to it. No extra wallet or synthetic production metrics.
- Focusable bank-event overflow, underlined inline wallet link, padded settings fieldsets and two-column rail fields address problems found in real browser/visual checks. Hover/selected feedback remains restrained and respects reduced motion; approved unrelated surfaces are untouched. Unslop and installed baseline/accessibility/motion guidance were applied within MoboCom/SDS constraints.

Executed evidence for this slice: full TypeScript in private Linux source, UID1000/no `.env`; source/import and architecture gates; 45 existing navigation/payment tests passed. React Doctor over eight affected React files exited0 with0 errors and12 reviewed warnings: existing shell fetch/complexity, Admin complexity/repeated JSX, small bank-ID membership lookup, locale formatting and intentional CSV anchors. No suppressions, package upgrades or relaxed baselines.

Actual Edge/Playwright against the isolated PostgreSQL database (all208 migrations applied) exercised signed incoming bank evidence and canonical Wallet read models, both independent shell groups, every submenu link, direct reload, history, current-link selection, CSV download, filter reset, mobile Escape/focus and signed manage-only/settle-only staff. Final26 accepted scopes have axe0, overflow0 and page errors0:1440 light/dark,390 light/dark, all merchant/Admin views plus role-denied/read-only screens. Relevant final mobile/settings frames were replaced after the final polish and visually reviewed. Raw non-secret evidence is ignored at root `.mobocom/pay-nav-qa/browser/evidence.json`.

Earlier attempts are not passing evidence: the initial fixture expected200 for a successful201 create; private dev HMR needed an allowed loopback origin; browser found/fixed the inline-link distinction and scroll-region keyboard issue. Next dev's memory threshold restarted only the private preview, so merchant and Admin phases were split. Unknown/module-off pages use Next's not-found boundary; a streamed response can have HTTP200 with `NEXT_HTTP_ERROR_FALLBACK;404`, so do not claim every HTML response returned404. API module-off is still expected to return404.

No migration, live provider/transfer, production build, hosted workflow, push/PR/merge or deployment belongs to this slice. Existing provider/network limitations and the Wallet-compatible rollback rule below remain. Reverting this presentation slice alone needs no data change; retain the existing financial migration/code.

Final receipt: the routed merchant quote/reserve was persisted and a nonempty settlement was shown to actual reviewer, manage-only and settle-only staff; action visibility matched their permissions. All13 changed product-source hashes matched the tested private runtime. Unknown/deactivated-module deep pages reached the Next not-found boundary and the disabled API returned404; fixture state was restored before cleanup. The exact owned container `96a64322e36844396b0d39808468dbbc5075e5f4ed5601b66295c4ef0172f629`, owned `mobocom_pay_test_20261123_navigation` database and host fixture JWT/key JSON files were removed. Shared dependency volumes and the original SMS/platform app were untouched; original host3000 readiness/session both returned200. Source3054/architecture and final full TypeScript passed after the last product edits. Local evidence/cleanup receipts remain at root ignored `.mobocom/pay-nav-qa/`. Delivery is on the same local feature branch under commit subject `feat(pay): add dedicated payment gateway navigation [skip ci]`; owner merges/deploys.

## Checkout and owner decisions — 2026-11-23

Authoritative checkout: `.mobocom/mobocom-pay`, branch `feat/mobocom-pay-2026-11-23`, from freshly fetched `origin/main` `bcdfbdc7` (1.7.21). The root and `.mobocom/autonomous-foundation` contain unrelated work and were not reset or used as product-edit targets. This handoff records local work, not deployment or a live financial service. Read [the spec](../../specs/mobocom-pay/SPEC.md) and [Persian operation/API guide](../../MOBOCOM-PAY-FA.md).

Owner requested MoboComPay for external stores/services and Telegram bots, card-transfer incoming funds, detailed reports and fiat/crypto settlement. Clarifications: bank provider is not selected; incoming verification should be automatic through a replaceable connection; payouts require administrator approval. Initial rails are IRR/bank, TRX/TRON and USDT/TRON. The owner said other networks are needed but has not named them; no additional network is assumed enabled.

## Implemented ownership and behavior

- Billing owns the domain contract/policies in `src/modules/billing/domain/pay*.ts`, composed commands/read models behind `src/modules/billing/server/pay.ts`, HTTP delivery behind `server/http/pay.ts`, and six typed Pay models. Thin Next routes cover session `/api/pay`, bearer `/api/v1/pay`, admin `/api/admin/mobocom-pay`, signed `/api/payment/mobocom-pay/bank-events`, public `/pay/:id`, merchant `/dashboard/pay` and Admin `/admin/mobocom-pay`.
- The opt-in `src/plugins/mobocom-pay/manifest.json` adds `mobocom-pay.manage` and `mobocom-pay.settle`, Finance navigation, canonical section/maintenance registration and a module-filtered account link. Module off preserves rows and closes Pay; Core Wallet remains usable. Restricting the whole Pay section to groups also restricts guest checkout; machine access evaluates the authenticated canonical user's section access.
- Canonical User/standing/permissions, Public API hashed/revocable keys, Settings exact-value/history owner, strict Audit and Notifications inbox are reused. No new login, shared wallet, queue, general provider registry or Telegram client exists. Bearer endpoints do not accept cookie fallback. User/key/module/public API standing is checked again in financial transactions; merchant changes share a version fence with suspension.
- Enrollment starts PENDING. Another authorized administrator activates it. Active merchants manage terminals on the registered HTTPS return origin. Payment creation and settlement reservations bind request fingerprints to idempotency keys; external order IDs are unique per terminal. Return links are shown after persisted success only; integration fulfills after authenticated verification of ID/order/amount/status.
- Verification requires signed authoritative bank evidence and a trusted payment-specific `targetPaymentId`, exact bank account/IRR amount/reference and occurrence inside the payment window. A customer reference alone cannot assign a deposit. Unbound/mismatched events remain unmatched; either event/hint arrival order is supported. Replays cannot credit twice. Raw body is bounded to 8000 bytes and HMAC-authenticated with a 300-second timestamp window before consuming trusted feed quota. No arbitrary external URL is fetched.
- Verified net proceeds enter canonical Wallet via PAY_CREDIT, canonical Billing Payment journal via provider MOBOCOM_PAY (no top-up invoice/recovery), strict audit and the existing inbox in one transaction. Bank identifiers with Pay history cannot be overwritten; the existing delete action deactivates a used account rather than losing financial history.
- Wallet adds `withdrawableMinor` as an exact IRR subset, plus immutable delta/after provenance and a unique original-purchase reversal link on WalletTx. Every canonical movement locks the account before reading both balances. Ordinary credits do not become withdrawable; purchases consume ordinary funds first and then proceeds. Settlement PAY_RESERVE debits both once; rejected requests PAY_RELEASE both once. Failed/VOID checkout reversals restore exactly the original PURCHASE provenance, and the invoice closes before money is returned, preventing stale callbacks from consuming refunded credit.
- Five-minute settlement quotes snapshot IRR source/fee, manual exact rate, asset/network/decimals and output atoms. No market-rate fallback is invented. Administrator approval and recording an external transfer are separate state claims. No self-approval; bank reference/chain hash and duplicate-proof uniqueness are required. Marking PAID does not send or independently verify an external transfer. Approved-but-not-sent requests can be rejected by the API; an ambiguous sent transfer must be investigated before any reserve release.
- Reports expose exact gross/fee/net, daily trend, settlement state, destination/network/transfer proof and timestamps. Merchant lists are searchable, paginated and CSV-exportable under the same ownership; spreadsheet formula prefixes are neutralized. CSV caps at 1000 rows per export page; Admin overview currently caps at 200 merchants/settlements and 100 payments/events. This is not unlimited forensic reporting.
- Public checkout is noindex, no-referrer, private/no-store and excluded from the existing page-cache/analytics paths. Persian RTL and existing SDS/MoboCom tokens remain; protected public sections were not redesigned. Unslop by Damir Sokolovsky (CC-BY-4.0) guided spacing/hierarchy/visual passes; the requested [OpenDesign](https://github.com/nexu-io/open-design) brief and inspect/refine approach was consulted as a design reference. No OpenDesign application/daemon/account was installed or claimed connected.

## Migration and compatibility

`prisma/migrations/20270325120000_mobocom_pay/migration.sql` is additive and listed under `unreleased`. Both Prisma schemas match. Existing published migration hashes remain unchanged. The migration creates typed/FK/indexed Pay records, widens WalletTx types, enforces withdrawable subset/precision/state rules, immutable financial facts, valid settlement transitions and deferred bank/wallet/quote proof links. Foreign keys preserve financial references.

Legacy accounts/ledger default withdrawable provenance to zero. Telegram placeholder merging refuses source accounts carrying Pay ownership or positive withdrawable funds rather than silently dropping provenance. General Store merchandise refunds remain nonwithdrawable; only a linked full cancellation of a purchase reservation restores its original proceeds. Do not claim arbitrary/partial refund provenance is implemented.

## Executed local evidence

Checks ran against exact copied task source in an isolated Linux runtime, with private generated Prisma 5.22 client, UID1000 and no `.env`. The original `/app` source/dependencies and production database were not migrated. Docker/WSL restarted during initial preview attempts; private source/client/cache damage was detected, recopied and regenerated. A separate loopback-only task container reused the installed image and read-only dependency volume; bounded preview memory and disabling unrelated modules **on the owned fixture database only** stabilized browser validation. Early failed attempts are not counted as passing evidence.

| Scope | Actually executed result |
| --- | --- |
| Fresh PostgreSQL migration | All 208 migrations applied on owned empty test databases; native `scripts/run-pg-checks.cjs mobocom-pay` passed |
| Native financial scenarios | Both bank arrival orders; duplicate/conflicting events; unbound/attacker attribution; no hint-only credit; ownership; PENDING/module-off denial; exactly-once journal/credit/audit rollback; same-key replay/payload conflict; concurrent over-reservation; exact refund/rejection; self-review denial; IRR and TRX/USDT quotes/address/hash checks; immutable quote/ledger/amount/state; expired quote; bank identifier/deactivation preservation; full failed-invoice provenance and stale callback refusal |
| Populated upgrade | 207→208 on separate owned database preserved `1234567890123456` legacy IRR minor units/ledger exactly, set withdrawable fields to0 and allowed ordinary Core spending |
| Deliberate faults | Removing trusted target attribution, skipping invoice closure and accepting a bad HMAC each failed the checks in separate disposable source copies; production source retained. A redundant candidate-filter-only mutation initially survived because deferred DB proof already refused diversion; it was not reported as a detected fault |
| Unit/regression | 180 tests across connected/account-security, payments SMS/Mellat, returns/invoice, invoice rules/subject, navigation, pagecache and scale passed; added exact bigint/fee/rounding and exact-body/HMAC/quota tests run in existing test:site file |
| Static gates | Full private-runtime TypeScript, source/import syntax, architecture, security, audit, money primitive/schema/UI, schema parity and release manifest passed. Generated catalog check passed after staging the new catalog (7 generated outputs match the Git index) |
| HTTP contracts | Spectral6.17.1 OpenAPI lint:0 diagnostics; official SHA256-verified Hurl8.1.0:4 requests passed (create, query, replay, foreign owner404). No oasdiff or external consumer/Pact claim for these new paths |
| Current authority | Actual signed section-only manager/settlement staff showed correct independent permissions; private bank/config fields hidden from settlement-only staff; forbidden cross-permission and foreign-Origin writes returned403 |
| Real browser | PostgreSQL-backed checkout hint→pending→signed bank→PAID; merchant quote→reserved request; administrator approve→record external bank reference→persisted PAID; authenticated enrollment→PENDING, expandable record and CSV. 4 intermediate +11 member/checkout/enrollment +5 admin scopes returned axe0/overflow0 and no page errors at1440 light/dark and390 light/dark with reduced-motion. After final readable component extraction, the actual flow and19 scoped screenshots were rechecked:4 checkout/overview/quote,10 member/checkout/details/pending and5 Admin, all axe0/overflow0/page-errors0 |
| React Doctor | Scoped installed CLI with telemetry/supply-chain off: no errors; reviewed warnings for form preventDefault, controlled async/abort, complexity and repeated form JSX. Final scan over14 Pay component files:0 errors,8 reviewed warnings. No rule suppression or dependency/config baseline relaxation |
| Scoped security scans | Local Semgrep rule over12 financial source files:0 findings/errors (not a whole-program certification). Redacted Gitleaks over changed files found one unchanged public Base32/TOTP known-answer fixture in the preexisting account-security test; verified in base HEAD, no live secret and no suppression added. Do not report the scan as0 findings |

Raw receipts/screenshots/temporary tools: root ignored `.mobocom/pay-qa/`. Native runner is optional/disposable-only: `DATABASE_URL=<owned mobocom_pay_test_*> node scripts/run-pg-checks.cjs mobocom-pay`. Do not aim it at a live database. Canonical source is the maintained worktree; scratch source is not the continuation checkout.

## Remaining integration and safe continuation

1. Choose the actual bank provider and implement its adapter against the existing signed bank-event contract. Demonstrate that `targetPaymentId` comes from bank-attested payment-specific attribution, with real credentials held privately; verify feed replay/clock/availability on the Iran host. Environment variable presence alone is not a verified bank connection. Incoming remains off until this is proven.
2. Obtain the owner's additional USDT network names; add typed rails, address validation/precision, quote contracts and test evidence before enabling them. No private-key custody, automatic bank/chain payout, live FX feed or on-chain receipt verification is present.
3. Before launch, verify operator handling of late/unmatched bank rows, suspended merchants and ambiguous external payouts. Current UI has read-only bank investigation, not an override that credits unproven funds. Any richer reconciliation/manual correction must preserve immutable evidence and explicit financial claims.
4. No production build, live bank/Telegram/chain call, production migration, hosted workflow, PR, merge or deployment was performed for this request. Local implementation/fixtures do not establish provider/legal/production readiness.

Rollback after financial activity: disable incoming/module, keep the upgraded Wallet-compatible code and migration, preserve all history and investigate reserved transfers. An older Wallet binary does not maintain the new subset constraint. Forward-fix; no destructive down migration or automatic clearing of balances/reservations.

## Final local delivery record

Final private runtime matched54 product source/schema/migration SHA256 hashes. Full UID1000/no-env type/source/architecture/security/audit/money/schema/manifest checks,180 tests and the registered native PG runner passed after final extraction. Generated index check passed7 outputs, Spectral returned0 diagnostics, final Hurl4 passed and real section-only authority/Origin/module-off HTTP checks passed. Final browser source received19 clean scopes; the earlier full enrollment produced its own clean eleventh member scope. The source-only review has no outstanding high-confidence financial finding; provider limitations above remain.

The exact owned preview container52d4f922c3a6 and all three named mobocom_pay_test_20261123{,_native,_upgrade} databases were removed. The first private source/client/archives/session helper under original app /tmp were removed; /app/shared dependencies were preserved. Host fixture JWT/key files and the owned3417 tunnel were removed/stopped. Original app readiness and session returned200 inside its container. Windows forwarding on127.0.0.1:3000 initially returned UND_ERR_SOCKET after the earlier Docker/WSL restart. A read-only comparison verified3236 original source files and package/config/start-script bytes identical to the current mounted source; restarting that original local container restored Windows readiness/session both200, with existing data/seed preserved and no Pay code installed into it. Raw non-secret proof remains under ignored root .mobocom/pay-qa. No full build, live provider, PR, merge, hosted workflow or deployment.

Code delivery is local commit 321a1238; this final documentation record updates the completed cleanup/original-port recovery. Owner merges/deploys; branch remains local.

## Pay/Cloud layout and first-terminal repair — 2026-11-26

Owner rejects the narrow specialist frames, scrolling default menus and lifeless
Pay landing, and reports that every website terminal fails with the missing
business-website message. Authoritative checkout .mobocom/pay-cloud-ui, branch
fix/pay-cloud-ui-2026-11-26, base main 44a501be (after the immutable 1.7.23 release).
Existing unrelated/unmerged worktrees are preserved. This is a scoped repair,
not a new theme or provider integration; publication/deployment is not performed.

Implementation:
- MerchantShell and CloudShell fill the viewport with a 276px full-height side
  column and fluid content/header/footer. Remove both the outer 1600px cap and
  the overlooked 1440px Cloud root-div cap. Only the current menu group opens
  by default; existing explicit choices, accessible scrolling, active-link
  marking and native mobile/tablet modal/focus/resize behavior remain. Map SDS
  brand surfaces to MoboCom's approved accent, style nested appearance controls
  and prevent global Admin active-label colors leaking into the dark drawer.
- Pay homepage uses 32px desktop gutters, an asymmetric payment-request
  illustration explicitly labeled as a sample, readable service/process/FAQ
  compositions and restrained existing-theme materials. Settings, routes,
  public theme header/footer and gate/application states remain. Public Cloud
  and protected product pages are untouched. FRONTEND_QUALITY records the
  fluid specialist frame and 1920px/menu-height acceptance; canonical generated
  AI knowledge is refreshed, without a competing design system.
- Root cause of terminal failure: enrollment website is optional, while
  createTerminal required merchant.website before reading the entered returnUrl;
  the form offered no registration path. Active merchants now explicitly send
  initial website only for WEBSITE/BOT when their stored website is empty.
  The existing HTTPS/public-host and same-origin policy validates it. Refuse
  existing origin-dependent terminals or bot callbacks, claim empty website
  against status/version, increment/audit it and insert the terminal inside
  the same serializable transaction. Existing registered websites cannot be
  replaced through terminal creation. No fee, credit, payment or auto-confirmation
  ownership changes; no schema/dependency/version bump. The UI shows the initial
  field or registered-site guidance, with native labels/required/length bounds.
  The optional write-only website request field is documented in the existing
  v1/v2 TerminalCreate OpenAPI schema and MOBOCOM-PAY-FA guide.

Executed evidence (local Linux Node 22 / UID 1000 / no .env, two isolated PostgreSQL
databases owned by a NOSUPERUSER role):
- npm run check passed twice; final run 96s: 1166 site /53 connected-source /4
  backup /14 billing plus configured architecture/source/schema/security/contract/
  type gates. The final browser-only CSS corrections do not change those APIs.
- node scripts/run-pg-checks.cjs pay-assets pay-merchant-account cloud-workspace
  passed in 13s. pay-assets now covers empty initial website, inactive/foreign
  access, invalid HTTP/IP/mismatched callback with unchanged stored data, first
  successful registration and rejection of later replacement. Both databases
  deployed all 222 migrations from empty. No new production migration is required.
- Actual Chromium/Playwright: 12 main views (Pay merchant, Cloud, public Pay at
  390/1440 in both themes), plus 17 wide 1920/mobile 320/tablet 768/1024 and themed
  application/restricted views. Axe and horizontal-overflow checks pass across
  these scopes. Desktop content is measured at viewport minus 276px; landing
  gutters are measured at 32px. Default nav fits 900px viewport, native drawers
  pass Escape, focus restoration, body-scroll and desktop-resize checks.
  Cloud capacity comes from an owned synthetic active service with automation off.
- The actual terminal form first rejects a foreign callback without saving the
  website, then returns 201 and persists exactly one initial website/terminal;
  a subsequent different-domain request returns 409 with no replacement/extra
  terminal. Screenshots and redacted receipts remain ignored in var/pay-cloud-ui.
- React Doctor on page.tsx, terminals.tsx and both navigation components, files
  scope, no telemetry/supply-chain, blocking error: 0 errors, 4 reviewed warnings
  in the existing terminal form (complexity, deliberate JSON onSubmit and two
  custom Field-wrapper label false positives). Actual getByLabel and axe pass;
  no suppression or framework/form-system replacement was introduced.
- Scoped Semgrep: 0 findings/errors; redacted Gitleaks: 0 findings.

Initial runs exposed landing-number and active-drawer contrast, and a Cloud
inner width cap; each was fixed and affected/final browser scopes rerun. The
preview's 4GB dev compiler restarted, so only its own heap was raised to 6GB.
The original private hostname could not be reached by this browser while local
TLS worked; verification uses isolated HTTPS localhost:3161. Harness assumptions
about a numeric child, a section instead of Cloud's div, JSON envelope and a
strict text locator were corrected; final persistence assertions remain.

Cleanup completed: only the verified owned preview/tunnel stopped; both owned
databases, role, runtime, temporary source archives and synthetic session/TLS
files removed. Shared app3000 returns HTTP 200; other worktrees, DBs, keys and
released 1.7.23 assets remain unchanged. No hosted workflow, live payment/provider
call, production build, new release or destination deployment is claimed.
Rollback is the scoped UI/API change revert; no financial/data purge is needed.

Review delivery: [PR496](https://github.com/WebNetData/MoboComCMS/pull/496)
targets main and remains open for owner review. Implementation commit 9857fad8;
9763a43a preserves unrelated historical ledger/map formatting. Subsequent delivery
record changes are documentation only. No merge or destination update was performed.
## Multi-card SMS confirmation — 2026-11-28

Automatic transfer allows saving a gateway with no fixed account. Select the
receiving accounts in Pay settings and register a verified SMS source for
each destination. A gateway with a legacy fixed account keeps using that
account until switched to the pool. Each quote fixes its destination and
globally unique amount. Ready accounts take priority. The merchant flow can
still accept a receipt for manual review.

The SMS parser recognizes the Bank Melli credit marker «انتقالی:» and the
earlier spelling. A general account requires the configured account number
and an account capture in the credit template. In a multi-account pool, a
source needs to identify its account. A wrong or ambiguous account is rejected.
An automatic merchant credit still requires a receipt.

The additive `20270418180000_pay_sms_account_pool` migration updates the
source binding guard. Parser unit tests, the PostgreSQL collection and
shared-checkout checks, and the Edge settings and template flow passed.
The connected fixture covered two general accounts at Bank Melli, routing,
wrong account, receipt requirement and replayed SMS. The existing
`pay-routing-operations` fixture also failed at its delivery status assertion
on untouched `main`. No live bank SMS was sent.

## Payment follow-up and period closing — 2026-11-28

- The Admin reconciliation desk filters accepted quotes awaiting a receipt,
  receipts awaiting a configured SMS source and cases for manual review. A
  validated early SMS can appear as an unlinked candidate. Receipt decisions
  use the existing single-posting path.
- Admin and merchant reports show contractual net amounts and reconcile
  posted credit against completed settlements in the date range, per source
  currency. The result describes period movement. The merchant terminal
  filter scopes payments and the daily CSV. Wallet settlements are
  merchant-level.
- Connected checks cover receipt-before-SMS, SMS-before-receipt, manual
  receipt and replay, terminal filtering and settlement totals. Edge verified
  the staff queue and report, mobile merchant report, terminal selection,
  CSV downloads and scoped accessibility.

## Permanent payment engineering gates — 2026-11-28

Worktree `.mobocom/pay-reliability-engineering`, branch
`chore/pay-reliability-engineering`, base `b1c09c39` on `main`.
The owner made [Pay Reliability](../../../.agents/skills/mobocom-pay-reliability/SKILL.md)
mandatory for direct and indirect payment changes and paired it with Premium
Design for affected payment UI. Both client copies contain the same skill and
regression reference. [Engineering gates](../ENGINEERING_SKILLS.md#payment-quality-gates)
are the source of test commands and delivery rules.

The existing connected runner now exposes all 16 registered Pay regressions
through `npm run test:pay`. It refuses missing, malformed or non-disposable
database URLs before spawning a check. The separate `pay-center-upgrade`
check seeds historical users through old columns and compares all applied
migration names against the current migration directories. Its historical
settlements, quotes and wallet invariants remain asserted. This slice changes
test infrastructure and project policy only.

Executed locally: a full migration and all 16 connected Pay checks on
PostgreSQL 17.11 as a non-superuser, the historical upgrade on a second empty
database, all 67 scoped unit cases in Linux, and architecture, source,
schema, migration-manifest, money and security gates. The original upgrade
fixture used an old migration count and attempted to read the newer
`User.loginPolicy` while seeding. The corrected fixture passed.
Guard tests rejected three invalid database inputs without echoing them.
The Codex app-server reported both skills enabled in repository scope.
Both entrypoints passed the skill validator and both reference files matched
their mirrors. Independent diff review found no blocking issue.

The manual Checks workflow provisions two separate owned databases and fails
when either Pay step fails. YAML routing and offline zizmor passed. The
hosted workflow was not dispatched. The owned synthetic databases and roles
were removed after verification. Payment PR evidence and independent
approval remain review controls. This tooling change required no browser
run, real funds, provider request or production change. Revert this policy
and test-infrastructure commit to roll back. There is no application schema
or financial data rollback.

## Terminal receiving accounts and merchant workspace — 2026-11-28

Worktree `.mobocom/pay-reliability-engineering`, branch
`fix/pay-account-lifecycle-and-workspace`, base `c50f9392` (Pay engineering
gates over `b1c09c39`). The owner requested safe removal with SMS verification,
a configurable receiving card per terminal, a wide merchant ticket surface,
complete account identity and a redesigned Pay home.

Billing's account DELETE previously retried an FK rejection when a verified
SMS source had the only reference. The handler now locks and evaluates the
account before making a claim. Actionable payment or review obligations block
removal. Verified SMS and automatic histories cause an archive in place and
disable the attached sources. Old ordinary accounts with history retain
reversible deactivation. The admin list omits archived accounts and reports the
actual removal action. A receipt still marked pending on an already-paid
invoice remains historical evidence. It no longer blocks archival.

Admin → Pay → Merchants → terminal now offers a destination-card selector.
The writer validates the existing Pay permission, request Origin, merchant
and terminal scope, version and effective gateway policy. Card options require
the existing SMS intake and verified source to be ready. The Admin projection
contains only the last four card digits. Billing snapshots the explicit
destination on a payment before checkout. Archived terminal selections stay
visible as unavailable until reassigned or cleared. Already issued quotes and
ledger rows keep their destination. The additive migration
`20270418190000_pay_terminal_receiving_account` adds archive status, both
nullable relations and the PostgreSQL payment snapshot immutability guard.
No production migration was run.

The Pay landing has a payment preview, capability and onboarding sections
and the primary merchant-dashboard action. The ticket workspace uses the
existing shared ticket API with Pay-specific wide layout and mobile treatment.
The sidebar and drawer wrap the full email next to the profile identity. The
site PWA invitation retains its public behavior and stays clear of merchant
workspace routes. Admin form operations and the landing follow the existing
SDS tokens and focus behavior.

Evidence: PostgreSQL 17 isolated non-superuser tests reproduced the original
400 and exercise concurrent removal, missing Origin/permission denial, policy
scoping, immutable destination, pending retention, automatic single credit,
and archival after settlement. All 17 connected Pay checks passed. The populated
historical settlement upgrade passed and all migrations deployed from empty.
Linux `npm run check` passed with 1171 site, 53 connected source, 4 backup
and 14 billing tests. Final TypeScript, security, schema and release-manifest
checks also passed. The final Linux `npm run build:postgres` completed and
passed the runtime trace check. Local Edge
with an isolated application and actual APIs saved and reloaded assignment
and account deletion. Edge and axe checked public CTA, new Pay
home, merchant identity and ticket interaction across seven desktop, tablet
and phone/theme combinations, including drawer Escape, active email hit
target, native FAQ keyboard action and public/merchant PWA boundary.
The application page returned 200. React Doctor had no blocking errors.
Scoped Opengrep and redacted Gitleaks returned no findings. An independent
review drove the immutability and policy changes and verified their final
source and archive behavior. Screenshots remain local in
`var/pay-lifecycle-browser`.
The synthetic PostgreSQL databases, role and preview session files were removed.

During release, apply the registered migration before upgrading the app.
To roll back the app use its previous build, keeping the additive columns
and constraints and the financial records. Keep assignment configured only
where the receiving bank and the existing SMS source are operational. Local
evidence uses synthetic accounts and SMS. A real bank or production rollout
was outside this slice.
