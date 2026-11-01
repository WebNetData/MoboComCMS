# Prompt Master — 2026-11-01

## Outcome and existing owners

Owner requests a polished new site section inspired by generateprompt.net. `/prompts` is a wide, RTL, light/dark prompt workspace for text, image, video and code instructions, a searchable/paginated public template library and private member history. Create prompts, not images/videos. Reference is product inspiration, not copied content or a promise of all reference-site tools.

Existing AI provider/credential client, canonical Identity/AuthZ, Extension settings/enable state, Vocabulary categories, Navigation, Content/Search/Favorites, SEO, strict rate limiter and Audit are reused. New domain `prompts` owns only prompt templates/generations; plugin `prompt-master`. No second AI client, identity, shared settings, media or payment service. Existing approved section visuals/routes stay intact.

## Actors, controls and contracts

Guests may generate structured prompts when `allow-guests` is on; output is returned, never persisted for a guest. Members use canonical `requireUser` and see/edit/pin/delete only their own bounded history. AI enhancement is explicit, defaults off, requires member login + consent + enabled AI assistant + configured provider, and consumes configured strict IP/user/daily allowances before the existing provider call. Failure stays failure; no invented AI result/provider claim. Sensitive input is not logged or sent to a provider in structured mode.

Managers hold `prompts.manage` declared by the plugin; other section managers cannot manage it. Template create/update/status/delete uses fresh guards, bounded JSON, explicit origin and transactional strict audit; version claims reject stale updates. Module-off means public/admin APIs/pages404 and data retained. Section maintenance, editable header/section bar and module SEO/settings join existing owners.

APIs: `/api/prompts/generate`, `/api/prompts/history` and `/api/admin/prompts`; canonical current identity, same-origin writes, no-store private responses. Public library exposes published templates only; never member generations. Generated content is plain untrusted text, rendered as text/textarea, downloaded as text, never HTML/executed. Template placeholders have a closed vocabulary. Public template cards join canonical Content/Search/Favorites; private history never does.

## Data and compatibility

Additive `PromptTemplate` and `PromptGeneration` models in both Prisma schemas. Template: stable unique slug, kind, managed category code, tags, plain prompt pattern/defaults, publication state, ordering/feature flag and claim version/timestamps. Generation: canonical User FK with cascade on identity deletion, bounded input/output, exact engine/model, pin flag, version/timestamps. History limits preserve pinned items with a separate bounded pin cap. Seed original templates and Vocabulary rows only; append the requested header entry once without replacing saved menus. Register one incremental migration in release manifest. Existing data/permissions unaffected. Code rollback leaves new tables/data; no automatic down migration.

## UI

Working studio first: kind switcher, idea editor, examples and progressive advanced controls, clear structured/AI modes, editable output/copy/text export and structural input checklist. Library search/kind/category/pagination, original example cards, published template detail/use action and existing shared favorite action. Private history with search/load/pin/delete; visitor sign-in state. Admin list/filter/page/create/edit/preview/status/delete, optimistic conflicts and category/settings links. All legitimate limits/copy/availability use Admin Control Plane rather than hard-coded owner settings.

Use MoboCom/SDS semantic primitives/tokens, original visual compositions and scoped CSS. 1440/390 both themes, keyboard/focus/RTL, reduced motion and axe. No fabricated usage/popularity ratings. Empty/loading/retry/disabled/permission states are visible.

## Acceptance and convergence

- Pure engine/input/template/token/heuristic tests in existing site test owner; module/navigation/schema/source/architecture gates.
- `scripts/prompt-master.connected.cjs`, registered in PG runner: publication leak refusal, canonical identity/ownership/permissions, template CAS + strict audit rollback, private history bounds/pins, module-off and explicit AI gating/limits/provider errors with only external provider/session boundaries doubled. Deliberately omit owner scope and AI gate in disposable copies; tests must detect them.
- Actual browser: guest builder/template/library/copy/export, member persistence and scoped denial, Admin create/publish/rename conflict/unpublish/delete, module-off/maintenance/navigation; light/dark1440/390, no overflow, axe and scoped React Doctor. PostgreSQL connected, production build and relevant tests must actually run; no hosted Actions dispatch or live cloud calls in tests.
- Persistent handoff/ledger/map record exact executed evidence and remaining limits for another agent. New code releases need a version above published1.6.1; this task does not silently replace the published assets or deploy production.

## Illustrated library follow-up — 2026-11-01

Owner clarifies that the library must show outputs alongside their prompts, including images, playable videos, written results and web design. Extend PromptTemplate with one bounded/versioned showcase JSON field and add WEB to the existing prompt-kind vocabulary/checks; retain old templates/URLs/history and manager CAS/audit. No second gallery/content/media/favorite system. Default library is the illustrated samples view; all prior patterns remain under its all-templates filter.

Curated original samples pair exact example prompts with locally bundled generated pictures, an authored silent motion clip, text and safe structured web compositions. Disclose provenance; do not copy reference assets or invent ratings/provider results. Admin can select existing Library images/video, enter public URLs, alt/caption/credit, plain result text or an allowlisted web layout; no arbitrary HTML/JS execution or automatic URL downloads. Unknown/legacy showcase data has a safe empty rendering; edits that omit showcase preserve it.

Gallery has type/category/search/sort/view filters, real counts, pagination and accessible image-led cards. Detail uses an enlarged sample, exact copy/download prompt, existing favorites/ManageBar, studio reuse and related public examples. Load video player only after explicit play and reuse the site's player. Keyboard, image zoom, error/retry, no autoplay, light/dark1440/390 and axe are acceptance requirements.

Use a new additive migration, never edit the applied first Prompt Master SQL. Native PG proves old rows/omitted-field edits, invalid media/layout refusal, new WEB kind, publication/privacy/filter boundaries and strict audit rollback. Browser proves Admin Library selection/persisted sample, each kind's detail/copy, real video playback, filtering/pagination and zoom focus/escape. Existing suite/build/Doctor and scoped scans remain evidence gates; owner data and published1.6.1 stay intact.

## Visual refinement — 2026-11-01

Owner requests a richer, orderly, professional Prompt Master appearance after PR294. Continue the same public studio/library/detail/history and Admin-controlled copy. Use MoboCom/SDS semantic surfaces, original sample art, current typography, defined focus/reduced-motion states and real content; no new theme/UI dependency, business state, API, permission or migration.

The studio hero links real published samples to the library; the workspace distinguishes editable input/output, keyboard-operable advanced options, input-length feedback and an accessible completeness indicator derived from the existing checklist (not an AI-quality score). Featured cards have a compact variant distinct from the library's varied image frames. Mobile library kind filters must keep the active choice visible, with full accessible names. Preserve copy/download, consent, private history, Media controls and Admin title/description settings. Validate actual generation, kind changes, error/retry, keyboard disclosure/progress, uniform featured-card bounds and loaded images; inspect1440/390 light/dark and scoped axe. Cosmetic-only work does not claim production/provider certification or require another schema migration.
