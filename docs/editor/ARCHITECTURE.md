# The block editor

Status: **Phase 1, step 1 of 3 is in the code** (the document, the registry, validation, reading). Steps 2 and 3 are planned below and are not built. Nothing in the admin or on a public page uses this yet.

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

## What is not built

Step 2 (storage and pages):
- `editorFormat` (`legacy` or `blocks-v1`) and a JSON document column on `Page` and `Post`, in both schemas, additive. Existing HTML content stays `legacy` and keeps rendering as it does.
- Save and load on the server with the check above, the item's permission, `updatedAt` as the version to save against (409 when the item changed since it was opened), and a `ContentRevision` per save.
- React renderers of the core blocks using the theme's styles; a boundary so one broken block does not take the page down.
- A switch for the editor in the admin, off by default.
- How a module or an enabled extension registers its blocks.

Step 3 (the editor itself):
- `@wordpress/block-editor` and its companions, imported only under `src/modules/editor/adapters/gutenberg` and `src/components/editor/gutenberg`, loaded only on the admin editing page.
- The adapter between the document and Gutenberg's block list; unknown blocks carried through untouched.
- The rich text block's editing component with Tiptap, storing JSON.
- The media picker over the existing upload API.
- Autosave with a dirty/saved/error state.
- Browser tests: insert, nest, type Persian text, add an image, reorder, save, reload, view the page.

Later phases (patterns, templates, locking, reusable blocks, responsive controls in the inspector, domain blocks beyond a proof) start after step 3 is stable.

## Known limits of step 1

- Media has no asset id in this codebase; a block stores the file's address.
- `documentHtml` knows the core blocks by name. A block from a module leaves a marked empty element there; its page rendering is the module's component.
- Tables are not in rich text yet.
