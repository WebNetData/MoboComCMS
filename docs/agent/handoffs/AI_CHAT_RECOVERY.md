Current continuation: [bridge0.6.3 reliability](AI_CHAT_AGENT_RELIABILITY.md) supersedes the0.5 transport limitations below; historical evidence stays dated.

# Chat production recovery — 2026-11-08

Continue AI Production/Standard/Economy owners. Reported1.7.11 complete text was
lost because extraction read only the first markdown node, excluding the separate
completion marker. Reproduced with the actual unpacked0.4 extension and controlled
Chat DOM: one submitted prompt, complete answer, no CMS delivery. No real account
was opened or certified.

Bridge0.5/production-v3 reads the whole new assistant turn and persists one bounded
operation receipt before delivery. Same-origin/panel/provider/prompt/operation/tab
binding, explicit20-minute expiry and owned-path checks restrict recovery. Explicit
retry reads completed/sent work instead of resending. Matching own prefill is reused;
unrelated text is preserved. Fresh-chat retry is a separate, visibly labelled action
that may repeat usage. The cache is temporary, not cross-browser durable storage;
closing the owned tabs/browser loses recovery, and old0.4 history is not imported.

Each item keeps one owned conversation. Cover and inline images are distinct
sequential prompts in that conversation; only new assistant-turn images qualify.
Canvas/CORS and image availability remain external limitations. No hidden endpoint,
cookie/token extraction, account/limit bypass or paid fallback. Existing canonical
server version/actor/lease validation, Media and reviewed draft save are unchanged.
No migration, dependency, shared queue, protected public UI or release artifact change.

Evidence in .mobocom/ai-chat-recovery: actual unpacked extension passed six controlled
cases (lost-result recovery with one send, changed-prompt refusal, same-chat cover and
inline/old-image exclusion, prefill protection, second-item isolation and draft refusal).
The real Admin UI on existing mobocom-app additionally completed two items through
text+cover+inline to REVIEW using a controlled production API, actual extension and
synthetic Admin authenticated against the existing PostgreSQL. Four1440/390 light/dark
views passed scoped axe/no-overflow; screenshots inspected. Readiness confirmed the
database ready. This is not native model generation or a new transactional-save proof.

Worker contract regression covers foreign origin/tab/frame, phase mismatch, prompt
binding, lost delivery/cache reuse, unrelated navigation, expiry and cancellation.
The manual reproducible browser harness is scripts/chat-web-recovery.browser.cjs;
it uses only controlled DOM and a disposable profile. It is not automatic CI.
React Doctor:0 errors,8 reviewed warnings (existing time formatting/expiry display,
immutable preview section index and deliberate async lifecycle/error handling).
Scoped Semgrep/Gitleaks:0 findings. No full release build, hosted workflow or VPS deploy.

Harness corrections: extension URL origin was null in Node URL handling; corrected
to its host. Controlled Persian HTML required explicit UTF-8. One integrated attempt
timed out; the subsequent completed run is the evidence above. These failed attempts
are not counted as successful checks. Unique profiles prevent stale cached workers.

Rollout requires both web code and extension0.5: replace the unpacked files, Reload
the same extension in chrome://extensions/edge://extensions, reconnect the site and
reload Admin. Replacing files alone is insufficient. Stop the current batch first.
Use recovery for new0.5 requests; choose fresh explicitly when abandoning uncertainty.
Rollback: stop production, restore prior web/extension code or select configured API;
existing drafts, images and batch data remain. Owner merges/deploys. Published1.7.11
stays immutable. Operator instructions: ../../CHAT-WEB-BRIDGE-FA.md.

Closure: scoped four-file TypeScript passed; worker regression also passed on Linux
as UID1000 with an empty environment. Architecture/source and canonical knowledge
checks passed. Host source check lacked typescript-api; the existing container's
installed dependency supplied the successful check. Mixed document line endings
were corrected before diff review. All13 ZIP entries equal reviewed source and the
public download returned those exact bytes, HTTP200. Synthetic users/cookies and
task-owned browser profiles were removed; original app/session/database remain ready.
