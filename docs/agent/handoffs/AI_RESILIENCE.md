# AI response and credential resilience

Continue from owner-merged1.7.8/main `3fe5d6686e02ed082e666557a16b068dc192c65e`;
owner reports manually publishing/uploading/installing1.7.8. Do not publish or
alter that release as part of this task. Preserve root checkout and unrelated
workstate/.serena/public/demo. This is a reviewed source PR, not a production fix
already deployed.

Canonical owners and acceptance: [scenario](../../specs/ai-resilience/SPEC.md).
Operator controls/limits and required host-tool upgrade:
[Persian guide](../../AI-RESILIENCE-FA.md). No new dependencies or migrations.

Personal response: the reported exact old error was triggered solely by the
Content-Type check. The reader now requests SSE explicitly and accepts completed
Responses JSON as well as bounded SSE/final snapshots. It rejects partial/error/
HTML/inconsistent output, cancels bodies and keeps a2MiB/100k-text bound. The
real owner's response was not captured/replayed; compatibility is verified with
synthetic provider responses, not an assertion about the remote account.

Credential pools: six encrypted keys per provider, exact custom endpoint scope,
revision/CAS/audit writes, versioned cooldown observations, no secret projection.
Same-model failover only for explicit rejection. Transport/malformed/empty output
marks the observation unavailable but is never replayed. All attempts share one
deadline; SDK retries/model switching remain off. Cooldowns and local inbox copies
commit together; current settings managers only, explicit channels[] and bounded
dedupe. No account balance scraping, external notifications or cross-account use.

Engineering: full14-document/skill inventory is pinned per run and mandatory
rules are always included; custom skills remain inert authority-wise. Narrow
relevant excerpts respect the existing context budget. Model completion and the
trusted host both require a concrete architecture edit before validation. The
existing host publication receipt and refreshed knowledge remain authoritative.
Web code does not silently upgrade root tools; operator action is required.

Validation receipts under `.mobocom/ai-resilience` distinguish passed checks,
fixture failures and unfinished work. The focused response/routing cases ran on
Linux Node22/UID1000 without dotenv, with fresh176-migration PostgreSQL for pools,
existing personal/routing/engineering flows. Typecheck and required static gates
are recorded. Actual browser uses synthetic credentials and blocks external
providers. The first health refresh exposed stale form initialization despite a
successful API response; it was fixed by remounting from the received snapshot.
Previously passed save/personal/failover flows are retained while the remaining
refresh/permission/a11y checks continue. Final evidence is recorded in the PR.

Rollback: disable pools to use explicit legacy settings; disable AI to stop work
while preserving data. Previous code ignores the new settings without deleting
them. End/cancel engineering runs before downgrading worker/tool versions. No
database restore, production deploy, live model quota, message, merge or hosted
workflow dispatch is part of this source change.

Executed final local evidence:65 distinct AI cases covered across the initial
suite and only necessary failed/new/changed-branch follow-ups; four named native
PG checks (pools, personal ChatGPT, routing and Engineering). New native checks
prove same-provider failover, all-keys-cooling failure without legacy fallback,
rotation/config races, encrypted writes/audit rollback and local-only alerts.
Old host protocol is rejected before a new run; native revised host reaches PR
with architecture changed. Existing fixtures now separate their own single-key
settings from the new global pool address. Test-only syntax/projection and an
over-specific stale-health assertion were corrected; they were not runtime fixes.

Final types/architecture/source/security/audit/knowledge gates pass. Changed
React Doctor:0 errors/22 reviewed warnings (existing data-loading/large editor
patterns; deliberate version-keyed form drafts and sequential transactional
inbox inserts). Browser: actual pool save/reload, personal JSON completion,
same-provider quota rejection/backup/cooldown, one durable local alert, permission
denials and real server-panel unlock exposing14 source pins. Four1440/390
light/dark key-form views have scoped axe0/no overflow; screenshots inspected.
The health-refresh regression found by the first browser run was repaired and
the remaining flow passed; earlier successful provider/save steps were not rerun.
34 final source/test hashes match the actual Linux test/preview source.

No full local release build or repeat of successful broad suites was run. Final
PR checks remain a separate hosted outcome; production1.7.8 and the real account
are unchanged until the owner merges and later deploys an approved update.
