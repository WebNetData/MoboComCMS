# Purpose-specific AI routing — 2026-11-06

Owner requested independent API/model choices, for example Gemini support and
personal ChatGPT Admin. Existing PR362 was merged at2b2f3289; branch
`feat/ai-purpose-routing-2026-11-06` starts there. Continue existing AI owners,
not a new provider service. [Spec](../../specs/ai-routing/SPEC.md),
[operator guide](../../AI-ROUTING-FA.md).

## Ownership and behavior

- `ai/domain/routing.ts` is the closed typed purpose/hierarchy registry and
  existing Admin action/section mapping. Support/Prompt Master inherit the
  global API; Admin children inherit Admin. Unconfigured Admin preserves
  PR362 personal-mode precedence. Explicit API overrides personal. Explicit
  personal needs that actor's enabled grant; no error fallback. Unknown
  source/purpose and personal public bindings are rejected.
- `ai/server/routing.ts` extends canonical Settings at `ai.routing.v1`, using
  existing Serializable exact-value CAS/retries and transactional strict
  audit. API key fields use the existing panel cipher, including long stored
  ciphertext retention. Patches merge untouched purposes/fields; changing
  provider/endpoint clears old credentials unless replaced; explicit clear
  is supported. Inherit/personal retains dormant API configuration. Corrupt
  or unreadable data is never overwritten by defaults. No migration/dependency.
- `client.generate(prompt, config?, purpose?)` resolves routes before choosing
  personal/API. Trusted request-local context holds canonical Admin UserId
  and action purpose. Explicit public purposes override that context and can
  never consume personal grants. Legacy no-purpose ordinary calls retain
  shared generation. Public `ai/server/generation.ts` remains the consumer
  boundary; Livechat and Prompt Master pass their own fixed purpose.
  Prompt Master studio availability also uses its own API binding through
  `publicAiReady`, so an empty global key does not hide independently configured
  AI enhancement. Its targeted readiness case and final TypeScript check passed.
- Existing Admin handlers derive content purposes from known actions/section
  IDs, preserving existing section permissions. Only the settings.manage
  diagnostic accepts a purpose selector; it cannot publish content. Existing
  generation limits/Origin/module guards remain. Internal GET/PUT
  `/api/admin/ai/routing` uses settings.manage, module guard, bounded typed
  JSON and strict write rate limit. No private key/ciphertext in projection,
  request audit or response logs. Cache is private/no-store.
- `/admin/ai` composes existing MoboCom/SDS cards/fields. A keyed per-purpose
  draft sends only dirty patches; selection/save/test/error states are distinct,
  failed initial reads expose no editable defaults. Provider cards/global
  defaults and personal OAuth controls remain in place. Source selection never
  changes member identity, content publication, module state or public scope.

## Executed evidence

- Final non-root Node22 unit run, no `.env` and empty DATABASE_URL: **44 passed,
  zero failed/skipped** across AI/Livechat. Six new routing cases cover context
  isolation, inheritance, explicit failures/no fallback, encrypted long keys,
  patch/destination behavior, malformed/array source, corrupt retention,
  HTTP authorization/module-off and actual section/action mapping. The old
  personal-encryption fixture now supplies/restores its own synthetic key;
  its previous ambient-key dependency was exposed by this no-env run.
- Native PostgreSQL/Prisma **ai-routing and chatgpt-admin passed** on a dedicated
  empty database after all171 existing migrations. Actual routing/Settings/
  encryption/leases/audit and two-purpose/two-field concurrent first creation
  are exercised; only provider/cache boundaries are doubled. Audit failure
  rolls back; corrupt rows and previous key/config values are preserved.
- Types, architecture, source (2492 TS/TSX), security contracts passed. Scoped
  Semgrep/redacted Gitleaks passed. Two isolated deliberate faults (personal
  overriding explicit API, ignored selected API) were detected; application
  source was never mutated by the fault harness.
- Real browser with synthetic encrypted personal grant/recorded API responses:
  support Gemini, Admin personal, inherited Magazine, independent product Groq,
  save/reload, key-preserving dirty model patch, quota/no fallback, invalid
  input retention, secret-free response, missing Origin, guest and section-only
  direct rejection passed. First attempt stopped at an overly exact provider
  label locator; corrected harness passed without app changes. Four1440/390
  light/dark captures passed axe/no overflow and were visually inspected.
- React Doctor: zero errors, seven reviewed warnings. Five concern existing
  Admin/personal patterns; the two new warnings are branching complexity of
  the bounded form and prop-derived draft state. The latter is intentionally
  reset by `purpose:revision` key after selection/save and was browser-verified.
  No suppression or checker baseline change.

Docker Desktop became stopped after browser acceptance and interrupted the
last incremental type-check. Restarted the local runtime, left the task preview
stopped and completed the final Linux type-check successfully. A Windows
fallback check was not accepted as a gate: its installed dependencies/generated
Prisma client lack current editor and data types. No dependency repair or
owner-package edit was attempted. Final source hashes match the isolated tree.

Raw local evidence is ignored under `.mobocom/ai-routing/`. Tests use a
dedicated container/database; original local app and owner data stay separate.
No real provider/account usage, actual support conversation or full Prompt
Master end-to-end scenario, production build/deploy, release or hosted workflow
was executed. Existing personal OAuth browser evidence is in CHATGPT_ADMIN;
this slice uses a seeded synthetic grant and does not repeat login.

## Adoption and rollback

Owner merges/deploys. No change until that version is installed. Existing
settings preserve current behavior; configure/diagnose each chosen purpose
explicitly. Keep the production panel encryption key. Model eligibility,
destination connectivity, plan/API billing and actual account consent remain
provider/operator matters, unverified by recorded fixtures. All purposes use
the existing single AI-purpose egress selection; per-purpose Xray profile
selection is not introduced.

Set bindings to inherit for old behavior; disconnect personal where desired.
Explicit personal bindings fail when that connection is disabled, so change
those bindings deliberately before expecting API use. Reverting this commit
leaves encrypted dormant route rows harmlessly stored and restores PR362
routing; no schema/data rollback or purge. Never restore rotating OAuth tokens
from an older backup. Customer support remains MoboCom-only.
