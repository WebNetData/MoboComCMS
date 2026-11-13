CRM engagement2026-11-07: continue [the scoped CRM handoff](CRM_ENGAGEMENT.md) for birthday/offers/winback. It adds a closed configuration within Automation and reuses the canonical notification queue/providers; the generic Automation rule executor remains unchanged apart from retaining idempotency-bearing processed event receipts. No second queue, identity, discount engine or real campaign activation.

# Form builder, held work and platform safety — continue existing work

## Repair invoice at the counter — 2026-11-13

Branch `feat/repair-invoice-2026-11-13` from main `898a0a6f`. A repair is invoiced through the Store counter sale (parts from stock, staff-priced work and bought-in parts) and linked by `FormSubmission.repairOrderId`; a step marked `invoice` hands the device back only with that invoice paid (or a manager's recorded reason). Decision and owners: PLATFORM_DECISIONS «Repair invoice at the counter». Check: `scripts/repair-invoice.connected.cjs` (registered in `run-pg-checks.cjs`). `forms-counter.connected.cjs` now mocks `moduleGuard` (it failed on main since the in-store module's guard). `store-counter.connected.cjs` still fails on main: its register has no stock location (pre-existing, untouched).

## Repair counter continuation — 2026-11-12

Reviewed release1.7.18/main `1cd2406e`, continuing Claude's merged PR445. Current correction is `.mobocom/repair-counter-audit`, branch `fix/repair-counter-audit-2026-11-12`. The [1.7.16–1.7.18 reconciliation](../audits/2026-11-12-release-1.7.16-1.7.18.md) indexes the releases across the existing owners and records their historical verification limits.

### Implemented correction

- `src/app/admin/forms/page.tsx` exposes «ثبت حضوری» in the header, including the all-forms queue and handler-only accounts. A saved selected free form links directly to its intake. A handler following `?form=<id>&tab=inbox` retains that form's context. The existing unsaved builder confirmation applies to the new link.
- `src/app/admin/services/page.tsx` exposes the same action on each unpaid form service. `Inbox.tsx` delegates entry to the persistent header.
- `src/app/admin/forms/counter/page.tsx` reads the existing authorized form list, offers a labelled native picker, includes saved drafts, excludes paid forms and reports loading/empty/failure/retry states. Switching forms remounts answers. The saved panel receives focus and scrolls into view. Configured customer/shop receipts and «مشتری بعدی» use the existing submission DTO.
- `src/components/site/PublicForm.tsx` omits the public challenge widget and readiness gate in staff-counter mode. The previous disabled condition could hold the staff submit button indefinitely. The public mode keeps its challenge gate.
- `scripts/forms-counter.connected.cjs`, registered in `scripts/run-pg-checks.cjs`, exercises actual Forms routes/owners against namespaced PostgreSQL fixtures, with real canonical permission checks and an external SMS double. `scripts/forms.test.cjs` includes the staff/public readiness regression.

The owner remains Forms (`domain/forms.ts`, `server/counter.ts`, `server/paid.ts`, existing Site HTTP adapters). Existing `cms.pages`/`forms.handle`, per-form handlers, held work, encrypted secrets, pickup codes and audited shop receipts remain the contracts. This correction needs no schema or API change. Sealed migration `20270310120000_form_work_receipts` belongs to1.7.18.

### Executed evidence

- Existing app container, isolated `/tmp/mobocom-repair-counter-20261112`, no `.env`, Linux UID1000, Node22 and installed Next16.4.6/React19.3.1. A fresh owned PostgreSQL database deployed all191 migrations. The application under test used a separate port, database and private generated Prisma client.
- `node --test scripts/forms.test.cjs` passed29 tests. `node scripts/forms-counter.connected.cjs` passed draft intake, manager/assigned-handler access, forbidden-handler/section/guest denials, paid/invalid refusal, sealed PIN persistence, private customer/token receipts, shop projection and audit. An isolated removal of the POST scope guard failed with200 versus403 as intended. The guard was restored and the check passed again.
- TypeScript (`node node_modules/typescript/bin/tsc --noEmit`), `check-architecture.mjs`, `check-source.mjs` (2780 TS/TSX files), `check-security.mjs`, schema parity and `release-migrations.cjs` passed. The manifest reports20 releases and0 unreleased migrations. All43 commits referenced in the reconciliation were confirmed as ancestors of the reviewed main, and its literal source paths exist.
- Actual Playwright Chromium completed12 scenarios and8 scoped axe scans with0 violations and no horizontal overflow, at1440 and390 in both themes. Covered keyboard entry from the queue, permitted-form selection, cleared answers after switching, deep links from a selected form and Services, paid/foreign form denial, actual403 mutations, failed load/retry/empty list and dirty-builder cancellation. A real counter POST persisted a sealed PIN and opened both customer/shop receipts, with A5 PDFs. Next-customer reset passed. Public mode stayed disabled when its challenge request failed. Saved-result focus/scroll was checked. Page errors were0 in the tested views.
- React Doctor0.9.17 ran with `--scope files --no-telemetry --no-supply-chain --blocking error` over the five affected React files, with0 errors and21 reviewed warnings. Existing Inbox/PublicForm effect, complexity and lookup findings remain. The counter's post-await state is protected by abort checks, and HTTP status is checked before applying the parsed body.

Local receipts are ignored under `.mobocom/repair-counter-qa/` in the root checkout. The browser runner was adjusted for Next's default localhost development Origin and scoped selectors for its route announcer/footer. These runner changes preserved the product checks.

Final normalized hashes matched all eight affected source/test files between the checkout and the tested Linux copy. The owned test server, database, source, browser sessions and loopback tunnel were removed after verification. The original application's readiness endpoint returned200 afterward.

### Limits and rollback

The integrated1.7.16–1.7.18 suites and a fresh production build were outside this follow-up's executed scope. Real SMS, physical printing, destination-server update and live external providers remain unverified. The existing real-provider limits in release handoffs still apply. Owner merges and deploys.

Rollback reverts the five UI files and associated test/documentation correction. Existing forms, submissions, secrets and receipts retain their data. The earlier repair migration remains sealed and additive.

2026-10-30 continuation: existing Form handler/privacy permissions remain; work edits now claim original assignee/stage/payment and edited reply/read/status values. A deterministic concurrent-take PG test and actual specialist/colleague browser isolation passed. Store specialists extend the existing Order owner with the same held-work principle. [Exact implementation, evidence, migrations and rollback](EDITOR_GROUPS_EXPERTS.md). Do not create another work queue or permission resolver.

This is the handoff for the form builder, the rule that work somebody holds is theirs, and the safety review of October 2026. Another agent continues from here; the files named below are the owners. Nothing here is a claim that a feature is finished for production: each section says what ran and what did not.

## Owner requirements (2026-10-13 … 14)

1. A Gravity-Forms-class form builder that the whole site can use: paid orders (a typed foreign amount priced through the rate API, details, payment, a member of staff doing the work) and any other form (interview, appointment, résumé).
2. Modern, tidy screens — nothing confusing; the desk where staff handle requests must be orderly.
3. **A member of staff per kind of work** ("pay a foreign site", "Telegram Premium"), who takes the work themselves.
4. **Nobody steps into the work of a colleague of the same standing** — staff, operator, author or manager.
5. The SMS panel must not send needless messages (no provider key is set yet).
6. Robots, spam, brute force and floods are kept out; the platform is checked against being broken into.
7. Everything is written into the architecture and the skills so another agent can test and continue.

## Historical implementation branches

| Pull request | Branch | Holds |
| --- | --- | --- |
| #170 | `feat/store-order-inputs` | Products that ask the buyer for information; a typed foreign amount on a product; staff open a ticket to a customer |
| #171 | `feat/form-builder-pro` | Paid forms, work stages, secrets, themes, `forms.handle` |
| #172 | `feat/form-builder-advanced` | Persian date, appointments with capacity, repeating rows, signature, quiz, conditional messages, webhooks, conversational layout, per-form handlers |
| next | `feat/forms-desk-security` | The desk, the work queue, held work (forms and tickets), SMS ceiling, per-account sign-in limit, this handoff |

These October branches were stacked. Repair work is now merged through release1.7.18 at main `1cd2406e`. Continue the current correction in `.mobocom/repair-counter-audit` on `fix/repair-counter-audit-2026-11-12`. The [release reconciliation](../audits/2026-11-12-release-1.7.16-1.7.18.md) identifies the newer implementation. The root and older worktrees retain separate owner work.

Specs: `docs/specs/store-order-inputs/SPEC.md`, `docs/specs/form-builder/SPEC.md`. Decisions: `docs/agent/PLATFORM_DECISIONS.md` §6L–6O.

## Owners (extend these; do not build beside them)

| Concern | Owner |
| --- | --- |
| Field kinds, conditions, steps, validation, the bill, themes | `src/modules/forms/domain/forms.ts` (pure, no imports) |
| Merge tags, conditional messages, quiz points, statistics, open days | `src/modules/forms/domain/advanced.ts` (pure) |
| Forms, submit, inbox, CSV, uploads | `src/modules/forms/server/service.ts` |
| The bill at today's rate, payment through checkout, secrets, stages, held work, "my requests" | `src/modules/forms/server/paid.ts` |
| Appointments (`FormBooking`), notifications, webhooks, statistics, staff corrections, per-form handlers | `src/modules/forms/server/advanced.ts` |
| Public form | `src/components/site/PublicForm.tsx`, `FormFieldsPro.tsx`; styles `src/app/formbuilder.css` then `src/app/forms-pro.css` |
| Admin | `src/app/admin/forms/` — `page.tsx` (forms, queue), `Builder.tsx`, `SettingsPanel.tsx`, `ProPanels.tsx`, `AdvancedPanels.tsx`, `Inbox.tsx` (the desk) |
| Sender's page | `src/components/site/MyRequests.tsx` → `/dashboard/requests` |
| Checkout kind `form` | `src/modules/checkout/server/checkout.ts` (`formSubmissionId`), `src/modules/fulfillment/server/jobs.ts` (`FORM_PAID`) |
| Work steps, device lock, counter entry, receipts (2026-11-12) | domain `forms.ts` (`normalizeWorkflow`, `readDeviceLock`, `Receipt`), `server/paid.ts` (`workOnSubmission` pickup and receipt, `tellSender`), `server/counter.ts`, `components/forms/DeviceLockInput.tsx`, `ReceiptSheet.tsx`, admin `WorkPanels.tsx`, `counter/`, `receipt/[id]/`, public `/receipt/[token]` |
| Tickets held by somebody | `src/modules/support/server/department-access.ts` (`heldByAnother`) |

## Invoices (admin)

`/admin/invoices` is the desk (list, panel, create, recurring, closing rules); owners `src/app/admin/invoices/`, `src/modules/billing/domain/invoice-rules.ts` (pure), `src/modules/billing/server/invoice-rules.ts` (stamp, close, issue, the `invoice-rules` job). Spec `docs/specs/invoice-desk/SPEC.md`.

## Services (admin)

`/admin/services` lists what the site performs for a customer: forms whose settings say `service: true`, and virtual products with `Product.isService`. Each card shows the work waiting and links to where it is done (the form's desk, the store's orders). Owner: `src/modules/site/server/http/admin/services/route.ts`, page `src/app/admin/services/page.tsx`. It is a view over the two owners — it stores nothing of its own. Ran in a browser (9 checks, `pw-services.cjs`).

## Automation

Rules "when … if … then …" at `/admin/automation` (permission `automation.manage`). Spec `docs/specs/automation/SPEC.md`, decision §6R.

| Concern | Owner |
| --- | --- |
| Triggers, actions, checks on a rule, tags, ready-made rules | `src/modules/automation/domain/automation.ts` (pure) |
| Queue, scans, schedules, actions, runs, preview | `src/modules/automation/server/engine.ts` (`processAutomation` runs each minute from the `automation` job in `src/modules/notifications/server/jobs-scheduler.ts`) |
| Admin API / page | `src/modules/automation/server/http/admin.ts`, `src/app/admin/automation/page.tsx`, `src/app/automation.css` |
| Events announced | register route (`user.registered`), `announcePaidOrder` in billing (`order.paid`), forms service (`form.submitted`, `form.paid`), customer ticket route (`ticket.opened`) |

To add a trigger: add it to `TRIGGERS` with its facts, announce it from its owner (or add a scan in `subjectsFor`), add a test. To add an action: `ACTIONS`, its checks in `checkAction`, its work in `runAction` — through the owner of what it changes.

Ran: `scripts/automation.test.cjs` (10), `pw-automation.cjs` (17, with the real scheduler). Not run: e-mail and SMS actions against a real provider, a webhook to a real endpoint, the scans for abandoned carts, expiring subscriptions, inactive users and low stock against real data, the weekly report, two servers claiming the same event.

## A lesson from October 2026 — core permissions

Adding the core permission `forms.handle` made every general manager whose role was stored as the old full list lose the extension permissions (games, music, cinema, software). `src/modules/identity/rbac.ts` now keeps `CORE_ADDED_LATER`: **a new core permission must be added to that list**, or the same thing happens again. A unit test in `scripts/account-security.test.cjs` holds it.

## Rules that must keep holding

- **The bill is the server's**: priced on the page (`/api/forms/<slug>/quote`), on submit and again at checkout. The margin of a foreign amount, the value of a hidden field and quiz points never go to the browser (`publicForm`).
- **A paid form** needs a signed-in sender; only they pay it, once; no discount code; staff do not start before payment.
- **A password typed into a form or an order** is encrypted apart, masked everywhere, read by an audited action, erased a week after the work ends.
- **A turn is never overbooked**: unique key (form, field, turn, seat) taken in the answer's transaction; freed on rejection, deletion, or a bill unpaid for a day.
- **Held work** (decision 6O): an answer or a ticket that somebody holds can be read by colleagues who may open that form or department, and changed only by its holder or by a manager — `cms.pages` for forms, `tickets.departments.manage` for tickets. Anybody may take what nobody holds; only a manager hands work to somebody else. A colleague may still leave an internal note on a ticket.
- **A form is given only to people who can open its answers**: the list offered (`formStaff`) holds active admin-area accounts with `forms.handle` or `cms.pages`; saving a form or handing over work refuses anybody else and names them; a handler who lost the permission is pointed out on the form's settings.
- **A form may name its handlers**; then only they and form builders see its answers, attachments and queue, and only they are told of new work.
- **Permissions**: `cms.pages` builds forms and manages their work; `forms.handle` works on answers. One permission per section stays the rule.

## What ran

- Isolated runtime: `npm run check`, 109 connected PostgreSQL checks, `npm run build` — see each pull request for the commit they ran on.
- Browser, local preview: `pw-forms.cjs` (38: paid flow), `pw-forms2.cjs` (38: advanced fields and layouts), `pw-forms3.cjs` (24: handlers, held work, the desk on desktop and phone), `pw-tickets.cjs` (8: a held ticket through the API) — scripts live in the ignored `.mobocom/claude-tools/`; they need a local admin session, a customer session and two operators who hold only `forms.handle`.
- Unit: `scripts/forms.test.cjs`, `scripts/store-v2.test.cjs`.

## What did not run (test these next)

1. A production build's page payload for a form with a foreign-amount field (development mode sends server debug values, so the local page proves nothing either way).
2. A real outgoing webhook and notification e-mail; two visitors taking the last seat of a turn at the same instant.
3. Paying a form from the wallet and through gateways other than card-to-card.
4. The seven-day erasure of secrets and the one-day release of unpaid turns against a database.
5. The ticket holder rule in the ticket desk's own screen (it ran through the API with two agents of one department — 8 checks in `pw-tickets.cjs` — but the desk does not yet show a "held by a colleague" notice or hide the reply box).
6. The SMS ceiling against a real provider (no key is configured).
7. The Telegram purchase path for products that ask for information.

## Safety review — what was looked at, found and changed

Looked at (code review and local requests only; **no attack tool was run against any server**, and none should be run against production — use a staging copy, with the owner's go-ahead):

| Area | State found | Changed |
| --- | --- | --- |
| Sign-in guessing | Strict (atomic, Redis-backed) limits per address and per address+account; Turnstile hook | Added a limit on the account itself (30 / 15 min), so a guess spread over many addresses still stops |
| Codes by SMS | 60 s between codes, 5 per number and 15 per address an hour, 5 wrong tries burn a code, single use, hashed | — |
| Password reset, 2-step, register, password change | Strict limits present | — |
| Form spam | Honeypot, link heuristic, per-address and per-day limits, upload sniffing (PDF and images only), private storage | Quote and turns endpoints rate-limited |
| Cross-site requests | Mutations must come from this origin (`mutationOrigin` in `src/proxy.ts`) | — |
| Headers | CSP with a nonce, `nosniff`, frame options, HSTS in production | — |
| Outgoing requests chosen by staff | Rate source checked against private addresses | Webhooks: https only, private ranges refused after DNS, no redirects, timeout |
| Secrets at rest | Panel and delivery credentials encrypted (AES-256-GCM) | Buyer and sender secrets use the same cipher; reads audited |
| Access between staff | Department and section permissions | Held work for forms and tickets; per-form handlers; attachments follow the form |
| SMS | Sends only when configured; alerts only to verified, opted-in numbers | Ceiling per number per day and no duplicate within ten minutes for automatic alerts |

Not covered by the application, by design — do these at the edge:

- **Floods (DDoS)**: the per-route limits slow abuse of one feature; they do not absorb a flood. Put the site behind a CDN/WAF with rate limiting and connection limits at the reverse proxy. A global in-app limiter was deliberately not added: `clientIp` trusts the right-most `x-forwarded-for` entry, and behind two proxies every visitor would share one address and be throttled together. Fix the proxy chain first, then consider it.
- **A scan with real tools** (the owner pointed at a collection of offensive tools): run a web scanner, a TLS check and a dependency audit against a **staging copy**, never production, and feed findings back here. `npm audit` and the release checks in `mobocom-release` are the in-repo part.

Known limits to keep in mind: a webhook's address is resolved before the request (a DNS answer that changes between the two is not caught — pin the address if that matters); a webhook is tried once and not logged per delivery; drafts live in one browser.

## Not built

Name and address field groups; attachment kinds beyond PDF and images; a resume link across devices; retries and a delivery log for webhooks; resizing by dragging on the canvas; reminders and deadlines for staff; a funnel of where visitors stop. Store order holders are implemented in the [editor/groups/experts continuation](EDITOR_GROUPS_EXPERTS.md), extended by the specialist delivery work in1.7.18. Content follows its section permissions and authorship.
