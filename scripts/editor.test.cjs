const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

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
const text = (value, marks) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) })
const para = (...content) => ({ type: 'paragraph', content })
const richDoc = (...content) => ({ type: 'doc', content })
let n = 0
const block = (type, props = {}, children) => ({ id: `blk_${String(++n).padStart(4, '0')}`, type, version: 1, props, ...(children ? { children } : {}) })
const document = (...blocks) => ({ version: 1, blocks })
const codes = (check) => check.issues.filter((issue) => issue.level === 'error').map((issue) => issue.code)

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
  assert.equal(html, '<h2 class="mcb-align-center" dir="rtl">عنوان</h2><p dir="rtl">متن <strong><em>پررنگ</em></strong> و English mixed 123 <a href="/blog/x">پیوند</a><br><code>کد</code></p><ul dir="rtl"><li><p dir="rtl">یک</p></li><li><p dir="rtl">دو</p><ol start="3" dir="rtl"><li><p dir="rtl">سه</p></li></ol></li></ul><ul class="mcb-tasks" dir="rtl"><li class="mcb-task is-done"><input type="checkbox" disabled checked><div><p dir="rtl">انجام شد</p></div></li></ul><blockquote dir="rtl"><p dir="rtl">نقل</p></blockquote><pre dir="ltr"><code class="language-bash">echo &quot;&lt;b&gt;&quot; &amp;&amp; ls</code></pre><hr>')
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
  assert.equal(out, '<p dir="ltr">&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;</p><p dir="ltr">x<a href="https://example.com/" target="_blank" rel="noopener noreferrer nofollow">y</a></p><p dir="ltr">p</p><p dir="ltr">c</p><h2 dir="ltr">h1</h2><pre dir="ltr"><code class="language-plain">code</code></pre>')
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
  assert.match(html, /<iframe src="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ" title="معرفی" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation"><\/iframe>/)
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

test('the editor domain depends on nothing but itself: no editing engine, no React, no database', () => {
  const dir = path.resolve(__dirname, '..', 'src/modules/editor/domain')
  for (const name of fs.readdirSync(dir)) {
    const source = fs.readFileSync(path.join(dir, name), 'utf8')
    for (const [, from] of source.matchAll(/from '([^']+)'/g)) assert.match(from, /^@\/modules\/editor\/domain\//, `${name} imports ${from}`)
    assert.doesNotMatch(source, /@wordpress|@tiptap|dangerouslySetInnerHTML|innerHTML/, name)
  }
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

test('text reads in the direction of its first letter: Persian from the right, English from the left', () => {
  for (const [value, dir] of [['سلام world', 'rtl'], ['Hello دنیا', 'ltr'], ['۱۲۳ سلام', 'rtl'], ['123 hello', 'ltr'], ['  «نقل»', 'rtl'], ['(note)', 'ltr'], ['שלום', 'rtl'], ['Привет', 'ltr'], ['\u05beHello', 'ltr'], ['\u06d5Hello', 'rtl'], ['\u05b0Hello', 'ltr'], ['\u06d4\u06d5', 'rtl'], ['\u0600\u0660\u06f9!', null], ['', null], ['   ', null], ['123 ۴۵۶ !?', null], [null, null], [5, null]]) assert.equal(rich.textDirection(value), dir, JSON.stringify(value))
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
  assert.match(old, /dir = 'rtl', minHeight/); assert.match(old, /\n      TypedDirection,\n/)
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
  assert.equal(rich.richTextHtml(richDoc({ type: 'codeBlock', content: [text('سلام')] }), 'rtl'), '<pre dir="ltr"><code class="language-plain">سلام</code></pre>')
})
