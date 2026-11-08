

## Low-cost routes and personal web chat (0.6)

The Admin economy policy references your existing authorized connections. OpenRouter
uses only `openrouter/free`; Ollama verifies installed, non-remote models through
`/api/tags` (5-minute metadata cache). OmniRoute uses your configured endpoint
(default `http://localhost:20128/v1`) and key from its Endpoints screen. Before
adding it to economy mode, disable paid fallbacks upstream and confirm that policy
in MoboCom. MoboCom cannot independently guarantee gateway pricing. Configure a
provider in the site default, an explicit purpose route or its existing key pool;
source priority is site default, first explicit purpose, then enabled pool. For a
keyless local connection, configure an explicit purpose route. A configured local
model `auto` selects the first verified local model. No model is downloaded.

Choose the explicit economy provider for each desired purpose or production batch;
existing personal/Codex and ordinary API choices are unchanged. Policy/source changes
invalidate old economy batches: create a new batch. Health derives from actual
responses, not fabricated probes; metadata refresh is demand-driven, not a background
cron. Auth/quota/rate rejections can advance to the next authorized source. Network
uncertainty, partial output, cancellation, content refusal and 5xx stop without replay.

Bridge 0.4 adds explicit text-chat choices for Gemini, Qwen and DeepSeek, alongside
ChatGPT. Upgrade the same unpacked extension, review its new service host permissions,
reconnect and reload Admin. Images remain ChatGPT-only. Log in personally in the same
browser profile. Sessions/cookies are never exported. Fresh-page DOM adapters are
best effort: changed UI, login challenges and quotas fail closed and reveal the tab.
Real account compatibility is operator-verified, not guaranteed by controlled tests.
Web chat quotas still apply; no account rotation or limit bypass is included.

A gateway on the host is not Docker localhost. Use a reachable trusted host address
and protect the endpoint/key; do not expose a local model unauthenticated publicly.
No additional container or gateway installation is performed by this change.

Bridge0.5 adds production-v3: full assistant-turn text extraction, a bounded
20-minute session receipt, explicit same-operation recovery and one owned ChatGPT
conversation per item. Cover and inline images are separate sequential requests;
only new assistant-turn images count. Canvas/CORS restrictions remain. Upgrade the
same unpacked extension, click Reload in the browser extension manager, reconnect
and reload Admin. Replacing files alone may leave the old service worker active.
Recovery is restricted to the same panel tab, origin, provider, prompt and operation;
it never scans arbitrary history. Closing the owned tabs/browser can lose recovery.
Explicit fresh-chat retry may repeat generation. Real-account behavior remains
operator verification; controlled browser tests do not certify external interfaces.

Bridge0.6/production-v4 persists uncertain dispatch before clicking, confirms the
exact user marker after asynchronous navigation/hydration and resumes owned reloads
without resending. Owned complete production JSON may omit its completion marker;
canonical server validation still applies. Responses use user/turn order and include
assistant image-tool cards outside their text node. Each picture selects an explicit
available image control and gets its own request in the same conversation. Visible
image bytes may be re-read under normal CORS with strict bounds; no hidden inference
endpoint or account cookie export. Popup diagnostics contain only version, phase,
counts and image origins; no raw content, account data or signed asset URLs. Account
compatibility remains operator verification. Reload/reconnect the same extension.

Patch0.6.1 handles boxless visible role containers and semantic conversation labels.
Diagnostic schema2 distinguishes raw role nodes from rendered turns and reports
redacted route/layout/control structure without conversation IDs or content. An
unconfirmed-navigation error may be reported without trusting that path or accepting
response data; text/images still require an acknowledged owned user turn.

Patch0.6.2 traverses open shadow roots and assigned slots in composed document order.
It does not open closed roots or cross-origin frames. Thread-title/sidebar markers
cannot establish ownership; the nonce must belong to a user-role message. Diagnostic
schema3 reports light/deep role counts and redacted host/layout metadata, never raw
messages or private attribute values.

Version0.6.4 performs at most one read-only recovery when the already-sent user message hydrates after initial navigation confirmation. It retains the original deadline and never resends that prompt.

Version0.6.5 waits for an already-sent message within its original operation deadline, including when the conversation URL is still being assigned. Confirmation is not cut off by the readiness20-second budget. No second send or deadline extension.
