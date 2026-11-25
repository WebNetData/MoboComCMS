# Public Pay and complete account administration

Owner2026-11-26, continuation of806b8ed0 in `.mobocom/pay-account-domains`.
Existing Pay public enrollment closure and empty-only user deletion are superseded
by this explicit request. No production deletion, merge or deployment is requested.

## Existing owners and outcome

Pay's layout currently renders MerchantShell before MerchantEntry denies access.
Gate the shell server-side, preserving ACTIVE dashboard, checkout capabilities,
canonical identity and module/maintenance guards. `/pay` becomes a public product
home; `/pay/apply` submits an authenticated existing user's typed PENDING merchant
request through Billing. Only Admin activates. Existing site menus and module
settings control public navigation/text/request availability; no second form engine.
Use existing MoboCom/SDS tokens, deliberate financial flow visual, restrained
functional motion, reduced-motion, Persian RTL, desktop/mobile, light/dark.

Identity already owns users.manage, staff-guard, credential providers, sign-in
ways, OTP and session revocation. Extend its Admin customer detail with explicit
phone/email/name edits, administrative phone-verification acknowledgement,
new/generated password, per-user five-method login policy and session revocation.
Existing passwords/secrets never leave the server. Each sensitive action requires
current permission/staff hierarchy, exact revision, note, bounded body/Origin,
strict rate limiting and same-transaction audit; ambiguity/collision fails409.
New additive User loginPolicy and sessionsRevokedAt preserve defaults and distinguish
session revocation from proof that a known password was set. All providers and
current session guards enforce policy; self lockout is refused.

Deletion uses an explicit full-data preview/confirmation distinct from compatible
empty-only deletion. Lead audits User FK ownership and immutable money triggers
before implementation. An account's personal/domain data must not silently delete
another user's identity, credit, shared catalogue or financial counterpart record.
Preview counts, exact target/revision, full Admin authority, transaction rollback,
current guard, strict audit and constrained purge scope are acceptance requirements.
No deletion of real user data occurs during development.

Owner choice: personal data is erased; shared financial records remain anonymous.
Identity keeps a terminal, banned reference row with random non-deliverable email,
no credentials/contact/profile and erasedAt. It cannot sign in, be reactivated or
receive new owned rows/rebindings. This is not physical deletion of shared ledger
rows. Billing removes private order answers/receipt/settlement destinations and
merchant credentials (including delivery snapshots), preserving states, exact
amounts, payload hashes, payment links and other customers' balances. Forms retain
work/financial links with empty customer answers/secrets; stale PII restoration is
refused by the database. Existing published catalogue/provenance remains.

File deletion follows a committed, exact-name manifest via existing Operations:
linked profile, ticket, receipt, form, business proof, return and private delivery
files; symlinks are refused and shared references survive. Failure retains the
manifest for retry and returns cleanup QUEUED, rather than pretending the database
transaction failed after it committed. Historical unlinked/orphan files, backups,
external provider resources and environment-provisioned Bale connector credentials
require existing operator retention/decommissioning; no live send/cancellation.

Additive migrations219–221 are unreleased and must accompany their writers. Last
stable1.7.22 assets/seals remain unchanged. Restore an erased identity only from a
coherent pre-erasure database/file backup; code rollback cannot restore its data.

## Evidence and acceptance

Graph absent; source/Serena evidence is authoritative. Reuse installed dependencies
and existing workstate/handoffs. New migrations join the release manifest and both
schemas; fresh/nonroot PostgreSQL verifies identity, permission revocation, contact
ambiguity, old sessions/OTP, policy through actual providers, audit rollback,
concurrent/stale writes, PENDING-only requests, target-only purge and related money
invariants. Existing Pay/account/money regression suites must pass. Browser proves
no private shell for guest/denied/pending, ACTIVE access, application submission,
editable public text/menu, real account controls, destructive preview/confirmation,
1440/390 themes, keyboard/reduced-motion/axe and no overflow. React Doctor and
scoped security/source/architecture checks complement actual behavior.
Owner merges/deploys; no provider sends, live deletion or hosted workflows.
