# Connected platform journeys — 2026-11-14

## General Automation event recovery — 2026-11-27

The owner asked to continue the next defect after PR505. Local branch
`fix/automation-event-recovery-2026-11-27` on main `6ef4b061` changes
the existing scheduler's general AutomationEvent worker. A two-minute
token-bound claim replaces the previous early processed timestamp.
Preparation failures wait before retrying. An expired claim without an
action start may be recovered. A recorded possible effect is retained for
review and is never automatically replayed. Each action and final
completion check the current token and expiry. CRM engagement dedupe
receipts and non-event schedules keep their owners and behavior.

The private `GET /api/admin/automation` response adds `recovery` for
`automation.manage`. It returns the count and 20 recent event IDs,
types, dates and stable codes. It does not return job payloads, provider
messages or lease credentials. The scheduler emits a count-only warning.
This slice includes no dashboard change or replay command. Automatic
producer persistence and exact-once provider delivery remain separate.

Verified in disposable PostgreSQL 17, with a non-superuser database
owner and Linux UID1000 without an `.env`. All 225 migrations applied.
The registered `automation-event-recovery` test exercised competing
workers, pre-action recovery, pre-action backoff, possible effects under
expired claims, a stale worker failing to start a second action, and
CRM receipt preservation. The private review projection passed. The
existing `crm-engagement` connected test, 17 Automation unit cases,
TypeScript, source/import, architecture, security, schema parity,
SQLite/PostgreSQL Prisma validation and migration manifest passed.
External effects were fixture doubles. No real provider calls or
browser check ran.

After PR506 merged, rebased onto main `32a3eeda`. The combined runtime
at `5d1f6977` applied all 226 migrations to a fresh PostgreSQL instance.
`automation-event-recovery`, `crm-engagement`, `crm-follow-ups`,
`crm-customer-desk` and `crm-scope-currency` passed, as did all 17
Automation unit cases, TypeScript, source/import, architecture and
security. A separate populated upgrade from 225 to 226 retained an
assigned customer follow-up, a processed CRM receipt and an unprocessed
general event. Both databases were isolated from the local application.

`20270413120000_automation_event_recovery` is additive and unreleased.
Pause all scheduler instances before upgrading or rolling back the
worker. Older workers do not interpret leases or review fields. Reconcile
pending rows with possible effects before allowing older workers to
resume. Preserve the columns, quarantined rows and CRM receipts.
[Scope and acceptance](../../specs/automation-event-recovery/SPEC.md).

## Public UI regression correction — 2026-11-14

Owner reported1.7.20 screenshots with unwanted «مطالب و رویدادهای مرتبط» in celebrity/cinema hero actions and broken Business filter layout; confirmed the Business issue is appearance, not placement. Checkout .mobocom/public-ui-regressions, fix/public-ui-regressions-2026-11-14, base owner-merged main1147e518. Other worktrees and immutable1.7.20 assets preserved.

- Root cause96ac5736 appended ItemHistory globally to ItemActionBar. Removed that render/import and unused component/CSS, superseding the original global placement below. Existing favorite/follow/collection/PDF and RecentViewTracker remain. Separate artist/person controls predate1.7.20 and were not collapsed. Audited11 page owners/12 calls: Catalog, Studios, Software, Cinema title/person, unified Celebrity, Music track/artist/album, Games and Magazine. Timeline/read API remains.
- Business module CSS now gives fields equal flexible width,48px selects/submit/reset target and aligned icon slot; retains tokens/colors and mobile stacking. Baseline actually measured42px selects versus46px submit. No global CSS changed; source diff found no1.7.19→1.7.20 Admin CSS leak into this form. Acceptance also exposed stale uncontrolled defaults after clearing URL filters. Filter form keys q/kind/category; search input keys q so cleared URL defaults replace stale DOM values. Existing two browser scenarios now guard these regressions and retained timeline API.
- Executed before:4 screenshots reproduced Celebrity history twice/Cinema once and42/46px fields. After:33 guest views across11 actual routes,1440 light/dark and390 dark, no page errors/overflow. Final Business form/CSS changes invalidated its3 old views; these were recaptured and passed with48px equal controls/scoped axe0, retaining the30 unchanged views. Actual GET submit, valid long category, exact result, preserved q, clear/reset, keyboard and Admin→public navigation passed1366 light/1024 dark/390 dark. Visually inspected Celebrity desktop, Cinema mobile and Business controls. Scoped evidence, not all-site certification.
- UID1000 private Linux: source/import, architecture,16 engagement cases, existing item-timeline PostgreSQL and full TypeScript passed. Final source/architecture/types and both browser-script syntax checks passed after form changes. Doctor across3 affected TSX owners:0 errors/3 reviewed existing maintainability warnings, no suppression. Full Business/platform browser workflows were not rerun; their changed operations were exercised by focused actual acceptance. No full release stack, hosted Actions, provider sends or production deploy.
- Setup failures were corrected only in fixtures: missing required Business website, vocabulary code over40 characters, Studio without published credit. Initial33-view run resumed9 unchanged completed views after the Studio correction. Both app/PostgreSQL restarted together19:24:33Z (OOMKilled=false/restartCount0), interrupting final recapture; task CSS copy became empty while host source remained intact. Re-copy plus exact SHA256 comparison4072 inputs passed (only known Next-written tsconfig/next-env differed; retired files absent), followed by exact private cache/process reset. Task TLS close was corrected to flush buffered bytes; retry failures are not product passes. Final recapture and functional filters passed on recovered source/cache.

Private helpers/evidence: var/ui-regressions here, /tmp/mobocom-ui-regressions-20261114 in existing app container, separate mobocom_ui_regressions_test_20261114 database and localhost TLS3125. Final verification/cleanup/Git receipt follow before handoff. No production data/credentials/providers used. Rollback: focused source/CSS revert; no migration/data change. Never replace1.7.20 release assets; any later install package uses a new version after owner merge.

Final local receipt: all4072 source/build inputs matched exactly after the last code and generated-knowledge changes; only Next-written tsconfig.json/next-env.d.ts differed, with no missing/unexpected source and both retired UI files absent. The14-document knowledge check passed. Final Business3-view recapture and1366/1024/390 functional filter/Admin-navigation checks passed after recovery. The exact2 private preview processes, source/dependencies/env/runtime, task DB, task TLS forwarding, host session/certificate files and two named container archives/setup helpers were removed. Original /api/health/ready200 and /api/auth/session200 were rechecked after cleanup. Private screenshots/logs/receipts remain under var/ui-regressions. Git/PR publication receipt follows; owner merges and deploys a new version.

## Published pull request — 2026-11-14

Owner requested a PR for all development through the current slice.
[PR #468](https://github.com/WebNetData/MoboComCMS/pull/468) is open, non-draft and targets main
from `feat/platform-integration-2026-11-14`. It contains platform journeys,
launch corrections and purchase guides; source/evidence head `8b534e15`,
followed by this documentation-only publication receipt. Fresh main remains
`68746778`; full72-file range review retained history, Gitleaks0 and the
local Semgrep rule on40 TS/TSX targets returned0. The42 recorded scoped
axe0 views/native checks are earlier executed branch evidence, not new full
release runs. Owner merges/deploys; real content/provider/printer/restore gaps
remain. No workflow was dispatched. Earlier local-only statuses are historical.


ادامهٔ اجرایی امکانات پایهٔ افتتاح در
[Store launch basics](STORE_LAUNCH_BASICS.md) ثبت شده است: اصلاحات محدود
فهرست کالا، درگاه، ارسال و صندوق، شواهد تازهٔ محلی و حدود تأیید. پیشنهادهای
محفوظ زیر و تاریخچهٔ شش مسیر پلتفرم همچنان حفظ شده‌اند.

## اولویت جاری مالک: امکانات پایهٔ راه‌اندازی — ۲۰۲۶-۱۱-۱۴

مالک تصریح کرد هدف فعلی بازکردن سایت و تکمیل امکانات پایه است. پیشنهادهای
محفوظ زیر backlog آینده‌اند، نه مسیر اجرایی جاری. در پیشنهاد یا توسعهٔ بعدی،
ابتدا مسیرهای ضروری شروع کار را در کد و محیط واقعی بررسی کن: تنظیمات و
ناوبری/اطلاعات تماس، انتشار کالای واقعی با قیمت و موجودی، ورود مشتری، خرید
و پرداخت/بازیابی پرداخت، پردازش و تحویل سفارش، دسترسی کارکنان، رسیدگی به
درخواست مشتری، پشتیبان‌گیری/بازیابی و خطاهای مانع استفاده. برای بخش‌های
محتواییِ موردنظر مالک، انتشار و دسترسی عمومی نیز جزو مسیر پایه است.
موجود/ناقص/مسدود/بررسی‌نشده را با شواهد جدا کن؛ امکانات ساخته‌شده را دوباره
نساز و حضور کد یا تست آزمایشی را آماده‌بودن production معرفی نکن. این یادداشت
هیچ مجوز تازه‌ای برای انتشار، استقرار، پرداخت واقعی یا ارسال پیام ایجاد نمی‌کند.

## پیشنهادهای محفوظ برای ادامه — ۲۰۲۶-۱۱-۱۴

مالک خواست پیشنهادهای زیر فراموش نشوند و فعلاً پیشنهادهای دیگری مطرح شوند:
گسترش API رسمی موبایل/دسکتاپ (پیشنهاد اول با مسیر ورود تا پیگیری سفارش)،
ادامهٔ فعالیت میان دستگاه‌ها، حریم خصوصی و مدیریت دادهٔ حساب، ورود/خروج
استاندارد داده، تمرین واقعی بازیابی در محیط جدا، و راهنمای شروع کارکنان.
این‌ها گزینه‌های آینده‌اند؛ درخواست حفظ پیشنهادها مجوز پیاده‌سازی آن‌ها نیست.
پیش از انتخاب، مالکان و قابلیت‌های موجود بررسی و ادامه داده شوند.

مالک همچنین خواست این شش گزینهٔ بعدی حفظ شوند: پروندهٔ تجهیزات مشتری
(پیشنهاد اول این گروه)، پیش‌فاکتور و پیشنهاد فروش، گردش خدمات پس از فروش و
ضمانت، توسعهٔ Solution Packهای کسب‌وکار، همکاری و اشتراک‌گذاری فهرست‌ها و
مجموعه‌های کاربران، و مدیریت حقوق/منبع/مجوز محتوا. این گروه نیز صرفاً
پیشنهاد محفوظ است؛ وضعیت پیاده‌سازی آن‌ها هنوز ممیزی نشده و مجوز اجرا ندارد.

گروه سوم نیز به درخواست مالک محفوظ است: محیط پیش‌نمایش تغییرات
(پیشنهاد اول این گروه)، تأیید دوم برای عملیات حساس، رزرو خدمات با ظرفیت
کارکنان و تجهیزات، اشتراک خدمات دوره‌ای، مدیریت پیشنهادها و رأی کاربران، و
گزارش نتیجهٔ کسب‌وکار با تفکیک دادهٔ قطعی از برآورد. این‌ها نیز ایده‌های
آینده با وضعیت ممیزی‌نشده‌اند؛ حفظ آن‌ها مجوز توسعه یا تغییر سیاست نیست.

گروه چهارم نیز به درخواست مالک محفوظ است: خرید سازمانی و حساب شرکت‌ها،
تعهد زمان پاسخ‌گویی پشتیبانی، مرکز دارایی‌ها و حق دسترسی مشتری
(پیشنهاد اول این گروه)، تنظیمات دسترس‌پذیری کاربر، مدیریت عمر محتوا، و
سنجش رضایت پس از تحویل/خدمت/پشتیبانی. این گزینه‌ها ممیزی یا اجرا نشده‌اند؛
درخواست فعلی فقط حفظ آن‌ها و پیشنهاد برای فروشگاه فیزیکی است.

گروه پنجم، ویژهٔ فروشگاه فیزیکی، به درخواست مالک محفوظ است: ثبت تحویل
دستگاه و لوازم همراه با تصاویر و تست اولیه؛ رزرو قطعات برای تعمیر
(پیشنهاد اول این گروه)؛ خرید یا معاوضهٔ دستگاه مشتری؛ سفارش کالای ناموجود
همراه پیگیری بیعانه و وعدهٔ تحویل؛ رهگیری قطعه/دستگاه نزد تأمین‌کننده؛ و
موجودی لوازم مصرفی تعمیرگاه. وضعیت اتصال‌های موجود پیش از هر توسعه بررسی
شود؛ این‌ها پیشنهاد محفوظ‌اند و درخواست ثبت به معنی مجوز اجرا نیست.

گروه ششم، ویژهٔ عملیات مغازه، نیز به درخواست مالک محفوظ است: تأیید هزینهٔ
تعمیر توسط مشتری و تأیید مجدد افزایش هزینه؛ چک‌لیست کنترل کیفیت پیش از
تحویل (این دو پیشنهاد اول گروه)؛ رهگیری دوباره‌کاری همان ایراد؛ شناسایی
کالای راکد؛ نشانی دقیق قفسه/کشو/جایگاه کالا؛ و ثبت دستگاه امانی یا جایگزین
با متعلقات و موعد برگشت. این‌ها ممیزی یا پیاده‌سازی نشده‌اند و باید با
گردش فعلی فرم‌ها، تعمیرات، انبار و رسیدها تطبیق داده شوند؛ فعلاً مجوز ثبت
پیشنهاد است، نه اجرا.

گروه هفتم نیز محفوظ است: زمان و هزینهٔ واقعی تعمیر، مرجوعی خرید به
تأمین‌کننده، صف مشتریان حاضر، مدیریت انتقال/تحویل اطلاعات مشتری و حذف نسخهٔ
موقت، و پیگیری وعده‌های داده‌شده به مشتری (پیشنهاد اول این گروه). این پنج
مورد ممیزی/اجرا نشده‌اند؛ با توجه به تصریح جدید مالک فعلاً زیر اولویت
امکانات پایهٔ راه‌اندازی قرار می‌گیرند.

## Integrated with owner-merged Store PR467 — 2026-11-14

The owner merged Store PR467 while this work was being finalized. The complete
platform slice is now committed locally as `96ac5736` on top of `main`
`68746778`, branch `feat/platform-integration-2026-11-14`; final evidence notes
are a follow-up local documentation commit. Nothing is pushed or deployed.
Earlier uncommitted/base337831b3 entries below are historical checkpoints.

Rebase conflicts were confined to shared prepend-only workstate/architecture/
map/ledger/decisions, connected-check registration and generated knowledge.
Exact baseline-suffix checks preserved both complete histories; both suites'
registrations remain, and knowledge was regenerated from the existing14docs.
All29platform runtime source hashes are unchanged by the rebase. Fresh
PostgreSQL now applies200migrations, including the owner's Store migration.
All six directly related native scripts passed on that empty database as
UID1000 without `.env`; integrated TypeScript, architecture, source/import and
security gates also passed. This repeats only the affected integration scope,
not the full release or unrelated Store suites. Three updated Store-page
connection views at1440light/dark and390dark passed real related-article loading,
scoped axe0 and overflow0; the other15unchanged captures are retained. The
resumed runner again passed limited-staff/member/guest denials. Final native
receipt reconfirmed29source hashes, zero money rows and unchanged service work.
The second task runtime/database/private sessions/TLS were then removed;
original readiness/session both returned200. Ignored `integrated-main.json`,
`final-proof.json`, `browser/result.json` and `cleanup.json` are the final receipts.

## Final local evidence and cleanup — 2026-11-14

All six bounded journeys are implemented and verified locally;47changed
files were preserved in the local implementation commit. No PR/push/merge/deploy was made
for this batch. Owner can review this checkout; future Claude/Codex sessions
continue the same shared spec/handoff rather than reconstructing missing files
from the older root or autonomous-foundation branch.

- Final integrated TypeScript7, architecture, source syntax/import2855files
  and security gates passed. Expanded editorial acceptance proved52scheduled
  rows with exactly50detailed inspections and correct Tehran-midnight grouping;
  daily counts still sum to the whole window. Expanded workdesk acceptance
  passed custom active workflow stages and unpaid exclusion. Its first unpaid
  fixture had zero amount and was correctly refused by the existing database
  constraint; the fixture now supplies a positive amount/currency. The database
  rule and product behavior were not weakened.
- Removing the Forms customer-history held-work predicate in the private
  runtime made the real assertion fail (three visible submissions versus two).
  Exact source was restored and native CRM/Forms acceptance passed again.
  This deliberate failure is expected evidence, not an unresolved failure.
- Actual final browser matrix:18distinct successful scoped axe0/overflow0
  captures, covering six journeys at1440light/dark and390dark; page errors0.
  Read-only successful captures survived interrupted runs. Two light CRM/health
  views were specifically repeated after their final scoped contrast changes;
  other unchanged views were retained. Real workdesk failure/retry, explicit
  typo-link navigation, lazy related-article loading, limited-staff queues and
  actual member/guest403 denials passed. This is an interrupted/resumed matrix,
  not an uninterrupted full-run claim. Desktop workdesk/CRM and mobile workdesk/
  related-content screenshots were visually inspected.
- A single multiplexed loopback forwarding process replaced the task's earlier
  one-process-per-connection tunnel to reduce QA memory pressure; no application
  network architecture or original service configuration changed. Hydration
  handling was corrected for native details opened before listener attachment
  and StrictMode's abort/remount. Final ItemHistory Doctor:0errors/one reviewed
  loading-reset warning; the reset is in an abort-fenced `finally`.
-29normalized runtime source hashes matched the final local files. The
  generated AI knowledge is documentation metadata, separately checked against
  its existing14canonical documents. Native receipt confirms zero orders,
  invoices, payments or wallet transactions and unchanged synthetic service
  workflow. No customer financial or workflow action occurs in these reads.
- Redacted Gitleaks inspected the full changed tracked diff plus new source/
  scripts/docs (~1.16MB), zero findings; review also proved the entire baseline
  workstate history remains as an unchanged suffix. Scoped diff whitespace
  passed. Existing package/schema pins and owner changes are untouched.
- Cleanup actually stopped the three exact-working-directory preview
  processes and path/PID-verified task TLS forwarding; dropped only
  `mobocom_platform_test_20261114`; removed its realpath-verified source/private
  client/env/sessions/TLS and named transfer files. Host private fixture/key/
  cert/archive were removed. Ignored reports/screenshots/helper source remain
  under `var/platform-20261114`; they are not product or published data.
  Original localhost3000 readiness and auth-session endpoints both returned200.

No further feature work is required for these six bounded slices. The limits
below remain explicit product/operational boundaries; a future owner request
can extend additional workdesk queues or run real-provider/release acceptance.

Owner authorized all six proposed journeys, then asked to continue. Authoritative
checkout: `.mobocom/platform-integration`, branch
`feat/platform-integration-2026-11-14`, initially from `main` `337831b3`.
The final integration above includes owner-merged Store PR467; its earlier
independent/uncommitted status is historical. Preserve root, repair,
bank-checkout and autonomous-foundation's unrelated changes.
[Inventory, blueprint and acceptance](../../specs/platform-integration/SPEC.md).

## Implemented owners and contracts

| Journey | Actual change and boundary |
| --- | --- |
| Staff workdesk | Reporting `server/workdesk.ts`, private `GET /api/admin/workdesk`, `DailyWorkdesk` on the existing Admin home. Store's own `adminOrders` receives actor/manager scope; Forms' minimal `server/workdesk.ts` applies canonical handler/held-work scope and includes custom stages, excluding spam/unpaid/completed work; Support keeps department/holder scope. At most five rows per queue, exact counts, source timestamp/assignee and direct owner links. Forbidden/off queues are hidden; failed reads remain unavailable. No generic task table, due-date policy or financial writer. |
| Connected content | Existing Content `itemTimeline` is now accessible through a lazy native details panel beside `ItemActionBar` across current item pages. Existing Journal links, releases/episodes and public forum topics remain the sources. Article URLs/current visibility come from Content cards; Journal/Forum maintenance suppresses their contributions. API version1 shape is unchanged; response is now private/no-store to avoid retaining withdrawn connections. Client handles loading/failure/retry and details opened before hydration. No duplicate relationship graph. |
| Customer file | Existing Livechat `crmProfile` composes Forms `customerServiceHistory`; the route passes its authenticated actor. The current customer's canonical UserId alone selects at most30 recent service submissions, with up to200 related form configurations examined and truncation disclosed. `cms.pages`/full access or named `forms.handle`, plus unassigned/own-held scope, is mandatory. No answers, encrypted device locks, pickup/receipt tokens or phone-only account inference. CRM shows a recent-history service filter and summary with truthful restricted/unavailable states. |
| Search recovery | Page-only `suggestSearchCorrection`, pure Search typo helper and existing search page. Zero exact first-page/unfiltered results may offer an explicit one-character insertion/deletion/substitution correction, supported by current public titles. At most24 trigrams/400 candidates; corrected phrase is verified through ordinary `searchSite` with logging off. Short/numeric and ambiguous matches are refused. No automatic substitution, new index or change to `/api/search` JSON. Existing Analytics zero-result reporting and facets stay canonical. |
| Editorial calendar | Existing Journal dashboard/API gain14 Tehran dates, exact daily/total scheduled counts, at most50 detailed scheduled posts and existing `postIssues` facts. Old six-item `scheduledList` semantics are preserved. No automatic publish, invented age policy, new permission or workflow. |
| Operational health | Existing Operations monitoring gains typed action signals for failed/stalled jobs and the Notifications backup owner. `backup-status` reuses worker manifests/config/state, checks recent archive presence and reports disabled/unconfigured/running/failed/stale/unavailable separately. Existing backup panel shares the manifest reader. No secrets/raw backup state in health DTO; archive presence is not an integrity/restore guarantee. Recovery links use existing tools; reads never retry, restore, send or update a package. Monitoring has abort-fenced failure/retry and stale-data notice. |

No schema, migration, package/version, Identity, financial state, public route or
new extension lifecycle. Shared UI uses existing SDS/MoboCom tokens and preserves
approved compositions. Scoped Admin contrast fixes cover only CRM's selected
filter and monitoring error text; meters receive accessible names and valid
bounded values. API reads are internal typed contracts except the unchanged
version1 public timeline; no independent consumer/Pact interface was added.

## Executed checks so far

- Fresh isolated PostgreSQL17 database `mobocom_platform_test_20261114`, all199
  current migrations, private Prisma5.22 client; Linux UID1000, no `.env`.
- `operations-health.connected.cjs`: actual canonical permission denials,
  disabled/missing/archive/stale/corrupt/failed backup states, private DTO,
  actual failed/stalled BackgroundJob rows and read-only/no-store passed.
- `platform-workdesk.connected.cjs`: real canonical Identity/Forms/Support
  permissions, handler/held-work and department scope, guest API refusal passed.
  Store delegation uses a bounded adapter double to inspect actor/manager scope;
  this is not a new sale or inventory test.
- `platform-connections.connected.cjs`: actual Forms/CRM owner and route,
  canonical linked buyer, own/unassigned/colleague-held/named-form scope,
  damaged scope configuration, secret minimization and member/guest403 passed.
- `search-correction.connected.cjs`: ordinary exact owner query, one-edit
  suggestion, type isolation, withdrawn source, module/maintenance-off passed.
  The existing `item-timeline.connected.cjs` passed actual public article,
  release/episode/forum visibility, ordering and module-off behavior.
- `platform-editorial.connected.cjs` initially passed exact14-day counts,
  quality findings and no publication mutation. Expanded cap/midnight assertions
  are recorded after execution below.
- Focused Search ranking + Journal dashboard units:5 passed. Initial run4/1
  failed because the ambiguity fixture used a deliberately excluded three-letter
  candidate; changed it to two eligible four-letter alternatives, with the
  rejection assertion preserved. The old Journal mock now supplies fields for
  the new query; live pagination assertions are retained.
- Integrated native TypeScript7 passed after fixing the workdesk's literal key
  narrowing. Architecture, source syntax/import2854files and security passed
  before the final UI/Forms projection refinement; final scope is recorded below.
- React Doctor8affected files:0errors/18reviewed warnings. Existing broad-page
  complexity/index keys/time formatting remain advisory. New async views use
  abort fences and `finally`; loading-reset warnings do not bypass cleanup.
  No suppression or dependency upgrade. Installed host CLI was used after the
  isolated app's Doctor path was unavailable.
- Semgrep existing local rule,8sensitive source files:0findings/errors.
  Restricted initial invocation could not open the Windows CA store; normal
  authorized execution passed with local rules/metrics off and no source upload.

## Browser progress, failures and environment

Actual task-owned HTTPS/Playwright synthetic users exercise Admin home,
Journal, CRM, monitoring, Search and product-related content at1440 light/dark
and390 dark. Maintained runner `platform-integration.browser.cjs` can resume
successful read-only captures; exact completed matrix is recorded below.
It also checks workdesk failure/retry, explicit search-correction navigation,
private service projection, role-scoped day view and actual member/guest API
denials. It is not a production build, live-provider or whole-site certification.

Initial real axe found unnamed monitoring meters and dark CRM/error-text
contrast; source fixes use existing scoped Admin tokens. Native details opened
before hydration missed its request; mount/toggle handling now covers it,
including development StrictMode's abort/remount. No assertion was suppressed.
Next cold compilation hit its memory restart threshold and interrupted a
navigation; completed captures are retained and remaining views resume rather
than being claimed as an uninterrupted run. Docker Desktop itself also went
offline during a source copy; a hidden normal restart recovered the same app
and PostgreSQL without config, volume or data resets. One initial relative
Docker copy produced zero-byte files; source-size inspection identified it and
absolute-path transfers corrected it before migrations/tests.

Private ignored evidence: `var/platform-20261114/` in this checkout. Runtime is
`/tmp/mobocom-platform-20261114` inside the existing app, separate port3117,
private client/database/env/TLS and synthetic sessions. Owner app port3000,
database, source, real settings and providers are not test targets. No hosted
workflow, merge/deploy, real SMS/bank/provider call or destructive owner-data
operation has been performed. Cleanup/final validation follow below.

## Limits and rollback

This batch improves the six scoped journeys; it does not replace every Admin
screen. The workdesk currently composes Store/Forms/Support work, while editorial
approval/calendar stays in Journal. It does not introduce universal assignment,
SLAs, broken-link crawling or a new publishing workflow. Existing catalogue,
CRM, search categories/facets and monitoring functions were reused.
Typo recovery is a bounded suggestion sample, not exhaustive fuzzy search;
transpositions and broader semantic similarity are outside this matcher.
Backup signals are recorded state/file presence, not a newly executed restore
drill; package compatibility stays in the established update/extension controls.
No arbitrary retry, backup restore or provider action occurs while viewing.

Rollback removes the added read models/panels while preserving all original
links, orders, customer records, form submissions, queues, histories and settings.
There is no migration to roll back. Owner merges/deploys. Before continuing,
read the final evidence below and the active workstate; preserve unrelated work.

Published correction [PR #474](https://github.com/WebNetData/MoboComCMS/pull/474) targets main from fix/public-ui-regressions-2026-11-14. Initial verified source head `bc8128691caba9360bd8fb1c1a3b548db1ff493c`, OPEN/non-draft/MERGEABLE; this following receipt changes only handoff/workstate. Gitleaks over the staged14-file correction returned0, final diff check passed. Initial ordinary Git push failed to connect; one scoped HTTP/1.1 retry succeeded. Connected GitHub PR tool failed transport; existing GCM-backed gh created and verified the PR without exposing credentials. Owner merges/deploys; no Actions or release replacement.

## PR474 merge-conflict correction — 2026-11-14

Owner reports PR474 cannot merge. Fetched main d4e7e941 (owner-merged PR473 release receipt); the only conflict is .ai/MOBOCOM_WORKSTATE.md, where both branches wrote the first status paragraph. Merge main into fix/public-ui-regressions-2026-11-14, retain the complete incoming stable1.7.20 record/history plus the UI correction acceptance summary. Keep the merged release handoff unchanged. No product/source/CSS/test code differs from the previously validated UI source during this reconciliation, so existing scoped browser/PG/types evidence is reused. Diff check, knowledge integrity, redacted changed-diff scan and remote mergeability are verified for publication. No hosted workflow, self-merge to main, deployment or release asset changes.

## Screenshot frontend corrections — 2026-11-15

Owner supplied DailyWorkdesk and low-data utility screenshots and authorized small
frontend fixes. Authoritative checkout: `.mobocom/frontend-small-fixes`, branch
`fix/frontend-small-fixes-2026-11-15`, fetched main `58a67c81`; local uncommitted
slice. Other worktrees and existing edits are preserved.

- `DailyWorkdesk.tsx` and new `daily-workdesk.module.css` replace the UA list
  marker/global moving card hover with contained, keyboard-focusable queue rows.
  Headers wrap; grid tracks shrink; long titles/details wrap. Counts are localized;
  timestamp and assignee have separate wrapping groups and bidi isolation.
  Empty/unavailable/retry states and server access/queue composition are retained.
- `SiteUtilityControls.tsx` and `site-utility-controls.module.css` group the toggle
  with its description, add spacing/separation and mobile stacking, and associate
  the hint through `useId`/`aria-describedby`. Hint text now uses the current
  theme's `--muted`; the previous dark-only site token failed light contrast.
  Existing SDS/MoboCom colors, fonts, native controls and cookie behavior remain.

Executed evidence, retained in ignored `var/frontend-small-fixes/`:

- Playwright/Edge runs the actual affected React components and LowDataProvider
  with all root stylesheet imports, bundled fonts and the MoboCom manifest tokens.
  Six before/after views: 1440 dark/light, 390 dark/light, 320 dark, 1440 English.
  Providers/navigation and workdesk transport use explicit synthetic fixtures;
  this is component browser acceptance, not a full authenticated Admin-page run.
  All six final views: scoped axe0, horizontal overflow0, page errors0. Verified
  long mixed-script titles, empty/unavailable queues, stable hover, keyboard focus,
  low-data on/off and cookie writes, report dialog Escape and workdesk failure/retry.
  Desktop dark and mobile light final screenshots were visually inspected.
- React Doctor two affected TSX, files scope, telemetry/supply-chain disabled,
  blocking error: exit0, zero errors/two reviewed existing warnings (workdesk
  complexity and loading reset, which is already in abort-fenced `finally`).
- Fresh disposable PostgreSQL, 204 migrations, no `.env`, Linux UID1000:
  `platform-workdesk.connected.cjs` passed actual Forms assignment, Support
  department/held scope, permission denial, module-off and Store delegation.
  Full TypeScript, source/import and architecture checks passed. Four changed
  source SHA256 values matched the executed runtime byte-for-byte.
- First source transfer ran before archive completion and failed EOF; it was
  replaced only after completion. Installed Prisma schema comparison then refused
  reuse; a private generated client was used without changing the app's client.
  Initial browser harness selector/font/token setup failures were corrected;
  final captures use actual stylesheet/font/theme inputs. Serena initialization
  timed out, so precise source search and patch edits were used.
- Exact disposable database/runtime/private client/source archive were removed
  after saving receipts. Original localhost3000 readiness and session both returned
  200 afterward; final diff whitespace check passed. No new application dependency, schema, API, permission,
  provider send, hosted workflow, PR, merge or deployment. Rollback reverts these
  four presentation files; there is no data rollback. Existing page-wide and
  production/provider acceptance are outside this bounded correction.


## AI administration integration continuation — 2026-11-15

The current checkout is `.mobocom/admin-ai-integration`, branch `feat/admin-ai-integration-2026-11-15` based on `39a19818` plus prior small frontend fixes. AI category operations cover seven existing taxonomy namespaces; menu operations modify existing menu owners and support icons. Changes remain explicit-approval/opt-in and use stale guards and audit. The user directory shows the phone identifier in Admin while retaining canonical numeric identity/auth; deletion is limited to empty accounts and guards linked history. The shared public low-data strip and toggle were removed; media preferences and provider configuration remain. These Admin contextual tools do not imply arbitrary edits across every Admin domain.

Local app uses the existing `mobocom-app` container on port 3000 with this checkout mounted, skip-seed enabled, and local additive migrations 198→204. The actual configured provider's Gemini 2.5 attempt returned 404 and Gemini 3.8 timed out; the existing API configuration selected Gemini 3.1 Flash Lite with the key retained. One category proposal (id3) and one menu proposal (id4) were obtained and separate controlled browser approvals persisted two categories and one menu link with its book icon. Earlier scoped native, source, architecture, security, type and unit checks passed; earlier themed AI views and four current user views passed scoped axe with zero findings. Final current AI browser and checks passed; detailed scope is recorded in AI_OPERATIONS.md. No production, hosted, push, PR, merge or deployment evidence is claimed.
