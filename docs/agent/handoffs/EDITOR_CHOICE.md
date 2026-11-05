# Per-item editor choice for pages and articles — 2026-11-05

Branch `feat/editor-choice-2026-11-05` from merged main `ba8e4b5a` (through PR352). Continue the existing AdminCrud
form, the block editor module (`block-editor`), the classic editor module (`classic-editor`) and the stored
`editorFormat` column. No schema/migration, no new editor, no second plugin system.

## Behavior and ownership

- The owner asked: «وقتی دارم مطلب می‌گذارم بتونم انتخاب کنم از کدوم ویرایشگر استفاده کنم». While the
  `block-editor` module is on, the page and article form shows a two-option segmented choice above the body field
  («ویرایشگر بلوکی» / «ویرایشگر کلاسیک»), instead of forcing the block editor. The choice is per item, not a site
  default; the module switches stay the site-wide owners.
- `src/app/admin/cms/AdminCrud.tsx` owns the choice: state `bodyEditor` (`'blocks' | 'classic'`, default blocks),
  the `.cms-body-picker` radiogroup, and three save rules in `persist()`:
  1. new item + classic → the form sends its HTML body and stays on the form (no jump to `/admin/editor`);
  2. new item + blocks → body sent empty and the browser jumps to `/admin/editor/:type/:id` as before;
  3. existing item → block-written bodies are never sent from this form (server 409 guards keep this true:
     `src/modules/site/server/http/admin/cms/route.ts` refuses `content` for `editorFormat === 'blocks-v1'`), and a
     legacy item edited as classic keeps sending its body.
- `edit(row)` defaults the choice to classic for a legacy row (its own format) and `emptyForm()` resets to blocks for
  a new item. A block-written row shows «متن این مورد با ویرایشگر بلوکی نوشته شده و از این فرم عوض نمی‌شود.» plus the
  write-in-editor link; the legacy note «این مورد هنوز با ویرایشگر قدیمی…» shows only for `editFormat === 'legacy'`.
- The classic editor rendered in the form is the same `ContentEditor` door every staff form uses
  (`RichEditor` = `dynamic('@/components/editor/ContentEditor')`), so the classic module's TinyMCE keeps its owner.
  Styles: `.cms-body-picker` block in `src/app/media-design.css` (tokens, focus-visible, reduced-motion).
- Server logic and `editorFormat`/`contentDocument` storage are untouched; only the form's payload and redirect
  change. `legacyBody` remains the internal "send the body" flag; the picker sets it.

## Executed evidence

- `npx tsc --noEmit` clean in the disposable Linux copy (/c15) with dependencies; `node --test scripts/editor.test.cjs`
  26/26 (new pinned test: the choice, the save rules, the reset and the lock message), `content-controls` 97/97,
  `editor-blocks` 29/29.
- Real browser (Playwright, preview `http://localhost:3001`, DB copy `mobocom_ec`/`mobocom_ec2`, module on):
  - new post with classic chosen → TinyMCE renders in the form; save stores `editorFormat=legacy`, HTML body kept,
    URL stays `/admin/posts` (row `ec-classic-test`);
  - new post with blocks chosen → save jumps to `/admin/editor/posts/<id>` (row `ec-blocks-test`);
  - editing a legacy row → classic preselected with its body in the form;
  - editing a blocks row → picker + write-in-editor link + kept-body note (fixed during the walk: the legacy note
    leaked onto blocks rows; the note is now `editFormat === 'legacy'` only).
- Screenshots in `.mobocom/claude-tools/shots/editor-choice/` (1440, light). Walk scripts:
  `.mobocom/claude-tools/ec-walk.cjs`, `ec-save.cjs`, `ec-blocks.cjs`, `ec-edit.cjs` (cookie via
  `.mobocom/claude-tools/mk-session.cjs` against the preview container).

## For the next agent

Release follow-up2026-11-05: PR353 is merged at main4fb0f7ac. Production QA for1.7.4 caught the initially hidden classic body (`setLegacyBody(false)`) despite the checked Classic label. `edit` now initializes visible body and selected editor together from stored format; blocks stay locked. Final production browser covers both pages and articles, eight1440/390 light/dark states/axe0, four real classic/block creates and direct body-write409; all175 native PG suites and final check/build pass. See [release handoff](RELEASE_1_7_4.md). The older walk below did not establish this first-open behavior.

- Pages (`/admin/pages`) share the same AdminCrud branch; the walk covered posts, pages inherit.
- Do not "simplify" by removing `legacyBody`: `persist()` uses it as the send/don't-send gate.
- Dark mode and 390px screenshots of the picker were not taken yet; the styles use tokens so risk is low, but the
  whole-site quality standard still asks for them before release.
- Publication: not merged yet; the owner merges. This feature rides the 1.7.4 cycle (the owner said "بیشتر توسعه
  بدیم بعد ریلیز می‌کنیم").
