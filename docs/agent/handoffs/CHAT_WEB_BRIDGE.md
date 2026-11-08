# Editor loading and personal Chat web bridge — 2026-11-08

Owner chose the personal unofficial browser bridge after discussing its UI
fragility and account limits; command and result remain in MoboCom Admin. No
free/unlimited claim, account sharing, private inference endpoint or cookie export.
Owner merges/deploys; immutable1.7.9 artifacts are not changed.

AdminCrud lacked its richtext branch outside block-driven content, so with the
block-editor module off the HTML body appeared in a one-line input. Reproduced
against a real isolated draft, then restored ContentEditor with functional updates
after existing block locks. The initial real browser now renders TinyMCE with the
original formatted text and no page errors. Other field types and body locks stay.

AI owns editor-assist.ts for one source/polish/excerpt prompt and parser shared
by API writing and the explicit browser transport. Private POST /api/admin/ai/chat-web
is prepare/complete only: canonical cms.posts, module, explicit Origin, strict limit,
bounded JSON, no-store, existing sanitizer. No content/job/credential writes or model
request. Native PostgreSQL check passed canonical actor/section/standing denies,
Origin/module/rate/bounds, shared prompt/parser equivalence and no inference fallback.

deploy/chat-web-bridge contains reviewed MV3 source, packaged by existing
scripts/pack-package.mjs into public/downloads/mobocom-chat-web-bridge.zip. Optional
single-site grant, fresh owned background tab, ID/tab/origin binding, one request,
completion marker, cancellation and no replay. Popup grants/revokes; panel relay
only runs on Admin posts. The browser alone holds the ChatGPT login. Existing
writing panel adds transport, installation help, undo and explicit stale-form review.
No new schema/dependency/settings or shared identity/queue owner.

Validation receipts: .mobocom/editor-loading. Actual unpacked extension returned a
controlled Chat DOM answer into the real Admin form and undo restored the original.
The test harness explicitly navigates the owned blank tab to its controlled Chat
fixture so no external account is involved. Real editor PATCH/save/reload retains
strong markup; missing extension never falls back to inference; a delayed UI relay
fixture proves stale-form review/apply/undo and cancellation/late-response refusal.
Four1440/390 light/dark scoped axe0/no-overflow views were captured and inspected.
Real ChatGPT account remains operator verification. The test manifest alone grants localhost;
worker/panel/chat scripts must match shipped bytes. Initial popup test reused a
cached service worker; fresh profiles avoid it. A test-fixture syntax error was
corrected before the native pass. Local preview/types memory contention interrupted
checks; passed units/inventory are reused and unfinished checks resume without the
preview. No interrupted/fixture-only check is production certification.

Rollout: web deploy plus optional personal desktop extension install/grant/manual
Chat login. Existing configured API transport remains the default. Rollback:
select that transport, disconnect/revoke the extension and optionally revert code;
drafts/history are kept. Operator instructions: ../../CHAT-WEB-BRIDGE-FA.md.

Final local evidence:91 editor/AI units and the exact Magazine permission inventory
passed; native chat-web passed on the fresh176-migration owned database as UID1000
without dotenv. Final types, source, architecture and canonical knowledge integrity
passed. Source/Origin guard has an explicit malformed-site-URL refusal. Scoped
Semgrep has no findings. React Doctor has0 errors; reviewed complexity/legacy Admin
warnings and deliberate response/error/finally patterns remain. Gitleaks has0 new
findings and one unchanged pre-existing account-security test-line finding, proven
identical to HEAD and separately scanned; no baseline/suppression was changed.
ZIP entries exactly match reviewed source. No new dependencies/schema, local
production build, real account use, hosted browser dispatch or deployment.

Harness corrections: fresh profiles avoid cached extension workers; explicit fresh-tab
load waiting fixed a real transport race; fixture UTF-8/response format and expected
CMS PATCH method were corrected. The successful saved fixture was reused. A final
knowledge check first saw old copied docs; copying the actual canonical docs fixed
the overlay, and passed types/native checks were not repeated. These failed or
interrupted attempts are not counted as successful product checks.

Closure: public extension ZIP served HTTP200 with exact SHA256/source entries;
20 final code/test/extension/ZIP hashes match the validated Linux copy. Owned
container/database, all9 disposable profiles and synthetic cookie removed.
Original app/PostgreSQL services remain running and session HTTP200.
No production deployment or real ChatGPT account verification.
