# Devstack integration — 2026-10-10

Scope: owner's attached tooling/skill mandate, reconciled with current repository rules. Existing feature work was preserved. Canonical integration: [DEVSTACK](../DEVSTACK.md); exact versions and upstream commits: [manifest](../../../tools/devstack/manifest.json).

## A. Inventory and installations

Reused TRS, Probe, Serena, ast-grep, dependency-cruiser, Knip, React Doctor, Playwright Test, Spec Kit and Opengrep. Installed pinned Context7 4.3.0, Playwright MCP 0.0.83 and MCP client SDK 1.32.1 in an isolated npm workspace; Semgrep 1.180.0 through uv/Python 3.13; Gitleaks 8.30.1 from its official Windows release with verified SHA-256. Root `package.json` and `package-lock.json` remained byte-identical to the task-start backup.

## B. Agent integration

Added Context7/Playwright stdio bindings to existing machine-local Codex and Claude project configs. Serena retained. Real Codex VS Code app-server inventory: Serena 24, Context7 2, Playwright 25 tools. Claude installed executable health: those three connected. Live Serena active project/LSP, fixture lookup/references/semantic edit and resulting behavior passed; fixture removed. Verified a dated factual project memory write/read without credentials. Current open conversation inventory may require reload/new session.

## C. Skills and architecture

Updated six canonical `mobocom-*` workflows and existing engineer guidance, then synchronized existing Claude/Codex mirrors without changing agent metadata. Installed two reviewed Vercel skills from commit `063bee94c3f4df8453406c830b0a7df0f2860278` into repository, Claude and Codex skill locations, retaining upstream content/hashes. Added explicit MoboCom exceptions for private imports, nonce, cache isolation, protected visuals and framework versions. Reviewed named candidates from OpenAI/Anthropic/Awesome Copilot/Superpowers; skipped overlapping or conflicting workflows. Spec Kit existing CLI reused without creating `.specify` or initializing the repository.

## D. Rules and quality

Dependency graph now includes type imports and upward/private-part boundaries. Existing baseline: two mixed type/runtime cycles and three nested server-part integrations. New edges fail the scoped router; baseline is not a claim of architectural purity. AST delivery-process rules and local Semgrep dynamic-code review have positive/negative fixtures. Knip scoped configuration produces candidates, not auto-removal. Twelve historical Gitleaks matches were individually classified as Setting key, empty/example placeholders or RFC test vectors; only exact fingerprints are excluded. No credentials or Git history changed.

## E. Efficiency and privacy

Progressive tool router, compact summaries and recoverable machine-local reports added. Optional local metrics contain tool/status/duration/counts only. No token measurement or savings percentage claimed. Context7 requests used public Next.js documentation questions; source/security scans were local. Backups/reports under `.mobocom` excluded through machine-local Git info, preserving the owner's `.gitignore`. No telemetry settings of unrelated tools were changed.

## F. Files/configs

- Canonical docs: DEVSTACK, TOOLCHAIN, FRONTEND_QUALITY, ARCHITECTURE, root AGENTS routing and scoped MoboCom skills/guidance.
- New isolated npm workspace/lock, inventory/source/skill provenance, attachment archive/hash and generated reviewed baselines under `tools/devstack` / `docs/agent/requirements`.
- Root dependency-cruiser, Knip, AST and Gitleaks configs; local tool router, fixture/MCP/config validators and VS Code process tasks.
- Existing engineering-docs gate calls the fast offline config validator. No workflow added or dispatched, no push/PR/Actions run.
- Machine-only: Codex/Claude MCP registrations, local exclude and dated config backups; actual Windows executables installed. These contain machine paths and are not release artifacts.

## G. Executed checks

| Check | Actual result |
| --- | --- |
| Context7 initialize/list/resolve/query | Passed, version-scoped Next.js cookies documentation returned |
| Playwright MCP initialize/list/navigate/snapshot/close | Passed against actual `localhost:3000/music`, isolated headless Edge |
| Codex app-server + Claude MCP health | Serena/Context7/Playwright connected and inventories present |
| Serena symbol/reference/edit/isolated execution + memory | Passed; edited temporary return value reached caller; fixture removed |
| AST rules | Two rule suites passed, positive/negative cases; source scan zero findings |
| Semgrep fixtures | Passed, dynamic eval/Function rejected and JSON parsing accepted |
| Semgrep local `src` scan | Native exit 0; zero findings and zero scan errors, ~77 seconds |
| Gitleaks fixture | Synthetic token detected; ordinary config name accepted |
| Gitleaks available local Git history | Initial native exit 1 / 12 reviewed false positives; exact baseline scan exit 0 / zero new findings |
| dependency-cruiser | 1,891 modules / 7,082 dependencies; five reviewed existing entries; scoped delta gate passed |
| dependency fixture | Bad domain/platform edges detected; valid graph accepted |
| Knip | Native exit 1 with candidates: 41 files, 545 exports, 142 types, 23 unlisted uses, 16 dependencies; explicitly advisory |
| Isolated npm audit | Exit 0; zero vulnerabilities reported by registry |
| External skill validators | Both installed Vercel skills valid |
| Offline pins/provenance + engineering docs/mirror integrity | Passed |
| Scoped diff whitespace and root package preservation | Passed |
| React Doctor / Spec Kit | Doctor CLI help verified; `specify check` passed. No new product UI review claimed |

Initial Windows command-wrapper/AST pattern and Semgrep fixture-path failures were corrected before the successful fixture runs. Raw machine-local logs retain those failures; failed attempts were not counted as successful checks. No full product build, database or product regression suite was rerun for this tooling-only batch; earlier feature evidence is separate.

## H. Remaining limits

Knip candidates and five graph entries need owner-by-owner review in later feature slices. Windows is the tested setup; other OS paths/CLI installations require their own checks. Remote docs depend on network/service limits. Claude's pre-existing GitHub plugin health failed with malformed Authorization header; its authentication was not modified by this task and that does not affect the three verified new/reused engineering connections. A currently open agent conversation may need its normal reload/session refresh. Details for update, disable and rollback are in DEVSTACK; no product database, URLs, permissions or protected visuals changed.
