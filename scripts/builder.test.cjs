const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

function load(file, mocks = {}, cache = new Map()) {
  const absolute = path.resolve(__dirname, '..', file)
  if (cache.has(absolute)) return cache.get(absolute).exports
  const mod = { exports: {} }; cache.set(absolute, mod)
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const localRequire = name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.resolve(__dirname, '../src', name.slice(2)) : path.resolve(path.dirname(absolute), name)
      for (const suffix of ['.ts', '.tsx', '/index.ts']) if (fs.existsSync(base + suffix)) return load(path.relative(path.resolve(__dirname, '..'), base + suffix), mocks, cache)
    }
    return require(name)
  }
  new Function('require', 'module', 'exports', code)(localRequire, mod, mod.exports)
  return mod.exports
}

test('BBCode decorations are allowlisted, nested, code-safe, sanitized and idempotent', () => {
  const { renderBBCode, TEXT_DECORATIONS } = load('src/shared/content/bbcode.ts')
  const { cleanRichText } = load('src/shared/content/sanitize.ts')
  for (const decoration of TEXT_DECORATIONS) {
    const html = cleanRichText(decoration.code)
    assert.doesNotMatch(html, /\[(?:note|tip|warning|success|quote|highlight|spoiler|columns)\]/)
    assert.equal(cleanRichText(html), html)
  }
  assert.match(cleanRichText('[note][b]hello[/b][/note]'), /<strong>hello<\/strong>/)
  assert.match(cleanRichText('[spoiler]answer[/spoiler]'), /<details[^>]*><summary>نمایش جزئیات<\/summary>/)
  assert.equal(renderBBCode('<code>[note]literal[/note]</code>'), '<code>[note]literal[/note]</code>')
  assert.equal(renderBBCode('<a title="[b]literal[/b]">link</a>'), '<a title="[b]literal[/b]">link</a>')
  assert.equal(renderBBCode('[unknown]value[/unknown]'), '[unknown]value[/unknown]')
  assert.equal(renderBBCode('[note]unclosed'), '[note]unclosed')
  assert.doesNotMatch(cleanRichText('[note]<img src="x" onerror="alert(1)"><script>alert(1)</script>hello[/note]'), /onerror|<script/)
  assert.doesNotMatch(cleanRichText('[b]x[/b]<a href="javascript:alert(1)">bad</a>'), /href="javascript/)
  const hostile = '[note]'.repeat(1000) + 'x' + '[/note]'.repeat(1000)
  assert.ok(renderBBCode(hostile).length < hostile.length * 2)
})

const domain = () => load('src/modules/site/domain/builder.ts')
test('editorial shortcodes are bounded, escaped, idempotent and inert inside code examples',()=>{
  const media=load('src/shared/media/editorial.ts'),sanitize=load('src/shared/content/sanitize.ts')
  const input={kind:'audio',src:'/files/a.mp3?x=1&y=2',title:'صدای "من" <script>alert(1)</script>',caption:'توضیح & نمونه',audioKind:'podcast'}
  const short=media.mediaShortcode(input),html=sanitize.cleanRichText('<p>'+short+'</p>')
  assert.match(html,/data-mc-media="audio"/);assert.match(html,/data-mc-audio-kind="podcast"/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script|onerror=/)
  assert.equal(sanitize.cleanRichText(html),html,'stored media survives another save/render pass')
  const bracket=media.mediaShortcode({...input,title:'قسمت [۱] "آغاز"'})
  assert.match(media.mediaShortcodes(bracket),/data-mc-title="قسمت \[۱\] &quot;آغاز&quot;"/)
  assert.match(media.mediaShortcodes('<pre>'+short+'</pre>'),/\[audio /)
  assert.equal(media.editorialMedia({kind:'audio',src:'javascript:alert(1)'}),null)
  assert.equal(media.editorialMedia({kind:'video',src:'https://evil.invalid/index.html'}),null)
  assert.doesNotMatch(sanitize.cleanRichText('<audio src="javascript:alert(1)" onplay="evil()" autoplay></audio>'),/javascript:|onplay|autoplay/)
  const policy=load('src/platform/http/csp.ts').contentSecurityPolicy({path:'/p/sample',production:true,nonce:'abcdefghijklmnopqrstuv'})
  assert.match(policy,/https:\/\/www.namasha.com/);assert.match(policy,/https:\/\/tamasha.com/);assert.doesNotMatch(policy,/frame-src[^;]* https:\s/)
  const frames=policy.match(/frame-src ([^;]+)/)[1].split(' ')
  for(const origin of media.MEDIA_FRAME_ORIGINS)assert.ok(frames.includes(origin),origin)
  assert.ok(frames.every(origin=>["'self'",...media.MEDIA_FRAME_ORIGINS,'https://www.openstreetmap.org','https://translate.google.com'].includes(origin)),'no implicit arbitrary frame host')
})

function textDoc(widgets) {
  const d = domain(), section = d.createSection(1)
  section.columns[0].widgets = widgets.map(([type, props]) => ({ ...d.createWidget(type), props }))
  return { ...d.emptyDoc(), sections: [section] }
}

test('builder descriptions contain authored content, separated blocks and decoded entities, never script/style/configuration', () => {
  const { builderContentText } = load('src/modules/site/domain/builder-content.ts')
  const doc = textDoc([['hero', {title:'خدمت &amp; راهنما', text:'معرفی واقعی', href:'https://secret.invalid', css:'CSS_SECRET', js:'JS_SECRET'}], ['text', {html:'<p>بخش اول</p><p>بخش دوم</p><script>SCRIPT_SECRET</script><style>STYLE_SECRET</style>'}]])
  assert.equal(builderContentText(doc,'fa'),'خدمت & راهنما معرفی واقعی بخش اول بخش دوم')
  assert.doesNotMatch(builderContentText(doc,'fa'),/SECRET|secret.invalid/)
  const code={...domain().emptyDoc(),mode:'code',code:{html:'<h1>صفحهٔ کد</h1><p>متن عمومی</p><script>PRIVATE_SCRIPT</script>',css:'PRIVATE_CSS',js:'PRIVATE_JS',advanced:true}}
  assert.equal(builderContentText(code,'fa'),'صفحهٔ کد متن عمومی')
})

test('builder text follows the same widget module owners as rendering and bounds recursive saved templates', () => {
  const { builderContentText, builderWidgetModule } = load('src/modules/site/domain/builder-content.ts')
  const child=textDoc([['text',{html:'<p>قالب عمومی</p>'}],['template',{templateId:'cycle'}]])
  const doc=textDoc([['products',{title:'فروشگاه خاموش'}],['media',{title:'سینمای خاموش',source:'cinema-new'}],['heading',{text:'Visible',textEn:'English'}],['template',{templateId:'cycle'}]])
  const text=builderContentText(doc,'fa',new Map([['cycle',child]]),{store:false,cinema:false})
  assert.doesNotMatch(text,/خاموش/);assert.match(text,/Visible/);assert.equal((text.match(/قالب عمومی/g)||[]).length,3)
  assert.equal(builderWidgetModule(domain().createWidget('products')),'store')
  assert.match(builderContentText(doc,'en',new Map(),{store:false,cinema:false}),/English/)
})

test('page descriptions use live builder and canonical body, preserve template order and fall back to this page title', async () => {
  let doc=textDoc([['hero',{title:'شرح طراحی',text:'متن صفحه‌ساز'}]]),blocks=null
  const { pageDescription } = load('src/modules/site/server/page-description.ts', {
    '@/modules/editor/server/documents':{pageBlocksHtml:()=>blocks},
    '@/modules/site/server/builder-preview':{resolveBuilderDoc:async(preview)=>{assert.equal(preview,undefined);return doc}},
    '@/modules/site/server/builder':{listUserTemplates:async()=>[]},
    '@/extensions/server/modules':{getModuleStates:async()=>({})},
  })
  const page={id:1,title:'عنوان همین صفحه',titleEn:'Page title',content:'<p>متن قدیمی</p>',contentEn:'',editorFormat:'legacy',contentDocument:''}
  assert.equal(await pageDescription(page,'fa','none'),'شرح طراحی متن صفحه‌ساز متن قدیمی')
  assert.equal(await pageDescription(page,'fa','about'),'متن قدیمی شرح طراحی متن صفحه‌ساز')
  doc=null;blocks='<p>بدنهٔ زندهٔ بلوکی &amp; درست</p>'
  assert.equal(await pageDescription({...page,content:'STALE_CACHE'},'fa','none'),'بدنهٔ زندهٔ بلوکی & درست')
  blocks=null;assert.equal(await pageDescription({...page,content:''},'fa','none'),'عنوان همین صفحه')
  doc=textDoc([['text',{html:'الف'.repeat(500)}]])
  assert.equal((await pageDescription({...page,content:''},'fa','none')).length,160)
})

test('builder documents fill defaults for new section and widget style fields (old documents stay valid)', () => {
  const { validateBuilderDoc } = domain()
  const legacy = {
    v: 2, mode: 'builder', code: { html: '', css: '', js: '', advanced: false },
    sections: [{ id: 's1', anchor: '', style: { bg: '', bgImage: '', paddingY: 40, tone: 'none' }, columns: [{ id: 'c1', width: 100, widgets: [{ id: 'w1', type: 'heading', props: { text: 'Hi', level: 'h2' }, style: { align: 'center' } }] }] }],
  }
  const doc = validateBuilderDoc(legacy)
  assert.deepEqual({ width: doc.sections[0].style.width, valign: doc.sections[0].style.valign, hideOn: doc.sections[0].style.hideOn }, { width: 'boxed', valign: 'start', hideOn: 'none' })
  assert.equal(doc.sections[0].columns[0].widgets[0].style.hideOn, 'none')
  assert.equal(doc.sections[0].columns[0].widgets[0].style.align, 'center')
  const custom = validateBuilderDoc({ ...legacy, sections: [{ ...legacy.sections[0], style: { width: 'full', valign: 'center', hideOn: 'mobile' } }] })
  assert.equal(custom.sections[0].style.width, 'full')
  assert.equal(custom.sections[0].style.valign, 'center')
  assert.equal(custom.sections[0].style.hideOn, 'mobile')
  const junk = validateBuilderDoc({ ...legacy, sections: [{ ...legacy.sections[0], style: { width: 'huge', valign: 'x', hideOn: 'always' } }] })
  assert.deepEqual([junk.sections[0].style.width, junk.sections[0].style.valign, junk.sections[0].style.hideOn], ['boxed', 'start', 'none'])
})

test('builder documents reject unsafe links, duplicate ids and oversized structures', () => {
  const { validateBuilderDoc, createSection, createWidget, emptyDoc } = domain()
  const doc = emptyDoc()
  const section = createSection(2)
  const button = createWidget('button')
  button.props.href = 'javascript:alert(1)'
  section.columns[0].widgets.push(button)
  assert.throws(() => validateBuilderDoc({ ...doc, sections: [section] }), /Invalid URL/)
  button.props.href = '/plans'
  assert.equal(validateBuilderDoc({ ...doc, sections: [section] }).sections[0].columns[0].widgets[0].props.href, '/plans')
  const dup = createSection(1)
  dup.id = section.id
  assert.throws(() => validateBuilderDoc({ ...doc, sections: [section, dup] }), /Invalid element ID/)
  assert.throws(() => validateBuilderDoc({ ...doc, sections: Array.from({ length: 41 }, () => createSection(1)) }), /Too many sections/)
  assert.throws(() => validateBuilderDoc({ v: 1, sections: [] }), /Invalid builder document/)
})

test('video links become embeddable player URLs', () => {
  const { toEmbedUrl } = domain()
  assert.equal(toEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
  assert.equal(toEmbedUrl('https://youtu.be/dQw4w9WgXcQ?t=3'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
  assert.equal(toEmbedUrl('https://www.youtube.com/shorts/abcdefghijk'), 'https://www.youtube-nocookie.com/embed/abcdefghijk')
  assert.equal(toEmbedUrl('https://www.aparat.com/v/abc12'), 'https://www.aparat.com/video/video/embed/videohash/abc12/vt/frame')
  assert.equal(toEmbedUrl('https://vimeo.com/123456'), 'https://player.vimeo.com/video/123456')
  assert.equal(toEmbedUrl('https://example.org/player'), 'https://example.org/player')
  assert.equal(toEmbedUrl('not a url'), 'not a url')
})

test('legacy v1 page blocks migrate to v2 sections', () => {
  const { parseBuilderDoc } = domain()
  const doc = parseBuilderDoc([{ id: 'intro', kind: 'hero', title: 'سلام', titleEn: 'Hello', text: 'متن', textEn: 'Text', image: '/cover.webp', link: '/plans', linkLabel: 'خرید', linkLabelEn: 'Buy', items: '', tone: 'accent' }])
  assert.equal(doc.v, 2)
  assert.equal(doc.sections.length, 1)
  assert.equal(doc.sections[0].style.tone, 'accent')
  assert.equal(doc.sections[0].columns[0].widgets[0].type, 'hero')
  assert.equal(doc.sections[0].columns[0].widgets[0].props.href, '/plans')
})

test('post templates always contain the article slot and bundled templates are valid documents', () => {
  const { POST_TEMPLATES, BUNDLED_TEMPLATES } = load('src/modules/site/domain/builder-templates.ts')
  const { docHasContentSlot, validateBuilderDoc, ensureContentSlot, emptyDoc } = domain()
  for (const template of POST_TEMPLATES) assert.ok(docHasContentSlot(template.doc), template.id)
  for (const template of [...BUNDLED_TEMPLATES, ...POST_TEMPLATES]) {
    assert.doesNotThrow(() => validateBuilderDoc(JSON.parse(JSON.stringify(template.doc))), template.id)
    const links = JSON.stringify(template.doc).match(/"(?:secondaryH|h)ref":"(\/[^"]*)"/g) || []
    for (const link of links) assert.doesNotMatch(link, /\/(pricing|download)"/, `${template.id} links to a route that does not exist`)
  }
  assert.ok(docHasContentSlot(ensureContentSlot(emptyDoc())))
})

test('editor state helpers move, nudge and insert without losing blocks', () => {
  const state = load('src/app/admin/builder/state.ts')
  const { emptyDoc } = domain()
  let doc = emptyDoc()
  const a = state.addSection(doc, 2); doc = a.doc
  const b = state.addSection(doc, 1); doc = b.doc
  const sectionA = doc.sections[0], sectionB = doc.sections[1]
  let r = state.addWidget(doc, sectionA.id, sectionA.columns[0].id, 'heading'); doc = r.doc
  const first = r.sel.widgetId
  r = state.addWidget(doc, sectionA.id, sectionA.columns[0].id, 'text'); doc = r.doc
  const second = r.sel.widgetId
  doc = state.nudgeWidget(doc, { sectionId: sectionA.id, columnId: sectionA.columns[0].id, widgetId: second }, -1)
  assert.deepEqual(doc.sections[0].columns[0].widgets.map(w => w.id), [second, first])
  const moved = state.moveWidget(doc, state.locateWidget(doc, first), { sectionId: sectionB.id, columnId: sectionB.columns[0].id, index: 0 })
  doc = moved.doc
  assert.equal(doc.sections[1].columns[0].widgets[0].id, first)
  assert.equal(doc.sections[0].columns[0].widgets.length, 1)
  doc = state.nudgeSection(doc, sectionB.id, -1)
  assert.equal(doc.sections[0].id, sectionB.id)
  const inserted = state.insertSectionNear(doc, 3, sectionB.id, true)
  assert.equal(inserted.doc.sections[1].columns.length, 3)
  assert.equal(inserted.doc.sections[1].id, inserted.sel.sectionId)
  const appended = state.insertSectionNear(doc, 1, null, true)
  assert.equal(appended.doc.sections[appended.doc.sections.length - 1].id, appended.sel.sectionId)
  const eq = state.equalizeColumns(state.patchColumn(doc, sectionA.id, sectionA.columns[0].id, { width: 80 }), sectionA.id)
  assert.deepEqual(eq.sections.find(s => s.id === sectionA.id).columns.map(c => c.width), [50, 50])
})

test('advanced code needs the script permission only when it is added or changed', async () => {
  let stored = null
  const server = load('src/modules/site/server/builder.ts', {
    '@/platform/database/prisma': { db: { setting: { findUnique: async () => stored } } },
    '@/shared/content/sanitize': { cleanRichText: v => v, cleanWidgetHtml: v => v, sanitizeWidgetCss: v => v },
  })
  const { emptyDoc, createSection, createWidget } = domain()
  const doc = emptyDoc()
  const section = createSection(1)
  const code = createWidget('html')
  code.props = { ...code.props, html: '<div id="x"></div>', js: 'console.log(1)', advanced: '1' }
  section.columns[0].widgets.push(code)
  const withCode = { ...doc, sections: [section] }
  assert.equal(server.docUsesScripts(doc), false)
  assert.equal(server.docUsesScripts(withCode), true)
  assert.equal(await server.introducesScripts('home', withCode), true)
  stored = { value: JSON.stringify(withCode) }
  assert.equal(await server.introducesScripts('home', withCode), false)
  const edited = JSON.parse(JSON.stringify(withCode))
  edited.sections[0].columns[0].widgets[0].props.js = 'alert(1)'
  assert.equal(await server.introducesScripts('home', edited), true)
  assert.equal(server.permFor('home'), 'settings.manage')
  assert.equal(server.permFor('post-3'), 'cms.posts')
  assert.equal(server.permFor('product-3'), 'cms.products')
  assert.equal(server.permFor('12'), 'cms.pages')
})

test('theme templates pick the most specific published template for a context', () => {
  const { pickTemplate, validateTemplateMeta } = load('src/modules/site/domain/theme-templates.ts')
  const make = (id, conditions, extra = {}) => ({ ...validateTemplateMeta({ id, name: id, status: 'published', conditions }), ...extra })
  const all = make('tpl-header-aaaa1', [{ mode: 'include', target: 'all' }])
  const posts = make('tpl-header-bbbb2', [{ mode: 'include', target: 'posts' }])
  const gaming = make('tpl-header-cccc3', [{ mode: 'include', target: 'post-category:7' }, { mode: 'exclude', target: 'post-category:9' }])
  const draft = make('tpl-header-dddd4', [{ mode: 'include', target: 'section:gaming' }], { status: 'draft' })
  const list = [all, posts, gaming, draft]
  assert.equal(pickTemplate(list, 'header', { route: 'home' }).id, all.id)
  assert.equal(pickTemplate(list, 'header', { route: 'post', postCategoryIds: [3] }).id, posts.id)
  assert.equal(pickTemplate(list, 'header', { route: 'post', postCategoryIds: [7] }).id, gaming.id)
  // excluded category falls back to the next best
  assert.equal(pickTemplate(list, 'header', { route: 'post', postCategoryIds: [7, 9] }).id, posts.id)
  // drafts never apply
  assert.equal(pickTemplate(list, 'header', { route: 'section', sectionSlug: 'gaming' }).id, all.id)
  assert.equal(pickTemplate(list, 'footer', { route: 'home' }), null)
  const high = { ...make('tpl-header-eeee5', [{ mode: 'include', target: 'all' }]), priority: 5 }
  assert.equal(pickTemplate([all, high], 'header', { route: 'home' }).id, high.id)
})

test('theme template rules and placements are validated per type', () => {
  const { validateTemplateMeta, validatePlacement, placementConflict, templateTypeOf, newTemplateId } = load('src/modules/site/domain/theme-templates.ts')
  assert.throws(() => validateTemplateMeta({ id: 'tpl-post-abcd1', name: 'x', conditions: [{ mode: 'include', target: 'home' }] }), /Invalid display rule/)
  assert.throws(() => validateTemplateMeta({ id: 'tpl-product-abcd1', name: 'x', conditions: [{ mode: 'include', target: 'post-category:1' }] }), /Invalid display rule/)
  assert.equal(validateTemplateMeta({ id: 'tpl-product-abcd1', name: 'x', conditions: [{ mode: 'include', target: 'product-kind:PHYSICAL' }] }).conditions.length, 1)
  assert.throws(() => validateTemplateMeta({ id: 'tpl-evil-abcd1', name: 'x' }), /Invalid template id/)
  assert.throws(() => validateTemplateMeta({ id: 'tpl-page-abcd1', name: '' }), /name/)
  assert.throws(() => validatePlacement({ kind: 'section', slug: 'admin' }), /reserved/)
  assert.throws(() => validatePlacement({ kind: 'section', slug: 'Bad Slug' }), /Section URL/)
  assert.deepEqual(validatePlacement({ kind: 'section', slug: 'gaming', postCategoryId: '4' }), { kind: 'section', slug: 'gaming', postCategoryId: 4, productCategoryId: null })
  const a = validateTemplateMeta({ id: 'tpl-page-aaaa1', name: 'a', status: 'published', placement: { kind: 'section', slug: 'podcast' } })
  const b = validateTemplateMeta({ id: 'tpl-page-bbbb2', name: 'b', status: 'published', placement: { kind: 'section', slug: 'podcast' } })
  for (const slug of ['admin', 'products', 'compare', 'movies']) assert.throws(() => validatePlacement({ kind: 'section', slug }), /reserved/)
  // Built-in sections may get a designed landing page instead of the default one.
  for (const slug of ['music', 'cinema', 'games', 'software', 'forum', 'vip']) assert.equal(validatePlacement({ kind: 'section', slug }).slug, slug)
  assert.equal(placementConflict([a], b).id, a.id)
  assert.equal(placementConflict([a], { ...b, placement: { ...b.placement, slug: 'radio' } }), null)
  for (const type of ['header', 'footer', 'page', 'single-post', 'single-product']) assert.equal(templateTypeOf(newTemplateId(type)), type)
})

test('page layout accepts header/footer template ids and rejects anything else', () => {
  const { validateBuilderDoc, emptyDoc } = domain()
  const doc = validateBuilderDoc({ ...emptyDoc(), layout: { header: 'tpl-header-abcd12', footer: 'none' } })
  assert.deepEqual(doc.layout, { header: 'tpl-header-abcd12', footer: 'none' })
  assert.deepEqual(validateBuilderDoc({ ...emptyDoc(), layout: { header: 'tpl-footer-abcd12', footer: '<script>' } }).layout, { header: 'default', footer: 'default' })
})

test('product templates always contain product parts', () => {
  const { PRODUCT_TEMPLATES, THEME_PRESETS } = load('src/modules/site/domain/builder-templates.ts')
  const { PRODUCT_SLOT_TYPES, docHasSlotWidget, ensureProductSlots, emptyDoc, validateBuilderDoc } = domain()
  for (const template of PRODUCT_TEMPLATES) assert.ok(PRODUCT_SLOT_TYPES.some(type => docHasSlotWidget(template.doc, type)), template.id)
  assert.ok(docHasSlotWidget(ensureProductSlots(emptyDoc()), 'product-hero'))
  for (const list of Object.values(THEME_PRESETS)) for (const preset of list) assert.doesNotThrow(() => validateBuilderDoc(JSON.parse(JSON.stringify(preset.doc))), preset.id)
})

test('feature modules hide links into their public paths only while disabled', () => {
  const { pathDisabled, assertUniqueExtensionIds } = load('src/platform/extensions/contracts.ts')
  const runtime = { journal: { enabled: false, settings: {}, paths: ['/blog'] }, vpn: { enabled: true, settings: {}, paths: ['/plans'] }, banner: { enabled: false, settings: {} } }
  assert.equal(pathDisabled('/blog', runtime), true)
  assert.equal(pathDisabled('/blog/some-post?x=1', runtime), true)
  assert.equal(pathDisabled('/blogger', runtime), false)
  assert.equal(pathDisabled('/plans', runtime), false)
  assert.equal(pathDisabled('/', runtime), false)
  const base = { name: 'x', version: '1.0.0', apiVersion: 1 }
  assert.throws(() => assertUniqueExtensionIds([{ ...base, id: 'a', kind: 'module', requires: ['missing'] }]), /missing module/)
  assert.throws(() => assertUniqueExtensionIds([{ ...base, id: 'p', kind: 'plugin', publicPaths: ['/x'] }]), /Only feature modules/)
  assert.doesNotThrow(() => assertUniqueExtensionIds([{ ...base, id: 'a', kind: 'module', publicPaths: ['/a'] }, { ...base, id: 'b', kind: 'module', requires: ['a'] }]))
})

test('bundled module manifests are valid', () => {
  const { assertUniqueExtensionIds } = load('src/platform/extensions/contracts.ts')
  const dir = path.resolve(__dirname, '../src/plugins')
  const manifests = fs.readdirSync(dir).filter(name => fs.existsSync(path.join(dir, name, 'manifest.json'))).map(name => JSON.parse(fs.readFileSync(path.join(dir, name, 'manifest.json'), 'utf8')))
  assert.doesNotThrow(() => assertUniqueExtensionIds(manifests))
  for (const id of ['vpn', 'store', 'journal', 'page-builder', 'membership', 'music', 'cinema', 'games']) assert.equal(manifests.find(m => m.id === id)?.kind, 'module', id)
})

test('VIP membership rules: access, stacking periods, member prices and teasers', () => {
  const { canAccess, normalizeAccess, extendMembership, daysLeft, memberPrice, parsePerks, teaserHtml } = load('src/modules/membership/domain/membership.ts')
  assert.equal(canAccess('PUBLIC', false), true)
  assert.equal(canAccess('MEMBERS', false), false)
  assert.equal(canAccess('MEMBERS', true), true)
  assert.equal(normalizeAccess('members'), 'PUBLIC')
  const now = new Date('2026-01-01T00:00:00Z')
  const fresh = extendMembership(null, 30, now)
  assert.equal(fresh.startsAt.toISOString(), now.toISOString())
  assert.equal(daysLeft(fresh.endsAt, now), 30)
  const stacked = extendMembership(fresh.endsAt, 10, now)
  assert.equal(stacked.startsAt.toISOString(), fresh.endsAt.toISOString())
  assert.equal(daysLeft(stacked.endsAt, now), 40)
  const expired = extendMembership(new Date('2025-01-01T00:00:00Z'), 5, now)
  assert.equal(expired.startsAt.toISOString(), now.toISOString())
  assert.deepEqual(memberPrice(1000n, 800n, true), { amountMinor: 800n, memberDiscount: true })
  assert.deepEqual(memberPrice(1000n, 800n, false), { amountMinor: 1000n, memberDiscount: false })
  assert.deepEqual(memberPrice(1000n, 1200n, true), { amountMinor: 1000n, memberDiscount: false })
  assert.deepEqual(memberPrice(1000n, 0n, true), { amountMinor: 1000n, memberDiscount: false })
  assert.deepEqual(parsePerks('[{"icon":"🎬","fa":"فیلم","en":"Films"},{"fa":""},"x"]'), [{ icon: '🎬', fa: 'فیلم', en: 'Films' }])
  assert.equal(teaserHtml('<p>a</p><p>b</p><p>secret</p>'), '<p>a</p><p>b</p>')
  assert.ok(!teaserHtml('<div>' + 'x'.repeat(2000) + '</div>').includes('</div>'))
})

test('media links, trailers, requirements and scores are validated', () => {
  const { cleanLinks, groupLinks, trailerSource, cleanRequirements, scoreBand, slugOf, joinList, formatDuration, formatRuntime } = load('src/modules/media/domain/media.ts')
  assert.throws(() => cleanLinks([{ url: 'javascript:alert(1)' }]), /http/)
  assert.throws(() => cleanLinks([{ url: 'not a url' }]), /Invalid link/)
  const links = cleanLinks([{ url: 'https://dl.example.com/a.mkv', quality: '1080p', audio: 'DUBBED', access: 'MEMBERS', kind: 'weird' }, { url: '' }, { url: 'https://dl.example.com/b.mkv', audio: 'ORIGINAL' }])
  assert.equal(links.length, 2)
  assert.equal(links[0].kind, 'DOWNLOAD')
  assert.equal(links[0].access, 'MEMBERS')
  assert.deepEqual(groupLinks(links).map(g => g.audio), ['DUBBED', 'ORIGINAL'])
  const media = load('src/modules/media/domain/media.ts'), withTracks = cleanLinks([{ url: 'https://dl.example.com/a.mkv', audio: 'DUBBED' }, { url: 'https://dl.example.com/en.srt', kind: 'SUBTITLE', language: 'en', audio: 'DUBBED' }, { url: 'https://dl.example.com/fa.srt', kind: 'SUBTITLE', language: 'fa' }, { url: 'https://dl.example.com/fa.mka', kind: 'AUDIO', language: 'xx' }])
  assert.deepEqual([groupLinks(withTracks).map(g => g.items.length), media.trackLinks(withTracks).subtitles.map(l => l.language), media.trackLinks(withTracks).audio.map(l => [l.language, l.audio]), media.playbackKind('https://dl.example.com/x.mp4', 'SUBTITLE')], [[1], ['fa', 'en'], [['', '']], 'none'])
  const { toEmbedUrl } = domain()
  assert.deepEqual(trailerSource('https://youtu.be/dQw4w9WgXcQ', toEmbedUrl), { embed: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' })
  assert.deepEqual(trailerSource('https://cdn.example.com/t.mp4', toEmbedUrl), { src: 'https://cdn.example.com/t.mp4' })
  assert.deepEqual(trailerSource('javascript:alert(1)', toEmbedUrl), {})
  assert.deepEqual(cleanRequirements({ min: { cpu: ' i5 ', evil: 'x' }, rec: 'nope' }), { min: { cpu: 'i5' }, rec: {} })
  assert.equal(scoreBand(90), 'great')
  assert.equal(scoreBand(null), 'none')
  assert.equal(slugOf('The Last of Us II'), 'the-last-of-us-ii')
  assert.throws(() => slugOf('فیلم'), /Slug/)
  assert.equal(joinList('Drama, Crime ،جنایی'), 'Drama, Crime, جنایی')
  assert.equal(formatDuration(185), '3:05')
  assert.equal(formatRuntime(130, false), '2h 10m')
})

test('builder media and VIP widgets validate their props', () => {
  const { validateBuilderDoc, createWidget } = domain()
  const media = createWidget('media')
  assert.equal(media.props.source, 'music-new')
  const doc = (widget) => ({ v: 2, mode: 'builder', code: { html: '', css: '', js: '', advanced: false }, sections: [{ id: 's1', anchor: '', style: {}, columns: [{ id: 'c1', width: 100, widgets: [widget] }] }] })
  const ok = validateBuilderDoc(doc({ ...media, props: { source: 'cinema-top', limit: '8', title: 'Top' } }))
  assert.equal(ok.sections[0].columns[0].widgets[0].props.source, 'cinema-top')
  const junk = validateBuilderDoc(doc({ ...media, props: { source: 'db-dump', limit: '999' } }))
  assert.equal(junk.sections[0].columns[0].widgets[0].props.source, 'music-new')
  assert.doesNotThrow(() => validateBuilderDoc(doc(createWidget('vip-cta'))))
})

test('advanced style: only bounded values are stored, and the CSS written from them holds nothing a writer typed', () => {
  const fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api')
  const compile = (file, deps = {}) => { const mod = { exports: {} }; new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)((name) => deps[name] || require(name), mod, mod.exports); return mod.exports }
  const style = compile('src/modules/site/domain/builder-style.ts', { './builder-kit': compile('src/modules/site/domain/builder-kit.ts') })
  // Nothing set stores nothing; defaults are dropped so a document stays small.
  for (const empty of [undefined, null, {}, [], 'x', { margin: { t: 0, r: 0, b: 0, l: 0 }, opacity: 100, fontSize: 0, zIndex: 0 }]) assert.equal(style.validateAdvancedStyle(empty), undefined)
  // Numbers are clamped, choices must be on the list, colours must be hex, unknown keys go.
  assert.deepEqual(style.validateAdvancedStyle({ margin: { t: -9999, r: '12', b: 'x', l: 4.6 }, padding: { t: -5, r: 500 }, fontSize: 9000, fontWeight: '700', lineHeight: 10, bg: 'red', borderWidth: 99, borderStyle: 'groove', borderColor: 'url(x)', shadow: 'huge', hover: 'lift', motion: 'spin', opacity: -4, zIndex: 9999, evil: '</style><script>', classes: ['ok-one', 'br-section', '9bad', 'x y', 'ok_two', '"><script>'] }),
    { margin: { t: -300, r: 12, b: 0, l: 5 }, padding: { t: 0, r: 400, b: 0, l: 0 }, fontSize: 200, fontWeight: 700, lineHeight: 80, borderWidth: 20, borderStyle: 'solid', borderColor: '#888888', hover: 'lift', opacity: 0, zIndex: 100, classes: ['ok-one', 'ok_two'] })
  // A gradient needs both colours; the angle has a default.
  assert.deepEqual(style.validateAdvancedStyle({ bg: '#FF0000', bg2: '#0000ff' }), { bg: '#ff0000', bg2: '#0000ff', bgAngle: 135 })
  assert.deepEqual(style.validateAdvancedStyle({ bg2: '#0000ff', bgAngle: 90 }), undefined, 'a second colour without the first is nothing')
  // The CSS: logical sides, phone rules under 768px, hover only for a hovering pointer, motion only where allowed and supported.
  const css = style.advancedCss('w_abc-1', style.validateAdvancedStyle({ margin: { t: 10, r: 20, b: 30, l: 40 }, paddingM: { t: 8, r: 8, b: 8, l: 8 }, fontSize: 40, fontSizeM: 24, bg: '#101010', bg2: '#303030', bgAngle: 90, borderWidth: 2, borderStyle: 'dashed', borderColor: '#ff00ff', radius: { t: 16, r: 0, b: 16, l: 0 }, shadow: 'lg', opacity: 80, hover: 'lift', motion: 'up', alignM: 'center', maxWidth: 600 }))
  assert.match(css, /\.br-x-w_abc-1 \{ margin-block: 10px 30px; margin-inline: 20px 40px; background: linear-gradient\(90deg, #101010, #303030\); border: 2px dashed #ff00ff; border-start-start-radius: 16px;/)
  assert.match(css, /opacity: 0\.8; max-width: 600px; margin-inline: auto; \}/)
  assert.match(css, /\.br-x-w_abc-1, \.br-x-w_abc-1 :is\(h1, h2, h3, h4, h5, h6, p, li, blockquote\) \{ font-size: 40px; \}/)
  assert.match(css, /@media \(max-width: 767px\) \{ \.br-x-w_abc-1 \{ padding-block: 8px 8px; padding-inline: 8px 8px; text-align: center; \} \.br-x-w_abc-1, [^{]* \{ font-size: 24px; \} \}/)
  assert.match(css, /@media \(hover: hover\) \{[^@]*:hover \{ transform: translateY\(-6px\)/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[^}]*transition: none; transform: none;/)
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{ @supports \(animation-timeline: view\(\)\) \{ \.br-x-w_abc-1 \{ animation: br-in-up linear both;/)
  // Whatever goes in, what comes out is made of the allowed alphabet: no tag, no url(), no expression, no import.
  const hostile = style.advancedCss('w1', style.validateAdvancedStyle({ bg: '#000000</style><script>alert(1)</script>', borderColor: 'expression(alert(1))', borderWidth: 1, borderStyle: 'solid;}body{display:none', shadow: 'x;}*{color:red', classes: ['a{b}'], margin: { t: '1px;}*{x:y', r: 1, b: 1, l: 1 } }))
  assert.doesNotMatch(hostile, /<|>|url\(|expression|@import|javascript|display:\s*none|\*\s*\{/i)
  // An id that is not an id of the document styles nothing; nothing set writes nothing.
  assert.equal(style.advancedCss('x y</style>', { opacity: 50 }), '')
  assert.equal(style.advancedCss('w1', undefined), '')
  // Stored on blocks and sections through the document's own validation, and kept by a copy.
  const builder = load('src/modules/site/domain/builder.ts')
  const doc = builder.emptyDoc(); const section = builder.createSection(1); const widget = builder.createWidget('heading')
  section.columns[0].widgets.push({ ...widget, adv: { fontSize: 44, junk: 1 } }); section.adv = { minHeight: 480, padding: { t: 40, r: 0, b: 40, l: 0 }, color: 'x' }
  const saved = builder.validateBuilderDoc({ ...doc, sections: [section] })
  assert.deepEqual([saved.sections[0].adv, saved.sections[0].columns[0].widgets[0].adv], [{ padding: { t: 40, r: 0, b: 40, l: 0 }, minHeight: 480 }, { fontSize: 44 }])
  assert.equal('adv' in builder.validateBuilderDoc({ ...doc, sections: [builder.createSection(1)] }).sections[0], false, 'an element without advanced style stores no empty object')
  assert.deepEqual(builder.cloneSections(saved.sections)[0].columns[0].widgets[0].adv, { fontSize: 44 })
  // The renderer writes the rules beside the element and the inspector edits them through the same validation.
  const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')
  assert.match(read('src/components/content/builder/BuilderRenderer.tsx'), /styleTag\(widget\.id, widget\.adv\)\}\{renderWidget\(widget, ctx\)\}/)
  assert.match(read('src/components/content/builder/BuilderRenderer.tsx'), /\{styleTag\(section\.id, section\.adv\)\}/)
  assert.match(read('src/app/admin/builder/advanced-style.tsx'), /onChange\(validateAdvancedStyle\(\{ \.\.\.adv, \.\.\.change \}\), history\)/)
  for (const motion of style.MOTIONS) assert.match(read('src/app/builder-render.css'), new RegExp('@keyframes br-in-' + motion + ' '))
})

test('effects: surfaces, heading effects, loops and the new hovers and entrances are choices from a list, and add up rather than replace each other', () => {
  const fs = require('node:fs'), path = require('node:path')
  const style = load('src/modules/site/domain/builder-style.ts')
  const css = (adv) => style.advancedCss('w1', style.validateAdvancedStyle(adv))
  // Only listed values are stored.
  assert.deepEqual(style.validateAdvancedStyle({ loop: 'float', surface: 'aurora', textFx: 'shimmer', hover: 'tilt', motion: 'flip' }), { hover: 'tilt', motion: 'flip', loop: 'float', surface: 'aurora', textFx: 'shimmer' })
  assert.equal(style.validateAdvancedStyle({ loop: 'url(x)', surface: '</style>', textFx: 'expression(1)' }), undefined)
  // An entrance and a loop share one animation list: the entrance on the scroll timeline, the loop on its own clock.
  const has = (text, part) => assert.ok(text.includes(part), `missing: ${part}\nin: ${text}`)
  has(css({ motion: 'up', loop: 'float' }), 'animation: br-in-up linear both, br-loop-float 6s ease-in-out infinite; animation-timeline: view(), auto; animation-range: entry 0% entry 45%, normal;')
  has(css({ loop: 'pulse' }), '@media (prefers-reduced-motion: no-preference) { .br-x-w1 { animation: br-loop-pulse ')
  // Surfaces draw behind the content in the element's own stacking context; the beam and aurora move only where motion is welcome.
  has(css({ surface: 'aurora' }), '.br-x-w1 { position: relative; isolation: isolate; }')
  has(css({ surface: 'aurora' }), ".br-x-w1::before { content: ''; position: absolute; inset: 0; z-index: -1;")
  has(css({ surface: 'beam' }), '@media (prefers-reduced-motion: no-preference) { .br-x-w1::before { animation: br-beam')
  has(css({ surface: 'glass' }), 'backdrop-filter: blur(16px)')
  // Heading effects touch headings only; shimmer moves only where motion is welcome.
  has(css({ textFx: 'gradient' }), '.br-x-w1 :is(h1, h2, h3, h4, h5, h6), .br-x-w1:is(h1, h2, h3, h4, h5, h6) { background: linear-gradient')
  has(css({ textFx: 'shimmer' }), '@media (prefers-reduced-motion: no-preference) { .br-x-w1 :is(h1, h2, h3, h4, h5, h6)')
  // Shine and grey-to-colour exist only for a pointer that hovers; a phone sees the element as it is.
  assert.match(css({ hover: 'colorize' }), /^@media \(hover: hover\) \{[^@]* \.br-x-w1 \{ filter: grayscale\(1\); \} \}/)
  has(css({ hover: 'shine' }), '.br-x-w1::after { transition: none; } }')
  // Every hovered, looped, surfaced or shimmering element still writes nothing a writer typed.
  for (const hover of style.HOVERS) for (const surface of style.SURFACES) assert.doesNotMatch(css({ hover, surface, textFx: 'shimmer', loop: 'spin' }), /<|url\(|expression|@import|javascript/i)
  // Every named entrance and loop has its keyframes; the templates that use them are real documents.
  const sheet = fs.readFileSync(path.resolve(__dirname, '..', 'src/app/builder-render.css'), 'utf8')
  for (const loop of style.LOOPS) assert.match(sheet, new RegExp('@keyframes br-loop-' + loop + ' '))
  for (const name of ['br-aurora', 'br-beam', 'br-shimmer']) assert.match(sheet, new RegExp('@keyframes ' + name + ' '))
  const { PAGE_TEMPLATES, BUNDLED_TEMPLATES } = load('src/modules/site/domain/builder-templates.ts')
  const landing = PAGE_TEMPLATES.filter((template) => !['page-foreign-payment', 'page-service', 'page-campaign'].includes(template.id))
  assert.equal(landing.length, 6)
  const advOf = (template) => template.doc.sections.flatMap((section) => [section.adv, ...section.columns.flatMap((column) => column.widgets.map((widget) => widget.adv))]).filter(Boolean)
  for (const template of landing) assert.ok(advOf(template).some((adv) => adv.surface) && advOf(template).some((adv) => adv.motion), template.id + ' uses the effects')
  assert.equal(BUNDLED_TEMPLATES.filter((template) => template.id.startsWith('fx-')).length, 6)
  assert.equal(new Set([...PAGE_TEMPLATES, ...BUNDLED_TEMPLATES].map((template) => template.id)).size, PAGE_TEMPLATES.length + BUNDLED_TEMPLATES.length, 'template ids are unique')
})

test('width and height: the frame is as wide as the site, a section takes a content width in percent, any element a height in screen percent', () => {
  const builder = load('src/modules/site/domain/builder.ts'), style = load('src/modules/site/domain/builder-style.ts')
  const fs = require('node:fs'), path = require('node:path')
  const sheet = fs.readFileSync(path.resolve(__dirname, '../src/app/builder-render.css'), 'utf8')
  assert.ok(sheet.includes('.br-container{inline-size:var(--mb-chrome,min(97%,100% - 32px));'), 'the frame is not capped at a fixed width')
  const section = (widthPct) => { const s = builder.createSection(1); s.style = { ...s.style, widthPct }; return builder.validateBuilderDoc({ ...builder.emptyDoc(), sections: [s] }).sections[0].style.widthPct }
  assert.deepEqual([section(80), section(10), section(250), section(undefined), section('x')], [80, undefined, 100, undefined, undefined])
  assert.deepEqual(style.validateAdvancedStyle({ minHeightVh: 100 }), { minHeightVh: 100 })
  assert.ok(style.advancedCss('w1', { minHeightVh: 60 }).includes('min-height: 60svh;'))
  assert.equal(style.validateAdvancedStyle({ minHeightVh: '100vh; color:red' }), undefined)
})

test('layout: a column lays its blocks in a row or a column with its own style, and a section sets its gap and its phone order', () => {
  const builder = load('src/modules/site/domain/builder.ts')
  const fs = require('node:fs'), path = require('node:path')
  const section = builder.createSection(2)
  section.columns[0].layout = { dir: 'row', gap: 'lg', justify: 'between', align: 'center', wrap: true }
  section.columns[0].adv = { padding: { t: 20, r: 20, b: 20, l: 20 }, surface: 'glass', junk: 1 }
  section.columns[1].layout = { dir: 'sideways', gap: '99px', justify: 'x', align: 'y', wrap: 'yes' }
  section.style = { ...section.style, gap: 'xl', stackM: 'keep', reverseM: 'true' }
  const saved = builder.validateBuilderDoc({ ...builder.emptyDoc(), sections: [section] }).sections[0]
  assert.deepEqual(saved.columns[0].layout, { dir: 'row', gap: 'lg', justify: 'between', align: 'center', wrap: true })
  assert.deepEqual(saved.columns[0].adv, { padding: { t: 20, r: 20, b: 20, l: 20 }, surface: 'glass' })
  assert.deepEqual(saved.columns[1].layout, { dir: 'column', gap: 'md', justify: 'start', align: 'stretch', wrap: false }, 'unknown values fall back to the defaults')
  assert.deepEqual([saved.style.gap, saved.style.stackM, saved.style.reverseM], ['xl', 'keep', undefined], 'reversing takes a real true')
  // Untouched, nothing new is stored, so older documents stay as they were.
  const plain = builder.validateBuilderDoc({ ...builder.emptyDoc(), sections: [builder.createSection(1)] }).sections[0]
  assert.deepEqual(['layout' in plain.columns[0], 'adv' in plain.columns[0], 'gap' in plain.style, 'stackM' in plain.style, 'reverseM' in plain.style], [false, false, false, false, false])
  // Drawn with classes from the lists and the column's own style beside it.
  const renderer = fs.readFileSync(path.resolve(__dirname, '../src/components/content/builder/BuilderRenderer.tsx'), 'utf8')
  assert.ok(renderer.includes('{styleTag(column.id, column.adv)}') && renderer.includes('br-flow-${column.layout.dir}'))
  // The accordion: one open at a time through the native details group, words as text.
  assert.ok(renderer.includes("const group = props.single === '0' ? undefined : `acc-${widget.id}`"))
  assert.ok(renderer.includes('<div className="br-acc-body">{String(item.text || \'\').split('), 'the accordion draws its words as text')
})

test('the global kit: an untouched kit writes nothing, a set one writes only listed values, and advanced style can point at its colours', () => {
  const fs = require('node:fs'), path = require('node:path')
  const kit = load('src/modules/site/domain/builder-kit.ts'), style = load('src/modules/site/domain/builder-style.ts')
  // Nothing chosen: existing pages keep the site's own look.
  assert.equal(kit.kitCss(kit.validateKit(undefined)), '')
  assert.equal(kit.kitCss(kit.validateKit({ colors: [{ id: 'c1', name: 'اصلی', hex: '' }] })), '')
  // Only hex colours, known slots and listed choices are kept.
  const stored = kit.validateKit({ colors: [{ id: 'c1', name: 'Brand<script>', hex: '#FF0066' }, { id: 'c1', hex: '#000000' }, { id: 'c9', hex: '#123456' }, { id: 'c2', hex: 'red' }], headingFont: 'comic', bodyFont: 'inter', headingWeight: '900', scale: 'huge', radius: 'round', buttons: 'gradient' })
  assert.deepEqual(stored.colors, [{ id: 'c1', name: 'Brandscript', hex: '#ff0066' }, { id: 'c2', name: '', hex: '' }])
  assert.deepEqual([stored.headingFont, stored.bodyFont, stored.headingWeight, stored.scale, stored.radius, stored.buttons], ['theme', 'inter', 900, 'theme', 'round', 'gradient'])
  const css = kit.kitCss(stored)
  for (const part of ['--bk-c1: #ff0066;', '--primary: #ff0066;', '--br-radius: 22px;', "font-family: 'HappInter'", 'font-weight: 900;', '.btn-primary { background: linear-gradient']) assert.ok(css.includes(part), part)
  assert.ok(!css.includes('font-size'), 'heading sizes stay as the site sets them while the scale is left to the theme')
  assert.doesNotMatch(css, /<|script|url\(|expression/i)
  // Advanced style points at a kit colour, which falls back to the accent while its slot is empty.
  assert.deepEqual(style.validateAdvancedStyle({ bg: 'kit:c2', color: 'kit:c1', borderWidth: 1, borderColor: 'kit:c9' }), { color: 'kit:c1', bg: 'kit:c2', borderWidth: 1, borderStyle: 'solid', borderColor: '#888888' })
  const written = style.advancedCss('w1', style.validateAdvancedStyle({ bg: 'kit:c2', color: 'kit:c1' }))
  assert.ok(written.includes('background: var(--bk-c2, var(--primary));') && written.includes('color: var(--bk-c1, var(--primary));'), written)
  // Built pages carry the kit; changing it takes the site settings permission and is audited.
  const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')
  assert.ok(read('src/components/content/builder/BuilderRenderer.tsx').includes('const kit = kitCss(await getBuilderKit(!!preview))'))
  const http = read('src/modules/site/server/http/builder/kit.ts')
  assert.match(http, /export async function PUT[\s\S]*requirePerm\(req, 'settings\.manage'\)[\s\S]*auditAdmin/)
})

test('the slider: settings from a list, addresses checked where drawn, and a client part that pauses, follows the direction and stays still for less motion', () => {
  const fs = require('node:fs'), path = require('node:path')
  const builder = load('src/modules/site/domain/builder.ts')
  const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n')
  const doc = (props) => { const section = builder.createSection(1); section.columns[0].widgets.push({ ...builder.createWidget('slides'), props: { ...builder.createWidget('slides').props, ...props } }); return builder.validateBuilderDoc({ ...builder.emptyDoc(), sections: [section] }).sections[0].columns[0].widgets[0].props }
  assert.equal(JSON.parse(builder.createWidget('slides').props.items).length, 2, 'a fresh slider has two slides to edit')
  assert.deepEqual([doc({ effect: 'cube', autoplay: '1', height: '9000px', overlay: 'red', align: 'top' })].map((p) => [p.effect, p.autoplay, p.height, p.overlay, p.align])[0], ['slide', '6', 'md', 'soft', 'start'], 'only listed settings are kept')
  assert.throws(() => doc({ items: JSON.stringify(Array(11).fill({ title: 'x' })) }), /Invalid items list/)
  // Tablet values sit between 768 and 1024px, before the phone values that still win below 768px.
  const style = load('src/modules/site/domain/builder-style.ts')
  const tabletCss = style.advancedCss('w1', style.validateAdvancedStyle({ paddingT: { t: 12, r: 12, b: 12, l: 12 }, fontSizeT: 30, alignT: 'center', fontSizeM: 20 }))
  assert.ok(tabletCss.includes('@media (min-width: 768px) and (max-width: 1024px) { .br-x-w1 { padding-block: 12px 12px; padding-inline: 12px 12px; text-align: center; }'), tabletCss)
  assert.ok(tabletCss.indexOf('min-width: 768px') < tabletCss.indexOf('max-width: 767px'), 'phone rules come after tablet rules')
  const renderer = read('src/components/content/builder/BuilderRenderer.tsx')
  const drawn = renderer.slice(renderer.indexOf("case 'slides'"), renderer.indexOf("case 'carousel'"))
  for (const use of ['src: safeSrc(item.src)', 'href: safeHref(item.href)', 'href2: safeHref(item.href2)']) assert.ok(drawn.includes(use), use)
  const live = read('src/components/content/builder/BuilderSlides.tsx')
  assert.match(live, /^'use client'/)
  for (const part of ["matchMedia('(prefers-reduced-motion: reduce)')", "visibilitychange", 'inert={!on}', 'aria-pressed={paused}', "getComputedStyle(root.current).direction === 'rtl'", 'aria-roledescription']) assert.ok(live.includes(part), part)
  assert.match(live, /const playing = autoplay > 0 && count > 1 && !paused && !held && !calm && !hidden/)
  const sheet = read('src/app/builder-render.css')
  assert.match(sheet, /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.br-slide/)
})

test('showcase blocks: each is a real block of the document, offered in the palette, described in the inspector and drawn safely', () => {
  const fs = require('node:fs'), path = require('node:path')
  const builder = load('src/modules/site/domain/builder.ts')
  const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n')
  const NEW = ['icon-box', 'tabs', 'testimonials', 'counters', 'gallery', 'carousel', 'pricing', 'countdown', 'social', 'progress', 'slides', 'accordion', 'flip-box', 'animated-headline', 'before-after', 'timeline', 'team', 'logos', 'marquee', 'steps', 'comparison', 'video-box', 'alert', 'rating']
  const palette = read('src/app/admin/builder/palette.tsx'), inspector = read('src/app/admin/builder/inspector.tsx'), renderer = read('src/components/content/builder/BuilderRenderer.tsx')
  for (const type of NEW) {
    assert.ok(builder.WIDGET_TYPES.includes(type), type)
    assert.ok(builder.WIDGET_LABELS[type].fa && builder.WIDGET_LABELS[type].en, type + ' has a name in both languages')
    // A fresh block is a valid document as it stands, and survives a save unchanged.
    const widget = builder.createWidget(type), section = builder.createSection(1); section.columns[0].widgets.push(widget)
    const saved = builder.validateBuilderDoc({ ...builder.emptyDoc(), sections: [section] }).sections[0].columns[0].widgets[0]
    assert.deepEqual(saved.props, widget.props, type)
    const quoted = type.includes('-') ? "'" + type + "'" : type
    assert.ok(palette.includes("'" + type + "'"), type + ' is in the palette')
    assert.ok(new RegExp('\\n  ' + quoted.replace(/[-']/g, '\\$&') + ': \\[').test(inspector), type + ' has inspector fields')
    assert.ok(renderer.includes("case '" + type + "':"), type + ' is drawn')
  }
  // Limits hold: too many items, an icon off the list, a link that runs.
  const withProps = (type, props) => { const section = builder.createSection(1); section.columns[0].widgets.push({ ...builder.createWidget(type), props }); return { ...builder.emptyDoc(), sections: [section] } }
  assert.throws(() => builder.validateBuilderDoc(withProps('gallery', { items: JSON.stringify(Array(25).fill({ src: '/a.webp' })), columns: '3' })), /Invalid items list/)
  assert.equal(builder.validateBuilderDoc(withProps('icon-box', { icon: 'skull<script>', layout: 'diagonal', title: 'x' })).sections[0].columns[0].widgets[0].props.icon, builder.BOX_ICONS[0])
  assert.throws(() => builder.validateBuilderDoc(withProps('icon-box', { icon: 'star', href: 'javascript:alert(1)' })), /Invalid URL/)
  // Every icon the box offers exists in the site's icon set (an unknown name would silently show the shield).
  const icons = read('src/components/site/Icon.tsx')
  for (const name of builder.BOX_ICONS) assert.ok(new RegExp('\\n  ' + name + ': ').test(icons), 'icon ' + name)
  // Addresses typed into a list of items are checked where they are drawn: pictures by safeSrc, links by safeHref; a tab's words are text.
  assert.match(renderer, /const safeSrc = \(raw: string \| undefined\) => \{[^\n]*\/\^https:\\\/\\\/\[\^\\s<>"'\\\\\]\+\$\/\.test\(value\) \? value : ''/)
  for (const use of ['safeSrc(item.avatar)', 'src: safeSrc(item.src)', 'href={safeHref(item.href)}', 'href={safeHref(href)}', 'cleanWidgetHtml(escapeText(']) assert.ok(renderer.includes(use), use)
  assert.doesNotMatch(renderer.slice(renderer.indexOf("case 'icon-box'"), renderer.indexOf("case 'html':")), /dangerouslySetInnerHTML|src=\{item\.|href=\{item\./, 'no raw item value reaches an attribute or the markup')
  // The three that need the browser are one client file, readable without script and still under reduced motion.
  const live = read('src/components/content/builder/BuilderInteractive.tsx')
  assert.match(live, /^'use client'/)
  assert.match(live, /prefers-reduced-motion: reduce/)
  assert.match(live, /role="tablist"/); assert.match(live, /role="tabpanel"/); assert.match(live, /ArrowLeft/)
  assert.match(live, /const \[now, setNow\] = useState<number \| null>\(null\)/, 'the countdown paints the same on the server and in the browser')
  assert.match(read('src/app/builder-render.css'), /@media \(prefers-reduced-motion: reduce\) \{ \.br-iconbox, \.br-price,/)
})

// ---- article templates with a page style (owner, 2026-10-28)
test('designed article templates wear a style and keep the article slots', () => {
  const builder = load('src/modules/site/domain/builder.ts')
  const templates = load('src/modules/site/domain/builder-templates.ts')
  const postStyles = load('src/modules/journal/domain/post-styles.ts')
  const keep = builder.validateBuilderDoc({ v: 2, mode: 'builder', code: { html: '', css: '', js: '', advanced: false }, sections: [], layout: { header: 'default', footer: 'default', postStyle: 'ps-neon' } })
  assert.equal(keep.layout.postStyle, 'ps-neon')
  for (const bad of ['ps-', 'tpl-x', 'ps-NEON', 'psc-!!', 42]) {
    const doc = builder.validateBuilderDoc({ v: 2, mode: 'builder', code: { html: '', css: '', js: '', advanced: false }, sections: [], layout: { header: 'default', footer: 'default', postStyle: bad } })
    assert.deepEqual(doc.layout, { header: 'default', footer: 'default' }, String(bad))
  }
  assert.equal(Object.keys(postStyles.POST_STYLE_BASES).length, 10)
  const pro = templates.POST_TEMPLATES.filter((template) => template.id.startsWith('post-pro-'))
  assert.equal(pro.length, 7)
  for (const template of pro) {
    const types = template.doc.sections.flatMap((section) => section.columns.flatMap((column) => column.widgets.map((widget) => widget.type)))
    assert.ok(types.includes('content') && types.includes('post-header') && types.includes('post-footer'), template.id)
    const style = template.doc.layout.postStyle
    assert.ok(postStyles.resolvePostStyle(style, postStyles.DEFAULT_POST_STYLE_SETTINGS), `${template.id} ${style}`)
    assert.ok(templates.POST_TEMPLATE_IDS.includes(template.id))
  }
  // older templates keep a plain layout (no style key written)
  assert.equal('postStyle' in templates.POST_TEMPLATES.find((template) => template.id === 'post-classic').doc.layout, false)
})
