# Personal ChatGPT for Admin — 2026-11-06

Owner decision: their own ChatGPT account is for personal Admin tools only;
the customer assistant remains about MoboCom. Branch
`feat/chatgpt-admin-connection-2026-11-06` starts at owner-merged PR361,
`060a0945`. [Scenario](../../specs/chatgpt-admin/SPEC.md),
[Persian operator guide](../../CHATGPT-ADMIN-FA.md).

## Owners and contract

- Existing `ai/server/chatgpt/` owns the personal provider adapter. Admin
  generation establishes the canonical actor using request-local context;
  ordinary `generate()` calls, Livechat, Prompt Master and background jobs
  never select personal credentials. No shared owner account or public quota.
- `/api/admin/ai/chatgpt` is an internal Admin endpoint, guarded by
  `ai-assistant`, `settings.manage`, canonical write-Origin checks and strict
  rate limiting. Commands: begin, finish, models, save, select, disable,
  disconnect. JSON is bounded; all responses are private/no-store. Public
  projections contain connection labels/status/model, never OAuth secrets.
- Canonical Settings stores one encrypted envelope per current UserId at
  `ai.chatgpt.personal.v1.<id>`. Existing serializable JSON-setting updates,
  panel-credential encryption, strict transactional audit and database leases
  handle claims, refresh and concurrent changes. No schema, migration,
  dependency, identity or second settings service was added.
- Fixed official OpenAI HTTPS endpoints use existing Social AI-purpose egress.
  No proxy/root helper/host allowlist changes. OAuth uses PKCE S256, state,
  nonce, published discovery/JWKS signature validation, issuer/audience/expiry
  and scope checks, retained client/subject/host mapping and one-use completion.
  Tokens stay on the CMS server; account grants are isolated by Admin UserId.
- The downloaded, inspectable Node.js22 helper listens only on
  `127.0.0.1:1455/auth/callback`, validates state and returns the authorization
  code to the authenticated CMS browser in a promptly removed URL fragment.
  PKCE verifier, access/refresh tokens and passwords never enter this helper.
  It must run on the operator's computer, with the CMS session in the same
  browser. Login requires explicit personal-use and official OpenAI consent.
- Models come from the account catalog. Inference sends supported Responses
  fields only, `store:false`, `stream:true`; bounded SSE must reach a completed
  response. Personal-mode failures never fall back to a paid/shared provider.
  Explicit disable/disconnect returns Admin tools to the configured site
  provider, whose usual billing applies. Disconnect clears local tokens even
  when remote revocation cannot be confirmed; registration identity remains
  for reauthorization. Account/model changes during refresh or catalog saving
  fail safely; already dispatched upstream calls cannot be recalled.
- Existing Livechat domain owns platform-only instructions, local refusal of
  obvious general requests, required response prefix and uncertain-answer
  operator handoff. Customer context still comes from the conversation's own
  canonical user. This is model behavior guidance with deterministic checks,
  not a proof that every possible off-topic prompt is rejected. It grants no
  account/payment/action capabilities. Module-off preserves operator handoff.

## Executed evidence

Evidence retained locally under ignored `.mobocom/chatgpt-admin/`; test
credentials are synthetic. No real owner account, production login or paid
provider was used.

- Final focused AI/Livechat suite: **38 passed, zero failed/skipped**, as a
  non-root Node22 user with no `.env` and no database URL. Includes signed
  OAuth, bad signature/nonce/audience/scope, one-use state, encryption,
  cross-admin/public isolation, refresh, incomplete streams, no fallback,
  account-change races and platform-support parsing.
- Native PostgreSQL/Prisma: registered `chatgpt-admin` and `ai-connection`
  checks passed on a dedicated empty database after all171 migrations.
  Personal check exercises actual encrypted Setting rows, concurrent initial
  updates, shared refresh lease, two-admin isolation, strict audit persistence
  and audit-failure rollback. Only provider/cache boundaries are doubled.
- TypeScript, architecture, source and security contract gates passed. Final
  account-consistency guards received targeted unit and TypeScript checks;
  unaffected broad/release suites were not repeated.
- Actual local browser: generated helper download and real loopback listener,
  rejected wrong state, signed synthetic OAuth completion, account models,
  enable, Admin generation, streamed quota failure without shared-provider
  request, secret-free projection, Origin/guest403 and disconnect passed.
  Four 1440/390 light/dark captures have no axe violations or page overflow;
  final screenshots were visually reviewed. No protected public layout changed.
- React Doctor: zero errors; five reviewed warnings in the existing Admin
  page (fetch-status/form patterns). Scoped Semgrep and redacted Gitleaks
  passed. Three isolated deliberate faults (actor leak, signature bypass,
  partial-stream acceptance) were detected without modifying app source.

## Limits, adoption and rollback

Official contract reviewed on2026-11-06:
[OSS/self-hosted guide](https://developers.openai.com/siwc/token-sharing-open-source),
[sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in),
[tokens](https://developers.openai.com/siwc/token-sharing-open-source/token-reference),
[inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference),
[VMs](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms),
[limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).
This is the documented personal OSS/self-hosted preview, not session-cookie
scraping or a hosted-service partner integration. Actual account eligibility,
model access, destination connectivity, usage and consent remain unverified
until the operator connects their own eligible account. No unlimited quota
or regional availability is promised. No live production build/deployment,
release, hosted workflow dispatch or owner merge was performed.

Production must retain the existing panel encryption key and canonical HTTPS
`NEXTAUTH_URL`. Connect through Admin settings, choose a returned model and
explicitly enable. Existing shared AI configuration remains intact. For
rollback, disable/disconnect personal mode first, revoke app access in ChatGPT
if needed, then revert code through the normal PR/deploy path. Stored rows and
customer data need no purge or schema rollback. Do not restore old rotating
refresh tokens from a backup. The owner merges and deploys.
