# Personal Chat agent reliability — 2026-11-08

Continue the existing AI Production/Media/editor owners and
[handoff envelope](../../specs/chat-web-production/AGENT_HANDOFF.md).
Published1.7.12 remains immutable. Bridge0.6.6/production-v4 retains older protocol
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

## Confirmation deadline and clean slugs — 0.6.5

Operator0.6.4 reported the exact click-confirmation timeout. Matching current nonce,
complete JSON/end marker and a visible assistant were present later; worker stayed
dispatched at root with readOnlyRecovery=false. The package installed in the local
download folder matched the supplied0.6.4 sources, so an obsolete file was not assumed.
Controlled `modern-late-root` reproduced that exact error in0.6.4: both thread URL
assignment and user hydration arrived after the confirmation stage's20-second cap.
The0.6.4 recovery condition only covered an already-assigned thread.

Bridge0.6.5 waits for the already-dispatched message within the original operation
deadline; it does not increase the step deadline, create a new lease or send again.
The local confirmed bit is set after worker acknowledgement, and explicit sanitized
route-failure metadata carries only enum/boolean validation facts. The same actual
unpacked extension scenario passed one text/four sequential images in one chat with
exactly five sends, plus interrupted-dispatch recovery with one send. Real-account
first-attempt0.6.5 confirmation remains pending; do not claim controlled DOM is live
account proof.

AI Production's save used to append12 characters from every item UUID. It now keeps
the output slug verbatim when free, chooses -2/-3 only on actual collisions and
retries a slug-specific unique conflict within20 candidates. Canonical Journal,
Catalog and Site creation/history plus the atomic item receipt are retained.
Existing stored URLs are unchanged. No migration or automatic old-URL rewrite.
The focused `ai-production-slug.connected.cjs` (registered in the PostgreSQL runner)
passed actual PostgreSQL post/product/page saves, true collisions and repeated-save
idempotency. Only owned test data was removed. Scoped native TypeScript7.0.2 passed.
No inference, real account session, global settings or published content was used
by that check. The user needs the web change deployed for the new slug behavior;
the standalone bridge can be upgraded independently on existing1.7.12.

## Image variants and transfer budget — 2026-11-09, 0.6.6

Operator0.6.5 reached generated images, then reported raw `signal timed out` and
the exact multiple-images refusal, even after choosing one alternative. The old
unpacked extension reproduced the multiple-images error. The operator explicitly
chose automatic first variant when no preference exists. A read-only report could
not locate the live timeout stage because the operator had closed that request.

The new image-choice helper is scoped to the current nonce-owned response, observes
explicit image/preference clicks and semantic selected flags, otherwise chooses
the first candidate in DOM order. It never clicks Chat preference controls itself.
Multiple variants are not an error. A different explicit preference cancels only
the old bitmap transfer and reads the chosen visible asset; choosing the same asset
does not interrupt it. Selection remains private in the owned operation state.
Diagnostics export only candidate counts and selection/transfer enums, no image IDs
or signed URLs. Existing images and prompts from other operations remain excluded.

The visible-asset reader's15-second signal covered the response body too, whose
timeout escaped as a raw browser exception. VM execution of the prior committed
source reproduced that exact raw error during a slow body read. The corrected reader
uses the original operation deadline (no new lease or step extension), classifies
header/body timeouts, retains the generated asset and respects the original normal
CORS, redirect-host, MIME, byte and pixel bounds. No paid/inference endpoint or
session/cookie export. A separate server upload/registration timeout has not been
certified as fixed; the next live receipt distinguishes that from a browser read.

Actual unpacked0.6.6 controlled cases passed default-first, semantic second-choice
and explicit click plus cancelled-delivery recovery. Delivered bitmap pixels were
checked against the selected alternative. Each item still used one text/four image
prompts in one conversation (five sends); cover recovery did not generate again.
Focused regressions also cover same-image/no-abort, changed-image/abort, unrelated
clicks, body budget/timeout classification and existing CORS/size guards. No new
PostgreSQL/TypeScript/public UI behavior in this slice; earlier native evidence is
retained, not described as newly rerun. Real-account0.6.6 completion remains pending.
