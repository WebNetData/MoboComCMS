# Chat web bulk content/image production — 2026-11-08

Continue feat/chat-web-bulk-production-2026-11-08 above PR377 (9cfadf27); prior
editor bridge is not yet in main at preparation. Owner merges/deploys. Never
rewrite published1.7.9 assets. Owner explicitly chooses Chat web for generation,
with current assistant/engineering routing untouched; no unlimited/free promise.

AI owns relational AiProductionBatch/Item, typed configs/seeds/output, versioned
state/leases and browser driver. This is a domain workflow, not another shared
background queue. Private v1 API uses canonical target tool permissions/module,
own actor, explicit Origin, strict limits, bounded JSON and no-store. No model API
or account cookie/token is sent to the server. Category/config/price/spec validation
precedes generation; model output never controls price/stock/publication.

Canonical Journal/Catalog/Site creation and revision/audit transactions own save;
atomic item receipt makes retry idempotent. Canonical block documents include
semantic text/heading/image blocks; legacy fallback remains. Page has no cover
column: selected cover is the leading image block. Product remains inactive and
post/page DRAFT. Media's existing importData decoder moved behind the Downloads
public facade so both localization and generated images share validation/WebP/
Library registration. Text and0–4 sequential image steps are persisted separately;
stale lease/version/stop/expiry/revocation refuses late output. Failure/retry is
explicit; successful outputs and media remain. Orphan import after concurrent
revocation stays in the owner's Library, never silently attached to content.

MV3 bridge0.2 negotiates production/image capabilities, allows only Admin posts
and production paths of one granted origin, and captures only a new assistant
bitmap via canvas in its owned fresh Chat tab. Cross-origin pixel restrictions,
login/CAPTCHA/quota/UI failures stop instead of invoking a private media/model
endpoint or paid fallback. Model/mode selection remains operator responsibility;
real Chat account access is not verified by fixture evidence. Browser must remain
open for generation; persisted results survive closing/reloading.

Actual validation receipts .mobocom/ai-production: initial empty177 migrations,
schema parity/manifest/types; native complete post with cover/inline Media and
canonical document, exact inactive product price/stock and page draft, strict audit
rollback, duplicate-save receipt, concurrent claims, pause/retry/module/standing
and section/Origin/JSON denies passed. A real populated176→177 migration preserved
complete User/Page/Setting rows; upgrade DB removed. Initial native Page cover
mapping failed and was corrected to the leading block; no schema workaround.

Actual unpacked extension text and image/canvas roundtrips passed against two
controlled DOM pages (test manifest alone pregrants localhost). Full Admin+Chat
navigation fixture was unreliable and failed/was stopped; it is not claimed as a
successful combined test or real-account evidence. Separately the actual Admin
client/API/Media workflow with a controlled window relay produced2topics/2text/
4images, preview/review/saved2 drafts, reload, scoped section/customer denies and
four1440/390 light/dark axe0/no-overflow views. That relay made no inference call.
Final compact preview/settings/error checks, final native follow-up, scans/gates,
hash/ZIP proof and cleanup are recorded in final receipts when actually completed.

No local production build, real model account, customer message, merge, release or
deployment claim. Operator instructions/rollout/rollback: ../../AI-PRODUCTION-FA.md.
Deploy the registered additive20270224120000_ai_production migration and upgrade
personal desktop extension to0.2. Disable/rollback keeps batches/content/media;
do not drop new tables or restore DB automatically.

Final executed closure: 129 affected AI/editor/file/Media unit cases, plus the final
Linux bridge tab/origin/request/type/cancel regression, permission inventory, native
production/chat-web and all final types/schema/manifest/source/architecture/security/
audit/knowledge gates passed. Final native also proves active work remains visible
behind21 completed histories and creation keys cannot silently change input.
Image receipt has strict transactional audit; caption/alt comes from bounded model
description with clear AI-illustration attribution. 176 published migration SQL
files match their prior normalized bytes; dependencies unchanged. 40 final
source/test/schema/extension/ZIP hashes match Linux. Semgrep0/Gitleaks0; Doctor0
errors/21 reviewed warnings (complexity/legacy fetch/effect diagnostics).
Initial all-file Doctor hit memory pressure; focused groups and the final all-file
review succeeded without rule/baseline changes. Graphify refresh failed an existing
out-of-corpus source validation; owner relationships were confirmed with inspected
source, native transactions and architecture gates, not a claimed fresh graph.
Final UI polish reuses semantic card tokens; four final1440/390 light/dark preview
axe0/no-overflow screenshots were inspected, no generation replay. Product settings/
missing-extension pause/explicit retry/cancel passed. Real ChatGPT account still
requires operator verification. PR377 merged during this work (eeca5957), all its
Checks green; new publication targets main and adds this slice.

Closure: all8 shipped ZIP entries match canonical LF source; actual download
HTTP200 SHA256 matches. Owned runtime, production/upgrade databases,4 disposable
profiles and synthetic session file removed. Original app/PostgreSQL remain
running and session HTTP200. No production deploy or real Chat account test.

PR378 initial automatic unit job passed969/970; the sole failure was the existing
Store delivery-authentication test replacing a random ciphertext suffix with
`zz`, which can decode to unchanged bytes. The test now flips an authenticated
ciphertext byte deterministically. Production encryption is unchanged. Only this
failed case was rerun locally, passing in a disposable non-root, network-disabled
Linux container with read-only source/dependencies (ci-store-case.json). The
whitespace check also removed one final blank line from image-input.ts; its
non-whitespace source is identical to the validated Linux file.

## Clean generated slugs — 2026-11-09

AI Production now saves the generated slug verbatim when available. The old save path unconditionally appended12 characters from the item UUID. Actual collisions alone choose readable -2/-3 suffixes with bounded slug-specific unique-conflict handling. Existing stored URLs are not rewritten; canonical Journal/Catalog/Site transactions, history and atomic item receipts stay intact. No schema, permission, UI, inference or extension change.

Exact source was already validated on native PostgreSQL: post/product/page free slugs, actual collisions and repeated-save idempotency; owned fixtures were cleaned. Scoped installed TypeScript7.0.2 passed. The source here matches6ffbabc0 byte-for-byte after newline normalization, and main is the same b3c81884 server baseline used for that evidence. No redundant tests, new container, hosted workflow, production build or deployment were run to extract this focused PR. The registered ai-production-slug.connected.cjs is reproducible on the ordinary test DB. Owner merges and applies the web update; upgrading only the browser bridge cannot change server slug generation.
