# The block editor

Status: **Phase 1, steps 1 and 2 of 3 are in the code**: the document, the registry, validation and reading (step 1); storing a page as a document, saving it safely and showing it on the public page (step 2). Step 3, the editor itself (Gutenberg and Tiptap in the admin), is not built: today a document reaches a page only through the API. The switch is off by default.

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

## What is not built

Step 3 (the editor itself):
- `@wordpress/block-editor` and its companions, imported only under `src/modules/editor/adapters/gutenberg` and `src/components/editor/gutenberg`, loaded only on the admin editing page.
- The adapter between the document and Gutenberg's block list; unknown blocks carried through untouched.
- The rich text block's editing component with Tiptap, storing JSON.
- The media picker over the existing upload API.
- Autosave with a dirty/saved/error state, and a way to start a blocks page from a legacy one.
- Browser tests: insert, nest, type Persian text, add an image, reorder, save, reload, view the page.

Also not built:
- React components for blocks that modules register. A page is rendered from `documentHtml`; a module's block leaves a marked empty element there. This comes with the first real domain block.
- A document for the English body (`contentEn`) of a page. A blocks page has one document.
- Posts and other items. The magazine's article page is a protected surface and is not touched by this.
- Extensions registering blocks (modules can, through `registerModuleBlocks`).

Later phases (patterns, templates, locking, reusable blocks, responsive controls in the inspector, domain blocks beyond a proof) start after step 3 is stable.

## Known limits

- Media has no asset id in this codebase; a block stores the file's address.
- `documentHtml` knows the core blocks by name. A block from a module leaves a marked empty element there; its page rendering is the module's component.
- Tables are not in rich text yet.
