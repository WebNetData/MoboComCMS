# External merchant bot activation and dedicated egress

Owner2026-11-26: the supplied custom-payment protocol belongs to another
merchant's Telegram bot, not MoboCom's Telegram integration. Continue merged
PR492/mainc9355792 in `.mobocom/pay-bot-readiness`. No release or deploy requested.

Existing Billing Pay already issues terminal-scoped creation keys, converts
Toman exactly, returns URL/links, snapshots the merchant panel's `/api/payment`
and distinct payment Token, and queues one delivery after canonical settlement.
SMS/Bale/manual approval, fee/net accounting and recovery retain their owners.
Read-only audit must distinguish live commissioning from implemented checks.

The concrete slice extends the existing Server Panel/Xray purpose registry with
`pay_callbacks`, controlled only by existing unlocked Server Panel guards. It
routes third-party HTTPS payment confirmations, not the merchant's Telegram Bot
API and not all site traffic. The existing `telegram` purpose stays unchanged.
The root builder gets version4 and a dedicated loopback HTTP CONNECT inlet10810
for this explicit purpose. Payment callback transport still validates/pins public
DNS, connects to that public IP:443, checks TLS against the original hostname,
keeps Token encrypted through TLS, refuses redirects/oversized replies, and never
silently falls back to direct transport if the selected proxy fails. A separate
inlet inside the same Xray service avoids an arbitrary-host exception on the
existing static domain-restricted inlet10809. Root rules refuse private/reserved
addresses; app authority remains exact registered merchant callback URL.

Server settings for financial egress are read fresh/strictly; DB failure or corrupt
configuration cannot silently choose direct traffic. Missing purpose means direct
for backwards compatibility. Existing root builders can keep old routes, but
cannot apply this new purpose until the installed helper is upgraded.

Merchant guide labels three different secrets/locations explicitly: our creation
endpoint/key goes into their bot settings; their panel endpoint/payment Token
goes into our integration form. No bot token is requested. A generic connectivity
test is not an acknowledged payment or production certification. Unknown external
acknowledgement retains UNKNOWN/review rather than retrying a possibly applied
financial action. Safe pre-dispatch failures may be retried only if no POST could
have left the process; no guessed duplicate-success patterns.

The pending `20270410120000_pay_bot_boolean_ack` constraint migration admits explicit JSON_STATUS_TRUE in existing
integration/delivery acknowledgement fields; no row rewrite, new money state or
dependency. A BOT terminal may configure its hosted panel on another public origin;
WEBSITE retains its registered-origin constraint. No success shape is inferred
from the public unauthenticated403 response. SMS/Bale accepted credit evidence and
the existing Operations pay.transfer-match recovery job commit in one transaction;
inline matching remains immediate. Recovery invokes the same current-authority
matcher and never weakens locked-rate USDT evidence/time requirements.
Reuse current queue/audit/identity,
module-off and merchant-current-authority guards. UI stays scoped SDS/MoboCom,
RTL/mobile/theme/accessibility with Unslop copy/hierarchy pass. Acceptance uses
existing social-proxy/pay-bot units, real TLS-through-CONNECT test, root builder
configuration validation, native PostgreSQL payment/delivery/manual/SMS/Bale races
and fee separation, then actual Admin/merchant browser checks. No real bank payment,
bot fulfillment, credential entry or proxy-server change without operational data.
Rollback removes the new route selection before reverting the root helper; all
financial history and unknown delivery records remain retained for review.

## Integrated reliability audit — 2026-11-26

Continue the existing implementation from `7e6b1ae9` on merged PR496/main
`595fa493` in `.mobocom/pay-reliability`, branch `fix/pay-reliability-2026-11-26`.
The unpublished ACK migration is moved after the already-shipped Cloud migration;
all released SQL/hashes and the approved wide Pay/Cloud presentation stay intact.

Acceptance for this repair:
- Generic Admin invoice settlement cannot bypass an automatic transfer quote.
  Refuse it atomically with the invoice claim and direct staff to existing receipt/
  transfer review; qualified manual/SMS/Bale paths still settle once. Principal,
  platform adjustment and merchant net/Wallet credit remain distinct.
- Bot creation and callback execution require a fresh, fail-closed section-access
  read. A stale cached grant or storage failure cannot authorize a new payment or
  irreversible callback.
- Both direct and selected-proxy callbacks verify pinned public TLS before any
  HTTP POST exists. Proven pre-send failure uses the existing bounded safe retry;
  a lost reply after a possible POST remains UNKNOWN and never automatically replays.
- Run relevant native Pay/Wallet/invoice suites on owned nonroot PostgreSQL,
  including original SMS bank samples, manual/auto races, expiry/review and recovery.
  Exercise actual TLS/refusal/certificate/redirect/uncertainty locally, one fault
  control for each new critical guard, and current Admin/merchant browser states.
  Audit file parity/routing of project Claude/Codex skills without claiming a
  second architecture or actual client execution from file presence.

Local tests do not commission a real personal Bale account, bank sender/filter,
SMS phone, merchant ACK shape, root Xray helper or production queue. No live
financial POST, provider action, release, deployment or hosted workflow is requested.
