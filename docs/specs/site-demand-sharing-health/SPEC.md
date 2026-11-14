# Requests, shared carts and link health — 2026-11-14

Owner approved all three journeys. Continue `.mobocom/platform-integration` on
`feat/site-requests-shared-cart-link-health-2026-11-14`, fresh main `cbb469f5`
(merged PR470). Existing source wins; preserve other worktrees and protected UI.

| Flow | Owner / contract |
| --- | --- |
| Request a product/content | Support owns grouped demand and private per-user participation, separate from conversational Tickets. A visitor can open an inline, section-aware CTA; sign-in is needed to submit/track. Exact normalized titles offer an explicit join, never fuzzy automatic merging. Existing section manager permission decides reviewing/declined/fulfilled with revision claim, strict Audit and a typed actual public target. Forum uses the canonical global moderator guard; category moderation grants no site-wide scope. Fulfillment sends deduplicated in-account Inbox through Jobs, with no email/SMS/push. Target module/access/current availability is rechecked; hidden targets are never exposed. |
| Shared cart | Store snapshots only public physical product/variant/quantity selections. Never share the Cart token, user identity, encrypted buyer answers, special amount or private customer price. High-entropy capability, hashed in storage, expires and can be revoked through the source cart owner. Public preview reports current eligibility; recipient explicitly selects quantities and current price/stock review. One atomic canonical-cart addition, exact quantity caps and same-request replay prevent double imports. Staff may import the reviewed public combination into the existing quotation draft, with explicit customer selection. No reservations/payment/pricing engine. |
| Link health | Downloads extends the existing remote guard/manual probe, existing LinkReport repair queue and canonical Operations Jobs/scheduler. Staff configure an explicit host allowlist, interval and bounded batch; default off. HEAD first, guarded/pinned DNS on every redirect, bounded timeout, no downloaded body; bounded range fallback is cancelled at headers. Persist current source fingerprint, lease, last check/success/status/failures and next due time. Edited/disabled/off-module sources cannot receive stale results. Repeated failures produce one existing report, never automatic deletion/disable. Track audio and HQ use the same health inventory and link to the Music editor. |

UI direction: useful service desk, restrained and exact; current Persian type,
SDS/MoboCom semantic colors and section identity. A short section-specific CTA
near section discovery and empty search; one action, no invented availability
promise. Responsive native form/dialog, explicit labels/error/retry/success,
keyboard focus and reduced motion. No whole-page redesign or new UI library.

Root owns schema, migration, navigation/section integration, runtime, Git and
shared records. All three light workers hit usage limits during read-only audit;
root continues implementation and preserves the request audit source evidence.
No production provider calls, hosted dispatch, PR, merge or deploy in this task.

Acceptance: fresh PostgreSQL, no .env, UID1000; current/foreign/module-off/stale/
duplicate/rollback and bounded network synthetic cases; deliberate critical
guard fault with byte-for-byte restore. Scoped types/source/architecture/schema/
manifest/security/Audit/money checks; actual themed desktop/mobile browser flows,
axe/overflow/screenshots. Keep exact source hashes before cleanup. Additive data
rollback retains histories/shares/health; no reset of old orders or identities.
