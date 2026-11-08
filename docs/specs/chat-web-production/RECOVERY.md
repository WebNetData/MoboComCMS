# Personal chat result recovery and sequential illustrations

Owner: modules/ai production and deploy/chat-web-bridge. Continue existing batch,
lease, media, actor and draft contracts; no migration/shared queue/provider fallback.
Reported1.7.11: complete JSON+marker remains in Chat while CMS times out; retry
encounters its own filled composer; no illustrations follow a lost text completion.

Confirmed source gaps: first markdown-only extraction loses separate marker blocks;
background chat timers and short text deadline; result deletion before delivery;
fresh-tab-per-image prevents an owned per-item conversation. Browser DOM host is
unavailable, so live account compatibility must not be claimed from screenshots.

Bridge0.5/protocol production-v3 adds bounded per-item conversation+operation keys.
Session cache is bound to approved CMS origin/panel, provider, owned tab, prompt hash
and operation. One latest bounded result, expiry and explicit reset; no history scan,
cookie/session export, hidden endpoints, CAPTCHA/account/limit bypass or paid fallback.
Retry recovers matching completed/sent work without blind resend. A matching own
prefill may continue; unrelated text is preserved. Uncertain sent work can be read
only; explicit fresh-generation control discards only that owned conversation.

Text reads the full new assistant turn, accepts its exact completion marker before
toolbar/fence text, and retains a delivered result until the CMS has persisted it.
Chat is active/visible during DOM automation. Text deadline stays below the existing
12-minute server lease. Canonical server authorization/version/lease remain final.

Each selected cover/inline image is a distinct sequential request in the same owned
ChatGPT conversation for that item. Only new assistant-turn bitmaps count; previous
images and unrelated conversations cannot satisfy a step. CORS remains enforced;
an unreadable image is reported explicitly, never fabricated or imported by hidden API.

Accept: reproduce split-markdown loss; one text+cover+inline across two items with
actual unpacked extension and controlled Chat DOM; response recovery/no duplicate send,
matching vs unrelated prefill, origin/tab/prompt/path fences, old-image exclusion and
stop/late-result behavior. Scoped types/security and relevant native production guards;
no full release build or automatic CI. Preserve immutable published1.7.11. Rollback:
stop batches, restore previous code/extension; drafts/media/data are kept.
