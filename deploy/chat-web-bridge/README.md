

## Low-cost routes and personal web chat (0.4)

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
