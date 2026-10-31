# The block editor

Current2026-10-30: the domain permits exactly two tested zero-import codecs: shared media and `shared/content/bbcode.ts`. Safe text decorations reuse existing canonical richText/callout/quote/FAQ/columns blocks and HTML adapters; explicit legacy conversion discloses unsupported detail loss. Article full-template creation/selection and post role defaults are retired; historical documents remain readable, ordinary patterns and Page defaults remain supported. [Current owners, validation and continuation](../agent/handoffs/EDITOR_GROUPS_EXPERTS.md). This supersedes the sole-codec wording and post-template plans in historical notes below.

Current2026-10-28: `content.embed`, `content.video` and `content.audio` use the one dependency-free media codec at `shared/media/editorial.ts`; this is the domain's sole neutral-codec exception, with a test enforcing zero runtime/engine/network dependencies. Classic/lightweight HTML adapters preserve the same playable representation and canonical documents remain MoboCom JSON. [Ownership, current implementation, actual validation and limits](../agent/handoffs/EDITOR_MEDIA.md).

Current 2026-10-26: published Journal authors can explicitly propose the canonical
body through the existing PostEditProposal while review is enabled. Exact live
base/proposal tokens, shared Editor validation and guarded manager comparison/
apply preserve the live document until approval. The shared block workspace and
Classic/Admin fallback controls use the existing MoboCom/SDS visual system.
[Implementation, executed checks and rollback](../agent/handoffs/JOURNAL_BLOCK_PROPOSALS.md).
The older observations and phase checkpoints below are historical.

Status2026-10-19: **the block editor is the site's canonical document editor** for pages and magazine articles. The existing plugin switch, explicit legacy conversion, tables and semantic formatting remain. Ten module-owned public catalogue blocks now share schemas with the browser and render live data. Broader Phase2 templates/patterns/locking remain separate work. [Current contracts, evidence and limits](../agent/handoffs/MODULE_BLOCKS_SETTINGS_HISTORY.md).

## What was found in the repository first

This table is the initial historical audit, not the current dependency or Media capability inventory. Current owners are linked in the handoff above.

| Question | Answer in this codebase |
| --- | --- |
| Framework | Next.js 15 (App Router), React 19, TypeScript. Modules live in `src/modules/<name>/{domain,server}`; `domain` is pure. |
| Editors today | `src/components/RichEditor.tsx`: Tiptap 3 producing **HTML**, used by posts, pages, products, games, software releases, tickets, the newsletter. `src/modules/site/domain/builder.ts`: the page builder, a fixed document (`BuilderDoc` v2: sections, columns, 34 widget types with string props) rendered by `src/components/content/builder/BuilderRenderer.tsx`. The forum has its own Markdown composer. |
| Where content is stored | `Post.content`, `Post.contentEn`, `Page.content`, `Page.contentEn` and the equivalent fields of media items: HTML in a text column. |
| Media | Files in storage, addressed by URL (`/uploads/...`). There is no table of media assets and no asset id. Uploading goes through `src/components/admin/FileUpload.tsx` and `CoverField.tsx`. |
| Validation | Hand-written `normalize…`/`validate…` functions in each module's `domain`. No validation library is installed. |
| Permissions | One permission per section (`cms.posts` is the magazine), checked by `requirePerm` in `src/modules/identity/server/access.ts`. |
| Revisions | `ContentRevision` (`src/modules/content/{domain,server}/revisions.ts`): a version of an item's fields after each save, with restore. |
| Feature switches | Optional modules are switched in `/admin/modules`; a disabled module keeps its data. |
| Two databases | `prisma/schema.postgresql.prisma` (production) and `prisma/schema.prisma` (SQLite, used by the browser suite); `npm run schema:check` compares them. |
| Policy for scripts | Scripts run by nonce; inline handlers do not run (`src/platform/http/csp.ts`). |
| Gutenberg | `@wordpress/block-editor` 18 accepts React 18 or 19. Not installed. |

## The rule everything follows

**The MoboCom document is the stored format. Gutenberg is an editing engine.** Nothing Gutenberg serializes (block comments, its HTML) is stored. If the engine is replaced, stored content is untouched.

```
stored document  <->  adapter  <->  editing engine (Gutenberg)
       |
       +--> validation (server)  --> storage
       +--> renderers            --> pages, feeds, search
```

## The document (`src/modules/editor/domain/document.ts`)

```ts
interface MoboComDocument { version: number; blocks: MoboComBlock[] }
interface MoboComBlock { id: string; type: string; version: number; props: Record<string, unknown>; children?: MoboComBlock[] }
```

- `type` is `owner.name` (`layout.section`, `content.richText`, `store.productGrid`).
- `version` is the version of that type's props, not of the document.
- `props` is data. No field of any block holds HTML, CSS, a class name or a script.
- Limits: 2,000 blocks, 12 levels, 2 MB.

## Fields (`domain/fields.ts`)

A block type declares its fields; the server checks every value against them.

| Kind | Holds |
| --- | --- |
| `string` | text up to a length; `role: 'text' \| 'heading'` makes it count for search and SEO |
| `enum` | one name from a list |
| `int` | a whole number in a range |
| `boolean` | |
| `url` | http(s), a site path, an anchor, `mailto:`, `tel:`. Never `javascript:`, `data:`, protocol-relative, or with credentials |
| `asset` | `{ src, alt, caption, width, height, mime }`; `src` is a site path or an https address of the accepted kind |
| `embed` | a YouTube, Aparat or Vimeo video; the stored address is the player's embed address, built from the id |
| `richText` | Tiptap JSON, see below |
| `responsive` | `{ desktop, tablet, mobile }` of an enum or an int |
| `list` | up to N items, each with its own fields |

A missing value takes its default. A wrong value is an error and is replaced by the default in the returned copy; a document with errors is not saved. A prop that is not declared is dropped with a warning.

## Rich text (`domain/rich-text.ts`)

Tiptap JSON is the stored value of a rich text field. It is checked against a closed list:

- nodes: paragraph, heading (levels 2 to 6), bullet, ordered and task lists, blockquote, code block, hard break, horizontal rule, table, tableRow, tableCell and tableHeader
- marks: bold, italic, underline, strike, code, link, highlight, text colour (a theme colour name)
- attributes: text alignment, direction, heading level, list start, task checked, code language

H1 is not allowed anywhere in a document: the page's own title is the H1.

**Rich-text version2 (2026-10-18).** `content.richText` is version2 with an identity migration from1; the document stays version1/`blocks-v1`. Tables use a closed rectangular schema with positive bounded row/column spans, maximum100 rows and20 columns, no nested tables, arbitrary style or engine width metadata. The server rejects invalid grids; the renderer escapes content into a named scrollable region with semantic table/header cells. Version1 documents migrate without changing their text; a registry that only knows version1 retains a newer block as unsupported. `rich-table.ts` owns the bounds. The adapter's exact `@tiptap/extension-table`3.31.3 matches the existing Tiptap version. Semantic color/highlight controls and table row/column/header/merge/split/delete actions live in `RichTextTools.tsx`; they store only the same validated MoboCom rich-text subset. See [verified continuation](../agent/handoffs/AUTHORING_OPERATIONS.md).

**Direction.** The site is right to left, and so is an empty editor. A paragraph, heading, list or quote reads in the direction of its first letter (`textDirection`: Persian, Arabic and Hebrew from the right; Latin, Greek and Cyrillic from the left; digits and punctuation decide nothing). The rule is applied when reading, so `richTextHtml` and the heading block write `dir` on each of them, and nothing about it is stored; a direction the writer chose is stored and wins. Precedence is explicit paragraph direction → explicit containing rich-text block direction → first-letter inference → page default. `resolveTextDirection` applies that precedence in the renderer and in editor decorations; changing the inspector direction refreshes the editor without rewriting text. Only Unicode letters decide automatic direction, never punctuation, marks or digits. While writing, `src/components/editor/TypedDirection.ts` shows the same thing from the same rule in both editors (the block editor's rich text and the older `RichEditor`). A wrapper around rendered blocks must not say `dir="auto"`: the browser skips children that carry their own `dir`, so it would fall back to left to right.

`richTextHtml` builds HTML from the checked JSON with every text escaped. `richTextFacts` gives plain text, headings and links. HTML from a browser is never stored.

## The registry (`domain/registry.ts`, `domain/core-blocks.ts`)

Module schemas live with their owners in `src/modules/<owner>/domain/editor-blocks.ts`. Trusted composition is `server/blocks/contributions.ts`; shared public-item field defaults are in `domain/module-blocks.ts`. Read those maintained definitions instead of copying another schema here.

- `kind: 'static'`: everything shown is in the props. `kind: 'dynamic'`: the props are a question (which products, how many); the answer is fetched when the page is rendered. A dynamic block never stores a copy of a product or a film.
- `children`: which blocks it may hold. `parents`: where it may sit. A `layout.column` only sits in `layout.columns`.
- `permission`: needed to add or change the block (`content.embed` asks for `editor.embed`).
- `migrate`: `migrate[n]` turns props of version n into version n + 1. The registry refuses a type whose history has a hole.

Core blocks: `layout.section`, `layout.container`, `layout.columns`, `layout.column`, `layout.stack`, `layout.spacer`, `layout.divider`, `content.richText`, `content.heading`, `content.image`, `content.gallery`, `content.embed`, `content.button`, `content.buttonGroup`, `content.quote`, `content.callout`, `content.faq`.

`createRegistry(extra)` returns the core blocks plus those passed in. Trusted module contributions now compose through `server/blocks/contributions.ts` and the same public `registerModuleBlocks` address. `activeEditorRegistry` filters effective owners per request; serializable descriptors share that schema with the browser after server migrations. See the current handoff before adding a contribution.

## Checking (`domain/validate.ts`)

`checkDocument(input, registry, { permissions })` returns `{ ok, document, issues, unsupported, migrated }`.

**A block that is not known is kept.** When a block's type is not registered (its module or extension is off), when its version is newer than the registered one, or when a migration step is missing, the block is returned exactly as stored and listed in `unsupported`. It is not dropped, not read, and not rendered. Its ids stay taken. When its owner is back, it is a block again.

A document whose own `version` is not known is refused whole.

## Reading (`domain/render.ts`)

- `documentFacts`: plain text, headings, links, images, images without a description. Worked out from the field declarations, so a new block type needs no code here.
- `headingProblems`: heading levels that skip a step.
- `documentHtml`: semantic HTML with every value escaped and layout choices as class names from closed lists (`mcb-cols-desktop-3`). Generated storage/feed copies remain synchronous. Public pages/articles now use `publicBlocksHtml`, which supplies bounded current public module output to the same renderer; no copied catalogue data or engine markup is stored.

## Security

- Editor data is input. It is checked on the server whatever the client did.
- No raw HTML block exists. If one is added later it needs its own permission and the sanitizer.
- Embeds are a list of players; an `iframe` address is never typed by a user.
- With the nonce policy, an inline handler or a script that got into stored content would not run anyway. That is the second line, not the first.

## Tests

`scripts/editor.test.cjs` (part of `npm run test:site`): the document check, fields, rich text, unknown and newer blocks, migrations, permissions, facts, HTML, the core blocks, and that `domain` imports nothing outside itself.

## Storage and pages (step 2)

**Pages and magazine articles use canonical block documents.** Products and specialist media descriptions retain their existing editors.

| Column of `Page` | Holds |
| --- | --- |
| `editorFormat` | `legacy` (the default: HTML in `content`) or `blocks-v1` |
| `contentDocument` | the document as JSON text when the format is `blocks-v1`, empty otherwise |
| `content` | for a blocks page, HTML **generated** from the document, so search, feeds, the SEO audit and anything that only knows HTML keep working. It is a copy and is never read back as the source. |

The columns are text, like every other JSON value in this schema, because the SQLite schema must match. The migration `20261217120000_page_documents` is additive: every existing page is `legacy` and renders exactly as before. Two database constraints hold the pairing: the format is one of the two names, and a page has a document exactly when it is written in blocks.

`src/modules/editor/server/documents.ts`:

- `blockEditorEnabled()`: the switch (setting `editor.blocks`), **off by default**. Off stops saving; pages already written in blocks keep rendering.
- `loadPageDocument(id)`: the document, what could not be read, and `updatedAt`, the version to save against. For a legacy page it returns the page's HTML beside an empty document; nothing is converted silently.
- `savePageDocument({ id, document, expectedUpdatedAt, actor })`: checks the document with the registry and the actor's permissions, and writes it **only if the page is still at the version the editor opened**. Otherwise 409 `CHANGED`. A document with errors is 422 with the list. Each save adds a version to the page's history (`ContentRevision`), the first one after a baseline of the HTML the page had.
- `pageBlocksHtml(page)`: what the public page shows. A document that cannot be read gives an empty page and a log line, never an error page.
- `registerModuleBlocks(definitions)`: how a module hands in its block types.

API (permission `cms.pages`; the switch needs `settings.manage`):

| | |
| --- | --- |
| `GET /api/admin/editor` | whether the editor is on |
| `POST /api/admin/editor { enabled }` | turn it on or off |
| `GET /api/admin/editor/pages/:id` | document, unsupported blocks, `updatedAt`, `legacyHtml` |
| `PUT /api/admin/editor/pages/:id { document, updatedAt }` | save |

The page form (`/api/admin/cms?type=pages`) may still change a blocks page's title, address and state; it refuses to write its body (409).

The public page `/p/<slug>` renders a blocks page from its document into `.mcb-document`. Styles are in `src/app/editor-blocks.css`: every class there is one the renderer writes from a closed list, with the theme's tokens for colour and radius, and the three breakpoints of the responsive fields.

Check: `scripts/editor-page-documents.connected.cjs` (in `npm run test:pg`).

## The editor in the admin (step 3)

`/admin/editor` lists the site's pages and holds the switch. `/admin/editor/pages/<id>` is the editor.

### Where WordPress code is allowed

| Folder | What is there | Imports `@wordpress/*` |
| --- | --- | --- |
| `src/modules/editor/domain` | the format and its rules | never |
| `src/modules/editor/adapters/gutenberg/convert.ts` | document <-> the engine's block objects | **no**: it knows their shape only, and is tested in Node |
| `src/components/editor/gutenberg` | the editing screen | yes |

A unit test fails when `@wordpress/` appears in any other file under `src`, and when the public page or the document service imports the editor.

Packages (all GPL-2.0-or-later; used as dependencies, nothing copied): `@wordpress/block-editor`, `@wordpress/blocks`, `@wordpress/components`, `@wordpress/compose`, `@wordpress/data`, `@wordpress/element`, `@wordpress/i18n`, `@wordpress/keyboard-shortcuts`. `@wordpress/block-library` is **not** installed: MoboCom has no WordPress block. `@wordpress/block-editor` ships no types; `wordpress-block-editor.d.ts` declares the parts used.

### The adapter (`convert.ts`)

- A type `owner.name` is the engine block `mobocom/owner-name`. The MoboCom id and version travel in the attributes `mcId` and `mcVersion`.
- A block MoboCom does not know goes in as `mobocom/unsupported` holding the stored block whole, shows as "unsupported block", cannot be opened, and comes out exactly as it went in.
- On the way out, a block the engine made (inserted, duplicated, pasted) gets an id of its own; a block the engine cannot name (pasted from another editor) is left out. The server checks the result like any other document.
- Nothing the engine serializes is stored: every block's `save` returns nothing.

### The screen (`src/components/editor/gutenberg`)

- `blocks.tsx` registers every type of the registry with one generic editing component. **A block type needs no editor code**: its settings panel is built from its fields (`FieldControls.tsx`), and what it shows on the canvas is the HTML the public renderer builds for it. The two blocks people write in, rich text and heading, are edited where they stand. A broken block shows its own fault inside a boundary; the rest of the page stays editable.
- `RichTextField.tsx` is Tiptap, storing Tiptap JSON. Keys typed in it stay in it: the block editor around it does not take Backspace, Enter or the arrows.
- Media: an image or file field uploads through the site's own upload API (`uploadFile` of `src/components/admin/FileUpload.tsx`) or takes an address; the image's size is read from the image.
- `BlockEditorApp.tsx`: inserter, undo and redo, the list of blocks, the selected block's tools (move, duplicate, remove), the settings panel, and saving. A save names the version the page was opened at. After the first explicit save of a legacy conversion, it saves by itself four seconds after the last change, one save at a time; a change made during a save is saved right after it. States shown: unchanged, unsaved, saving, saved, error, changed elsewhere. When the page changed elsewhere, saving stops instead of overwriting. Leaving with unsaved work asks first.
- The engine is loaded only on the editing page, in the browser (`next/dynamic`, no server rendering). Its stylesheets are imported there and nowhere else.
- Editor surfaces and text use the existing MoboCom semantic tokens (`--bg-soft`, `--card`, `--text`, `--primary`), including engine controls. No white fallback surface may sit below inherited dark-theme text. The direction browser regression checks text contrast in both themes and the mobile layout.

### Adding a block

1. Define it (see "The registry") and hand it in with `registerModuleBlocks` on the server.
2. Server validation accepts the definition. The browser currently has only the core registry, so a module definition remains unsupported there until definitions are shared; do not claim it already appears in the inserter.
3. For its look on a page, add its case to the renderer. (A way for a module to supply a component without touching the renderer is not built yet.)

Browser test: `e2e/tests/block-editor.spec.ts`.

## The main editor

The owner's decision (2026-10-07): the block editor is the editor of the site, not an option beside the old one.

- **A plugin, on by default.** `src/plugins/block-editor/manifest.json`; `blockEditorEnabled()` is `isModuleEnabled('block-editor')`, so it is switched on and off on `/admin/extensions` like every other plugin (owner, 2026-10-07). **Off**: nothing saves through the editor, its menu entry and the links into it are gone, and the pages and articles forms show the old body field again with the body in it. An item already written in blocks keeps its document, keeps rendering, and its form says the body is in blocks and does not send one. **On** again: everything is where it was.
- **Pages and magazine articles.** `Post` has the same two columns as `Page` (migration `20261218120000_post_documents`), the same two constraints, and is stored through the same service: `loadDocument(entity, id)`, `saveDocument({ entity, ... })`, `blocksHtml(row)`, with `entity` one of `pages`, `posts`. Each is edited under its own section's permission (`cms.pages`, `cms.posts`); saving an article tells the rest of the site it changed, as the article form does.
- **API**: `GET`/`PUT /api/admin/editor/:entity/:id`.
- **The article page** (`/blog/<slug>`, a protected surface) is unchanged except for where the body's HTML comes from: an article written in blocks shows its document inside the same `#article-body` frame. A locked article still shows the teaser cut from its HTML copy; a visitor reading in English gets the English body when the article has one.
- **The admin forms** (`/admin/pages`, `/admin/posts`): the body field is a button into the block editor. Saving a new page or article goes straight there. The forms still hold everything else (title, address, cover, categories, state) and do not send a body they did not edit; the server refuses a body for an item written in blocks. For an item still written the old way, "keep using the old editor" brings the old field back.
- **An old body opens as blocks** (`src/components/editor/gutenberg/legacy.ts`, in the browser): words become rich text blocks (Tiptap reads the HTML with the same extensions it edits with; an H1 becomes an H2), an image standing by itself becomes an image block, a YouTube, Aparat or Vimeo frame becomes a video block. Valid tables carry into rich text. Images inside running text, frames of other sites, scripts and styles have no place in a document: they are left out and the writer is told how many. **Opening or editing the conversion changes no stored body**: autosave stays off until the writer explicitly saves the first conversion. If parts were omitted, the save button says «تأیید تبدیل و ذخیره» beside the omission notice. After that successful save, ordinary autosave resumes. A failed or conflicting save leaves conversion pending; the old body stays in the item's history. Regression: the legacy-conversion browser test edits text, waits longer than autosave, checks the unchanged legacy body, explicitly saves, then verifies ordinary autosave resumes.
- **Role default templates** (owner, 2026-10-20; `server/role-templates.ts`, migration `20270111120000_editor_role_templates`): `EditorRoleTemplate` maps (section, role) to one full template of that section. `GET`/`PUT /api/admin/editor/role-templates?entity=` is the section manager's table on `/admin/editor` (only roles that can write in the section are listed; Serializable, strict audit). `GET /api/admin/editor/:entity/:id` adds `startTemplate` only for an item that never had a body (not `blocks-v1`, empty HTML); `BlockEditorApp` opens it unsaved with a "start blank" button. A template that no longer reads cleanly (a switched-off module's block) is not offered. Evidence: `editor-role-templates.connected.cjs` and a real browser run (panel, writer's new article, start blank, reopen, save).

## What is not built

- Broader templates, patterns, locking and reusable blocks remain outside the ten implemented public module integrations. The generic module preview/selection adapter and public renderer already exist; future specialized compositions need their own evidence.
- **There is no English body field.** The site is written in one language and translated by Google Translate (owner, 2026-10-07): the pages and articles forms no longer show `contentEn`. The column and what it holds are kept; an item that has an English body still shows it to a visitor reading in English.
- Products, games, software and other items: their descriptions are still written in the old editor.
- Uploaded executable block implementations are not supported. Trusted build-time extensions can use the existing validated registry/renderer contribution address.
- Existing asset fields already compose shared LibraryPicker in FieldControls.tsx, in addition to upload/address entry. Do not recreate a gallery. Full browser coverage of every asset/list-field combination is not part of this slice.
- Labels for the values of a choice (`container`, `narrow`, …) are shown as they are stored. Field names have Persian labels.
- Tables and semantic text colour/highlight are implemented in the existing toolbar and renderer; valid legacy tables carry into the explicit first-save conversion. Unsupported inline images/foreign frames remain disclosed omissions.

Broader Phase2 (patterns, templates, locking, reusable blocks, responsive editing previews) and Phase3 remain future scope. Domain blocks are partially delivered by the ten public integrations above.

## Known limits

- A block asset stores the file's address, not a Library asset foreign key. The shared Library has its own IDs; the existing picker returns the address and descriptive metadata.
- Synchronous `documentHtml`/`blocksHtml` retain module placeholders for compatibility/generated HTML. Actual public pages/articles and guarded preview use the asynchronous live rendering address. Plugin-off preserves public output; disabled owners hide their output and retain raw blocks.
- Table bounds are100 rows/20 columns and forbid nesting. Module rendering is bounded to20 blocks,24 items per block and four concurrent tasks; it is not a production-load certification.
- Full canonical document JSON is preserved in history; restores validate it and regenerate derived HTML. Already-truncated old snapshots are refused safely, not reconstructed.
