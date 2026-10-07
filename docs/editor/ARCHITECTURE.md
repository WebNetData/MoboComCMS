# The block editor

Status: **Phase 1 is in the code, and the block editor is the site's main editor** for pages and magazine articles: on unless an administrator switches it off, reached from the pages and articles forms, with an old body turned into blocks when it is opened. Phase 2 has not been started.

## What was found in the repository first

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

- nodes: paragraph, heading (levels 2 to 6), bullet, ordered and task lists, blockquote, code block, hard break, horizontal rule
- marks: bold, italic, underline, strike, code, link, highlight, text colour (a theme colour name)
- attributes: text alignment, direction, heading level, list start, task checked, code language

H1 is not allowed anywhere in a document: the page's own title is the H1.

`richTextHtml` builds HTML from the checked JSON with every text escaped. `richTextFacts` gives plain text, headings and links. HTML from a browser is never stored.

## The registry (`domain/registry.ts`, `domain/core-blocks.ts`)

```ts
registry.register({
  type: 'store.productGrid', version: 1, category: 'store', kind: 'dynamic',
  label: { fa: 'شبکهٔ محصول', en: 'Product grid' }, icon: 'grid',
  fields: {
    source: { kind: 'enum', values: ['latest', 'category'], default: 'latest' },
    categoryId: { kind: 'int', min: 0, max: 1e9, default: 0 },
    limit: { kind: 'int', min: 1, max: 24, default: 8 },
    columns: { kind: 'responsive', of: { kind: 'int', min: 1, max: 6, default: 4 } },
  },
  owner: 'store',
})
```

- `kind: 'static'`: everything shown is in the props. `kind: 'dynamic'`: the props are a question (which products, how many); the answer is fetched when the page is rendered. A dynamic block never stores a copy of a product or a film.
- `children`: which blocks it may hold. `parents`: where it may sit. A `layout.column` only sits in `layout.columns`.
- `permission`: needed to add or change the block (`content.embed` asks for `editor.embed`).
- `migrate`: `migrate[n]` turns props of version n into version n + 1. The registry refuses a type whose history has a hole.

Core blocks: `layout.section`, `layout.container`, `layout.columns`, `layout.column`, `layout.stack`, `layout.spacer`, `layout.divider`, `content.richText`, `content.heading`, `content.image`, `content.gallery`, `content.embed`, `content.button`, `content.buttonGroup`, `content.quote`, `content.callout`, `content.faq`.

`createRegistry(extra)` returns the core blocks plus those passed in. How modules and extensions hand in theirs is step 2.

## Checking (`domain/validate.ts`)

`checkDocument(input, registry, { permissions })` returns `{ ok, document, issues, unsupported, migrated }`.

**A block that is not known is kept.** When a block's type is not registered (its module or extension is off), when its version is newer than the registered one, or when a migration step is missing, the block is returned exactly as stored and listed in `unsupported`. It is not dropped, not read, and not rendered. Its ids stay taken. When its owner is back, it is a block again.

A document whose own `version` is not known is refused whole.

## Reading (`domain/render.ts`)

- `documentFacts`: plain text, headings, links, images, images without a description. Worked out from the field declarations, so a new block type needs no code here.
- `headingProblems`: heading levels that skip a step.
- `documentHtml`: semantic HTML with every value escaped and layout choices as class names from closed lists (`mcb-cols-desktop-3`). For feeds, e-mail and the stored plain copy. Pages will be rendered by React components of the theme (step 2), not by this.

## Security

- Editor data is input. It is checked on the server whatever the client did.
- No raw HTML block exists. If one is added later it needs its own permission and the sanitizer.
- Embeds are a list of players; an `iframe` address is never typed by a user.
- With the nonce policy, an inline handler or a script that got into stored content would not run anyway. That is the second line, not the first.

## Tests

`scripts/editor.test.cjs` (part of `npm run test:site`): the document check, fields, rich text, unknown and newer blocks, migrations, permissions, facts, HTML, the core blocks, and that `domain` imports nothing outside itself.

## Storage and pages (step 2)

**Pages are the first kind of item written in blocks.** Posts, products and media items stay as they are.

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
- `BlockEditorApp.tsx`: inserter, undo and redo, the list of blocks, the selected block's tools (move, duplicate, remove), the settings panel, and saving. A save names the version the page was opened at. It saves by itself four seconds after the last change, one save at a time; a change made during a save is saved right after it. States shown: unchanged, unsaved, saving, saved, error, changed elsewhere. When the page changed elsewhere, saving stops instead of overwriting. Leaving with unsaved work asks first.
- The engine is loaded only on the editing page, in the browser (`next/dynamic`, no server rendering). Its stylesheets are imported there and nowhere else.

### Adding a block

1. Define it (see "The registry") and hand it in with `registerModuleBlocks` on the server.
2. That is all for editing and validation: it appears in the inserter with a settings panel.
3. For its look on a page, add its case to the renderer. (A way for a module to supply a component without touching the renderer is not built yet.)

Browser test: `e2e/tests/block-editor.spec.ts`.

## The main editor

The owner's decision (2026-10-07): the block editor is the editor of the site, not an option beside the old one.

- **On by default.** `blockEditorEnabled()` is true unless the setting `editor.blocks` says `enabled: false`. Switched off, nothing saves and the old forms keep working.
- **Pages and magazine articles.** `Post` has the same two columns as `Page` (migration `20261218120000_post_documents`), the same two constraints, and is stored through the same service: `loadDocument(entity, id)`, `saveDocument({ entity, ... })`, `blocksHtml(row)`, with `entity` one of `pages`, `posts`. Each is edited under its own section's permission (`cms.pages`, `cms.posts`); saving an article tells the rest of the site it changed, as the article form does.
- **API**: `GET`/`PUT /api/admin/editor/:entity/:id`.
- **The article page** (`/blog/<slug>`, a protected surface) is unchanged except for where the body's HTML comes from: an article written in blocks shows its document inside the same `#article-body` frame. A locked article still shows the teaser cut from its HTML copy; a visitor reading in English gets the English body when the article has one.
- **The admin forms** (`/admin/pages`, `/admin/posts`): the body field is a button into the block editor. Saving a new page or article goes straight there. The forms still hold everything else (title, address, cover, categories, state, the English body) and do not send a body they did not edit; the server refuses a body for an item written in blocks. For an item still written the old way, "keep using the old editor" brings the old field back.
- **An old body opens as blocks** (`src/components/editor/gutenberg/legacy.ts`, in the browser): words become rich text blocks (Tiptap reads the HTML with the same extensions it edits with; an H1 becomes an H2), an image standing by itself becomes an image block, a YouTube, Aparat or Vimeo frame becomes a video block. Tables, images inside running text, frames of other sites, scripts and styles have no place in a document: they are left out and the writer is told how many. **Opening changes nothing**: nothing is saved until the writer changes something or presses save, and the old body stays in the item's history after that.

## What is not built

- **Blocks from modules in the editor's browser side.** The editing screen builds its registry from the core blocks; `registerModuleBlocks` is known to the server only. A module's block is validated and stored, and shows as unsupported in the editor until the screen is given the same list.
- React components for blocks that modules register; one renderer shared by the canvas and the page exists for the core blocks only.
- A document for the English body: a page or article written in blocks has one document, and its English body is still HTML from the old field.
- Products, games, software and other items: their descriptions are still written in the old editor.
- Extensions registering blocks.
- Picking an existing file from a gallery: a field uploads a new file or takes an address.
- Labels for the values of a choice (`container`, `narrow`, …) are shown as they are stored. Field names have Persian labels.
- Text colour and highlight are in the format and are rendered, but the rich text toolbar has no button for them. Tables are not in the format.
- Tables in an old body are not carried into blocks (the format has none yet).

Phase 2 (patterns, templates, locking, reusable blocks, responsive previews, domain blocks) and Phase 3 start after this has been used.

## Known limits

- Media has no asset id in this codebase; a block stores the file's address.
- `documentHtml` knows the core blocks by name. A block from a module leaves a marked empty element there; its page rendering is the module's component.
- Tables are not in rich text yet.
