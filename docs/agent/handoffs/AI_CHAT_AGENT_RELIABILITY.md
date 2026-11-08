# Personal Chat agent reliability — 2026-11-08

Continue the existing AI Production/Media/editor owners and
[handoff envelope](../../specs/chat-web-production/AGENT_HANDOFF.md).
Published1.7.12 remains immutable. Bridge0.6.4/production-v4 retains older protocol
advertisements for the installed1.7.12 client; no migration/dependency/paid fallback.

The operator's0.6.2 diagnostic identified visible user bubbles with
`data-user-message-bubble`, indexed text with `data-search-result-target`, and zero
legacy role/article nodes. Add-on Shadow roots were not the conversation's cause.
The reader now recognizes the observed structure and anchors response regions after
the exact nonce-bearing user message. Sidebar titles, navigation, editors and other
user messages cannot prove ownership. Legacy/semantic/open-shadow layouts remain
supported; a scoped plain JSON/image fallback handles unindexed response parts.

Dispatch is persisted before the click, then confirmed against the actual user
message through root-to-thread hydration. Interrupted dispatched operations resume
read-only; uncertain sends are not replayed. Whole-turn extraction accepts a unique
complete production JSON even if the optional end marker is absent. Each selected
picture gets its own sequential prompt in the same owned item conversation, with
explicit image instruction/tool selection and a new completed bitmap. Visible assets
may be reread only with normal CORS, allowed HTTPS origins, bounded bytes/pixels and
validated MIME/redirect destination. Session/cookies stay in the browser.

Popup diagnostics are explicit/read-only: counts, masked paths and attribute names,
not prompts, responses, account fields, request IDs or signed media URLs. The Admin
connection control shows the actual bridge version. Existing server actor, version,
lease, category, Media decoding and atomic reviewed-draft guards are unchanged.

Executed evidence is ignored under `.mobocom/chat-agent-reliability`:

- Actual unpacked extension reproduced delayed hydration and display:contents
  failures, then passed missing/split marker, stale streaming, virtualized/reloaded,
  semantic, open-shadow, observed modern and unindexed modern layouts. Each completed
  scenario used one text plus four separate images in one conversation; interrupted
  dispatch recovered with one send. These are controlled Chat DOM cases.
- Real Admin UI and native Production API on the existing app/PostgreSQL completed
  create/start/claim/text/four Media writes/review/save. Canonical blocks/history,
  DRAFT, cover+three inline Media and the atomic receipt were inspected in the DB.
  AI settings were unchanged; only owned fixture rows/media/actor were removed.
  Chat DOM and image CDN were controlled, not the production API or database.
- Four1440/390 light/dark connection views passed scoped axe/no overflow; inspected
  desktop-dark/mobile-light screenshots preserve the current design. React Doctor
  reported0 errors and5 reviewed warnings. Source/architecture and scoped host
  TypeScript5.9.3 and installed native TypeScript7.0.2 passed. Final three
  worker/JSON/image regressions passed on Linux UID1000 with an empty environment; they cover binding, uncertain
  dispatch, limits and CORS policy. No broad suite, new container or hosted CI.

Initial native attempts exposed a malformed helper-generated JSX wrapper and a
fixture script quoting error; both were corrected before successful evidence.
Default Windows scanner initialization failed on its certificate store; this was
not a security finding. Scoped elevated scans subsequently passed. A redirected
asset browser fixture did not complete; direct CDN CORS was browser-verified and
redirect rejection is unit-covered. Do not describe those failed attempts as passes.

Operator0.6.3 follow-up: a fresh production returned text and requested images after
manual recovery, but initially reported a conversation-change error. This verifies
real-account delivery with recovery, not a clean first attempt. Bridge0.6.4 adds one
automatic read-only recovery of an already-dispatched execution during root-to-thread
confirmation failure, within the original deadline. It neither sends again nor binds
an unverified path; a second failure remains explicit. No silent infinite retry.
The focused `modern-late` browser case delays user hydration beyond the first20-second
confirmation window and requires text+four images with exactly five sends. Reproduce
with `node scripts/chat-web-agent.browser.cjs modern-late`; controlled DOM is still
distinct from real-account first-attempt proof, which remains pending.
Do not promise unlimited usage or claim this controlled evidence certifies external
UI/accounts. Runtime deadlines and account limits remain explicit.

Install by replacing the same unpacked extension's files, Reload, reconnect and
refresh Admin. New download files must match source byte-for-byte. Rollback: stop
production and restore prior web/bridge code; saved drafts/media/batches are kept.
Owner merges/deploys. No new release/tag, production deployment or hosted workflow.
