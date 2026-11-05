# AI connection and Xray continuation — 2026-11-06

Branch `fix/ai-egress-connectivity-2026-11-06`, based on merged main `cb3f5f1c` (PR360).
Owner reports Gemini cannot connect from an Iranian server using the existing Xray integration.
The destination's exact error, active route and live provider response have not been supplied.
Do not infer a repaired production connection from local fixtures.

RiskR3: credential/configuration retention and shared outbound transport.

## Canonical owners and inventory

| Concern | Existing owner / contract | This slice |
| --- | --- | --- |
| AI configuration and generation | `ai/server/client.ts`, Setting `ai.config.v1`, canonical credential encryption | Preserve encrypted envelopes byte-for-byte on read; fail closed on unreadable stored JSON/DB reads. |
| Admin entry | `/admin/ai`, `/api/admin/ai`, `ai/server/http/admin.ts` | Same UI and permissions; typed configuration-read/save errors reach the existing error state. |
| Network selection | `social/server/egress.ts`, Setting `egress.proxy.v2`, `egressRoute` / `egressFetch` | Expose the existing host/purpose decision to diagnostics; keep response-body cancellation active after headers. |
| Root proxy policy | `deploy/ubuntu/xray-config.cjs`, installed `mobocom-xrayctl`, Xray26.10.31 | Unchanged builder/allowlist. The panel selects a profile for `ai`; no automatic selection or direct retry on proxy failure. |
| Identity/security | Existing module guard, settings permission, Origin policy, rate limit and audit | Unchanged. No new permission, schema, dependency, module, public URL, queue or secret store. |

## Reproduced defects and behavior

- Gemini's existing connection probe asks for only200 output tokens. Default thinking can use
  that whole allowance before producing text. Explicit `reasoning_effort: none` is now sent
  only for `gemini` + `gemini-2.5-flash` family + requests of at most1200 tokens. Longer
  editorial requests, Pro/3/custom models and other providers retain their protocol.
  Empty length-limited output is identified as a token-budget failure, not a network failure.
- Location restrictions, key failures (including Google's400), access403, quota429,
  model404 and generic provider failures are distinguished. Network/JSON errors identify
  the selected direct/Xray path. Provider error text is not echoed back with possible secrets.
- The400-character plaintext input normalizer previously truncated larger encrypted
  envelopes during reads. Stored ciphertext now bypasses input normalization. Corrupt
  JSON or a DB read failure cannot become writable empty defaults. Existing corrupted
  ciphertext cannot be reconstructed; keep `PANEL_CREDENTIAL_KEY` and re-enter the original
  API key once if needed. No automatic repair/backfill or migration.
- `viaProxy` previously detached AbortSignal on response headers. A stalled body could
  hang generation after its deadline. Abort now covers body consumption; listeners are
  released on stream end/close/error. TLS/SNI verification, CONNECT and no direct fallback remain.

## Acceptance and executed evidence

- Four new AI regressions fail on old code; fixed AI + social-proxy suites:35/35.
  Two additional route/error-shape checks cover direct/proxy hints, malformed outputs,
  typed Admin read/save failures and guest denial.
- New real CONNECT/TLS fixture checks Gemini POST path/auth/body, trusted local certificate,
  wrong-host rejection and a deliberately stalled response body. The old egress implementation
  fails that deadline test. Test CA/private key are generated at runtime, never checked in.
- `scripts/ai-connection.connected.cjs` is registered in `run-pg-checks.cjs`. Real Prisma,
  production crypto and routing prove encrypted400-character key persistence, masked resave,
  short Gemini request, explicit AI profile routing, direct opt-out, near-host rejection and
  corrupt-read preservation. Upstream generation is recorded, never billed. Cleanup claims
  exact last values and preserves concurrent writes for operator review.
- All171 existing migrations applied to a fresh PostgreSQL18.6 **PGlite0.5.15/WASM** instance;
  the registered connected check passed over TCP/Prisma. This is bounded PostgreSQL engine
  evidence, not native PostgreSQL17/concurrency certification. No PGlite dependency enters Git.
- TypeScript, architecture, source and security checks passed. Full `npm run check` reached
  898 site tests:895 passed,3 failed. The same3 fail on clean base `cb3f5f1c` (26/29 in the
  two affected baseline files): two Imports DNS/redirect fixtures receive environment404s;
  the server-domain helper fixture sees this container's systemd wrapper text. They were
  not weakened or fixed in this unrelated slice. Later full-check stages were not reached.
- This environment cannot switch away from UID0 (`setresuid`/`setgroups` refused); native
  non-root validation remains required. Node24.22.1 was used, within package engine bounds.

- Actual existing `/admin/ai` browser flow passed on the final code: saved a synthetic key,
  then invoked generation through the project's **real hash-verified Xray26.10.31** binary,
  builder-v2 AI routing, a recording SOCKS upstream and a local CA-verified Gemini-shaped
  HTTPS endpoint. POST path, Authorization and short-call reasoning parameter were checked.
  Geographic403, invalid-key401 and quota429 reached the existing notice. Guest and
  missing-Origin requests were403. Four1440/390 light/dark captures had no overflow or
  page errors. All four captures were visually reviewed. No frontend layout/component changed.
- Browser ran against a local Next development server and the same PGlite engine, with
  Prisma pooler mode/uncached statements to accommodate its single-backend socket bridge.
  This is not a production build, native17 DB, live Google or real remote VLESS/Trojan proof.
  Sandbox tool setup needed an explicit loopback hostname and a locally extracted Chromium;
  its initial launch/cleanup failures were tooling-only and the final complete flow passed.
- Local receipts/screenshots are under `/tmp/mobocom-ai-lab/`; they are temporary evidence,
  not runtime source or release assets. Repeat the registered checks on native PostgreSQL17
  as a non-root user and run the target server's saved-config test before adoption.

## Continuation, adoption and rollback

Continue these owners; do not add a second AI provider stack, proxy daemon or configurable
unrestricted host registry. Keep the allowlist and root/application host mapping in sync
only if a separately scoped change needs new hosts. A working Telegram route does not select AI.
Old installed root builders need the existing trusted installer; application updates alone
cannot replace root-owned helpers. See [host/Xray handoff](HOST_INSTALL_UPGRADE.md).

Operator instructions: [AI-CONNECTION-FA](../../AI-CONNECTION-FA.md). Confirm the real server's
AI route and run the existing saved-config test after adoption. A Google location refusal
requires an exit IP/project eligible for the service; a local test does not establish that.

Every PR targets main; owner merges/deploys. Published1.7.6 tag/assets remain immutable and
do not acquire this fix. No release, hosted workflow dispatch or production action is performed.
Rollback is the focused code commit; configuration rows, keys and historical data stay in place.

References: Google [OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai),
[thinking/output limits](https://ai.google.dev/gemini-api/docs/thinking).
