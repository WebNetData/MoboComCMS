---
name: graphify
description: Discover MoboCom architecture, code relationships and change-impact candidates using the local Graphify source graph. Use before broad architecture exploration; use Serena for precise symbols and edits.
---

# Local MoboCom code graph

Official Graphify CLI, package `graphifyy==0.9.84`, installed with uv/Python 3.13. This project adapter replaces the upstream mixed-document pipeline. Read only the Graphify section of `docs/agent/DEVSTACK.md` for installation, measurements, update and rollback.

From the repository root (PowerShell-compatible):

```powershell
trs raw -- node scripts/graphify-local.cjs status
trs raw -- node scripts/graphify-local.cjs refresh
trs raw -- node scripts/graphify-local.cjs query "PluginOutlet clientPlugins extensionCatalog"
trs raw -- node scripts/graphify-local.cjs path "PluginOutlet()" "useExtensions()"
trs raw -- node scripts/graphify-local.cjs affected "isModuleEnabled()"
```

Use the existing graph for architecture discovery. Refresh after a coherent source batch when status is stale. The adapter hashes Git-visible source and ignore selection, skips unchanged batches, uses Graphify's incremental manifest and validates the resulting corpus. Failed refresh is not fresh evidence. Queries are budgeted; narrow a truncated query before expanding. Local artifacts live under `.mobocom/graphify`; pass their explicit graph path when using upstream query references.

The corpus is canonical `src` JavaScript/TypeScript only, subject to Git exclusions and `.graphifyignore`. Canonical extension/theme generated registries are included; documents, JSON configuration, credentials, dependencies, migrations, test fixtures and duplicate worktrees are excluded. Extraction always uses `--code-only --no-cluster --no-dedup` with two AST workers; the Python worker environment blocks IP networking and strips provider credentials. Do not use cloud, semantic extraction, global merging, watch/git hooks or upstream mixed-file rebuild commands for this project without a separate explicit request.

Graphify proposes architecture/relationship and impact candidates; confirm source locations with Serena. EXTRACTED is static source evidence, INFERRED is a hypothesis, neither proves runtime behavior, dynamic coverage or authorization. Beads tracks work when installed; the existing workstate remains authoritative while it is absent. Existing architecture, PostgreSQL, unit and browser gates prove correctness. Do not replace them with graph assertions or claim token savings from output-size estimates.

The retained upstream references are optional format/query guidance, not permission to expand the corpus or override these local constraints. Project registration works through `.agents/skills` (Codex) and the identical `.claude/skills` mirror (Claude); no global skill or MCP registration is needed.
