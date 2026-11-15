# Repair receipt tracking and purpose templates — 2026-11-15

Continue3fba96c9 in the current SMS worktree/container3000. The owner requests
status by a printed receipt code or OTP, customizable OTP text and ready repair,
service and sale messages. Extend Forms/SMS/Identity and their existing settings;
there is no new identity, token table, queue or migration.

Paper: derive a status-only80-bit code from the existing random receiptToken,
fixed ASCII version prefix and canonical submission id. Print it separately
from the six-digit handover secret; constant-time comparison and strict limits
protect lookup. Existing QR receipts remain; old paper numbers can use OTP.

OTP: number plus the first current normalized transaction mobile/tel, exact
REPAIR:id purpose, shared hashed OtpCode/expiry/attempt/consumption. Generic send
responses across matches/misses and provider states, no account creation or
verified-mobile change. Commit wrong-attempt increments inside the transaction;
check current phone and receipt state before granting the minimal one-response
view. No persistent tracking login or bearer token in browser storage/URL.

Only receipt-enabled service work with a valid current receipt token and no
SPAM status qualifies. The DTO contains number, bounded title/current label,
created/received dates, customer-facing reply and label-only workflow steps.
Never return answers, device lock, pickup/receipt tokens, staff, private flags,
secret settings or financial documents. No historical timestamps are invented.
Explicit Origin, bounded POST, HumanCheck and strict IP/receipt/contact limits
apply before matching. Responses are private/no-store; no credential query URL.

SMS settings retain legacy global OTP text/pattern/param as fallback. Closed
login/verify/reset/counter/repair overrides are independently editable, previewed
with synthetic values and saved through the same revision/audit/crypto owner.
Ready texts apply to drafts only. Actual approved pattern contents remain in
IPPanel; replacing a local free-text preset does not rewrite a provider pattern.

Acceptance: connected PostgreSQL/UID1000/no.env with recorded provider, wrong
and rotated paper code, pickup-code rejection, restricted records, changed phone,
generic send shape, purpose separation, five committed failures and concurrent
single consume, minimal DTO, no identity effects, template persistence/fallback/
unknown-variable validation. Detect an isolated guard removal. Scoped units,
types/source/architecture/security/audit and actual3000 desktop/mobile light/dark
browser/a11y for both methods, SMS presets and print. No real customer SMS or
production deployment. Rollback source preserves data and existing receipt QR.
