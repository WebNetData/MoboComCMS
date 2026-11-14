# Site demand, shared cart and link health — local validation 2026-11-14

Owner authorized all three flows in [the compact spec](../../specs/site-demand-sharing-health/SPEC.md).
Checkout `.mobocom/platform-integration`, branch
`feat/site-requests-shared-cart-link-health-2026-11-14`, base main `cbb469f5` after
owner merged PR470. This is new local work; prior PR evidence is history.

Read-only audit: Support Tickets are private conversations, not grouped demand;
canonical Inbox supports explicit `channels: []`. Section guards already exist.
Cart owns current pricing/stock and atomic component additions; never expose its
token or buyer inputs. Downloads has manual raw-fetch probe and grouped LinkReport
repair queue; `downloads/server/remote.ts` already supplies DNS/redirect/private-IP
guards. Operations Jobs and the existing scheduler own durable background work.
Graphify status: no local corpus. Serena initial instructions read; checkout
activation created local `.serena` tooling data, which is not product source.

Three scoped light agents were assigned read-only audit; all hit usage limits.
The request agent returned the owner/permission/Inbox audit; no worker source
changes or executed checks are claimed. Root implemented and validated the batch.

## Final local acceptance — resumed and completed 2026-11-14

Implementation commit `674c54e9` remains on the same feature branch. This
continuation resolved the Docker interruption, completed the pending checks and
removed the exact private runtime. Scope is locally functional; live hosting,
provider playback, external notifications and deployment remain outside proof.

- Inspected the preserved path/database before reuse:204 completed migrations,
  all three synthetic browser users, no old preview process. No reset/reseed or
  replacement container; source was synced from the feature base, not only the
  now-clean HEAD diff. The current connected PostgreSQL scenario passed, including
  late supporters, capability-path analytics exclusion and skipped-host backoff.
- Full Linux types exposed an optional dynamic-route context in the token route.
  `src/app/api/cart/share/[token]/route.ts` now has required typed adapters, like
  the base route's context-dropping adapter. Final complete Linux types passed.
  Source/import2962, parity, migration manifest, security, Audit, money UI2964 and
  primitives passed. Earlier architecture/account35 checks remain recorded.
- Browser quality continuation completed the saved request/cart write journeys:
  default-off health settings save/inventory refresh and owner UI revocation
  with recipient404 also passed. No original order/payment was created.
- Actual screenshot inspection found reliance on Store-only `sa-*` classes in
  new Support/Downloads/public surfaces. Replaced those dependencies with local
  CSS modules: `health.module.css`, `demand-desk.module.css`,
  `shared-cart.module.css`, using existing semantic tokens. Cards, form spacing,
  header rhythm and an independently scrollable/focusable table preserve the
  current MoboCom chrome and wide layout. No Store stylesheet imported into
  Support/Downloads. Only affected views were invalidated/recaptured.
- Final receipt: **12 unique clean views**, all scoped axe0/document overflow0,
  page errors0: request form1440 light/dark and join390 dark; request Admin,
  shared cart and health each1440 light/dark/390 dark. Business and presentation
  phases completed separately, not one uninterrupted full-suite run. Final
  health390 dark and shared-cart1440 light were visually inspected; the earlier
  mobile request/share inspection remains valid. React Doctor reviewed the three
  changed TSX:0 blocking errors/11 warnings, after earlier17-file/49-warning review.
  Warnings are bounded async/state, server-bounded numeric inputs, read-only note
  keys, native form handling and formatter/structure suggestions; no suppressions.
- Stopped only the three exact-cwd preview processes, then removed the current
  price fingerprint check **only in private source**. The native stale-price
  rejection assertion failed as expected. Restored the original file byte-for-byte
  and the complete connected scenario passed again; restored digest is in the
  structured receipt. No public source mutation or financial fixture survived.
- Before cleanup, actual SHA256 comparison passed for **54 named tracked changed
  source/script/schema files**, excluding generated AI documentation JSON. A
  verifier enumeration mistake omitted the three still-untracked CSS modules;
  these have actual final browser proof and recorded host hashes, **not** runtime
  byte-for-byte hash proof. Do not claim every changed file was hash-compared.
  The helper is corrected for future use; no DB rebuild/repeated business suite
  was performed merely to manufacture an omitted checksum receipt.
- Identity-checked cleanup actually stopped the task preview/one matching host
  tunnel, dropped only `mobocom_demand_test_20261114`, removed
  `/tmp/mobocom-demand-20261114` and its named archives, host TLS/session fixture
  and private Prisma client. Removal/DB absence were checked. The original app3000
  readiness and session both returned200. Retained host logs redact share tokens.
- Final existing one-rule Semgrep43 source files and redacted full feature diff
  Gitleaks67 files passed with0 findings. Canonical AI knowledge regenerated and
  its14-document integrity check passed. No dependency/tool installation or
  hosted validation was added.

The [structured receipt](../evidence/site-demand-sharing-health-2026-11-14.json)
is authoritative for final proof/coverage. Canonical map/ledger/workstate and the
Persian operator guide reflect this completion. Product code remains local; no
PR/push/hosted workflow, merge, provider call or deployment was performed.

Continue with a fresh named isolated fixture if new code needs runtime checking;
the old database, private client and preview were deliberately cleaned. Preserve
`.serena` tooling data and unrelated root/worktree changes. The bounded product
limits/rollback below still apply. There is no remaining Docker blocker for this
completed local slice.

## Historical checkpoint at 674c54e9 — superseded by final acceptance above

All three owner services, additive schema, private/public thin APIs and connected
UI are implemented locally. **This batch is not complete or release-validated.**
Docker Desktop failed during final browser acceptance: first `Docker Desktop is
unable to start`, then the `dockerDesktopLinuxEngine` pipe disappeared. Both
ordinary and escalated localhost PostgreSQL access failed. No daemon reset,
replacement container, production mutation, hosted workflow, PR or push ran.

### Source and ownership

- Support: `src/modules/support/domain/demand.ts`, `server/demand.ts` facade and
  `server/demand/{commands,http,targets}.ts`. Explicit normalized-title joining,
  one private supporter note/user, canonical per-section permission and global
  Forum moderation, serializable decision/version claim, strict Audit, typed
  current public target, existing Jobs and Inbox with `channels: []`. Late joiners
  have an independent per-user job, so a past batch cursor cannot skip them.
  Notification points to owned tracking, where the destination is revalidated.
- UI: `ContentRequest`, `DemandDesk`, `content-request.module.css`, existing
  `SiteUtilityControls` and empty Search. Section lookup uses canonical routing,
  including renamed public section addresses. Existing `/dashboard/requests`
  remains the Forms desk; new `/dashboard/content-requests` is separate and linked
  from MyRequests/AccountShell. `/admin/content-requests` uses existing section
  guards, not a new global `cms.posts` permission. Explicit label/ID connections
  were added after actual browser locator failures.
- Store: `server/shared-cart.ts` facade and `shared-cart/{read,commands}.ts`,
  `http/shared-cart.ts`, thin `/api/cart/share` and `/[token]` adapters. The base
  route deliberately drops Next's empty context; otherwise it would be mistaken
  for a token route. Existing Cart owns atomic additions/current prices/limits.
  Only public physical, non-service/non-open-amount/non-seller selections without
  buyer fields are shareable. Invalid field configuration fails closed. Seven-day
  192-bit token, SHA256 storage, twenty active links/source cart, owner revoke,
  explicit current fingerprint/selection, transactional import replay and a
  version/revocation/expiry row claim that serializes an import with revocation. GET/POST
  success projections use private/no-store and no-referrer. `/shared-cart/[token]`
  is noindex/nofollow and uses existing public chrome. CartPage exposes creation;
  existing quotations accept the combination into a draft with explicit customer
  selection. No payment, stock reservation or private price snapshot is shared.
- Analytics/PWA: capability paths `/shared-cart` and existing `/quote` are excluded
  at both client beacon and server normalization; do not store bearer paths as
  AnalyticsDaily dimensions. This does not promise removal from HTTP access logs.
- Downloads: `domain/health.ts`, `server/health.ts` facade and
  `health/{settings,sources,worker}.ts`; existing `server/remote.ts` owns protected
  HEAD and range fallback, including pinned DNS/private-IP/redirect checks.
  Existing manual probe now uses that guard too. Default off; exact approved
  public hosts, 6–168h interval, 1–3 sources/batch, 8s overall probe deadline,
  bodies destroyed on headers. Source hash, row lease and serializable current
  source recheck discard edited results. Settings/module changes are rechecked.
  Scheduled parent/release publication dates are respected. Existing Jobs
  scheduler/queue run bounded work; repeated file failures create one ordinary
  OPEN LinkReport and never disable a source. Music normal/HQ use the same health
  inventory and Music edit link, since LinkReport only relates to MediaLink.
  `/admin/downloads/health` and its scoped API expose revisioned settings, last
  status/success, repair links and existing monitoring/report destinations.
- Prisma: `20270321120000_site_demand_sharing_health` is additive migration204,
  listed in release-manifest; both schema dialects have ContentDemand,
  ContentDemandSupporter, SharedCart, SharedCartImport and DownloadLinkHealth plus
  canonical User/content/cart/source relations. PostgreSQL CHECKs constrain
  decision/typed destination, share shape and health state/source. Existing money
  states/types are unchanged. Do not edit an applied migration to fix runtime.
- Maintained acceptance: `scripts/site-demand-sharing-health.{connected,fixture,browser}.cjs`.
  Native check is registered with existing `run-pg-checks.cjs`. The existing
  account permission fixture allows the new actual Magazine-owned demand guard.

### Actually executed before the environment failure

- Fresh private PostgreSQL: all204 migrations applied, private generated client,
  UID1000/no `.env`. Exact DB `mobocom_demand_test_20261114`; isolated source
  `/tmp/mobocom-demand-20261114` in existing `mobocom-app`. Original app3000 was
  not restarted or replaced. Task preview3123 used task-only TLS/session fixtures.
- Native connected check **passed twice**: explicit joining/replay/privacy,
  cross-section/foreign-origin/stale-decision denial, current published target,
  inbox-only notices, current price rejection, atomic stock caps/import replay,
  sender cart preservation, ownership/revocation and buyer-field refusal; health
  persistence/report dedupe/recovery/edited URL discard/unlisted-host no-I/O.
  Real loopback HTTP exercised HEAD, HEAD405→one-byte Range, private redirect and
  private destination refusal; worker provider responses were synthetic.
- Full Linux source types passed after correcting the new public chrome and
  Next base-route context. Architecture passed. Source/import2962, schema parity,
  release manifest, security, Audit, money primitives/UI2964 passed; account
  security35 tests passed. These are earlier snapshots, not final source proof.
- Actual browser persisted two complete journeys: empty Games search→request,
  second customer explicit join→manager fulfillment→owned public target; cart
  link creation→recipient quantity review→atomic import→sender qty2 vs recipient
  qty3→existing quotation draft import. No quotation/order/payment was created.
  Health default-off, revisioned save to12h and inventory refresh also executed;
  table assertion incorrectly expected isolated text instead of a composed cell.
  That locator was corrected, but quality continuation could not reach PostgreSQL.
- Last clean receipt has **four** scoped axe0/overflow0 screenshots: request dialog
  1440 light, join390 dark, request Admin1440 light, shared cart390 dark; zero page
  errors in that accepted run. Mobile join/shared screenshots were actually
  inspected. The remaining health/themed desktop/mobile views and browser revoke
  are pending. Do not claim a whole-site accessibility or full-run pass.
- React Doctor17 affected TSX: exit0, zero blocking errors,49 warnings including
  existing large pages/effects, guarded async state, input parsing and PWA legacy
  dialog suggestions. No blanket suppression/dependency install. Existing local
  one-rule Semgrep43 source files and redacted changed/new Gitleaks57 files passed.
  Initial Gitleaks invocation used a missing checkout config; corrected to the
  existing root config. No auto-review rejection.

### Failures and final-source gaps

Earlier failed browser attempts remain failures: exact labels of wrapped selects,
an exact product-name locator that omitted quantity text, and unscoped duplicate
owned target links. Labels/source or test locators were corrected. A malformed
buyer-field native fixture revealed a fail-open parser assumption; sharing now
uses the validating parser and the corrected native scenario passed. No test was
weakened to accept an incorrect write.

After the last successful Linux run, late-supporter regression and analytics
privacy assertions were added; these new assertions have **not run on PostgreSQL**.
The last publication-date/parent-album checks, import/revocation row claim,
skipped-host counter/backoff correction and some browser/routing edits also
need final types/source/native/browser rerun. Host whole-source TypeScript fallback
failed on missing TinyMCE/Tiptap/assjs dependencies and AI monitoring Prisma types;
it is not a full typing pass and unrelated product code was not changed to hide it.
Final host syntax/import2963, architecture, parity, manifest, security, Audit,
money UI2965 and primitive checks passed using the already-installed exact5.9.3
parser through a task-only preload alias (`typescript-api` was missing by name on
the host). No dependencies or product tooling were changed. The earlier direct
host source invocation failed before this adapter and is not counted as a pass.
The task tunnel was confirmed already exited through an identity-checked process
query; the initial PowerShell file invocation was blocked by execution policy and
an ordinary process query was denied, so only the later escalated query counts.
Final local scan: existing single Semgrep rule43 source files and redacted
changed/new Gitleaks64 files,0 findings. The [redacted structured receipt](../evidence/site-demand-sharing-health-2026-11-14.json)
stores host-only source hashes and explicitly records missing final runtime proof.
Final runtime SHA256 comparison and deliberate critical-guard fault/restore remain
**UNVERIFIED**. Do not skip them or mark this batch complete from older passes.

### Resume and cleanup

Ignored `var/site-demand-20261114` contains exact isolated helpers, private fixture/
client/TLS and redacted receipts. It is not product source and must not be staged.
The authoritative source remains this checkout. Docker failed before final
comparison/cleanup; private container source and task database are **not confirmed
removed**, and original readiness/session200 could not be rechecked. Do not claim
cleanup. Preserve these exact names for a future identity-checked cleanup.

Once Docker is available, inspect existing task PID/cwd/database before starting
anything; do not rerun non-idempotent prepare/schema/navigation helpers or reset
the DB. Sync current source with `sync-batch.cjs`; run connected demand/full types
and changed scoped gates. Browser runner `browser.cjs quality` retains the two
completed journeys/four views and continues health/themed/revoke acceptance using
the same synthetic fixture. Current `result.json` has exactly those two operations.
If a later partial run changes that shape, inspect it before choosing continuation.
Run one meaningful critical-guard mutation only in private source and restore it
byte-for-byte, then native pass. Finally sync/compare exact source hashes **before**
identity-checked cleanup; cleanup helper now refuses incomplete browser/missing
hash receipt. Only then update this checkpoint, map/ledger/workstate and commit a
validation receipt. Do not change original app3000 or root worktrees to repair a
task preview. Owner merges/deploys; PR only on a new owner request.

### Limits and rollback

Demand grouping is exact conservative normalization with explicit joining, not
fuzzy merging. Completed/declined groups do not reopen in this slice. Lists are
bounded (100 requests; last10 supporter notes in Admin); no bulk moderation or
unbounded export. Shared-cart selection is ordinary physical goods only; current
caps are enforced inside canonical Cart and checkout still revalidates. Health
checks metadata, not file integrity/full playback, and exact redirect hosts need
approval. Music repair stays in the common health inventory rather than creating
a second LinkReport model. No real provider/playback or external notification ran.

Rollback disables the health setting/job producer and removes UI exposure while
retaining the additive tables/history. Revoke exposed shares. Do not drop tables,
rewrite orders, revert identity relations or purge supporter/audit history. Read
[the Persian operator guide](../../SITE-DEMAND-SHARING-HEALTH-FA.md).
