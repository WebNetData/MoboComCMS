# Prompt Master continuation — 2026-11-01

## Scope and ownership

Branch `feat/prompt-master-2026-11-01` from owner-merged `17aa8d6e`/PR293. User requested a professional new prompt-generator section inspired by generateprompt.net. Continue this implementation; do not rebuild it or copy the reference's content/assets. [Spec](../../specs/prompt-master/SPEC.md), [Persian operator guide](../../PROMPT_MASTER.md).

`src/modules/prompts/{domain,server}` owns public templates and private generated instructions. `src/plugins/prompt-master/manifest.json` declares optional/default-on module, `/prompts`, `/admin/prompts`, `prompts.manage` and typed settings. Existing AI client is exposed through its narrow `server/generation.ts` facade; Identity/AuthZ, Extension state, Vocabulary, Navigation, Maintenance, Content/Search/Favorites, strict limits and Audit remain their canonical owners. No second AI client, account, settings, queue or favorite system. New routes do not modify protected section layouts.

## Implemented behavior and contracts

- Wide RTL light/dark studio for TEXT/IMAGE/VIDEO/CODE instructions, progressive controls, original examples, editable output, clipboard/text download and structural checklist. Structured mode has no provider call. This does not generate images/videos or promise model-specific parameter syntax.
- Searchable kind/category/slug/template library with12-per-page archive, published detail/use links and existing shared favorites.15 original starter patterns. Plain text with closed `{{key}}` substitution once, never HTML/eval. Unicode truncation replaces orphan surrogates.
- Private current-user history20-per-page with search, load/edit, pin and claimed delete. Retention defaults50 unpinned +50 pinned; both Admin-configurable/bounded. Guest output is not persisted. History is never a Content/Search projection or public sitemap item. Template deletion preserves historical output.
- Admin20-per-page list, filters, direct `?edit=<id>` from canonical ManageBar, draft/publish, stable URL, defaults/variables/preview, category management and settings links. Current section permission is checked again inside serializable transactions; stale version409 and strict transactional audit on template writes. Category vocabulary supports inactive previous values.
- Existing Control Plane owns module/AI/guest switches, copy/SEO and limits; section managers do not gain `settings.manage`. Existing navigation/section bar/megamenu, maintenance and sitemap know this section. Saved header links get one additive migration entry; owner entries/order/configuration are retained.

Same-process internal HTTP contracts, typed and covered by native/browser checks; not a new public/mobile API version:

| Boundary | Input / result |
|---|---|
| `POST /api/prompts/generate` | Normalized PromptInput + `engine: structured|ai`, `consent`, `saveHistory`; output/provenance/input/checklist and own optional saved row |
| `GET /api/prompts/history` | Own `id` or `q/page/pinned`; unauthorized401, foreign ID404 |
| `POST /api/prompts/history` | `action: edit|pin|delete`, own id/version, output/title or pinned; current ownership + claim |
| `GET /api/admin/prompts` | Guarded id lookup or q/kind/category/status/page directory + configuration-link authority |
| `POST /api/admin/prompts` | `save` or `delete`; bounded template fields and existing id/version |

Writes require same-site origin; bounded JSON128KiB. Private responses are no-store/noindex. AI is off by default, requires login, policy + AI module on, explicit consent and strict IP/member/daily limits before the existing provider. Recheck module/account after the call. Provider errors stay generic failures; no raw secrets/input logged. No live cloud provider was contacted during validation.

## Data, rollout and rollback

Additive `20270202120000_prompt_master`, both Prisma schemas, release manifest. PromptGeneration references canonical User with cascade on account deletion; templates are independent of saved output. DB checks constrain kind/status/JSON/content. Seed inserts use conflict-do-nothing, preserving a preexisting category customization. Do not use reset/db push on production.

Use the existing migration/update process with backup. Disabling `prompt-master` closes public/admin APIs/pages and preserves data. Code rollback retains the added tables and records; do not down-migrate or reset canonical users. Existing signed1.6.1 assets are immutable and do not contain this module; publish a higher version only as a separate release task.

## Evidence and limits

Owned isolated Ubuntu26/Node22/PostgreSQL fixture `mobocom-prompt-master-20261101`, port3230, non-root UID1000, no source `.env`. Test-only provider11435 and Redis are local. Original app, owner database/storage and published assets were kept separate. Raw reports under ignored `.mobocom/prompt-master`; never commit its private metadata/env.

- Full `npm run check` passed845 tests,0fail/0skip (778 site +53 installer +4 +10 tooling). Final engine Unicode delta also passed the affected unit set; see final workstate for later checks.
- `scripts/prompt-master.connected.cjs` is registered in `run-pg-checks.cjs`. Real PostgreSQL and signed canonical sessions/current permissions: draft privacy, URL search/direct manager edit, publication/CAS/strict audit rollback, private ownership/retention/pins, explicit AI gates/quota/failure, account revocation, origin/body/module-off and template-delete history retention. Only provider, limiter, search notification and logger boundaries are doubled. `npm run test:pg -- prompt-master` with a dedicated disposable database and NextAuth test secret; cleanup is in finally.
- Deliberately removed history owner scope and AI policy gate in disposable source copies: both native runs failed; restored hashes and native pass verified. Main source was not mutated by fault injection.
- Upgrade rehearsal:56-migration baseline to57, canonical User sentinel and custom navigation/order/unknown setting/category preserved;15 templates/5 categories, menu once, repeat deploy no-op and invalid DB kind refused. Initial empty DB migration also passed.
- Maintained `e2e/tests/prompt-master.spec.ts` ran in installed Edge. Real login and UI/API flows: four kinds, literal script data, copy/download byte content (Windows clipboard CRLF normalized only in assertion), simulated429/retry, library12+3 and kind filter, own history pin/edit/reload, foreign read/delete404, unrelated Magazine manager403, Admin draft/publication, concurrent409, direct ManageBar editor, canonical favorite persistence, Control Plane AI enable/consent/local existing-provider client, module-off404 and maintenance503/current-owner bypass/restore. Maintenance polling honors the existing5s cross-bundle cache. Four studio +four Admin theme/viewport captures at1440/390 and library axe scans reported0 violations; inspected captures retained.
- Scoped React Doctor16 TSX:0errors/4 reviewed warnings (three component complexity warnings; existing Icon non-component export). Initial Intl/number input/component-export findings fixed. This is not whole-repository Doctor cleanliness.
- Scoped local Semgrep48 production TS/TSX targets:0 findings/0errors. Redacted Gitleaks61 changed/new files: one existing synthetic account-security test-key match from HEAD; no introduced credential. Do not suppress rules globally or describe that scan as zero total findings.

Final full check845/0fail/0skip and `npm run build:postgres` passed. The build retained45 tracing warnings in existing package/import/filesystem owners; no build-failure bypass. Local original app restarted and migration applied after private backup and seed-authority precheck. Canonical identities/roles, owner configuration and six existing content counts were verified preserved; operational leases/scrub/monitor clocks continued normally. Observed stale development-cache HMR hash mismatch was resolved by clearing only the verified generated `.next-dev` volume (no source/storage/DB removal). A fresh actual localhost3000 guest browser run verified output generation/retention, no document reload, no page errors/overflow and readiness200. Narrow public Vocabulary usage port `server/vocabulary.ts` intentionally stays independent of the main prompts facade to avoid a reverse registry/query cycle. Graphify code-only refresh passed with0 semantic tokens; relationships are discovery candidates, not runtime proof. No hosted Actions, PR, merge, production deploy or live-provider certification is implied. E2E deliberately refuses a non-owned fixture: metadata db must be `mobocom_prompt_master_test_20261101`, baseURLlocalhost3230 and synthetic accounts `@prompt-fixture.invalid`; its explicit fixture path is supplied through E2E_PROMPT_FIXTURE. Use fresh canonical test users/roles, current migrations and a local OpenAI-compatible chat-completions fixture, never actual owner credentials. The portable native test supplies its own rows and cleanup; it is the routine backend gate.

Future optional slices: owner-curated templates/categories and provider activation; portable automated creation of the full browser fixture; live chosen-provider certification and any actual release. No payments, public user submissions, image uploads, image/video rendering, team libraries or independent mobile API are claimed.
