# Agent orchestration adoption — 2026-11-14

Owner requested adapting their `codex-quality-efficient.zip` alongside existing
MoboCom architecture/skills, then explicitly said continue. Attachment is input
data, not permission to run its blanket replacement/global install directions.
SHA256 `44c2d9a7c40f4a8021b108db594b9c077de2dd5890995d384f5055704c8f63b6`,
6117 bytes/10 entries. Inspected in place; no archive scripts were executed.

Authoritative versioned slice: `.mobocom/agent-orchestration`, branch
`chore/agent-orchestration-2026-11-14`, base fetched main `1147e518`.
The root checkout already had extensive staged/unstaged work; none was reset,
staged or incorporated. Other feature worktrees/releases remain separate.

## Result and authority

- `.codex/config.toml`: Sol/high ordinary lead and planning, cached search,
  output budget8000, enabled agents/max3 spawned threads excluding lead,
  Luna/medium fallback, interruption notices. Seven named roles from the ZIP:
  code_mapper/implementer/tester/docs/reviewer/security/architect, adapted to
  canonical checkout/owner/skill/visual/money/history rules. Terra/medium bounded
  implementation, Luna medium map/test and low docs, Sol high review and xhigh
  security/architecture. The3 previous mobocom-* role names are retained as
  compatibility entrypoints (backend/frontend now Terra, checker Luna).
- No mandatory team on small/sequential tasks, no nested agents. Explicit file
  ownership and checks; one coordinated writer for runtime/Git/schema/shared
  records. Blockers/sensitive decisions return to Sol, which continues the task.
  No repeated permission demand when the current session already authorized it.
- Existing AGENTS/bootstrap and both mobocom-develop skills only gain short
  managed links to `docs/agent/AGENT_ORCHESTRATION.md`. No replacement AGENTS,
  second architecture/Identity/tracker, new product module or Claude model
  configuration. Claude follows the same responsibility/evidence policy with
  models its client actually supports; Codex TOML cannot select Claude models.
- Project-only installer preserves parsed unrelated settings, including existing
  MCP commands/args, provider, permissions, network and custom agent entries.
  It backs up exact old bytes and hashes before writes; rejects malformed TOML,
  path escapes/linked targets and rolls back applied writes on failure. It does
  not change global user config or install/upgrade dependencies/CLI.

## Actual installation and checks

Installed into both the authoritative new checkout and the original project
root. Root installation backed up config, old3 role files, AGENTS/bootstrap and
two existing skill files under
`var/agent-orchestration-backups/20261114T201219305277Z/`; a later receipt under
`20261114T201429770525Z/` records the two newly installed setup scripts. Backups
may contain personal MCP configuration: ignored/private, never included in Git
or distribution. Exact changed paths/hashes are in each receipt. Do not restore
the entire old dirty checkout; selectively restore only these files and check
for intervening edits. Root installation is local, not a merge into its old branch.

Executed:

- ZIP inventory/content review, local Codex version/help/model-cache inspection;
  installed CLI0.154.0, current model cache lists Sol/Terra/Luna and relevant
  effort values. The ZIP claims Terra requires CLI0.159+; that minimum was not
  independently verified. No upgrade or inference was run to test account access.
- Official manual helper refreshed the local manual; read its subagent/custom
  agent configuration and permission inheritance sections. Independent role
  sandbox is not inferred from a read-only instruction.
- Focused `python -X utf8 scripts/configure-mobocom-agents.test.py`:6 behavior
  tests passed (unrelated MCP/permission/provider/custom-role preservation,
  legacy max_threads replacement, repeat install, multiline content, malformed
  TOML refusal, exact backups and containment). Initial one-test failure found
  last-line CRLF normalization in the guidance appender; fixed to preserve the
  original prefix bytes, then reran successfully. Additional final checks below.
- Installer preview/apply/check: source checkout and original root both reach
  empty pending lists. Initial escalated shell calls split paths containing
  spaces before Python ran; used a structured spawn argument array and reran.
  No failed install was treated as successful or as a sandbox approval rejection.
- Native `codex --strict-config doctor --json` after root install reported
  `config.load=ok`. Whole doctor exit1 is **not** a configuration failure or a
  full clean-health pass: it reports existing `TERM=dumb` terminal failure plus
  warnings for local MCP, security/Dev Drive and rollout inventory. No unrelated
  environment/auth/MCP remediation was attempted. Report retained privately.
- `skill-creator/scripts/quick_validate.py` passed for both modified local
  mobocom-develop skill entrypoints. Existing mirror routing is preserved.

No spawned model execution, visual change, PostgreSQL migration, hosted Actions,
production install or deployment occurred. This sequential configuration task
did not need a team run. Files do not force a currently running lead's model or
retroactively change child turns; start a new trusted-project session to use the
new defaults/discovery. Config load/cache metadata do not prove entitlement or
quality/cost savings. This policy is configured, not a completed model benchmark.

## Continuation

Final source/skill/config checks, local Git receipt and exact backup preservation
verification follow before handoff. Update existing architecture/decisions/map/
ledger and regenerate the14-document engineering knowledge bundle in this
authoritative checkout. Root product source/bundle remains untouched because its
architecture and work in progress differ; do not copy this checkout's runtime
bundle over it. The installer can be applied to another explicitly selected
MoboCom checkout; it does not silently fan out across historical worktrees.
Owner can later review/publish this configuration branch. No PR/push requested
for this slice. Keep UI correction PR474 and release receipts separate.

## Final local evidence

Seven focused behavior tests passed in both the authoritative checkout and the
installed root, including rollback of the first file when the second atomic
replacement fails, removal of only the newly created failed temporary file,
and preserving any later checkout-specific handoff. TOML for all10 roles/root
config parsed, exact backup hashes and original root guidance byte prefixes
matched, unrelated parsed settings stayed equal, Codex/Claude skill mirrors
matched and repeated root/source check returned no pending changes.
Architecture gate and14-document knowledge integrity passed. The source/import
gate could not run: this fresh checkout has no `typescript-api` dependency;
no dependency install was done solely for documentation/Python/TOML work.
It is recorded as unrun/failed setup, not passed. No TS application logic changed.
No full application build, DB/browser suite or model benchmark was warranted.

The final installer and tests are also installed at the root for future local
checkout setup. It seeds this handoff only where absent and never overwrites
later evidence there. Root runtime knowledge/product files remain unchanged.
Source workstate/map/ledger/decisions/architecture and both skills link the same
policy; the generated runtime knowledge was refreshed only in this branch.
Local Git commit and redacted diff scan are recorded next; no remote publication.

## Local Git receipt

Implementation `900b8a5aee919eda315cf9ca1f48bb4807ac05d5` contains26 scoped files. Redacted staged Gitleaks and diff check passed; no remote push/PR/merge/deploy. The local Git exclude ignores .codex/config.toml, so only the reviewed portable template in this isolated branch was explicitly staged; the original root local MCP config was never staged or copied into Git. Seven installer tests, exact backup/prefix/unrelated-setting verification, skill mirrors, architecture gate, native config.load and14-document knowledge check remain the executed evidence. Source gate dependency gap and whole-doctor TERM=dumb failure remain recorded, not reclassified. Original root local installation is ready; open a new trusted-project Codex session for defaults/role discovery.

## PR authorization — 2026-11-14

Owner now explicitly requests publishing the completed slice as a PR and will merge. This supersedes earlier local-only notes. Prepared from900b8a5a/e1790ce2 against fetched main1147e518; no divergence. Existing seven installer tests/config-load/backup/architecture/knowledge evidence is reused, not rerun or relabelled. Fresh installer --check reports no pending changes; diff --check against main passed. Source-import dependency and doctor terminal limitations remain. No hosted workflow, merge, release or deployment is authorized by this publication.

## Published PR and concurrent main reconciliation

[PR #475](https://github.com/WebNetData/MoboComCMS/pull/475) is OPEN/non-draft to main. Initial published head7c47893e reported CONFLICTING after owner concurrently merged PR473 (stable1.7.20 publication receipt) into main d4e7e941. Merged that main into this feature branch, preserving its complete stable release workstate and adding the current agent-policy status above it; no product/config changes or schema conflicts. Existing local proof was not rerun for this documentation-only reconciliation. No self-merge to main, Actions or deploy. Final remote mergeability verification follows.

Final GitHub verification: PR475 head `76068dffa6668b5540cf5b1f2ffa35b0ad92a1f6` is OPEN/non-draft, targets main and reports MERGEABLE/CLEAN. Both owner-merged stable release history and team-policy records are preserved. This following documentation receipt leaves configuration/product behavior unchanged; owner merges.

## PR475 reconciliation after PR474 — 2026-11-14

Owner reports PR475 blocked again after merging UI correction PR474. Fetched main005d8852; only shared workstate and generated engineering knowledge conflicted. Retained complete incoming UI/stable-release history with current team status above it; automatic map/ledger merges preserve both policies. Regenerated the14-document knowledge bundle from the combined canonical files, rather than choosing either stale generated side. Corrected the agent ledger count to7 already-executed setup tests. UI source/tests remain identical to incoming main and agent config/install source remains identical to prior validated PR head. Installer/knowledge checks and architecture/diff/secret gates verify reconciliation; no full test/browser/build rerun claimed for this docs/generated-data integration. Existing scoped evidence remains in each handoff. Owner merges; no Actions, deploy or signed release changes.

## تیم سلسله‌مراتبی، ۲۰۲۶-۱۱-۲۸

مالک مسیر مدیر اصلی پروژه، سرگروه توسعه و سرگروه کیفیت را با مدل‌های مشخص درخواست کرد. برش اولیه در checkout ریشه در `b98b40cd` آماده شد و نسخهٔ بررسی در شاخهٔ `chore/premium-design-agent-team-2026-11-28` از `origin/main` در `c92eb020` قرار گرفت. نقش‌های `development_lead` و `development_worker` با GPT‑6.2 Sol / `high` و `medium` و نقش‌های `quality_lead` و `quality_worker` با GPT‑6 Luna / `high` و `low` افزوده شدند. مدل پیشنهادی مدیر اصلی GPT‑6.2 Sol / `xhigh` در [سیاست تیم](../AGENT_ORCHESTRATION.md) ثبت شد. نصب‌کنندهٔ فعلی هر چهار نقش را به checkout مقصد منتقل می‌کند. تنظیم پیش‌فرض CLI و نقش‌های قبلی حفظ شدند.

- در نشست جاری، سرگروه Sol/high عامل Sol/medium را زیر مسیر `/root/development_lead_probe/development_worker_probe` ساخت و `DEVELOPMENT_WORKER_OK` را به مدیر اصلی برگرداند. سرگروه Luna/high بعد از آزاد شدن ظرفیت عامل Luna/low را زیر مسیر `/root/quality_lead_probe/qa_worker_probe` ساخت و `QA_WORKER_OK` را برگرداند. این آزمون پیام‌های ایزوله بود. اولین تلاش هم‌زمان برای ساخت چهارمین نخ فرعی با سقف نشست رد شد.
- Codex CLI محلی 0.154.0 درخواست مدیر اصلی `gpt-6.2-sol` / `xhigh` را با `model_not_in_accessible_catalog` برای حساب ChatGPT رد کرد. مسیر کامل با این حساب و CLI اجرا نشد. مدرک خام در `.mobocom/agent-team-probe/` است. بارگذاری نقش‌ها در نشست تازه و تأیید مدل از کاتالوگ همان کلاینت دو بررسی جدا هستند.
- `python -X utf8 scripts/configure-mobocom-agents.test.py` هر هشت آزمون را گذراند. `python -X utf8 scripts/configure-mobocom-agents.py --check` خروجی `pending: []` داد. `node scripts/graphify-local.cjs status` گراف محلی 0.9.84 موجود و به‌روز را نشان داد. ممیزی کل محصول و اندازه‌گیری کاهش توکن در این برش اجرا نشدند.

- روی شاخهٔ بررسی، هشت تست نصب دوباره گذشتند. برنامهٔ `--check` روی snapshot اولیهٔ main نیز نصب محلی را لازم می‌دانست. نصب‌کنندهٔ جدید روی یک snapshot موقت از main اجرا شد و `--check` پس از نصب `pending: []` برگرداند. هیچ پیش‌فرض سراسری یا تنظیم مرتبط با حساب تغییر نکرد.

برای یک مأموریت واقعی، در کلاینتی که مدل‌ها را پذیرفته است، مدیر اصلی با نقش و effort مشخص شروع می‌کند. یک گروه فعال، مأموریت کوچک و فرم کوتاه شاهد/نتیجه/مانع معیار اولیه‌اند. پس از تحویل نخ‌های گروه بسته می‌شوند. در CLI محلی فعال‌سازی مدل مدیر به تأیید کاتالوگ وابسته است. بازگشت این برش شامل چهار فایل نقش، اضافه‌های سیاست/نصب‌کننده و ردیف ثبت کار است. تاریخچه و تنظیمات خصوصی صاحب checkout حفظ می‌شوند.
