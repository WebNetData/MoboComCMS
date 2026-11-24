## Routing, operations and confirmed platform repairs — 2026-11-24

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
