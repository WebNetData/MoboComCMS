# Opening basics — 2026-11-14

Owner selected essentials for opening the site, not the preserved advanced
backlog. Continue `.mobocom/platform-integration` and existing Catalog, Store,
Billing, Shipping, Forms, Identity and Notifications owners. The earlier
platform integration commits and uncommitted proposal notes stay preserved.

## Focused inventory and acceptance

| Essential | Existing evidence/owner | Current work |
| --- | --- | --- |
| Product and variants | Catalog create/update/revisions, product editor, shared location stock | Verify real first-item persistence/public selection and existing native content-management; fix verified blockers only. |
| Customer purchase | Existing Identity, Cart/Checkout/Billing and shipping quote/address | Retain canonical sessions, idempotent checkout and claim/settlement; verify a real synthetic purchase through existing acceptance. No real bank call. |
| Order and delivery | Store order scope, invoice, Shipping shipment/tracking, Returns | Reuse current flow; affected native scripts and owner/foreign browser checks. |
| Physical sale | In-store plugin, own register/location, Store tenders and receipt | Surface location read failure and prevent opening with unavailable location state. Existing stale counter native fixture must use real register/stock location setup. |
| Repair basics | Forms intake/held work, repair invoice, Store parts/work lines and handover | Verify existing native owner path, no new repair system or future feature. |
| Setup and operations | Existing Admin gateways/carriers, staff roles, support, backup | Gateway initial failures currently appear as an empty list; network writes can throw or remain busy. Shipping failures have no retry and numeric input drops Persian digits. Fix bounded failure/retry/pending states and preserve explicit saves. Existing backup proof stays scoped; live restore/provider/printer remain operator evidence. |

No migration, dependency, credentials, financial-state model or new Admin
dashboard. Preserve approved visuals/URLs and exact resource permissions.
Gateway/carrier changes remain explicit authorized writes under current guards
and Origin policy; a connection failure is not success. Form data survives a
failed write. Disable duplicate UI actions while one request is pending, and
abort/ignore stale reads on unmount. No auto-test of a real payment provider.
Gateway default changes and the insert/update commit together. The form's
initial minimum amount is explicitly0, accepted by the canonical money parser.

Validate against a fresh isolated PostgreSQL database as UID1000 without `.env`,
affected meaningful native owners and types/gates. Actual browser covers setup
load/save failures/retry and location-bound register opening,1440 light/dark
and390 with scoped axe. Existing connected counter/repair/refund owners verify
those money paths; prior customer-purchase browser evidence is attributed
separately, not described as rerun in this slice.
Use controlled synthetic fixtures/provider doubles only. Existing historical
tests are attributed, not counted as reruns. Record exact outcomes and remaining
operator requirements in the handoff. Rollback removes these bounded UI fixes
while retaining every product, stock/money/repair row and prior configuration.
