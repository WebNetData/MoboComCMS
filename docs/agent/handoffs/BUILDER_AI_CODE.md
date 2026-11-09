# Builder AI code assistant — 2026-11-09

Branch `feat/builder-ai-code-2026-11-09` from main `29d5e691`. First slice of the owner's request for an
Elementor-Pro-class MoboCom builder with AI that writes HTML/CSS/JavaScript anywhere, over API or personal
Chat web. Owner merges/deploys.

## Audit before this slice

The builder already has ~60 widgets, theme templates (header, footer, page, single post, single product,
surface pages) with conditions, global kit, reusable templates, live preview, history, hover/entrance/loop
motion, a bounded AI layout proposal (no code) and advanced code (page and `html` widget, HTML/CSS/JS,
`SCRIPT_PERMISSION` = `settings.manage`, approval when script code changes). Remaining gaps, in order:
per-element custom CSS; site-wide code snippets with conditions and a kill switch; reusable code components
with fields that extensions can register declaratively; archive/search/404/popup templates; sticky,
parallax, scroll-linked and pointer effects.

## This slice

- `ai/domain/code-assist.ts`: bounded request (target widget|page, instruction 5–3000, current code at the
  builder's own limits, scope `mc-x-…`), prompt (scope-prefixed CSS because advanced CSS is global, site
  colour variables, RTL, JS only in `js` and only inside its root, no eval/cookies/storage/network/external
  resources unless asked, responsive, accessible, reduced motion), tolerant JSON parsing, advisory scan
  (danger: eval/new Function, cookies, external script/@import; warn: network, storage, navigation,
  `<script>` in HTML, iframe/external form, inline handlers, external resources, scope leaks, missing root).
- `POST /api/admin/builder/code` (site owner): same-origin, page-builder + ai-assistant modules,
  `SCRIPT_PERMISSION`, 20/10min; `generate` (API, `builder` purpose, personal routing), `prepare`/`complete`
  (Chat web). Returns code + warnings only, strict audit `builder.code.proposed`; never saves or runs code.
- `AiCodePanel` in the `html` widget inspector and the page Code tab: instruction, API or Chat web, edit
  current code or start fresh, sandboxed `allow-scripts` srcdoc preview (no same-origin) at 390/820/1280
  with the site's colour variables, editable code tabs, warnings, insert (local undoable draft; JS turns on
  advanced mode) or discard. Saving keeps the builder's script permission and approval.
- Chat web bridge 0.6.8: panel relay and content script also match `/admin/builder*`; nothing broader.
  ZIP packed on Linux from LF source; all 17 entries byte-equal to `deploy/chat-web-bridge`.

## Evidence (local)

- 94/94 `scripts/ai.test.cjs` incl. 3 new cases; full `tsc` clean (LF copy in the preview container).
- Real endpoint: `complete` returned code with cookie (danger) and `body` scope-leak warnings; `prepare`
  returned the prompt; missing Origin and a limited staff account → 403; `generate` surfaced the site's
  real provider configuration error (model/API not found) — provider setup, not this feature.
- Browser run with an intercepted generate response: see final receipt in the PR.
- Not run: a real provider or real Chat web account producing code; e2e.
