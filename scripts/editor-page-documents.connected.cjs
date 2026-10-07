// Real PostgreSQL: a page, and a magazine article, written as a MoboCom document. The service is the real one; the site-wide switch is kept in
// memory so the check never switches the plugin of the local site. Pages are namespaced and removed.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), {PrismaClient} = require('@prisma/client')
const prisma = new PrismaClient(), seed = `editor-doc-${Date.now()}`
const plugin = {on: true}, changes = []
const mocks = {
 '@/platform/database/prisma': {db: prisma},
 '@/platform/observability/logger': {logEvent: () => {}},
 // The role catalogue pulls in every plugin manifest; the one function used here is this.
 '@/modules/identity/rbac': {hasPermission: (permissions, needed) => Boolean(permissions?.includes(needed))},
 // What the rest of the site does when an article changes (search, notifications) is not this check's subject; that it is told is.
 '@/modules/content/server/events': {contentChanged: (ref, before, after) => { changes.push([ref.type, ref.id, before.editorFormat, after.editorFormat]) }},
 // The editor is a plugin; whether it is on is the extensions page's to say.
 '@/extensions/server/modules': {isModuleEnabled: async id => id === 'block-editor' && plugin.on},
}
const cache = new Map()
const load = file => {
 if (cache.has(file)) return cache.get(file).exports
 const mod = {exports: {}}; cache.set(file, mod)
 new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText)(name => {
  if (Object.hasOwn(mocks, name)) return mocks[name]
  if (name.startsWith('@/')) {const base = `src/${name.slice(2)}`; return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '/index.ts')}
  return require(name)
 }, mod, mod.exports)
 return mod.exports
}
const editor = load('src/modules/editor/server/documents.ts')
let count = 0
const text = value => ({type: 'text', text: value})
const rich = (...lines) => ({type: 'doc', content: lines.map(line => ({type: 'paragraph', content: [text(line)]}))})
const block = (type, props = {}, children) => ({id: `blk_${String(++count).padStart(5, '0')}`, type, version: 1, props, ...(children ? {children} : {})})
const doc = (...blocks) => ({version: 1, blocks})
const failure = async work => { try { await work(); return null } catch (error) { return error } }
const staff = {id: 1, email: 'admin@example.invalid', roleId: null, permissions: null}

async function main() {
 const page = (name, data = {}) => prisma.page.create({data: {slug: `${seed}-${name}`, title: name, content: '<p>نوشتهٔ قدیمی</p>', status: 'DRAFT', ...data}})
 const row = id => prisma.page.findUniqueOrThrow({where: {id}})
 const first = await page('first')

 // ---- a page that was never written in blocks
 const opened = await editor.loadPageDocument(first.id)
 assert.deepEqual([opened.editorFormat, opened.document, opened.legacyHtml, opened.updatedAt], ['legacy', {version: 1, blocks: []}, '<p>نوشتهٔ قدیمی</p>', first.updatedAt.toISOString()])
 assert.equal(editor.pageBlocksHtml(first), null, 'a legacy page is rendered the old way')

 // ---- the block editor is the site's editor: on unless switched off. Switched off, nothing is saved.
 const manifest = JSON.parse(fs.readFileSync('src/plugins/block-editor/manifest.json', 'utf8'))
 assert.deepEqual([manifest.id, manifest.kind, manifest.defaultEnabled, manifest.adminPaths], [editor.BLOCK_EDITOR_PLUGIN, 'module', true, ['/admin/editor']], 'a plugin, on until switched off')
 plugin.on = false
 assert.equal(await editor.blockEditorEnabled(), false)
 const good = doc(block('layout.section', {width: 'narrow'}, [block('content.heading', {text: 'سلام دنیا', level: 2}), block('content.richText', {content: rich('متن فارسی و English با هم ۱۲۳')})]))
 const off = await failure(() => editor.savePageDocument({id: first.id, document: good, expectedUpdatedAt: opened.updatedAt, actor: staff}))
 assert.deepEqual([off?.status, off?.code], [404, 'EDITOR_OFF'])
 assert.equal((await row(first.id)).editorFormat, 'legacy')
 plugin.on = true
 assert.equal(await editor.blockEditorEnabled(), true)

 // ---- the first save
 const saved = await editor.savePageDocument({id: first.id, document: good, expectedUpdatedAt: opened.updatedAt, actor: staff})
 const stored = await row(first.id)
 assert.equal(stored.editorFormat, 'blocks-v1')
 assert.deepEqual(JSON.parse(stored.contentDocument).blocks[0].children.map(child => child.type), ['content.heading', 'content.richText'])
 assert.deepEqual(JSON.parse(stored.contentDocument).blocks[0].props, {width: 'narrow', space: 'md', tone: 'none', anchor: ''}, 'what is stored is the checked document, defaults included')
 assert.match(stored.content, /<h2 class="mcb mcb-content-heading mcb-align-start">سلام دنیا<\/h2>/, 'the HTML column holds a copy generated from the document')
 assert.equal(saved.updatedAt, stored.updatedAt.toISOString()); assert.notEqual(saved.updatedAt, opened.updatedAt)
 assert.match(editor.pageBlocksHtml(stored), /متن فارسی و English با هم ۱۲۳/)
 const reopened = await editor.loadPageDocument(first.id)
 assert.deepEqual([reopened.editorFormat, reopened.legacyHtml, reopened.document], ['blocks-v1', '', JSON.parse(stored.contentDocument)])
 // The history of the page has the HTML it had before and the document it has now.
 const versions = await prisma.contentRevision.findMany({where: {entityType: 'pages', entityId: first.id}, orderBy: {version: 'asc'}})
 assert.deepEqual(versions.map(v => [v.version, v.source, JSON.parse(v.snapshot).editorFormat]), [[1, 'baseline', 'legacy'], [2, 'edit', 'blocks-v1']])
 assert.equal(JSON.parse(versions[0].snapshot).content, '<p>نوشتهٔ قدیمی</p>')

 // ---- a save made from an older version of the page is refused
 const stale = await failure(() => editor.savePageDocument({id: first.id, document: doc(block('content.heading', {text: 'از نسخهٔ قدیمی'})), expectedUpdatedAt: opened.updatedAt, actor: staff}))
 assert.deepEqual([stale?.status, stale?.code, stale?.details.updatedAt], [409, 'CHANGED', saved.updatedAt])
 assert.equal((await row(first.id)).contentDocument, stored.contentDocument)
 for (const bad of [undefined, '', 'yesterday', 12]) assert.equal((await failure(() => editor.savePageDocument({id: first.id, document: good, expectedUpdatedAt: bad, actor: staff})))?.code, 'VERSION_REQUIRED')
 // Another write of the page (its title, in the page form) also moves the version.
 await prisma.page.update({where: {id: first.id}, data: {title: 'renamed'}})
 assert.equal((await failure(() => editor.savePageDocument({id: first.id, document: good, expectedUpdatedAt: saved.updatedAt, actor: staff})))?.code, 'CHANGED')

 // ---- two editors save from the same version at once: one wins, the other is told
 const race = await page('race')
 const from = (await editor.loadPageDocument(race.id)).updatedAt
 const both = await Promise.all(['الف', 'ب'].map(name => failure(() => editor.savePageDocument({id: race.id, document: doc(block('content.heading', {text: name})), expectedUpdatedAt: from, actor: staff}))))
 assert.deepEqual(both.map(error => error?.code || 'saved').sort(), ['CHANGED', 'saved'])
 assert.equal(await prisma.contentRevision.count({where: {entityType: 'pages', entityId: race.id, source: 'edit'}}), 1)

 // ---- a document with errors is not saved, and says where
 const before = await row(race.id)
 const invalid = await failure(() => editor.savePageDocument({id: race.id, document: doc(block('layout.column'), block('content.button', {label: 'x', href: 'javascript:alert(1)'}), block('content.image', {image: {src: 'data:image/png;base64,AA'}})), expectedUpdatedAt: before.updatedAt.toISOString(), actor: staff}))
 assert.deepEqual([invalid?.status, invalid?.code, invalid?.details.issues.map(issue => issue.code)], [422, 'DOCUMENT_INVALID', ['block.place', 'field.url', 'field.asset.src']])
 assert.deepEqual(await row(race.id), before)
 for (const junk of [null, 'text', [], {version: 9, blocks: []}]) assert.equal((await failure(() => editor.savePageDocument({id: race.id, document: junk, expectedUpdatedAt: before.updatedAt.toISOString(), actor: staff})))?.status, 422)
 assert.equal((await failure(() => editor.savePageDocument({id: 2147483000, document: good, expectedUpdatedAt: from, actor: staff})))?.status, 404)
 assert.equal((await failure(() => editor.loadPageDocument(2147483000)))?.status, 404)

 // ---- a block nobody knows is saved, loaded and saved again, untouched
 const stranger = {id: 'ext_block_01', type: 'gallery-pro.carousel', version: 3, props: {slides: [{id: 7, note: 'kept'}], speed: 2.5}, children: [{id: 'ext_child_01', type: 'gallery-pro.slide', version: 1, props: {x: 1}}]}
 let version = before.updatedAt.toISOString()
 for (let round = 0; round < 3; round += 1) {
  const current = round ? (await editor.loadPageDocument(race.id)).document : doc(block('content.heading', {text: 'قبل'}), stranger, block('content.heading', {text: 'بعد'}))
  const result = await editor.savePageDocument({id: race.id, document: current, expectedUpdatedAt: version, actor: staff})
  version = result.updatedAt
  assert.deepEqual(result.unsupported.map(item => [item.type, item.reason]), [['gallery-pro.carousel', 'unknown-type']])
 }
 const kept = await editor.loadPageDocument(race.id)
 assert.deepEqual(kept.document.blocks[1], stranger); assert.deepEqual(kept.unsupported.map(item => item.id), ['ext_block_01'])
 const shown = editor.pageBlocksHtml(await row(race.id))
 assert.match(shown, /قبل[\s\S]*<!-- unsupported block gallery-pro\.carousel -->[\s\S]*بعد/); assert.doesNotMatch(shown, /kept/)

 // ---- a block that asks for a permission is added only by staff who hold it
 editor.registerModuleBlocks([{type: 'store.priceTable', version: 1, category: 'store', kind: 'dynamic', icon: 'table', label: {fa: 'جدول قیمت', en: 'Price table'}, permission: 'cms.products', owner: 'store', fields: {limit: {kind: 'int', min: 1, max: 24, default: 8}}}])
 const priced = doc(block('store.priceTable', {limit: 4}))
 const pagesOnly = {id: 2, email: 'pages@example.invalid', roleId: 5, permissions: ['dashboard.view', 'cms.pages']}
 const denied = await failure(() => editor.savePageDocument({id: race.id, document: priced, expectedUpdatedAt: version, actor: pagesOnly}))
 assert.deepEqual([denied?.status, denied?.details.issues.map(issue => issue.code)], [422, ['block.permission']])
 const allowed = await editor.savePageDocument({id: race.id, document: priced, expectedUpdatedAt: version, actor: {...pagesOnly, permissions: ['cms.pages', 'cms.products']}})
 assert.deepEqual((await editor.loadPageDocument(race.id)).document.blocks[0].props, {limit: 4})
 // A page that already holds such a block is still read and shown to everybody.
 assert.match(editor.pageBlocksHtml(await row(race.id)), /data-block="store\.priceTable"/)
 assert.ok(allowed.updatedAt)

 // ---- the database itself: a format it does not know, and a blocks page without its document
 const raw = (data, pattern) => failure(() => prisma.page.update({where: {id: first.id}, data})).then(error => assert.match(String(error?.message), pattern))
 await raw({editorFormat: 'gutenberg'}, /Page_editorFormat_check/)
 await raw({contentDocument: ''}, /Page_document_matches_format/)
 await raw({editorFormat: 'legacy'}, /Page_document_matches_format/)
 const plain = await page('plain')
 await failure(() => prisma.page.update({where: {id: plain.id}, data: {contentDocument: '{"version":1,"blocks":[]}'}})).then(error => assert.match(String(error?.message), /Page_document_matches_format/))
 // What storage holds is read without ever failing the page.
 for (const broken of ['not json', '{"version":1', '{"version":4,"blocks":[]}', '[]']) assert.equal(editor.pageBlocksHtml({id: 1, editorFormat: 'blocks-v1', contentDocument: broken}), '')

 // ---- the page form leaves the body of a blocks page alone, and the public page reads the document
 const form = fs.readFileSync('src/modules/site/server/http/admin/cms/route.ts', 'utf8'), publicPage = fs.readFileSync('src/modules/site/server/pages/p/[slug]/page.tsx', 'utf8')
 assert.match(form, /b\?\.content !== undefined && \(await db\.page\.findUnique\(\{ where: \{ id \}, select: \{ editorFormat: true \} \}\)\)\?\.editorFormat === 'blocks-v1'\) return err\(/)
 assert.match(publicPage, /const blocks = pageBlocksHtml\(page\)\n\s+const content = blocks === null \? cleanRichText\(/)

 // ---- a magazine article is written the same way, under the magazine's own permission
 const article = await prisma.post.create({data: {slug: `${seed}-article`, title: 'article', content: '<p>متن قدیمی مقاله</p>', status: 'DRAFT'}})
 const openedArticle = await editor.loadDocument('posts', article.id)
 assert.deepEqual([openedArticle.entity, openedArticle.editorFormat, openedArticle.legacyHtml], ['posts', 'legacy', '<p>متن قدیمی مقاله</p>'])
 assert.deepEqual([editor.documentPermission('posts'), editor.documentPermission('pages')], ['cms.posts', 'cms.pages'])
 assert.deepEqual([editor.isDocumentEntity('posts'), editor.isDocumentEntity('products'), editor.isDocumentEntity('constructor')], [true, false, false])
 changes.length = 0
 const savedArticle = await editor.saveDocument({entity: 'posts', id: article.id, document: doc(block('content.heading', {text: 'تیتر مقاله'}), block('content.richText', {content: rich('بدنهٔ مقاله')})), expectedUpdatedAt: openedArticle.updatedAt, actor: staff})
 const storedArticle = await prisma.post.findUniqueOrThrow({where: {id: article.id}})
 assert.equal(storedArticle.editorFormat, 'blocks-v1'); assert.match(storedArticle.content, /تیتر مقاله[\s\S]*بدنهٔ مقاله/)
 assert.match(editor.blocksHtml(storedArticle), /<h2 class="mcb mcb-content-heading mcb-align-start">تیتر مقاله<\/h2>/)
 assert.deepEqual(changes, [['post', article.id, 'legacy', 'blocks-v1']], 'the site is told the article changed')
 assert.deepEqual((await prisma.contentRevision.findMany({where: {entityType: 'posts', entityId: article.id}, orderBy: {version: 'asc'}})).map(v => v.source), ['baseline', 'edit'])
 assert.equal((await failure(() => editor.saveDocument({entity: 'posts', id: article.id, document: doc(), expectedUpdatedAt: openedArticle.updatedAt, actor: staff})))?.code, 'CHANGED')
 assert.ok(savedArticle.updatedAt)
 // A page's id is not an article's: the same number names another row, or none.
 assert.equal((await failure(() => editor.loadDocument('posts', 2147483000)))?.status, 404)
 const raws = (data, pattern) => failure(() => prisma.post.update({where: {id: article.id}, data})).then(error => assert.match(String(error?.message), pattern))
 await raws({editorFormat: 'gutenberg'}, /Post_editorFormat_check/)
 await raws({contentDocument: ''}, /Post_document_matches_format/)
 assert.match(form, /b\?\.content !== undefined && \(await db\.post\.findUnique\(\{ where: \{ id \}, select: \{ editorFormat: true \} \}\)\)\?\.editorFormat === 'blocks-v1'\) return err\(/)
 const articlePage = fs.readFileSync('src/modules/site/server/pages/blog/[slug]/page.tsx', 'utf8')
 assert.match(articlePage, /const articleBlocks = !locked && \(isFa \|\| !post\.contentEn\) \? blocksHtml\(post\) : null/, 'a locked article never shows its document')

 console.log('PostgreSQL documents: a plugin that is on by default, and switched off saves nothing; a save is checked, versioned and kept in the page history; a stale or racing save is refused; an invalid document is not stored; unknown blocks survive; block permissions hold; the database refuses a mismatched row; an article is written the same way under its own permission passed')
}

main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {
  const ids = (await prisma.page.findMany({where: {slug: {startsWith: seed}}, select: {id: true}})).map(item => item.id)
  await prisma.contentRevision.deleteMany({where: {entityType: 'pages', entityId: {in: ids}}})
  await prisma.page.deleteMany({where: {id: {in: ids}}})
  const posts = (await prisma.post.findMany({where: {slug: {startsWith: seed}}, select: {id: true}})).map(item => item.id)
  await prisma.contentRevision.deleteMany({where: {entityType: 'posts', entityId: {in: posts}}})
  await prisma.post.deleteMany({where: {id: {in: posts}}})
 } finally {await prisma.$disconnect()}
})
