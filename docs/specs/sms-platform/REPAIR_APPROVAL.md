# Repair consent, delivery promise and customer history — 2026-11-15

Owner-authorized continuation of merged PR476, main fa2bd2af, in the existing SMS
checkout on feat/repair-approval-timeline-2026-11-15. Forms owns repair estimates,
deadline and business history; Store remains the invoice/payment/stock owner.

Current receipt/tracking, held-work/handler guards, OTP and Operations are reused.
No new identity, security-audit system, queue or provider. Staff with cms.pages or
forms.handle plus current form/held-work authority may publish an immutable IRT
estimate and customer-visible due date; publishing a replacement supersedes the
previous snapshot without erasing any prior decision. Revision claims serialize
stage/estimate/contact/deadline edits. A live estimate blocks repair-progress stage
changes until approved; legacy no-estimate work stays operable. OPEN, REJECTED,
QUOTED and pure intake are the bounded preapproval exceptions; take->IN_PROGRESS
and arbitrary custom stages cannot bypass. No manager bypass of customer consent.

Receipt code stays read-only. A current matching transaction phone proves approval
or refusal through exact submission/estimate/decision-bound OTP. Shared challenge
preparation checks current eligibility in its transaction, delivery follows commit.
Consume and conditional decision claim commit together; wrong attempts also commit.
No login, user creation, verified-phone change or marketing consent. A new quote,
changed phone, rotated receipt, expired quote or spent code denies the old action.

Only minimal current quote, due date and typed public stage/reply/quote/decision/
deadline business events are projected. No private answers, PIN, handover/receipt
tokens, staff identity or internal note. Historical events begin at adoption; old
created/received timestamps remain factual, no synthesized stage chronology.
Canonical strict audit records staff writes; anonymous OTP decisions use the
immutable Forms business receipt and never impersonate a User for audit.

Additive schema defaults preserve old records. Estimate state/amount/currency and
decision metadata have DB constraints; estimates block ordinary hard deletion of
their submissions/forms (archive instead). Existing explicit Forms deletion governs
non-financial timelines. Migration is manifest-registered and checked populated.

API: existing tracking POST gains request-decision-code/decide-estimate; protected
GET/PATCH /api/admin/forms/repair expose typed current work and revisioned changes.
Origin, bounded body, strict secret limits, HumanCheck and generic issuance remain.
Admin drafts survive conflicts; public approval explicitly identifies amount and
decision before code request. Existing scoped SDS/RTL/light/dark controls are used.

Acceptance: connected PostgreSQL/non-root/no.env, receipt/phone/role/holder denials,
immutable amounts, replacement/expiry/purpose separation, committed wrong attempts,
concurrent one-shot decision, stage/custom/take gates, accurate ordered public
history, deletion retention and audit rollback. Detect removed critical guard in
isolation. Types/source/architecture/security/audit/schema/manifest; actual3000
Admin/customer desktop/mobile light/dark browser/a11y and Doctor. Provider recording
only; no real customer SMS or production rollout. Source rollback retains additive
records; do not revert to code that can silently bypass pending consent.
