# Member Cloud continuation — 2026-11-09

Continues Claude's five commits on `feat/member-cloud-2026-11-09` from main
`5189e9f1`. Existing Account/ShellNav, Hosting catalogue/service/domain APIs,
Checkout and Livechat remain the owners. No schema, dependency, payment,
provisioning driver or permission changes.

Members get a dedicated MoboCom Cloud menu with overview, creation, servers,
hosting, domains and the existing all-services address. The wizard composes the
existing catalogue/order/domain controls, supports Iran/foreign locations and
Admin datacenter suggestions; maintenance includes `/dashboard/cloud`.
Existing service/domain detail addresses and dashboard checkout remain intact.

Continuation fixes:
- Server layout checks the existing module and session before rendering Cloud.
  Creation retains canonical section/group access; owned-service APIs retain
  current account ownership independently of catalogue purchase eligibility.
- Domain read failures are errors with explicit retry, never an empty list.
  Family lists fetch only their required API; cancelled views abort their reads.
- Native radios provide RTL keyboard selection. Invalid datacenter parameters
  return to available locations; the domain wizard has two actual steps. A
  minimum across potentially different currencies is no longer advertised.
- Shared submenu controls reference unique panels. Mobile menu consumes Escape
  while closing and returns focus; its native stop-loading action is prevented.
- Chat close SVGs stay centered. Full-screen mobile uses dynamic viewport height
  and safe-area padding, hides the redundant floating close, traps keyboard focus,
  closes with Escape and restores the launcher. Unsent text survives closing.
- Existing accent-ink tokens fix the observed light-theme plan-count contrast.
  Chat header/launcher foregrounds follow the same contrasting semantic tokens;
  measured header contrast is5.22:1 light and8.77:1 dark, including both gradient
  endpoints. Header metadata no longer reduces that contrast with opacity.

Executed evidence: affected TypeScript using the installed TypeScript7 CLI;
architecture and source checks; React Doctor0 errors (12 reviewed warnings on
the initial five components;6 existing AccountShell warnings reviewed separately).
Actual signed-in
PostgreSQL-backed browser exercised menu toggle/current entry, owned lists,
controlled domain503/retry, datacenter filtering/invalid URL recovery, RTL radios,
domain steps, cross-customer404 and guest login/API401. Eight1440/390 light/dark
wizard/chat captures passed scoped WCAG2A/AA/2.1AA axe with no horizontal overflow
or page errors. Actual mouse/Escape/mobile focus cycling and unsent-text retention
passed. The real light-theme contrast failure was fixed before completing views.
The final chat color adjustment received four additional scoped axe/contrast
checks; successful functional cases were not repeated. Two owned customers,
two pending manual services and four products were removed after verification;
settings, real orders and existing services were untouched. Fourteen live source
hashes matched the working tree and original readiness/session endpoints returned200.
Harness waits were corrected for exact asynchronous filter state and native RTL
arrow direction; only incomplete cases were resumed. Receipts: ignored
`.mobocom/member-cloud`. No full suite, release build, hosted workflow, real AI,
payment or provider operation was needed for this continuation.

Graphify query/refresh refused a stale out-of-corpus `CredentialPools.tsx` entry;
no fresh graph claim. Source/architecture gates and inspected owner boundaries
provide this slice's structural evidence. Existing provider delivery and payment
behavior were not retested. Rollback only these presentation changes; preserve
existing member services, orders, module settings and URLs.
