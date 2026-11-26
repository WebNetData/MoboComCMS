# Cloud automatic operations — 2026-11-26

Owner authorizes WHM provisioning/lifecycle, Joker register/renew, an Admin
operations center and Proxmox/Hetzner creation/power control. Continue deaac03e
in .mobocom/cloud-operations, feat/cloud-operations-2026-11-26. New corrected
WHM credentials passed verified TLS/API1 version/listpkgs (33 packages), read-only.
No real paid/domain/resource mutation is part of automated acceptance.

Hosting owns durable operation history, not a second queue. Canonical Operations
BackgroundJob executes closed hosting.operation intents. Freeze encrypted
provider connection, immutable resource identity, generated credential, contact/
nameserver/price limit and expected local state before dispatch. One active
operation per resource; exact version/status/lease claims. RUNNING interruption
becomes UNKNOWN, only read-only reconciliation may follow; unknown writes never
automatically repeat. Confirmed asynchronous stages persist before next dispatch.
Current provider/module/user authority is checked before writes. Changing provider
identity/credentials blocks old operation rather than reusing stale authority.

Paid creation/registration validates order+invoice ownership/payment. Activation
and expiry changes occur only on confirmed provider completion. Unknown domain
registration fences staff cancel/refund/complete and duplicate renewal. Existing
manual rows remain compatible. Legacy test drivers retain their boundary; new
drivers do not use unsafe old provision retry behavior. Ordinary nic.ir stays
manual. Joker contacts belong to the customer, never default to the merchant.
Renew uses target expiration year and result reconciliation, never blind periods.

Explicit provider autoOperations=false default; typed Admin settings include
WHM accepted package, compute template/image/location and dedicated VM range,
Joker max-price/currency/allowed basic TLDs/nameservers. No arbitrary JSON/code.
Secret configuration is encrypted; public/Admin/member projections exclude it.
Admin hosting.manage + strict rate/Origin owns dispatch/reconcile; owner-only
customer power actions are closed and confirm destructive state. Public Cloud
visuals and canonical billing/wallet/identity/queue remain unchanged.

Acceptance: fresh migration, populated preservation, nonroot PostgreSQL races/
claims/atomic enqueue/manual fences/module-off/no repeat, protocol fixtures,
types/scoped gates, full canonical check, Doctor and themed responsive browser/
axe with safe synthetic providers. Live read-only WHM success is distinct from
mocked provider creation and real canary commissioning. Retain history on rollback,
disable automation before reverting code. Owner merges/deploys; no hosted workflow.
