# External engineering skills — MoboCom

These are project-scoped supporting skills for Codex (`.agents/skills`) and Claude (`.claude/skills`). Continue the current MoboCom implementation through `mobocom-audit` → `mobocom-develop`; load only the relevant supporting skill and references. Installation does not change the site or authorize deployment.

## Binding integration rules

- The owner's request, current repository evidence and MoboCom decisions determine scope. Existing owners, URLs, permissions, data and approved visuals remain authoritative. For frontend work, use [frontend quality](FRONTEND_QUALITY.md): SDS/MoboCom semantic tokens, existing primitives, React Doctor and actual browser/a11y evidence.
- Generic recommendations to remove purple/gradients, change fonts, adopt Tailwind defaults, replace primitives, install motion/UI libraries or redesign a whole page do not override MoboCom's approved design. Apply a relevant technique to a verified problem; a style preference is not a defect.
- Existing `ARCHITECTURE.md`, this document and `FRONTEND_QUALITY.md` remain the canonical instructions. Do not create a competing design system/`DESIGN.md`/`MASTER.md` merely because a skill suggests one. New design artifacts or component canvases are scoped deliverables only when required by the actual task; previews remain local/private and reuse existing Storybook/primitives.
- Audit-only skills keep their own pass read-only. Finish that pass, then continue already-authorized implementation through `mobocom-develop`; their audit mode is not a reason to leave an authorized fix unfinished. Preserve existing task authorization instead of repeating generic interviews/approval steps.
- Browser testing reuses the installed Node Playwright CLI and existing Docker localhost3000 server. Wait for the real rendered control/session state; live chat/SSE/polling means global `networkidle` is not a universal readiness condition. The optional upstream Python server helper is available, but a second server/browser framework is not required.
- UI/UX search is local advisory evidence. Use one short outcome/domain or installed-stack query, inspect relevance and verify the proposed change in source/browser. Do not persist generated palettes or apply a new default theme automatically. No token-savings, accessibility, runtime, authentication or performance claim follows from installing a skill.
- The bundled Next.js dataset includes rows labeled16.2; MoboCom currently pins Next15.5.27/React19.2.8. Check compatibility against installed-version documentation (Context7) before implementing an API suggestion. Installing these skills is not an application framework upgrade.
- MCP authoring creates tools only when the task calls for them; it does not replace MoboCom API/domain owners. Remote UI registry MCP, Vercel deployment and provider evaluation services were not connected by this installation. Keep source/private configurations local; public documentation lookups do not authorize source uploads.

## Task routing

| Task | Supporting skill(s) | Use in MoboCom |
| --- | --- | --- |
| New authorized visual composition | `frontend-design`, `ui-ux-pro-max` | Existing identity/SDS first; local search for the specific design concern |
| Inspect an existing surface / quick polish | `improve-ui`, `baseline-ui` | Evidence-based, scoped audit; baseline's aesthetic/stack defaults yield to the binding rules above |
| React performance / reusable composition | `vercel-react-best-practices`, `vercel-composition-patterns` | Selected rules; verify installed React/Next versions and existing public module boundaries |
| UI guideline review | `web-design-guidelines` | Relevant current public guidelines plus MoboCom constraints |
| Accessibility / SEO / animation issues | `fixing-accessibility`, `fixing-metadata`, `fixing-motion-performance` | Existing HTML/SEO/animation owners, then actual browser evidence; no score-only certification |
| Existing component exploration | `component-canvas` | Scoped local preview only; component source remains unchanged by the canvas |
| Explicit design documentation task | `create-design-md` | Current evidence and existing canonical design documentation; no parallel instruction tree |
| Local browser checks | `webapp-testing` | DOM reconnaissance/console/screenshots using the existing installed Playwright tools |
| Architecture/document drafting and prose review | `doc-coauthoring`, `writing-guidelines` | Continue existing concise documents; avoid duplicate architecture and unnecessary interview loops |
| Actual new MCP integration | `mcp-builder` | Existing tool routing/permissions/privacy and explicit external-service requirements |

16 selected skills are pinned in [external-skills.lock.json](../../tools/devstack/external-skills.lock.json). Sources: [Anthropic](https://github.com/anthropics/skills), [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), [Vercel](https://github.com/vercel-labs/agent-skills), [ibelick](https://github.com/ibelick/ui-skills). The lock records reviewed commits, upstream paths, original entrypoint hashes, adapted payload hashes and the official UI/UX CLI package version/integrity. Each installed entrypoint adds only a short link to these integration rules; bundled resources/licenses are retained.

Existing document/PDF/presentation/spreadsheet skills and the system skill creator/installer are retained. Unrelated Anthropic creative/communication/provider skills, Vercel deployment/native/experimental features, UI registry meta-skill and UI/UX package addons were not activated. This is a selected MoboCom engineering integration, not an installation of every unrelated catalog entry.

## Install, verify and use

```powershell
trs raw -- python scripts/sync-engineering-skills.py --sync
trs raw -- python scripts/sync-engineering-skills.py
trs raw -- python -X utf8 .agents/skills/ui-ux-pro-max/scripts/search.py "avatar image overflow" --domain ux --json
trs raw -- python -X utf8 .agents/skills/ui-ux-pro-max/scripts/search.py "server components" --stack nextjs --json
trs raw -- python .agents/skills/webapp-testing/scripts/with_server.py --help
```

`--sync` copies only pinned files to the two project skill directories, backing up changed existing files under ignored `.mobocom/skill-backups/<UTC timestamp>`. Unmanaged extra files are preserved. The default command verifies normalized hashes and matching mirrors without downloading or changing anything. Run this after checkout/update when needed; no Git/watch hook, background agent, MCP registration or GitHub Actions workflow is added. Source updates require reviewing upstream changes, refreshing the lock and revalidating helpers; do not silently update to `latest`.

Available Python3.10.6 runs the standard-library UI/UX search without extra Python packages. UI/UX assets were generated using official `ui-ux-pro-max-cli@2.15.0` in an isolated ignored npm prefix with lifecycle scripts disabled, then the main skill was selected. Other skills used the system GitHub installer at immutable refs. The app's package.json/package-lock.json and runtime are unchanged. Newly installed skills become discoverable on the next agent turn; an already running Claude session may need reloading.

## Executed installation evidence — 2026-10-15

- 16 skills /196 total canonical payload files (about4.10MB), mirrored for each client; both active root checkout and authoritative `.mobocom/autonomous-foundation` pass offline payload verification. Existing changed files were backed up; owner source and unrelated extra files were preserved.
- System skill validator passed88 folders:16 supporting +6 existing MoboCom skills, each in two client scopes and two checkouts. The upstream `fixing-metadata` version field was moved into `metadata.version` for valid Codex frontmatter; the adaptation and original hash are recorded. Bundled Python compiled in memory without executing MCP/provider services.
- Actual Codex app-server `skills/list` found all16 enabled project entries in both checkouts. Actual installed Claude Code SDK-control initialization discovered all16 skill commands from the root project. These checks made no user/model turn; this is discovery evidence, not a claim that every optional provider integration was exercised.
- Local UI/UX domain, Next-stack and design-system queries passed with socket/DNS/subprocess access denied. The design-system result remained disposable test output and did not modify the site/design documents. An initially empty broad stack query was narrowed once to `server components`; no empty result was counted as successful retrieval. The Python server helper's `--help` passed; existing Node Playwright remains MoboCom's browser owner.
- A disposable project deliberately drifted from its lock: verification refused it; `--sync` saved the old content, repaired the file and preserved an unrelated owner sentinel. Final verification passed. No browser UI, production build, database migration, Actions or deployment claim for this tooling/documentation-only batch.
- Redacted Gitleaks scan of the authoritative project skill directory passed with no leaks found.
- Vendored upstream whitespace is retained with its pinned payload hashes. A full staged `git diff --check` reports imported formatting (including whitespace-only sample lines); the owned integration/docs/installer files pass the scoped whitespace check. No lint baseline or application rule was relaxed.

Root ignored raw evidence: `.mobocom/engineering-skills-evidence/{validation,codex,claude}.json`, local query outputs and disposable sync fixture; backups: `.mobocom/skill-backups/`. Claude was checked at project root; its authoritative-worktree copy has matching verified payloads, not a separately claimed Claude initialization run there.
