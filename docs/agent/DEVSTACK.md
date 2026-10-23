# MoboCom agent development stack

Canonical integration of the owner's 2026-10-10 tooling request. The [original attachment](requirements/autonomous-devstack-2026-10-10.md) is reference input; current owner decisions, repository evidence and `AGENTS.md` govern implementation. This is engineering tooling, not a new runtime platform service or Admin setting.

## Workflow and context budget

Audit the current slice → select its existing owner → inspect the smallest relevant scope → implement → run focused checks → review the diff → update verified facts. Continue partially implemented capabilities. Use `mobocom-audit`, then `mobocom-spec` for substantial scenarios, then `mobocom-develop`; contracts/extensions/release are scoped supporting skills.

| Need | First tool | Stop/expand rule |
| --- | --- | --- |
| Exact file/text | TRS + rg | Do not repeat semantic discovery after locating it |
| Unknown code location | Probe | Narrow paths before loading source |
| Architecture/relationships/impact candidates | Local Graphify | Refresh a stale source graph; validate source with Serena and runtime with existing gates |
| Persistent work tracking | Beads when installed; existing workstate otherwise | Do not create a second tracker or imply an absent tool is active |
| Definition/callers/reference/edit | Serena | Read the symbol before editing; inspect affected references |
| Version-sensitive library API | Context7 | Resolve one library, pin the installed version where supported, ask a specific question |
| Module direction/cycles/private edges | Existing architecture gate + dependency-cruiser | Existing gates remain; graph baseline isolates new violations |
| Structural code review/codemod | ast-grep | Test positive/negative fixtures; review preview before writes |
| Possible dead code | Knip | Advisory; inspect dynamic registries and public consumers before removal |
| Source security | Semgrep **or** Opengrep | Local config only; select one engine per review |
| Secrets | Gitleaks | Redacted output; exact reviewed fingerprints only |
| React/Next performance | Selected Vercel React rules + React Doctor | Load relevant rule files, not the compiled guide wholesale |
| Visual/accessibility review | Vercel web guidelines + current MoboCom/SDS tokens | Preserve protected surfaces, RTL, light/dark and existing components |
| Exploratory browser state | Playwright MCP | Isolated profile, local test accounts; narrow snapshots |
| Repeatable browser regression | Existing Playwright Test/CLI | Reproduce actual flows and persist useful scenarios in the existing suite |

External guidance cannot bypass section guards, canonical ownership, server authorization, nonce requirements or migration safety. In particular: Vercel's barrel-import advice does not authorize imports of private module parts; hydration examples need MoboCom's CSP nonce; cache suggestions cannot share private data across users; framework examples must fit the installed React/Next version. Do not add SWR/LRU/component libraries just because a reference recommends them.

## Current checkout and installation evidence

Continue the active checkout recorded at the top of `.ai/MOBOCOM_WORKSTATE.md`;
the older root working tree contains separate owner work. Resolve `git worktree
list` and `git status` before editing. Do not copy its product source into this
checkout or query its graph as evidence for this source tree.

2026-10-23: the pinned Graphify source-only adapter, privacy guard, project skills
and Registry harness are now present here. The isolated MCP package/lock and
portable launcher are also present. `node scripts/check-devstack-config.cjs`
checks this checkout's pins and client mirrors offline. Supporting skill payloads
use `python scripts/sync-engineering-skills.py`; its current lock is authoritative.
Earlier installation/scanner numbers below belong to the original root audit;
they are historical evidence, not a claim that absent scanner configs or global
client bindings were recreated here. No scanner baseline was imported or renewed.

Historical tool pins and current isolated MCP package integrity are in [manifest.json](../../tools/devstack/manifest.json). Current supporting skill hashes are in [external-skills.lock.json](../../tools/devstack/external-skills.lock.json).

| Tool | Installed/verified state | Configuration |
| --- | --- | --- |
| TRS 0.8.5 / Probe 0.6.0 | Reused; version checked | Existing shell tooling |
| Graphify 0.9.84 | uv/Python 3.13 isolated tool; project skills and offline source graph | `.graphifyignore`, `scripts/graphify-local.cjs`; measured Registry benchmark below |
| Serena 1.7.0 | Reused; Codex/Claude connected; live symbols/references/semantic fixture edit and memory write/read passed | Existing `.serena/project.yml`, machine-local Codex/Claude project bindings |
| Context7 MCP 4.3.0 | Installed; library resolution and version-scoped Next.js docs query passed without a key | Isolated npm package + project Codex/Claude binding |
| Playwright MCP 0.0.83 | Installed; real local `/music` navigation, accessibility snapshot and browser close passed | Headless Edge, isolated profile, machine-local output |
| dependency-cruiser 18.5.0 | Reused; 1,891 modules / 7,082 edges checked | Root `.dependency-cruiser.cjs`; five-entry reviewed graph baseline |
| ast-grep 0.45.3 | Reused; two rule suites and `src` scan passed | Root `sgconfig.yml`, `tools/devstack/ast-*` |
| Knip 6.40.0 | Reused; scoped scan executed, findings remain advisory | Root `knip.json`; candidate baseline |
| Semgrep 1.180.0 | Installed with uv/Python 3.13 on Windows; fixtures and local `src` scan passed | Local `tools/devstack/semgrep.yml`, metrics/version checks disabled |
| Gitleaks 8.30.1 | Official Windows binary installed with verified release SHA-256; fixtures and redacted history scan passed | `.gitleaks.toml`, exact `.gitleaksignore` fingerprints |
| React Doctor 0.9.17 | Reused; CLI help checked; previous affected-component review has warnings | [Frontend workflow](FRONTEND_QUALITY.md), telemetry disabled |
| Spec Kit 1.0.13 | Reused; `specify check` passed | Optional CLI; repository was not initialized |
| Playwright Test 1.63.0 | Reused existing suite | Existing Playwright configs and browser fixtures |
| Opengrep 1.30.0 | Reused; version checked only in this batch | Alternative SAST engine, not a second routine scan |

The new npm tools have their own [package/lock](../../tools/devstack/package.json), avoiding changes to the owner's pending root package edits or production dependency bundle:

```powershell
trs raw -- npm.cmd ci --prefix tools/devstack --ignore-scripts --no-audit --no-fund
trs raw -- uv tool install --python 3.13 semgrep==1.180.0
```

Gitleaks release asset and its expected SHA-256 are recorded in the manifest. Verify that digest before extracting its executable into the existing user `.local/bin`; never replace another version silently. Existing global ast-grep is reused, not reinstalled. On another OS, use that release's official matching asset and provide `GITLEAKS_BIN`, `SEMGREP_BIN` and, where needed, `AST_GREP_ENTRY` to the local checker. Windows is the environment actually tested here.

### Agent connections and activation

`scripts/devstack-mcp.cjs context7` / `playwright` launch the locked packages through Node, with OpenTelemetry disabled. Playwright uses `--isolated` and never attaches to the owner's personal profile. A Context7 API key is optional for the public requests verified here; if higher limits become necessary, use supported authentication/environment handling, never commit a key or pass it in command arguments.

This machine's `.codex/config.toml` and Claude project-local entry in `~/.claude.json` have additive `context7` and `playwright` stdio registrations pointing at the launcher by absolute path; existing Serena remains. For another checkout, register Node + the checkout's absolute launcher path + the server name through that client's supported MCP configuration. Do not reuse this machine's paths or replace its other MCP servers.

Codex VS Code's actual app-server reported Serena 24 tools, Context7 2 and Playwright 25. Claude's installed executable reported all three connected. A running conversation may need its normal MCP reload/new session to refresh the tool list; CLI health is not proof that an already-open conversation has refreshed. Newly installed skills become discoverable on the next turn/session.

## Skills and sources

The current16-skill selection and hashes are defined by ENGINEERING_SKILLS.md
and external-skills.lock.json. The original2026-10-10 review table below is
historical: its webapp-testing deferral was superseded by the adapted installation;
Node Playwright remains the browser owner. Activate Serena on the resolved current
checkout before symbol work. Project-file synchronization does not silently
replace global client registrations.

The two reviewed Vercel skills are installed at the pinned upstream commit into `.agents/skills`, mirrored into `.claude/skills` and the existing Codex skill directory. Upstream content is preserved; MoboCom's local workflow provides the project-specific constraints. `mobocom-*` skills link here progressively and are synchronized with the existing sync script.

| Source reviewed | Decision |
| --- | --- |
| vercel-labs/agent-skills | Install only `vercel-react-best-practices` and `web-design-guidelines`; no native/mobile/deployment packs |
| openai/skills, security-best-practices | Reviewed; defer installation because current scoped MoboCom audit/develop/release already own security review; can add when a distinct task requires its references |
| anthropics/skills, webapp-testing | Reviewed; Python-only Playwright workflow would duplicate the existing Node suite and new MCP |
| github/awesome-copilot, mcp-security-audit | Reviewed; pin/config/credential inspection concepts included in local validation; no second agent router |
| obra/superpowers, brainstorming | Reviewed; broad mandatory questioning/parallel process would duplicate MoboCom's spec workflow and conflict with the owner's autonomous-work preference |
| github/spec-kit | Existing CLI reused; compact scenarios/acceptance/convergence remain in `docs/specs`, not a parallel `.specify` system |

Source commit IDs are in the manifest. A review of a named candidate is not a certification of every skill in that repository. Do not initialize Spec Kit with `--force`, install entire collections or activate automatic agent orchestration. Independent review/delegation is appropriate only for a genuinely complex authorized scope, with isolated work and clear ownership.

## Rules, baselines and checks

Existing architecture/security/money/permission/PostgreSQL/browser gates remain authoritative. Graph or static matches do not prove runtime authorization. Use the current scripts:

```powershell
trs raw -- node scripts/check-devstack-config.cjs
trs raw -- python scripts/sync-engineering-skills.py
trs raw -- node scripts/check-architecture.mjs
trs raw -- node scripts/graphify-local.cjs status
```

The older root audit recorded dependency-cruiser, Knip, Semgrep, AST and redacted secret-scanner findings. Its scanner configs/baselines and VS Code tasks are not part of this checkout. Do not claim that the former devstack-check commands or CI integration are active here. Audit a named tool before bringing its configuration forward; do not import old baselines to conceal current findings. The scoped offline check above validates pins and mirrors only. No new CI job, workflow dispatch, global MCP replacement or automatic source watcher is installed.

## Efficiency and privacy

### Project engineering skills

16 scoped skills from Anthropic, UI/UX Pro Max, Vercel and ibelick are vendored for Codex/Claude with source refs, licenses and payload hashes in `tools/devstack/external-skills.lock.json`. Read [task routing and precedence](ENGINEERING_SKILLS.md) before applying their generic UI/stack advice. `python scripts/sync-engineering-skills.py --sync` installs project mirrors with backups; omit `--sync` for offline verification. UI/UX search uses existing Python and local data. No new MCP, runtime dependency, hook or Actions workflow is registered.

Use the same existing map/ledger and Serena memory for durable verified facts. A memory entry names evidence/date/scope, never credentials or speculative maturity. Refresh it when its owner changes; a stale snapshot never beats the current repository. Do not store whole source, prompts or run transcripts as memory.

Optional `MOBOCOM_DEVSTACK_METRICS=1` records tool ID, timestamp, duration, status and finding/file/edge counts in machine-local JSONL. It records no source, prompts, tokens or credentials. Token usage is unavailable to this runner; durations/counts are proxies, not a token-saving percentage. Remove local metrics to reset; leave the variable unset to disable. Context7 receives specific public documentation queries only; security/source scans stay local. Raw secret scanner output is redacted.

## Graphify local source graph

Official source: [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify), reviewed commit `1d1e03b4c88abf94a3f450c838e3c744ae514ef9`. Distribution **graphifyy**, CLI **graphify**, pinned `0.9.84`. Upstream documents Windows installation; this Windows x64 run used isolated uv/Python **3.13.15**. Six installed implementation files match the reviewed source after LF normalization. Pin, dependency snapshot, skill adaptation/reference hashes and installed environment size: [provenance](../../tools/devstack/graphify-provenance.json) and [constraints](../../tools/devstack/graphify-constraints.txt).

```powershell
trs raw -- uv tool install --python 3.13 --constraint tools/devstack/graphify-constraints.txt graphifyy==0.9.84
trs raw -- node scripts/graphify-local.cjs refresh
trs raw -- node scripts/graphify-local.cjs status
trs raw -- node scripts/graphify-local.cjs query "PluginOutlet clientPlugins extensionCatalog"
trs raw -- node scripts/graphify-local.cjs path "PluginOutlet()" "useExtensions()"
trs raw -- node scripts/graphify-local.cjs affected "isModuleEnabled()"
trs raw -- node scripts/graphify-validation.cjs
trs raw -- node scripts/graphify-benchmark.cjs
```

The supported `graphify install --project --platform agents` registered the Codex project skill. Its reviewed MoboCom entrypoint and retained upstream references are mirrored under `.claude/skills/graphify`. Actual Codex app-server `skills/list` reported the project skill enabled; Claude Code **2.1.296** SDK control initialization discovered `/graphify` without a model/user turn. Both skills expose the same verified local CLI commands. No Graphify MCP is registered; the optional MCP extra is not installed. Existing Serena/Context7/Playwright configuration is preserved. Neither CodeGraphContext nor Beads was installed/configured in the inspected project/client configs/PATH/uv tools; their absence is not a passing connection check.

### Corpus and refresh

`.graphifyignore` admits only canonical `src` code in addition to Git exclusions. Documents, JSON/configuration, credential files, generated clients, dependencies, storage, scratch worktrees and duplicate `scripts/src` are excluded. Canonical extension/theme generated TypeScript registries stay included because they are real application owners. The source graph does not include plugin JSON manifest values, SQL schemas or documentation semantics.

`scripts/graphify-local.cjs` enforces the pinned installed version, fixed root/output, two AST workers and **`extract --code-only --no-cluster --no-dedup`**. Its Python runner strips provider credentials/options and inherits a network-denying `sitecustomize` into AST workers. Graphs/caches/logs/measurements stay in ignored `.mobocom/graphify`; they are not committed or uploaded. The resulting source paths and indexed manifest are checked against Git-visible code. External import specifiers may be synthetic nodes; they are not indexed package files. Extraction reports **zero semantic input/output tokens**.

After a coherent source batch, check `status`, then `refresh` if stale. The adapter hashes source contents and ignore selection, skips unchanged batches and locks competing refreshes. Repeated supported `extract` uses Graphify's persisted manifest to parse only changed/new code and prune deleted/excluded files; it does not force a full reconstruction. No automatic git/watch hook, semantic indexing or global graph merge is installed. A failed run remains a failure; inspect its local log and fix the cause before recording freshness. Remove a stale lock only after checking its owning process. Query a current graph and confirm relevant locations with Serena. EXTRACTED/INFERRED graph relationships are static discovery evidence, never runtime, authorization or completeness proof; existing tests/architecture gates remain authoritative.

This run verified isolated canaries for Git ignore, credential/config/document exclusion, network denial, relationship extraction, incremental **add/change/delete**, and unchanged-refresh skip. Graphify's raw graph format is used (nodes/edges); community labeling/HTML and its NetworkX schema metadata are not enabled. An unchanged native incremental run dropped seven synthetic external dynamic-import nodes and sixteen edges; Registry traces remained correct. Treat dynamic/import inference coverage as a limitation, not an architecture certification.

### Registry benchmark — Condition E

[Scenario configuration](../../tools/devstack/registry-benchmark.json), [runner](../../scripts/graphify-benchmark.cjs), and [measured snapshot](../../tools/devstack/graphify-benchmark-results.json). No existing Registry A–D harness was found in the current checkout, skills or local engineering artifacts. E is added alongside named Serena-only/CodeGraphContext baselines without inventing historical measurements or condition IDs.

| Metric | Verified observation, current checkout2026-10-23 |
| --- | --- |
| Corpus |2,059 graph source files;13,759 nodes /51,882 edges |
| Source refresh | Latest measured changed batch27.880seconds,1,028,677,632 bytes sampled process-tree working set; two AST workers; unchanged adapter refresh skips extraction |
| Storage | Graph23,232,756bytes; graph+cache23,994,052bytes; no new Python-tool installation |
| Registry discovery/path/impact/server discovery |4/4 nominated static traces verified against current source; one native query per scenario;0.786–1.317seconds |
| Retrieval relevance | Nominated-file recall1.0; broad client/server nominated precision3/39 and4/38. Extra related files are not automatically irrelevant |
| Functional owner tests | Actual `node --test --test-reporter=tap scripts/packages.test.cjs`: 11 passed, zero failed/skipped |
| Serena-only | Earlier root evidence is not a newly controlled comparison; not remeasured in this batch |
| CodeGraphContext | Not installed/configured; no executed comparison |
| Agent total/cached/uncached/output tokens | **Unavailable**, null in results; zero Graphify semantic tokens is not zero Codex/Claude usage |
| Feature development completion time | **Not measured**; this is read-only retrieval/trace validation, not a completed feature-change experiment |

Windows process-tree memory is sampled every 250 ms (working set, shared pages included); it is not an exact allocation peak. Native operation counts/durations are not full agent tool-call totals/completion times. No token-saving claim is supported. To collect actual per-task client billing telemetry, export the scenario-matched fields documented in the configuration and pass `--usage <export.json>` to the benchmark; it validates total = cached input + uncached input + output. Never substitute characters/estimated tokens or a full-session total for per-task usage. CodeGraphContext comparison requires a verified installation and the same corpus/scenarios, separately from this integration.

To update: review upstream, pin version/constraints/provenance together, then rerun privacy/incremental and Registry checks; preserve current source/ignore policy. To disable: stop using the project Graphify skill/adapter; the app and existing MCPs are unaffected. To remove, review skill hashes/local edits and remove only these project Graphify registrations/artifacts; `uv tool uninstall graphifyy` only if this pinned installation is still the one being removed. Do not overwrite shared MCP configs or run upstream install/uninstall hooks against root instructions.

## Other DevStack update, disable and rollback

- Before updating: record version, source/integrity, current configs and focused baseline. Update the isolated lock and manifest together, inspect upstream instructions, run fixtures + actual MCP calls, then refresh approved skill hashes/mirrors. Never `npx ...@latest` during an ordinary feature task.
- Disable one MCP through the client's server setting/removal; keep other registrations and data. Removing Context7/Playwright registrations does not affect the app or Serena.
- Remove the two new external skill folders only after checking their recorded provenance against any local edits. Keep MoboCom skills. Restore machine-specific configs from the dated backup after reviewing later user edits; do not overwrite the whole live file blindly.
- Uninstall Semgrep with `uv tool uninstall semgrep` only if this installation is still the one being removed. Remove the verified Gitleaks executable only if its current digest matches this installed version. The isolated npm workspace can be removed after agent registrations are disabled; never remove root dependencies or databases as tooling cleanup.
- Historical 2026-10-10 tooling backups are under `.mobocom/devstack-2026-10-10` in the older root; its private exclusion and unchanged-product statement describe that tooling batch only. The current reliability/media/Admin product changes and validation are recorded in [the continuation](handoffs/RELIABILITY_MEDIA_ADMIN.md).
