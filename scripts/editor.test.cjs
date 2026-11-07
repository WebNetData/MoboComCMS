const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

const cache = new Map()
function load(relative) {
  const file = path.resolve(__dirname, '..', relative.endsWith('.ts') ? relative : `${relative}.ts`)
  if (cache.has(file)) return cache.get(file).exports
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const mod = { exports: {} }
  cache.set(file, mod)
  new Function('require', 'module', 'exports', source)((specifier) => (specifier.startsWith('@/') ? load(`src/${specifier.slice(2)}`) : require(specifier)), mod, mod.exports)
  return mod.exports
}

const doc = load('src/modules/editor/domain/document')
const rich = load('src/modules/editor/domain/rich-text')
const fields = load('src/modules/editor/domain/fields')
const { BlockRegistry } = load('src/modules/editor/domain/registry')
const core = load('src/modules/editor/domain/core-blocks')
const v = load('src/modules/editor/domain/validate')
const r = load('src/modules/editor/domain/render')

const registry = core.createRegistry()
test('editorial file blocks share typed asset validation and preserve playable canonical content', () => {
  for (const [type, src] of [['content.video','/files/uploads/clip.mp4'],['content.audio','/files/uploads/voice.mp3']]) {
    const checked = v.checkDocument({version:1,blocks:[{id:'media_0001',type,version:1,props:{file:{src,caption:'توضیح'},title:'عنوان',audioKind:'podcast'}}]},registry)
    assert.equal(checked.ok,true,JSON.stringify(checked.issues))
    const html = r.documentHtml(checked.document,registry)
    assert.match(html,/data-mc-player/);assert.ok(html.includes(src));assert.match(html,/controls preload="none"/);assert.match(html,/<figcaption>توضیح<\/figcaption>/)
  }
  const wrong=v.checkDocument({version:1,blocks:[{id:'media_0001',type:'content.audio',version:1,props:{file:{src:'/files/document.pdf'}}}]},registry)
  assert.equal(wrong.ok,false);assert.ok(wrong.issues.some(i=>i.code==='field.asset.type'))
  assert.equal(v.checkDocument({version:1,blocks:[{id:'media_0001',type:'content.audio',version:1,props:{file:{src:'/api/media/transfers/12345678-1234-1234-1234-123456789abc'}}}]},registry).ok,true,'explicit Library transfers keep their stable URL while pending')
})
test('provider resolver canonicalizes exact Namasha/Tamasha hosts and refuses URL confusion',()=>{
  for(const [url,expected]of [['https://www.namasha.com/v/kDjys59P','https://www.namasha.com/embed/kDjys59P'],['https://tamasha.com/v/xZlNe','https://tamasha.com/embed/xZlNe'],['https://www.tamasha.com/embed/xZlNe?autoplay=1','https://tamasha.com/embed/xZlNe']])assert.equal(fields.embedOf(url)?.url,expected)
  for(const url of ['https://tamasha.com.evil.invalid/v/xZlNe','https://evil.invalid/?url=https://namasha.com/v/abcd','https://user:password@namasha.com/v/abcd','https://tamasha.com:8443/v/xZlNe','//namasha.com/v/abcd','https://namasha.com/channel/abcd','https://youtu.be/dQw4w9WgXcQ/evil'])assert.equal(fields.embedOf(url),null,url)
})
test('module descriptors use the same owner schemas without sending executable migrations to the browser', () => {
  const { blockDescriptors, registryFromDescriptors } = load('src/modules/editor/domain/descriptors')
  const { publicItemsBlock } = load('src/modules/editor/domain/module-blocks')
  const definition = publicItemsBlock('cinema.fixtureGrid', 'cinema', 'cinema', 'title', { fa: 'فیلم‌ها', en: 'Films' })
  const server = core.createRegistry([definition]), descriptors = JSON.parse(JSON.stringify(blockDescriptors(server))), browser = registryFromDescriptors(descriptors)
  assert.ok(!descriptors.some(item => Object.hasOwn(item, 'migrate')))
  assert.deepEqual(fields.defaultProps(browser.get(definition.type).fields).columns, { desktop: 3, tablet: 2, mobile: 1 })
  assert.equal(browser.get(definition.type).owner, 'cinema')
  const old = { version: 1, blocks: [{ id: 'old_block', type: 'content.richText', version: 1, props: { content: { type: 'doc', content: [] } } }] }
  assert.equal(v.checkDocument(old, server).document.blocks[0].version, 2, 'server owns real migrations')
  assert.deepEqual(v.checkDocument(old, browser).document.blocks, old.blocks, 'browser never invents a migration for old pasted data')
  assert.equal(v.checkDocument(old, browser).unsupported.length, 1)
  assert.throws(() => new BlockRegistry().register({ ...server.get('content.richText'), migrate: undefined }), /migration/)
})
test('module traversal is bounded and never inspects children of unsupported blocks', () => {
  const { publicItemsBlock, moduleBlocks, MODULE_BLOCK_LIMIT } = load('src/modules/editor/domain/module-blocks')
  const definition = publicItemsBlock('music.fixtureGrid', 'music', 'music', 'track', { fa: 'آهنگ‌ها', en: 'Tracks' }), server = core.createRegistry([definition])
  const list = Array.from({ length: 40 }, (_, index) => ({ id: 'module_' + index, type: definition.type, version: 1, props: fields.defaultProps(definition.fields) }))
  const hidden = { id: 'unknown_parent', type: 'future.container', version: 1, props: {}, children: list }
  assert.equal(moduleBlocks({ version: 1, blocks: [hidden] }, server).length, 0)
  assert.equal(moduleBlocks({ version: 1, blocks: list }, server).length, MODULE_BLOCK_LIMIT + 1, 'one extra proves the save limit without traversing everything')
  const nested = { version: 1, blocks: [{ id: 'container_a', type: 'layout.container', version: 1, props: { width: 'wide', align: 'start' }, children: [list[0]] }] }
  const html = r.documentHtml(nested, server, item => item.id === list[0].id ? '<p>trusted render</p>' : undefined)
  assert.match(html, /mcb-layout-container[\s\S]*<p>trusted render<\/p>/)
})
test('history preserves complete canonical JSON rather than storing an un-restorable truncated document', () => {
  const { snapshotOf } = load('src/modules/content/domain/revisions')
  const contentDocument = JSON.stringify({ version: 1, blocks: [{ id: 'large_block', type: 'future.large', version: 1, props: { text: 'x'.repeat(240000) } }] })
  const result = snapshotOf({ contentDocument, miscellaneous: 'x'.repeat(240000), apiKey: 'private-fixture' })
  assert.equal(result.contentDocument, contentDocument); assert.equal(JSON.parse(result.contentDocument).blocks.length, 1)
  assert.equal(result.miscellaneous.length, 200000); assert.equal(result.apiKey, undefined)
})
const text = (value, marks) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) })
const para = (...content) => ({ type: 'paragraph', content })
const richDoc = (...content) => ({ type: 'doc', content })
let n = 0
const block = (type, props = {}, children) => ({ id: `blk_${String(++n).padStart(4, '0')}`, type, version: registry.get(type)?.version || 1, props, ...(children ? { children } : {}) })
const document = (...blocks) => ({ version: 1, blocks })
const codes = (check) => check.issues.filter((issue) => issue.level === 'error').map((issue) => issue.code)

test('rich-text v2 preserves v1 text and tables keep bounded spans, safe marks, direction and searchable text', () => {
  const cell = (value, attrs, header = false) => ({ type: header ? 'tableHeader' : 'tableCell', attrs, content: [para(text(value, [{ type: 'highlight' }, { type: 'textStyle', attrs: { color: 'accent' } }]))] })
  const row = (...cells) => ({ type: 'tableRow', content: cells })
  const table = (...rows) => ({ type: 'table', content: rows })
  const value = richDoc(table(row(cell('عنوان', { colspan: 2 }, true)), row(cell('فارسی', { rowspan: 2 }), cell('English <script>')), row(cell('آخر'))))
  const normalized = rich.normalizeRichText(value)
  assert.deepEqual(normalized.issues, [])
  const html = rich.richTextHtml(value)
  assert.match(html, /<table><tbody><tr><th colspan="2">/)
  assert.match(html, /<td rowspan="2"><p dir="rtl">/)
  assert.match(html, /English &lt;script&gt;/)
  assert.doesNotMatch(html, /<script>|style=/)
  assert.match(rich.richTextFacts(value).text, /عنوان\nفارسی\nEnglish <script>\nآخر/)
  const old = { ...block('content.richText', { content: richDoc(para(text('old unchanged'))) }), version: 1 }
  const migrated = v.checkDocument(document(old), registry)
  assert.equal(migrated.ok, true); assert.equal(migrated.document.blocks[0].version, 2)
  assert.equal(migrated.document.blocks[0].props.content.content[0].content[0].text, 'old unchanged')
  const oldRegistry = new BlockRegistry().register({ ...core.CORE_BLOCKS.find(block => block.type === 'content.richText'), version: 1, migrate: undefined })
  assert.equal(v.checkDocument(document(block('content.richText', { content: value })), oldRegistry).unsupported.length, 1, 'an older registry preserves the newer block as unsupported')
  for (const invalid of [table(), table(row(cell('a')), row(cell('b'), cell('c'))), table(row(cell('a', { colspan: 21 }))), table(row(cell('a', { rowspan: 2 }))), table(...Array.from({ length: 101 }, () => row(cell('a')))), table(row({ type: 'tableCell', content: [table(row(cell('nested')))] }))]) assert.ok(rich.normalizeRichText(richDoc(invalid)).issues.length, 'invalid grids are rejected')
  assert.deepEqual(rich.normalizeRichText(richDoc(table(row(cell('a', { rowspan: 2 })), row()))).issues, [], 'a whole merged row can have no own cells')
})

test('a document is checked block by block: shape, ids, places, depth and size', () => {
  const good = document(block('layout.section', { width: 'wide' }, [block('layout.columns', { columns: { desktop: 3, tablet: 2, mobile: 1 } }, [block('layout.column', {}, [block('content.heading', { text: 'سلام', level: 2 })]), block('layout.column', {}, [block('content.richText', { content: richDoc(para(text('متن فارسی و English با هم'))) })])])]))
  const checked = v.checkDocument(good, registry)
  assert.deepEqual([checked.ok, checked.issues, checked.unsupported, checked.migrated], [true, [], [], 0])
  // Every declared field is there after the check, with its default when it was not given.
  const section = checked.document.blocks[0]
  assert.deepEqual(section.props, { width: 'wide', space: 'md', tone: 'none', anchor: '' })
  assert.deepEqual(section.children[0].props.columns, { desktop: 3, tablet: 2, mobile: 1 })
  assert.deepEqual(v.checkDocument(checked.document, registry).document, checked.document, 'checking a checked document changes nothing')
  assert.deepEqual(v.checkDocument(JSON.parse(JSON.stringify(checked.document)), registry).ok, true)

  for (const [input, code] of [
    [null, 'document.shape'], [[], 'document.shape'], [{ version: 2, blocks: [] }, 'document.version'], [{ version: 1, blocks: {} }, 'document.blocks'],
    [document('x'), 'block.shape'],
    [document({ ...block('content.heading'), id: 'a b' }), 'block.id'],
    [document({ ...block('content.heading'), type: 'Heading' }), 'block.type'],
    [document({ ...block('content.heading'), version: 0 }), 'block.version'],
    [document({ ...block('content.heading'), version: '1' }), 'block.version'],
    [document(block('layout.column')), 'block.place'],
    [document(block('layout.columns', {}, [block('content.heading')])), 'block.place'],
    [document(block('content.buttonGroup', {}, [block('content.image')])), 'block.place'],
    [document(block('content.heading', {}, [block('content.heading')])), 'block.children'],
    [document(block('layout.columns', {}, Array.from({ length: 7 }, () => block('layout.column')))), 'block.children.count'],
    [document({ ...block('layout.section'), children: 'no' }), 'block.children'],
  ]) assert.ok(codes(v.checkDocument(input, registry)).includes(code), `${code}: ${JSON.stringify(codes(v.checkDocument(input, registry)))}`)
  const twin = block('content.heading')
  assert.deepEqual(codes(v.checkDocument(document(twin, { ...twin }), registry)), ['block.id.duplicate'])
  let deep = block('content.heading'); for (let i = 0; i < doc.DOCUMENT_LIMITS.maxDepth; i += 1) deep = block('layout.section', {}, [deep])
  assert.ok(codes(v.checkDocument(document(deep), registry)).includes('document.depth'))
  assert.ok(codes(v.checkDocument(document(...Array.from({ length: doc.DOCUMENT_LIMITS.maxBlocks + 1 }, () => block('layout.divider'))), registry)).includes('document.blocks.count'))
  assert.ok(codes(v.checkDocument(document(block('content.heading', { text: 'x'.repeat(301) })), registry)).includes('field.length'))
  assert.deepEqual(codes(v.checkDocument({ version: 1, blocks: [block('content.richText', { content: richDoc(para(text('x'.repeat(doc.DOCUMENT_LIMITS.maxBytes)))) })] }, registry)), ['document.size'])
  assert.match(doc.newBlockId(), /^b_[a-z0-9]{12}$/); assert.notEqual(doc.newBlockId(), doc.newBlockId())
})

test('a field holds what its block declares, and nothing that runs', () => {
  const props = (type, given) => { const issues = []; const out = fields.checkProps(registry.get(type).fields, given, 'p', issues); return { out, codes: issues.filter((i) => i.level === 'error').map((i) => i.code), warnings: issues.filter((i) => i.level === 'warning').map((i) => i.path) } }
  assert.deepEqual(props('content.heading', { text: 'T', level: 3 }).out, { text: 'T', level: 3, align: 'start', anchor: '' })
  for (const level of [1, 7, 2.5, '3']) assert.deepEqual(props('content.heading', { level }).codes, ['field.int'], `level ${level}: a document has no H1`)
  assert.deepEqual(props('layout.section', { width: 'huge' }).codes, ['field.enum'])
  assert.deepEqual(props('content.image', { rounded: 'yes' }).codes, ['field.boolean'])
  assert.deepEqual(props('content.heading', { text: 5 }).codes, ['field.string'])
  assert.deepEqual(props('content.heading', { text: 'ok', style: 'color:red', onclick: 'x()' }).warnings, ['p.style', 'p.onclick'], 'what is not declared is not kept')
  assert.equal('style' in props('content.heading', { style: 'x' }).out, false)
  // Links.
  for (const href of ['https://example.com/a?b=1', '/blog/x', '#top', 'mailto:a@b.co', 'tel:+982100000']) assert.deepEqual(props('content.button', { href }).codes, [], href)
  for (const href of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', 'vbscript:x', '//evil.example/x', 'https://user:pw@example.com', 'java\tscript:x', ' https://a b', '/\\evil']) assert.deepEqual(props('content.button', { href }).codes, ['field.url'], href)
  // Media: a file of this site or an https address, of the right kind.
  const image = (src, extra = {}) => props('content.image', { image: { src, ...extra } })
  assert.deepEqual(image('/uploads/2026/a.webp', { alt: 'گربه', width: 800, height: 600, mime: 'image/webp' }).out.image, { src: '/uploads/2026/a.webp', alt: 'گربه', caption: '', width: 800, height: 600, mime: 'image/webp' })
  assert.deepEqual(image('https://cdn.example.com/a.png?v=2').codes, [])
  for (const src of ['javascript:x', 'data:image/png;base64,AAAA', 'http://insecure.example/a.png', '/uploads/../../etc/passwd.png', '//x.example/a.png', '/a.png" onerror="x']) assert.deepEqual(image(src).codes, ['field.asset.src'], src)
  assert.deepEqual(image('/uploads/a.exe').codes, ['field.asset.type'])
  assert.deepEqual(image('/uploads/a.png', { width: -5, height: 1e9, mime: 'text/html<script>' }).out.image, { src: '/uploads/a.png', alt: '', caption: '', width: 0, height: 0, mime: '' })
  assert.deepEqual(props('content.image', { image: 'x' }).codes, ['field.asset'])
  // Embeds: only known players, and the stored address is built here.
  const embed = (url) => props('content.embed', { embed: { url } })
  assert.deepEqual(embed('https://www.youtube.com/watch?v=dQw4w9WgXcQ').out.embed, { provider: 'youtube', url: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' })
  assert.deepEqual(embed('https://youtu.be/dQw4w9WgXcQ').out.embed.provider, 'youtube')
  assert.deepEqual(embed('https://www.aparat.com/v/abc123').out.embed, { provider: 'aparat', url: 'https://www.aparat.com/video/video/embed/videohash/abc123/vt/frame' })
  assert.deepEqual(embed('https://vimeo.com/123456789').out.embed.url, 'https://player.vimeo.com/video/123456789')
  for (const url of ['https://evil.example/embed/x', 'http://www.youtube.com/watch?v=dQw4w9WgXcQ', 'javascript:x', '<iframe src=x>', 'https://www.youtube.com/watch?v="><script>']) assert.deepEqual(embed(url).codes, ['field.embed'], url)
  assert.deepEqual(embed('').codes, [])
  // Responsive values are structured; one value is spread over the three screens.
  assert.deepEqual(props('content.gallery', { columns: 4 }).out.columns, { desktop: 4, tablet: 4, mobile: 4 })
  assert.deepEqual(props('content.gallery', { columns: { desktop: 4, tablet: 2 } }).out.columns, { desktop: 4, tablet: 2, mobile: 3 })
  assert.deepEqual(props('content.gallery', { columns: { desktop: 9 } }).codes, ['field.int'])
  assert.deepEqual(props('content.gallery', { images: Array.from({ length: 61 }, () => ({})) }).codes, ['field.list.length'])
  assert.deepEqual(props('content.gallery', { images: 'x' }).codes, ['field.list'])
  assert.deepEqual(props('content.heading', 'x').codes, ['props.shape'])
})

test('rich text is Tiptap JSON checked against a closed list, and rendered with every text escaped', () => {
  const persian = richDoc(
    { type: 'heading', attrs: { level: 2, textAlign: 'center', dir: 'rtl' }, content: [text('عنوان')] },
    para(text('متن '), text('پررنگ', [{ type: 'bold' }, { type: 'italic' }]), text(' و English mixed 123 '), text('پیوند', [{ type: 'link', attrs: { href: '/blog/x' } }]), { type: 'hardBreak' }, text('کد', [{ type: 'code' }])),
    { type: 'bulletList', content: [{ type: 'listItem', content: [para(text('یک'))] }, { type: 'listItem', content: [para(text('دو')), { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [para(text('سه'))] }] }] }] },
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [para(text('انجام شد'))] }] },
    { type: 'blockquote', content: [para(text('نقل'))] },
    { type: 'codeBlock', attrs: { language: 'bash' }, content: [text('echo "<b>" && ls')] },
    { type: 'horizontalRule' },
  )
  const checked = rich.normalizeRichText(persian)
  assert.deepEqual(checked.issues, [])
  assert.deepEqual(rich.normalizeRichText(checked.doc).doc, checked.doc)
  const html = rich.richTextHtml(persian)
  assert.equal(html, '<h2 class="mcb-align-center" dir="rtl">عنوان</h2><p dir="rtl">متن <strong><em>پررنگ</em></strong> و English mixed 123 <a href="/blog/x">پیوند</a><br><code>کد</code></p><ul dir="rtl"><li><p dir="rtl">یک</p></li><li><p dir="rtl">دو</p><ol start="3" dir="rtl"><li><p dir="rtl">سه</p></li></ol></li></ul><ul class="mcb-tasks" dir="rtl"><li class="mcb-task is-done"><input type="checkbox" disabled checked><div><p dir="rtl">انجام شد</p></div></li></ul><blockquote dir="rtl"><p dir="rtl">نقل</p></blockquote><pre dir="ltr" tabindex="0" role="region" aria-label="بلوک کد"><code class="language-bash">echo &quot;&lt;b&gt;&quot; &amp;&amp; ls</code></pre><hr>')
  // What a hostile value may try.
  const issuesOf = (value) => rich.normalizeRichText(value).issues.map((issue) => issue.code)
  const hostile = richDoc(
    para(text('<script>alert(1)</script><img src=x onerror=alert(1)>')),
    para(text('x', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]), text('y', [{ type: 'link', attrs: { href: 'https://example.com', onclick: 'x()', class: 'a" onmouseover="x' } }])),
    { type: 'paragraph', attrs: { style: 'background:url(javascript:x)', class: 'x', textAlign: 'center;color:red', onclick: 'x' }, content: [text('p')] },
    { type: 'image', attrs: { src: 'x', onerror: 'x' } }, { type: 'iframe', attrs: { src: 'https://evil.example' } }, { type: 'rawHtml', attrs: { html: '<script>x</script>' } },
    para(text('c', [{ type: 'textStyle', attrs: { color: 'red;background:url(x)' } }, { type: 'evil' }])),
    { type: 'heading', attrs: { level: 1 }, content: [text('h1')] },
    { type: 'codeBlock', attrs: { language: '"><script>' }, content: [text('code', [{ type: 'bold' }])] },
  )
  const out = rich.richTextHtml(hostile)
  assert.equal(out, '<p dir="ltr">&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;</p><p dir="ltr">x<a href="https://example.com/" target="_blank" rel="noopener noreferrer nofollow">y</a></p><p dir="ltr">p</p><p dir="ltr">c</p><h2 dir="ltr">h1</h2><pre dir="ltr" tabindex="0" role="region" aria-label="بلوک کد"><code class="language-plain">code</code></pre>')
  assert.doesNotMatch(out, /<script|<iframe|<img| on[a-z]+="|href="javascript|style="/)
  assert.deepEqual([...new Set(issuesOf(hostile))].sort(), ['rich-text.color', 'rich-text.heading', 'rich-text.link', 'rich-text.mark', 'rich-text.node'])
  const kept = rich.normalizeRichText(hostile).doc
  assert.deepEqual(kept.content[kept.content.length - 1], { type: 'codeBlock', attrs: { language: 'plain' }, content: [{ type: 'text', text: 'code' }] }, 'text in a code block carries no marks')
  assert.deepEqual(kept.content[3], { type: 'paragraph', content: [{ type: 'text', text: 'c' }] }, 'a colour that is not a theme colour is not stored')
  assert.deepEqual(issuesOf({ type: 'paragraph' }), ['rich-text.doc'])
  assert.deepEqual(issuesOf(richDoc({ type: 'listItem', content: [] })), ['rich-text.place'], 'a list item outside a list')
  assert.deepEqual(issuesOf(richDoc(para({ type: 'paragraph' }))), ['rich-text.place'])
  let nested = para(text('x')); for (let i = 0; i < 20; i += 1) nested = { type: 'blockquote', content: [nested] }
  assert.ok(issuesOf(richDoc(nested)).includes('rich-text.depth'))
  assert.equal(rich.richTextHtml(null), ''); assert.equal(rich.richTextHtml('<p>html is not rich text</p>'), '')
  // Text colours are theme names; a mark listed twice is written once; mark order never changes the HTML.
  assert.equal(rich.richTextHtml(richDoc(para(text('a', [{ type: 'textStyle', attrs: { color: 'accent' } }, { type: 'highlight' }])))), '<p dir="ltr"><span class="mcb-color-accent"><mark>a</mark></span></p>')
  assert.equal(rich.richTextHtml(richDoc(para(text('a', [{ type: 'italic' }, { type: 'bold' }, { type: 'bold' }])))), rich.richTextHtml(richDoc(para(text('a', [{ type: 'bold' }, { type: 'italic' }])))))
  const facts = rich.richTextFacts(persian)
  assert.deepEqual([facts.headings, facts.links], [[{ level: 2, text: 'عنوان' }], [{ href: '/blog/x', text: 'پیوند' }]])
  assert.match(facts.text, /^عنوان\nمتن پررنگ و English mixed 123 پیوند\nکد\nیک\nدو\nسه\nانجام شد\nنقل\necho "<b>" && ls$/)
})

test('a block that is not known, or newer than known, is kept exactly as stored', () => {
  const stranger = { id: 'ext_block_1', type: 'gallery-pro.carousel', version: 4, props: { slides: [{ image: 'x', nested: { deep: [1, 2, 3] } }], speed: 2.5 }, children: [{ id: 'ext_child_1', type: 'gallery-pro.slide', version: 1, props: { html: '<b>kept as data, never rendered</b>' } }] }
  const future = { ...block('content.heading', { text: 'from a newer release', shadow: 'lg' }), version: 9 }
  const input = document(block('content.heading', { text: 'before' }), stranger, future, block('content.heading', { text: 'after' }))
  const checked = v.checkDocument(JSON.parse(JSON.stringify(input)), registry)
  assert.equal(checked.ok, true, JSON.stringify(checked.issues))
  assert.deepEqual(checked.document.blocks[1], stranger)
  assert.deepEqual(checked.document.blocks[2], future)
  assert.deepEqual(checked.unsupported.map((u) => [u.type, u.version, u.reason, u.path]), [['gallery-pro.carousel', 4, 'unknown-type', 'blocks[1]'], ['content.heading', 9, 'newer-version', 'blocks[2]']])
  // Saved and loaded again and again, it is still there, and still in its place.
  let round = checked.document
  for (let i = 0; i < 3; i += 1) round = v.checkDocument(JSON.parse(JSON.stringify(round)), registry).document
  assert.deepEqual(round.blocks.map((b) => b.id), input.blocks.map((b) => b.id)); assert.deepEqual(round.blocks[1], stranger)
  // Its ids are still taken: a block added later cannot share one.
  assert.deepEqual(codes(v.checkDocument(document(stranger, { ...block('content.heading'), id: 'ext_child_1' }), registry)), ['block.id.duplicate'])
  // It is not read and not rendered; it leaves a mark where it stands.
  const facts = r.documentFacts(checked.document, registry)
  assert.equal(facts.text, 'before\nafter'); assert.deepEqual(facts.blocks.filter((b) => !b.supported).map((b) => b.type), ['gallery-pro.carousel', 'content.heading'])
  const html = r.documentHtml(checked.document, registry)
  assert.match(html, /<!-- unsupported block gallery-pro\.carousel -->/); assert.doesNotMatch(html, /kept as data|newer release/)
  // When its owner comes back, it is a block again.
  const withOwner = core.createRegistry([{ type: 'gallery-pro.carousel', version: 4, category: 'extension', kind: 'static', icon: 'x', label: { fa: 'x', en: 'x' }, owner: 'gallery-pro', fields: { speed: { kind: 'int', min: 1, max: 10, default: 3 } }, children: { allowed: ['gallery-pro.slide'] }, migrate: { 1: (p) => p, 2: (p) => p, 3: (p) => p } }])
  const back = v.checkDocument(document(stranger), withOwner)
  assert.deepEqual(back.unsupported.map((u) => u.type), ['gallery-pro.slide']); assert.deepEqual(codes(back), ['field.int'], 'and its props are checked like any other')
  // A document format this code does not know is refused whole, not guessed at.
  assert.deepEqual(codes(v.checkDocument({ version: 7, blocks: [stranger] }, registry)), ['document.version'])
  // readDocument never throws on what storage holds.
  for (const stored of ['', '   ', 'not json', '{"version":1', null, undefined, 42, '[]']) assert.doesNotThrow(() => v.readDocument(stored, registry))
  assert.equal(v.readDocument('', registry).ok, true); assert.equal(v.readDocument('not json', registry).ok, false)
  assert.deepEqual(v.readDocument(JSON.stringify(input), registry).document.blocks.length, 4)
})

test('props of an older version are migrated step by step, never reinterpreted', () => {
  const card = { type: 'store.productCard', version: 3, category: 'store', kind: 'dynamic', icon: 'x', label: { fa: 'x', en: 'x' }, fields: { productId: { kind: 'int', min: 1, max: 1e9, default: 1 }, layout: { kind: 'enum', values: ['row', 'tile'], default: 'tile' } },
    migrate: { 1: (p) => ({ productId: Number(p.id), wide: p.wide }), 2: (p) => ({ productId: p.productId, layout: p.wide ? 'row' : 'tile' }) } }
  const withCard = core.createRegistry([card])
  const old = { id: 'card_0001', type: 'store.productCard', version: 1, props: { id: '42', wide: true } }
  const checked = v.checkDocument(document(old), withCard)
  assert.deepEqual([checked.ok, checked.migrated, checked.document.blocks[0]], [true, 1, { id: 'card_0001', type: 'store.productCard', version: 3, props: { productId: 42, layout: 'row' } }])
  assert.deepEqual(old.props, { id: '42', wide: true }, 'the stored value is not changed in place')
  assert.deepEqual(v.checkDocument(document({ ...old, version: 2, props: { productId: 7, wide: false } }), withCard).document.blocks[0].props, { productId: 7, layout: 'tile' })
  assert.equal(v.checkDocument(document({ ...old, version: 3, props: { productId: 7, layout: 'row' } }), withCard).migrated, 0)
  // A registry refuses a type whose history has a hole, and a name that is not owner.name.
  const base = { category: 'store', kind: 'static', icon: 'x', label: { fa: 'x', en: 'x' }, fields: {} }
  assert.throws(() => new BlockRegistry().register({ ...base, type: 'store.x', version: 3, migrate: { 1: (p) => p } }), /no migration from version 2 to 3/)
  assert.throws(() => new BlockRegistry().register({ ...base, type: 'Store', version: 1 }), /not a block type/)
  assert.throws(() => new BlockRegistry().register({ ...base, type: 'store.x', version: 0 }), /version/)
  assert.throws(() => core.createRegistry([{ ...base, type: 'content.heading', version: 1 }]), /registered twice/)
  // A block whose definition lost a step since it was stored is kept as stored.
  const holed = new BlockRegistry().register({ ...base, type: 'store.y', version: 1 }); holed.get('store.y').version = 2
  assert.deepEqual(v.checkDocument(document({ id: 'hole_0001', type: 'store.y', version: 1, props: { a: 1 } }), holed).unsupported.map((u) => u.reason), ['missing-migration'])
  // A permission of a block is asked of whoever saves.
  const guarded = core.createRegistry([{ ...base, type: 'store.priceTable', version: 1, permission: 'cms.products' }])
  const priced = document(block('store.priceTable'), block('content.heading', { text: 'anyone may add a heading' }))
  assert.deepEqual(codes(v.checkDocument(priced, guarded, { permissions: () => false })), ['block.permission'])
  assert.deepEqual(codes(v.checkDocument(priced, guarded, { permissions: (name) => name === 'cms.products' })), [])
  assert.deepEqual(codes(v.checkDocument(priced, guarded)), [], 'reading a stored document asks nobody')
})

test('a document reads as facts for search and SEO, and as plain HTML with nothing unescaped', () => {
  const page = v.checkDocument(document(
    block('layout.section', { width: 'narrow', tone: 'accent', anchor: 'intro' }, [
      block('content.heading', { text: 'راهنمای <نصب>', level: 2, anchor: 'install' }),
      block('content.richText', { dir: 'rtl', content: richDoc({ type: 'heading', attrs: { level: 4 }, content: [text('پیش‌نیاز')] }, para(text('برای شروع '), text('این صفحه', [{ type: 'link', attrs: { href: 'https://example.com/docs' } }]), text(' را ببینید.'))) }),
      block('layout.columns', { columns: { desktop: 2, tablet: 2, mobile: 1 } }, [
        block('layout.column', {}, [block('content.image', { image: { src: '/uploads/a.webp', alt: 'نمای برنامه', caption: 'تصویر ۱', width: 640, height: 360 }, link: '/software/x' })]),
        block('layout.column', {}, [block('content.gallery', { images: [{ image: { src: '/uploads/b.png', alt: '' } }, { image: { src: '/uploads/c.png', alt: 'c' } }] })]),
      ]),
      block('content.buttonGroup', {}, [block('content.button', { label: 'دانلود "نسخهٔ جدید"', href: '/dl/x', variant: 'primary' })]),
      block('content.callout', { tone: 'warning', title: 'توجه', content: richDoc(para(text('نسخهٔ قدیمی را حذف کنید'))) }),
      block('content.faq', { open: 'first', items: [{ question: 'رایگان است؟', answer: richDoc(para(text('بله'))) }, { question: 'لینوکس؟', answer: richDoc(para(text('خیر'))) }] }),
      block('content.embed', { embed: { url: 'https://youtu.be/dQw4w9WgXcQ' }, title: 'معرفی' }),
      block('content.quote', { content: richDoc(para(text('عالی'))), cite: 'کاربر' }),
      block('layout.spacer', { size: { desktop: 'lg', tablet: 'md', mobile: 'sm' } }), block('layout.divider', { line: 'dashed' }),
    ]),
  ), registry)
  assert.deepEqual(codes(page), [])
  const facts = r.documentFacts(page.document, registry)
  assert.deepEqual(facts.headings.map((h) => [h.level, h.text]), [[2, 'راهنمای <نصب>'], [4, 'پیش‌نیاز']])
  assert.deepEqual(r.headingProblems(facts).map((p) => p.message), ['heading level 4 follows level 2'])
  assert.deepEqual(facts.links.map((l) => l.href), ['https://example.com/docs', '/software/x', '/dl/x'])
  assert.deepEqual(facts.images.map((i) => [i.src, i.alt]), [['/uploads/a.webp', 'نمای برنامه'], ['/uploads/b.png', ''], ['/uploads/c.png', 'c']])
  assert.equal(facts.imagesWithoutAlt, 1)
  assert.equal(facts.text, 'راهنمای <نصب>\nپیش‌نیاز\nبرای شروع این صفحه را ببینید.\nتصویر ۱\nدانلود "نسخهٔ جدید"\nتوجه\nنسخهٔ قدیمی را حذف کنید\nرایگان است؟\nبله\nلینوکس؟\nخیر\nمعرفی\nعالی\nکاربر')
  assert.equal(facts.headings.some((h) => h.level === 1), false, 'a document never brings an H1')
  const html = r.documentHtml(page.document, registry)
  assert.match(html, /^<section class="mcb mcb-layout-section mcb-width-narrow mcb-space-md mcb-tone-accent" id="intro">/)
  assert.match(html, /<h2 class="mcb mcb-content-heading mcb-align-start" id="install" dir="rtl">راهنمای &lt;نصب&gt;<\/h2>/)
  assert.match(html, /<div class="mcb mcb-layout-columns mcb-cols-desktop-2 mcb-cols-tablet-2 mcb-cols-mobile-1 mcb-gap-md mcb-align-stretch">/)
  assert.match(html, /<a href="\/software\/x"><figure><img src="\/uploads\/a\.webp" alt="نمای برنامه" width="640" height="360" loading="lazy" decoding="async"><figcaption>تصویر ۱<\/figcaption><\/figure><\/a>/)
  assert.match(html, /<a class="mcb mcb-content-button mcb-variant-primary mcb-size-md" href="\/dl\/x">دانلود &quot;نسخهٔ جدید&quot;<\/a>/)
  assert.match(html, /<details open><summary>رایگان است؟<\/summary><p dir="rtl">بله<\/p><\/details><details><summary>لینوکس؟/)
  assert.match(html, /data-mc-media="embed" data-mc-src="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ" data-mc-title="معرفی"/)
  assert.match(html, /class="mc-media-external" href="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ"/)
  assert.doesNotMatch(html, /<iframe/, 'an external player waits for explicit viewer activation')
  assert.match(html, /<aside class="mcb mcb-content-callout mcb-tone-warning" role="note"><strong>توجه<\/strong>/)
  assert.doesNotMatch(html, /style=|<script| on[a-z]+=|javascript:/)
  // Props that reach the renderer without having been checked still cannot write markup.
  const unchecked = { version: 1, blocks: [{ id: 'raw_0001', type: 'layout.section', version: 1, props: { width: 'x" onmouseover="y', tone: '"><script>', anchor: 'a" onclick="b' }, children: [{ id: 'raw_0002', type: 'content.button', version: 1, props: { label: '<b>x</b>', href: 'javascript:alert(1)', variant: 'x y' } }, { id: 'raw_0003', type: 'content.image', version: 1, props: { image: { src: '/a.png" onerror="x', alt: '"><script>' }, link: 'javascript:x' } }] }] }
  const raw = r.documentHtml(unchecked, registry)
  assert.doesNotMatch(raw, /<script|javascript:| on[a-z]+="|<b>/)
  assert.deepEqual(r.blockCounts(page.document)['layout.column'], 2)
  assert.deepEqual(fields.defaultProps(registry.get('layout.columns').fields), { columns: { desktop: 2, tablet: 2, mobile: 2 }, gap: 'md', align: 'stretch' })
})

test('the core blocks: every one valid with its defaults, placed where it says, named owner.name', () => {
  const types = registry.list().map((definition) => definition.type)
  for (const needed of ['layout.section', 'layout.container', 'layout.columns', 'layout.column', 'layout.stack', 'layout.spacer', 'layout.divider', 'content.richText', 'content.heading', 'content.image', 'content.gallery', 'content.embed', 'content.button', 'content.buttonGroup', 'content.quote', 'content.callout', 'content.faq']) assert.ok(types.includes(needed), needed)
  for (const definition of registry.list()) {
    const issues = []
    const props = fields.checkProps(definition.fields, fields.defaultProps(definition.fields), 'p', issues)
    assert.deepEqual(issues, [], definition.type)
    assert.deepEqual(fields.checkProps(definition.fields, props, 'p', []), props)
    assert.ok(definition.label.fa && definition.label.en && definition.icon, definition.type)
    for (const parent of definition.parents || []) assert.ok(registry.has(parent), `${definition.type} names a parent that exists`)
    if (definition.children && definition.children.allowed !== 'any') for (const child of definition.children.allowed) assert.ok(registry.has(child), `${definition.type} names a child that exists`)
    // No field of a core block holds markup, a style or a script.
    for (const [name, spec] of Object.entries(definition.fields)) assert.doesNotMatch(name, /^(html|css|style|script|js|class|className)$/i, `${definition.type}.${name}`)
  }
  assert.equal(registry.accepts(null, registry.get('layout.section')), true)
  assert.equal(registry.accepts(null, registry.get('layout.column')), false)
  assert.equal(registry.accepts(registry.get('layout.columns'), registry.get('layout.column')), true)
  assert.equal(registry.accepts(registry.get('layout.section'), registry.get('layout.column')), false)
  assert.equal(registry.accepts(registry.get('content.heading'), registry.get('content.button')), false)
})

test('the editor domain depends only on itself and dependency-free presentation codecs: no editing engine, React or database', () => {
  const dir = path.resolve(__dirname, '..', 'src/modules/editor/domain')
  for (const name of fs.readdirSync(dir)) {
    const source = fs.readFileSync(path.join(dir, name), 'utf8')
    for (const [, from] of source.matchAll(/from '([^']+)'/g)) assert.ok(from.startsWith('@/modules/editor/domain/') || ['@/shared/media/editorial', '@/shared/content/bbcode'].includes(from), `${name} imports ${from}`)
    assert.doesNotMatch(source, /@wordpress|@tiptap|dangerouslySetInnerHTML|innerHTML/, name)
  }
  const mediaSource = fs.readFileSync(path.resolve(dir, '../../../shared/media/editorial.ts'), 'utf8')
  assert.doesNotMatch(mediaSource, /\bimport\s|\brequire\s*\(|\bfrom\s+['"]|window\.|document\.|@wordpress|@tiptap|\bfetch\s*\(/, 'the one neutral codec remains portable and has no external/runtime dependencies')
  const decorations = fs.readFileSync(path.resolve(dir, '../../../shared/content/bbcode.ts'), 'utf8')
  assert.doesNotMatch(decorations, /\bimport\s|\brequire\s*\(|\bfrom\s+['"]|window\.|document\.|\bfetch\s*\(/)
})

// ------------------------------------------------------------------ the Gutenberg adapter

const gb = load('src/modules/editor/adapters/gutenberg/convert')

test('a document goes into the editing engine and comes back the same document', () => {
  const stranger = { id: 'ext_block_9', type: 'gallery-pro.carousel', version: 4, props: { slides: [1, 2] }, children: [{ id: 'ext_child_9', type: 'gallery-pro.slide', version: 1, props: {} }] }
  const future = { ...block('content.heading', { text: 'newer' }), version: 9 }
  const source = v.checkDocument(document(
    block('layout.section', { width: 'wide' }, [
      block('layout.columns', { columns: { desktop: 3, tablet: 2, mobile: 1 } }, [block('layout.column', {}, [block('content.richText', { content: richDoc(para(text('سلام'))) })]), block('layout.column', {}, [block('content.image', { image: { src: '/uploads/a.png', alt: 'a' } })])]),
      stranger, future,
      block('content.buttonGroup', {}, [block('content.button', { label: 'برو', href: '/x' })]),
    ]),
  ), registry).document
  const engine = gb.toEngineBlocks(source, registry)
  assert.equal(engine[0].name, 'mobocom/layout-section')
  assert.deepEqual(engine[0].innerBlocks.map((b) => b.name), ['mobocom/layout-columns', 'mobocom/unsupported', 'mobocom/unsupported', 'mobocom/content-button-group'])
  assert.equal(gb.engineName('content.richText'), 'mobocom/content-rich-text')
  assert.equal(gb.typeOfEngineName('mobocom/content-rich-text', registry), 'content.richText')
  assert.equal(gb.typeOfEngineName('core/paragraph', registry), null)
  for (const definition of registry.list()) { assert.match(gb.engineName(definition.type), /^mobocom\/[a-z][a-z0-9-]*$/); assert.equal(gb.typeOfEngineName(gb.engineName(definition.type), registry), definition.type) }
  assert.equal(new Set(registry.list().map((d) => gb.engineName(d.type))).size, registry.list().length, 'no two types share an engine name')
  assert.deepEqual(engine[0].attributes, { width: 'wide', space: 'md', tone: 'none', anchor: '', mcId: source.blocks[0].id, mcVersion: 1 })
  // Through the engine and back, as many times as an editor is opened: the same document.
  let round = source
  for (let i = 0; i < 3; i += 1) round = gb.fromEngineBlocks(JSON.parse(JSON.stringify(gb.toEngineBlocks(round, registry))), registry)
  assert.deepEqual(round, source)
  assert.deepEqual(v.checkDocument(round, registry).issues, [])
  // The engine's own copy is never the stored one: changing it does not reach the document.
  engine[0].attributes.width = 'full'; engine[0].innerBlocks[1].attributes.stored.props.slides.push(3)
  assert.equal(source.blocks[0].props.width, 'wide'); assert.deepEqual(source.blocks[0].children[1].props.slides, [1, 2])
})

test('what the engine makes becomes blocks with ids of their own; what it cannot name is left out', () => {
  let next = 0
  const id = () => 'new_' + String(++next).padStart(4, '0')
  const heading = (attrs) => ({ name: 'mobocom/content-heading', attributes: { text: 'h', level: 2, align: 'start', anchor: '', ...attrs }, innerBlocks: [] })
  const carried = { name: 'mobocom/unsupported', attributes: { mcId: 'ext_block_9', stored: { id: 'ext_block_9', type: 'x.y', version: 1, props: { k: 1 }, children: [{ id: 'new_0001', type: 'x.z', version: 1, props: {} }] } }, innerBlocks: [] }
  const out = gb.fromEngineBlocks([
    heading({ mcId: 'kept_0001' }),          // an existing block
    heading({}),                              // inserted: no id yet
    heading({ mcId: 'kept_0001' }),          // duplicated: shares an id
    carried, JSON.parse(JSON.stringify(carried)), // an unsupported block, and a copy of it made in the editor
    { name: 'core/paragraph', attributes: { content: '<script>x</script>' }, innerBlocks: [] }, // pasted from somewhere else
    { name: 'mobocom/layout-section', attributes: { width: 'container' }, innerBlocks: [heading({}), { name: 'core/html', attributes: {}, innerBlocks: [] }] },
    { name: 'mobocom/content-heading', attributes: { text: 'leaf', mcId: 'leaf_0001' }, innerBlocks: [heading({})] }, // a leaf never keeps inner blocks
  ], registry, id)
  assert.deepEqual(out.blocks.map((b) => [b.id, b.type]), [['kept_0001', 'content.heading'], ['new_0002', 'content.heading'], ['new_0003', 'content.heading'], ['ext_block_9', 'x.y'], ['new_0004', 'layout.section'], ['leaf_0001', 'content.heading']])
  assert.equal(out.blocks.some((b) => b.id === 'new_0001'), false, 'an id held inside a carried block is not given to a new block')
  assert.deepEqual(out.blocks[3], carried.attributes.stored)
  assert.deepEqual(out.blocks[4].children.map((b) => b.type), ['content.heading'])
  assert.equal('children' in out.blocks[5], false)
  assert.equal('mcId' in out.blocks[0].props || 'mcVersion' in out.blocks[0].props, false, 'the travelling attributes are not props')
  const ids = []; doc.walkBlocks(out.blocks, (b) => ids.push(b.id)); assert.equal(new Set(ids).size, ids.length)
  assert.deepEqual(v.checkDocument(out, registry).issues.filter((i) => i.level === 'error'), [])
  assert.deepEqual(gb.newEngineAttributes('layout.columns', registry), { columns: { desktop: 2, tablet: 2, mobile: 2 }, gap: 'md', align: 'stretch', mcVersion: 1 })
  assert.deepEqual(gb.newEngineAttributes('no.such', registry), {})
  assert.deepEqual(gb.fromEngineBlocks([], registry), { version: 1, blocks: [] })
})

test('WordPress packages are imported only where the editor adapts to them', () => {
  const root = path.resolve(__dirname, '..', 'src')
  const allowed = [path.join('modules', 'editor', 'adapters', 'gutenberg'), path.join('components', 'editor', 'gutenberg')]
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : /\.(tsx?|css)$/.test(entry.name) ? [path.join(dir, entry.name)] : [])
  const outside = walk(root).filter((file) => /@wordpress\//.test(fs.readFileSync(file, 'utf8')) && !allowed.some((dir) => path.relative(root, file).startsWith(dir)))
  assert.deepEqual(outside.map((file) => path.relative(root, file)), [])
  // The adapter that is tested here knows the shape of engine blocks and nothing of the engine's code.
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'modules/editor/adapters/gutenberg/convert.ts'), 'utf8'), /from '@wordpress/)
  // And the public page never loads the editor.
  for (const file of ['modules/site/server/pages/p/[slug]/page.tsx', 'modules/editor/server/documents.ts', 'app/layout.tsx']) assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), /adapters\/gutenberg|components\/editor\/gutenberg|@wordpress|@tiptap/, file)
})

test('text with any Persian letter reads from the right; only all-Latin text reads from the left', () => {
  for (const [value, dir] of [['سلام world', 'rtl'], ['Hello دنیا', 'rtl'], ['X1 (معرفی‌شده در فروشگاه): برنده کلی — ANC بهترین تعادل', 'rtl'], ['Wi-Fi 6 router', 'ltr'], ['۱۲۳ سلام', 'rtl'], ['123 hello', 'ltr'], ['  «نقل»', 'rtl'], ['(note)', 'ltr'], ['שלום', 'rtl'], ['Привет', 'ltr'], ['\u05beHello', 'ltr'], ['\u06d5Hello', 'rtl'], ['\u05b0Hello', 'ltr'], ['\u06d4\u06d5', 'rtl'], ['\u0600\u0660\u06f9!', null], ['', null], ['   ', null], ['123 ۴۵۶ !?', null], [null, null], [5, null]]) assert.equal(rich.textDirection(value), dir, JSON.stringify(value))
  // Each paragraph of one block reads in its own direction; an empty one says nothing and takes the page's, which is right to left.
  const mixed = richDoc(para(text('این فارسی است')), para(text('This one is English')), { type: 'paragraph' }, para(text('2024 - ')), { type: 'bulletList', content: [{ type: 'listItem', content: [para(text('first'))] }] })
  assert.equal(rich.richTextHtml(mixed), '<p dir="rtl">این فارسی است</p><p dir="ltr">This one is English</p><p></p><p>2024 - </p><ul dir="ltr"><li><p dir="ltr">first</p></li></ul>')
  // A direction the writer chose wins over the text; "auto" means the text decides.
  assert.equal(rich.richTextHtml(richDoc({ type: 'paragraph', attrs: { dir: 'ltr' }, content: [text('فارسی')] }, { type: 'paragraph', attrs: { dir: 'auto' }, content: [text('فارسی')] })), '<p dir="ltr">فارسی</p><p dir="rtl">فارسی</p>')
  // The block itself takes the page's direction unless one was chosen for it; a heading block reads by its own text.
  const html = (blocks) => r.documentHtml({ version: 1, blocks }, registry)
  assert.equal(html([block('content.richText', { content: richDoc(para(text('Hi'))) })]), '<div class="mcb mcb-content-richText"><p dir="ltr">Hi</p></div>')
  assert.match(html([block('content.richText', { dir: 'ltr', content: richDoc(para(text('سلام'))) })]), /^<div class="mcb mcb-content-richText" dir="ltr"><p dir="ltr">سلام<\/p><\/div>$/)
  assert.match(html([block('content.heading', { text: 'Release notes' })]), /<h2 class="mcb mcb-content-heading" dir="ltr">Release notes<\/h2>/)
  assert.match(html([block('content.heading', { text: '2024' })]), /<h2 class="mcb mcb-content-heading">2024<\/h2>/)
  // The editor shows what the page will show, from the same rule, and starts right to left.
  const field = fs.readFileSync(path.resolve(__dirname, '..', 'src/components/editor/gutenberg/RichTextField.tsx'), 'utf8')
  const src = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')
  assert.match(field, /BlockAttributes, TypedDirection\]/)
  // The older HTML editor follows the same rule, starts right to left, and its body field is not mistaken for an English one.
  const old = src('src/components/RichEditor.tsx')
  assert.match(old, /dir = 'rtl', minHeight/); assert.match(old, /\r?\n      TypedDirection,\r?\n/)
  const crud = src('src/app/admin/cms/AdminCrud.tsx').match(/dir=\{fl\.dir \|\| \((.+?) \? 'ltr' : 'rtl'\)\}/)[1]
  const isLtr = (key) => new Function('fl', `return ${crud}`)({ key })
  for (const [key, ltr] of [['content', false], ['excerpt', false], ['contentEn', true], ['titleEn', true], ['agenda', false]]) assert.equal(isLtr(key), ltr, key)
  assert.match(field, /class: 'mcb-content-richText mc-rich-input', dir: 'rtl'/)
  assert.match(fs.readFileSync(path.resolve(__dirname, '..', 'src/components/editor/gutenberg/blocks.tsx'), 'utf8'), /dir=\{textDirection\(attributes\.text\) \|\| 'rtl'\}/)
})

test('paragraph choice, block direction and automatic inference agree in renderer and editor decorations', () => {
  const { Schema } = require('@tiptap/pm/model'), { EditorState } = require('@tiptap/pm/state')
  const { TypedDirection } = load('src/components/editor/TypedDirection')
  const schema = new Schema({ nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'text*', attrs: { dir: { default: null } } }, text: {},
  } })
  let inherited = 'ltr'
  const [plugin] = TypedDirection.config.addProseMirrorPlugins.call({ options: { direction: () => inherited } })
  const nodes = [para(text('سلام')), { ...para(text('Hello')), attrs: { dir: 'rtl' } }, para(text('123')), { type: 'paragraph' }]
  const state = EditorState.create({ schema, doc: schema.nodeFromJSON(richDoc(...nodes)) })
  const dirs = () => plugin.props.decorations(state).find().map(d => d.type.attrs.dir)
  assert.deepEqual(dirs(), ['ltr', 'rtl', 'ltr', 'ltr'])
  assert.equal(rich.richTextHtml(richDoc(...nodes), inherited), '<p dir="ltr">سلام</p><p dir="rtl">Hello</p><p dir="ltr">123</p><p dir="ltr"></p>')
  inherited = 'auto'
  assert.deepEqual(dirs(), ['rtl', 'rtl'])
  assert.equal(rich.resolveTextDirection('auto', 'ltr', 'سلام'), 'ltr')
  assert.equal(rich.resolveTextDirection('rtl', 'ltr', 'Hello'), 'rtl')
  assert.equal(rich.resolveTextDirection(null, 'invalid', 'Hello'), 'ltr')
  const nested = richDoc({ type: 'blockquote', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [para(text('سلام'))] }] }] })
  assert.equal(rich.richTextHtml(nested, 'ltr'), '<blockquote dir="ltr"><ul dir="ltr"><li><p dir="ltr">سلام</p></li></ul></blockquote>')
  assert.equal(rich.richTextHtml(richDoc({ type: 'codeBlock', content: [text('سلام')] }), 'rtl'), '<pre dir="ltr" tabindex="0" role="region" aria-label="بلوک کد"><code class="language-plain">سلام</code></pre>')
})

test('stored HTML is given a direction per paragraph where it is shown, and a written direction is kept', () => {
  const stamp = rich.withTextDirections
  assert.equal(stamp('<p>سلام</p><p>Hello</p><p>123</p>'), '<p dir="rtl">سلام</p><p dir="ltr">Hello</p><p>123</p>')
  // A Persian sentence that opens with a model name is still Persian — the case the owner reported.
  assert.equal(stamp('<ol><li><strong>X1 (معرفی‌شده در فروشگاه):</strong> برنده کلی — ANC بهترین تعادل</li><li>USB-C only</li></ol>'), '<ol><li dir="rtl"><strong>X1 (معرفی‌شده در فروشگاه):</strong> برنده کلی — ANC بهترین تعادل</li><li dir="ltr">USB-C only</li></ol>')
  // Attributes stay, a direction the writer chose wins, headings and quotes are covered, markup is not read as text.
  assert.equal(stamp('<h2 class="t" style="color:#fff">Review: هدفون</h2><blockquote dir="ltr">نقل</blockquote><p><a href="/english">متن</a></p>'), '<h2 class="t" style="color:#fff" dir="rtl">Review: هدفون</h2><blockquote dir="ltr">نقل</blockquote><p dir="rtl"><a href="/english">متن</a></p>')
  assert.equal(stamp('<p DIR=rtl>Hello</p>'), '<p DIR=rtl>Hello</p>')
  // An entity or a tag name is not a letter of the text; an unclosed paragraph is still read.
  assert.equal(stamp('<p>&nbsp;&laquo;۱۲&raquo;</p><p>متن بدون پایان'), '<p>&nbsp;&laquo;۱۲&raquo;</p><p dir="rtl">متن بدون پایان')
  assert.deepEqual([stamp(''), stamp(null), stamp(undefined)], ['', '', ''])
  // It runs where prose is shown, not where it is saved.
  const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')
  for (const file of ['src/modules/site/server/pages/blog/[slug]/page.tsx', 'src/modules/site/server/pages/p/[slug]/page.tsx', 'src/app/games/[slug]/detail-view.tsx', 'src/app/software/[slug]/detail-view.tsx', 'src/app/music/album/[slug]/detail-view.tsx', 'src/app/music/artist/[slug]/page.tsx', 'src/components/ProductTabs.tsx']) assert.match(read(file), /__html: [^}]*withTextDirections\(/, file)
  assert.doesNotMatch(read('src/shared/content/sanitize.ts'), /withTextDirections/)
})

test('the classic editor: quick tags wrap the selection, refuse an address that runs, and the plugin can be switched off without touching content', () => {
  const classic = load('src/modules/editor/domain/classic')
  const none = () => ''
  // A pair around the selection, the selection kept selected inside it.
  assert.deepEqual(classic.applyQuicktag('سلام دنیا', 5, 9, 'b', none), { value: 'سلام <strong>دنیا</strong>', start: 13, end: 17 })
  // Nothing selected: an empty pair with the caret between the tags.
  assert.deepEqual(classic.applyQuicktag('', 0, 0, 'li', none), { value: '<li></li>', start: 4, end: 4 })
  assert.equal(classic.applyQuicktag('a', 0, 1, 'ul', none).value, '<ul>\na\n</ul>')
  // A reversed or out-of-range selection is put in order, never thrown on.
  assert.equal(classic.applyQuicktag('abc', 3, 1, 'i', none).value, 'a<em>bc</em>')
  assert.equal(classic.applyQuicktag('abc', -5, 99, 'code', none).value, '<code>abc</code>')
  // A link and a picture ask for an address; a bare host gets https, a path and an anchor stay.
  assert.equal(classic.applyQuicktag('متن', 0, 3, 'link', () => 'example.com/a').value, '<a href="https://example.com/a">متن</a>')
  assert.equal(classic.applyQuicktag('متن', 0, 3, 'link', () => '/blog/x').value, '<a href="/blog/x">متن</a>')
  assert.equal(classic.applyQuicktag('x', 1, 1, 'img', () => 'https://cdn.example/a.webp').value, 'x<img src="https://cdn.example/a.webp" alt="" />')
  assert.equal(classic.applyQuicktag('a"b<c', 0, 5, 'img', () => '/u/1.webp').value, '<img src="/u/1.webp" alt="abc" />', 'the selected words become the alt text, without quotes or brackets')
  // What runs, breaks out of the attribute or is not an address changes nothing.
  for (const bad of ['javascript:alert(1)', 'data:text/html,<script>', 'vbscript:x', 'x" onmouseover="y', 'a b', '<script>', '//evil.example', '', '   ']) {
    assert.equal(classic.quicktagUrl(bad), null, JSON.stringify(bad))
    assert.equal(classic.applyQuicktag('متن', 0, 3, 'link', () => bad), null, JSON.stringify(bad))
  }
  assert.deepEqual(['https://a.example', '/p', '#top', 'mailto:a@b.example', 'tel:+98'].map(classic.quicktagUrl), ['https://a.example', '/p', '#top', 'mailto:a@b.example', 'tel:+98'])
  assert.equal(classic.applyQuicktag('a', 0, 1, 'script', none), null, 'an unknown tag does nothing')
  // Every quick tag has an action, and the toolbars name only tools of the open-source edition.
  for (const tag of classic.QUICKTAGS) assert.notEqual(classic.applyQuicktag('x', 0, 1, tag.id, () => '/a'), null, tag.id)
  const FREE = new Set('blocks bold italic underline strikethrough forecolor backcolor alignright aligncenter alignleft alignjustify bullist numlist outdent indent blockquote link image table codesample charmap rtl ltr removeformat searchreplace fullscreen undo redo fontfamily fontsize lineheight emoticons'.split(' '))
  for (const [name, bar] of Object.entries(classic.CLASSIC_TOOLBARS)) for (const tool of bar.split(/[\s|]+/).filter(Boolean)) assert.ok(FREE.has(tool), name + ': ' + tool)
  assert.doesNotMatch(classic.CLASSIC_TOOLBARS.basic, /image|table|codesample/)

  const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n')
  // A plugin of its own, on by default, with nothing but a manifest: switching it off cannot lose data.
  const manifest = JSON.parse(read('src/plugins/classic-editor/manifest.json'))
  assert.deepEqual([manifest.id, manifest.kind, manifest.defaultEnabled, manifest.settings.map((entry) => entry.key + ':' + entry.public)], [classic.CLASSIC_EDITOR_PLUGIN, 'plugin', true, ['start-tab:true']])
  assert.deepEqual(fs.readdirSync(path.resolve(__dirname, '..', 'src/plugins/classic-editor')), ['manifest.json'])
  // One door for every staff form; off → the lighter editor, same value either way.
  const door = read('src/components/editor/ContentEditor.tsx')
  assert.match(door, /if \(!state\?\.enabled\) return <RichEditor \{\.\.\.props\} \/>/)
  for (const file of ['src/app/admin/cms/AdminCrud.tsx', 'src/app/admin/cms/MediaCrud.tsx', 'src/app/admin/games/[id]/page.tsx', 'src/app/admin/store/products/[id]/page.tsx', 'src/app/admin/software/releases/ReleasesManager.tsx', 'src/app/admin/newsletter/page.tsx']) {
    assert.match(read(file), /import\('@\/components\/editor\/ContentEditor'\)/, file)
    assert.doesNotMatch(read(file), /import\('@\/components\/RichEditor'\)/, file)
  }
  // The heavy editor is loaded on demand, from this site's own bundle, under the GPL key — never from a CDN, never on a public page.
  const editor = read('src/components/editor/classic/ClassicEditor.tsx')
  assert.match(door, /dynamic\(\(\) => import\('@\/components\/editor\/classic\/ClassicEditor'\), \{ ssr: false/)
  assert.match(editor, /licenseKey="gpl"/)
  assert.doesNotMatch(editor, /tinymceScriptSrc|cdn\.tiny\.cloud|apiKey=/)
  assert.match(editor, /invalid_elements: 'script,style,object,embed,applet,form,/)
  assert.match(editor, /images_upload_handler: [^\n]*uploadPicture\(/)
  const importers = []
  const walk = (dir) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (/\.tsx?$/.test(entry.name) && /from '(tinymce|@tinymce\/)|import 'tinymce\//.test(fs.readFileSync(full, 'utf8'))) importers.push(path.relative(path.resolve(__dirname, '..'), full).replace(/\\/g, '/')) } }
  walk(path.resolve(__dirname, '..', 'src'))
  assert.deepEqual(importers, ['src/components/editor/classic/ClassicEditor.tsx'])
  // Fields that are stored as cleaned HTML are written in the editor, not as raw tags.
  assert.match(read('src/app/admin/software/titles/page.tsx'), /key: 'changelog',[^\n]*type: 'richtext'/)
  assert.doesNotMatch(read('src/app/admin/software/titles/page.tsx'), /HTML مجاز/)
  // The server's cleaning keeps what the editor can make (tables with merged cells) and still drops what runs.
  // The sanitiser imports its library by default export, so it is compiled here with module interop on.
  const cleaning = { exports: {} }
  new Function('require', 'module', 'exports', ts.transpileModule(read('src/shared/content/sanitize.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText)((name) => (name.startsWith('@/') ? load('src/' + name.slice(2)) : require(name)), cleaning, cleaning.exports)
  const { cleanRichText } = cleaning.exports
  assert.equal(cleanRichText('<table><tbody><tr><td colspan="2" rowspan="3" onclick="x()">a</td></tr></tbody></table>'), '<table><tbody><tr><td colspan="2" rowspan="3">a</td></tr></tbody></table>')
  assert.equal(cleanRichText('<p style="color:#ff0000;position:fixed">x</p><script>alert(1)</script><img src="javascript:alert(1)" onerror="x()"><a href="javascript:alert(1)">y</a>'), '<p style="color:#ff0000">x</p><img /><a>y</a>')
})

test('the media library: a chosen picture becomes clean markup, the listing is the store\'s own files, and the editor speaks Persian', async () => {
  const classic = load('src/modules/editor/domain/classic')
  const pick = (extra) => classic.pictureHtml({ url: '/api/media/covers/a.webp', alt: '', caption: '', width: 0, align: 'none', ...extra })
  assert.equal(pick({}), '<img src="/api/media/covers/a.webp" alt="" loading="lazy" />')
  // Alternative text and caption are text, never markup.
  assert.equal(pick({ alt: 'گربه "سیاه" <b>', caption: 'نمای <i>نزدیک</i> & دور' }), '<figure><img src="/api/media/covers/a.webp" alt="گربه &quot;سیاه&quot; &lt;b&gt;" loading="lazy" /><figcaption>نمای &lt;i&gt;نزدیک&lt;/i&gt; &amp; دور</figcaption></figure>')
  // A smaller size asks the image route for that width; a width it does not serve, or a picture from elsewhere, stays whole.
  assert.equal(pick({ width: 640, align: 'center' }), '<p style="text-align: center"><img src="/api/media/covers/a.webp?w=640" alt="" width="640" loading="lazy" /></p>')
  assert.equal(pick({ width: 500 }), '<img src="/api/media/covers/a.webp" alt="" loading="lazy" />')
  assert.equal(classic.pictureHtml({ url: 'https://cdn.example/x.png', alt: 'x', caption: '', width: 640, align: 'left' }), '<p style="text-align: left"><img src="https://cdn.example/x.png" alt="x" loading="lazy" /></p>')
  assert.equal(pick({ align: 'justify' }), '<img src="/api/media/covers/a.webp" alt="" loading="lazy" />', 'an alignment that is not one of the three is ignored')
  for (const url of ['javascript:alert(1)', 'data:image/svg+xml,<svg onload=x>', '//evil.example/a.png', 'a" onerror="x', '']) assert.equal(classic.pictureHtml({ url, alt: '', caption: 'c', width: 0, align: 'none' }), '', JSON.stringify(url))
  // Everything it writes survives the server's cleaning unchanged, so what the writer saw is what is stored.
  const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n')
  const cleaning = { exports: {} }
  new Function('require', 'module', 'exports', ts.transpileModule(read('src/shared/content/sanitize.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText)((name) => (name.startsWith('@/') ? load('src/' + name.slice(2)) : require(name)), cleaning, cleaning.exports)
  for (const html of [pick({}), pick({ alt: 'متن', caption: 'زیرنویس', width: 960, align: 'right' }), pick({ width: 320, align: 'center' })]) assert.equal(cleaning.exports.cleanRichText(html).replace(/text-align:(\w)/, 'text-align: $1'), html)

  // The listing: only files the store wrote (its naming), newest first, paged; nothing from the resized cache or a stray file.
  const os = require('node:os'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ml-')), covers = path.join(dir, 'storage', 'covers')
  fs.mkdirSync(path.join(covers, '.cache'), { recursive: true })
  const name = (n) => ('0000000' + n).slice(-8) + '-0000-4000-8000-000000000000.webp'
  for (let i = 1; i <= 5; i += 1) { fs.writeFileSync(path.join(covers, name(i)), Buffer.alloc(i * 10)); const at = new Date(Date.UTC(2026, 0, i)); fs.utimesSync(path.join(covers, name(i)), at, at) }
  fs.writeFileSync(path.join(covers, '.cache', name(1).replace('.webp', '-320.webp')), 'x'); fs.writeFileSync(path.join(covers, 'notes.txt'), 'x'); fs.writeFileSync(path.join(covers, '../../../' + path.basename(dir) + '-outside.webp'), 'x')
  const store = { exports: {} }, cwd = process.cwd()
  new Function('require', 'module', 'exports', ts.transpileModule(read('src/modules/site/server/cover-store.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText)(require, store, store.exports)
  try {
    process.chdir(dir)
    const first = await store.exports.listCoverImages(1, 2)
    assert.deepEqual([first.total, first.pages, first.page, first.items.map((item) => item.name)], [5, 3, 1, [name(5), name(4)]])
    assert.deepEqual([first.items[0].url, first.items[0].bytes], ['/api/media/covers/' + name(5), 50])
    assert.deepEqual((await store.exports.listCoverImages(3, 2)).items.map((item) => item.name), [name(1)])
    assert.equal((await store.exports.listCoverImages(99, 2)).page, 3, 'a page past the end is the last page')
    assert.equal((await store.exports.listCoverImages(1, 5000)).items.length, 5, 'the page size is capped, not trusted')
    // A new upload is seen at once: the folder's own change time says the remembered list is old.
    fs.writeFileSync(path.join(covers, name(6)), 'new')
    assert.equal((await store.exports.listCoverImages(1, 2)).total, 6)
  } finally { process.chdir(cwd); fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(path.join(os.tmpdir(), path.basename(dir) + '-outside.webp'), { force: true }) }
  // Listing and uploading ask the same question of the caller; a member without a content permission gets neither.
  const route = { exports: {} }; let permitted = false, registered
  const mocked = {
    '@/modules/identity/server/access': { requirePerm: async () => permitted ? { id: 23 } : null },
    '@/modules/identity/rbac': { CONTENT_EDIT_PERMISSIONS: ['cms.posts'] },
    '@/modules/identity/domain/sections': { AUTHOR_PERMISSIONS: ['journal.author'] },
    '@/platform/http/response': { err: (error, status) => Response.json({ error }, { status }), ok: value => Response.json(value) },
    '@/modules/site/server/cover-store': { coverFormat: () => true, storeCoverImage: async () => '/api/media/covers/owned.webp', listCoverImages: async () => ({ items: [], total: 0 }) },
    '@/modules/media/server/library': { libraryActor: async () => ({ id: 23 }), currentLibraryUser: async actor => actor, registerLocalAsset: async (url, creator) => { registered = { url, creator }; return { id: 'owned', revision: 0 } } },
  }
  new Function('require', 'module', 'exports', ts.transpileModule(read('src/modules/site/server/http/admin/media/route.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(name => mocked[name] || (name.startsWith('@/') ? load('src/' + name.slice(2)) : require(name)), route, route.exports)
  const request = () => { const form = new FormData(); form.set('file', new Blob(['owned']), 'test.png'); const req = new Request('http://localhost:3000/api/admin/media', { method: 'POST', headers: { Origin: 'http://localhost:3000', Host: 'localhost:3000' }, body: form }); req.nextUrl = new URL(req.url); return req }
  assert.equal((await route.exports.GET(request())).status, 403)
  assert.equal((await route.exports.POST(request())).status, 403)
  permitted = true
  assert.equal((await route.exports.GET(request())).status, 200)
  const uploaded = await route.exports.POST(request())
  assert.equal(uploaded.status, 200)
  assert.deepEqual(await uploaded.json(), { url: '/api/media/covers/owned.webp', assetId: 'owned', revision: 0 })
  assert.deepEqual(registered, { url: '/api/media/covers/owned.webp', creator: 23 })
  // Persian interface: the language is registered from this repository's own file, never fetched; and every tool on the toolbars has a Persian name.
  const editor = read('src/components/editor/classic/ClassicEditor.tsx')
  assert.match(editor, /tinymce\.addI18n\('fa', TINYMCE_FA\)/)
  assert.match(editor, /language: fa \? 'fa' : undefined,\n    language_load: false,/)
  assert.match(editor, /file_picker_callback: [^\n]*setLibrary\(\{ done \}\)/)
  const fa = load('src/components/editor/classic/tinymce-fa').TINYMCE_FA
  for (const label of ['Bold', 'Italic', 'Underline', 'Strikethrough', 'Paragraph', 'Heading 2', 'Text color', 'Background color', 'Align left', 'Align center', 'Align right', 'Justify', 'Bullet list', 'Numbered list', 'Blockquote', 'Insert/edit link', 'Insert/edit image', 'Table', 'Special character', 'Left to right', 'Right to left', 'Clear formatting', 'Find and replace', 'Fullscreen', 'Undo', 'Redo', 'Save', 'Cancel']) assert.match(fa[label] || '', /[؀-ۿ]/, label)
})

test('an upload is accepted from the hosts this site answers on, whatever address the server was bound to', () => {
  const { originIsThisSite } = load('src/platform/http/origin-policy')
  // The browser's address, as the Host header says it — the server may be bound to 0.0.0.0 or an internal name.
  assert.equal(originIsThisSite('http://localhost:3000', 'localhost:3000', undefined), true)
  assert.equal(originIsThisSite('https://mobocom.example', 'app:3000', 'https://mobocom.example'), true, 'behind a proxy the configured public address counts')
  assert.equal(originIsThisSite('https://MOBOCOM.example', 'mobocom.example', undefined), true)
  // Another site, a look-alike host, a sandboxed frame and a malformed value are not this site.
  for (const origin of ['https://evil.example', 'http://localhost:3001', 'https://mobocom.example.evil.example', 'null', 'not a url']) assert.equal(originIsThisSite(origin, 'localhost:3000', 'https://mobocom.example'), false, origin)
  // No Origin is the middleware's question (cookies need one there), not this second look's.
  assert.equal(originIsThisSite(null, 'localhost:3000', undefined), true)
  const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')
  for (const file of ['src/modules/site/server/http/admin/media/route.ts', 'src/modules/marketplace/server/http/marketplace.ts']) { assert.match(read(file), /originIsThisSite\(req\.headers\.get\('origin'\), req\.headers\.get\('host'\) \|\| req\.nextUrl\.host\)/, file); assert.doesNotMatch(read(file), /!== req\.nextUrl\.origin/, file) }
})

test('fonts, sizes and emoji in the editor: one list, and the server keeps a font only when it is on it', () => {
  const fonts = load('src/shared/content/fonts')
  const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n')
  const cleaning = { exports: {} }
  new Function('require', 'module', 'exports', ts.transpileModule(read('src/shared/content/sanitize.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText)((name) => (name.startsWith('@/') ? load('src/' + name.slice(2)) : require(name)), cleaning, cleaning.exports)
  const clean = cleaning.exports.cleanRichText
  // Every font on the list has its face declared and its file in the repository, with its licence beside it.
  const sheet = read('src/app/editor-fonts.css'), licences = read('public/fonts/editor/LICENSES.md')
  assert.ok(fonts.CONTENT_FONTS.length >= 8)
  for (const font of fonts.CONTENT_FONTS.filter((entry) => entry.family.startsWith('Mobo'))) {
    const files = sheet.split('\n').filter((rule) => rule.includes("font-family: '" + font.family + "';")).map((rule) => /url\(\/fonts\/editor\/([\w.-]+)\)/.exec(rule)?.[1]).filter(Boolean)
    assert.ok(files.length >= 1, font.family)
    for (const file of files) assert.ok(fs.statSync(path.resolve(__dirname, '..', 'public/fonts/editor', file)).size > 10_000, file)
    assert.ok(licences.includes(font.en), font.en)
  }
  assert.match(licences, /SIL Open Font License, Version 1\.1/)
  assert.match(read('src/app/layout.tsx'), /import '\.\/editor-fonts\.css'/)
  // What the editor writes is kept exactly…
  const written = '<p><span style="font-family:' + fonts.fontStack(fonts.CONTENT_FONTS[2]) + ';font-size:24px;line-height:2">متن</span></p>'
  assert.equal(clean(written), written)
  assert.equal(fonts.isContentFontFamily("'MoboLalezar', HappVazirmatn, sans-serif"), true)
  // …and anything else in those properties is dropped: another font, a remote one, a size or height off the list, an expression.
  for (const bad of ['Comic Sans MS', 'Arial, sans-serif', 'sans-serif', "MoboEstedad, url(https://evil.example/f.woff2)", 'MoboEstedad;background:url(x)', 'expression(alert(1))', 'MoboEstedad, a, b, c, d']) assert.equal(fonts.isContentFontFamily(bad), false, bad)
  assert.equal(clean('<span style="font-family: Comic Sans MS; font-size: 999px; line-height: 77; position: fixed; color: #ff0000">x</span>'), '<span style="color:#ff0000">x</span>')
  assert.equal(clean('<span style="font-size:13px">x</span><span style="font-size:24PX">y</span><span style="font-size:1e9px">z</span>'), '<span>x</span><span>y</span><span>z</span>')
  // The editor offers the list, in the site's language, with emoji from its own bundle; the toolbars name the tools.
  const editor = read('src/components/editor/classic/ClassicEditor.tsx'), classic = load('src/modules/editor/domain/classic')
  assert.match(editor, /font_family_formats: CONTENT_FONTS\.map\(/)
  assert.match(editor, /font_size_formats: CONTENT_FONT_SIZES\.map\(/)
  assert.match(editor, /line_height_formats: CONTENT_LINE_HEIGHTS\.join\(' '\)/)
  assert.match(editor, /import 'tinymce\/plugins\/emoticons'\nimport 'tinymce\/plugins\/emoticons\/js\/emojis'/)
  assert.match(editor, /emoticons_database: 'emojis'/)
  for (const tool of ['fontfamily', 'fontsize', 'lineheight', 'emoticons']) assert.ok(classic.CLASSIC_TOOLBARS.full.split(/[\s|]+/).includes(tool), tool)
  assert.match(classic.CLASSIC_TOOLBARS.basic, /\bemoticons\b/)
})

test('legacy code is keyboard reachable without accepting authored tab order or handlers', () => {
  const cleaning = { exports: {} }
  const source = fs.readFileSync(path.resolve(__dirname, '../src/shared/content/sanitize.ts'), 'utf8')
  new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText)((name) => (name.startsWith('@/') ? load('src/' + name.slice(2)) : require(name)), cleaning, cleaning.exports)
  const html = cleaning.exports.cleanRichText('<pre tabindex="99" role="button" aria-label="wrong" onclick="evil()"><code>&lt;script&gt;literal&lt;/script&gt;</code></pre>')
  assert.equal(html, '<pre tabindex="0" role="region" aria-label="بلوک کد"><code>&lt;script&gt;literal&lt;/script&gt;</code></pre>')
})

const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n')

test('the body editor is a per-item choice: picker, classic stays in the form, blocks still redirect and a blocks item stays locked', () => {
  const crud = read('src/app/admin/cms/AdminCrud.tsx').replace(/\r\n/g, '\n')
  // The choice is offered wherever the block editor drives the form, for new and legacy items alike.
  assert.match(crud, /blockDriven && fl\.key === 'content' \?/)
  assert.match(crud, /cms-body-picker/)
  assert.match(crud, /role="radio" aria-checked=\{bodyEditor === 'classic'\}/, 'the classic option is a real choice, not a hidden escape')
  // A new item saved with the classic editor sends its body and stays in the form.
  assert.match(crud, /bodyEditor === 'classic' \? payload\.content : ''/)
  assert.doesNotMatch(crud, /blockDriven && !editId && data\?\.id\) \{ window\.location/, 'the redirect must ask the choice first')
  assert.match(crud, /blockDriven && !editId && bodyEditor === 'blocks' && data\?\.id/)
  // The checked choice and visible body agree immediately with the stored format, without a second click.
  assert.match(crud, /setEditFormat\(row\.editorFormat === 'blocks-v1' \? 'blocks-v1' : 'legacy'\)\n\s+setLegacyBody\(row\.editorFormat !== 'blocks-v1'\)\n\s+setBodyEditor\(row\.editorFormat === 'blocks-v1' \? 'blocks' : 'classic'\)/)
  // A block-written item keeps its guard and its lock message; the classic path never sends its body.
  assert.match(crud, /if \(blockDriven\) \{ if \(!editId\) payload\.content = bodyEditor === 'classic' \? payload\.content : ''; else if \(editFormat === 'blocks-v1' \|\| !legacyBody\) delete payload\.content \}/)
  assert.match(crud, /blocksLocked && fl\.key === 'content' && editId && editFormat === 'blocks-v1'/)
  // The choice resets for the next new item.
  assert.match(crud, /setEditFormat\('legacy'\)\n\s+setBodyEditor\('blocks'\)/)
  // The classic editor rendered in the form is the same ContentEditor door every staff form uses.
  assert.match(crud, /import\('@\/components\/editor\/ContentEditor'\)/)
})
