const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

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

const domain = () => load('src/modules/site/domain/builder.ts')

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
  const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
  const compile = (file, deps = {}) => { const mod = { exports: {} }; new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)((name) => deps[name] || require(name), mod, mod.exports); return mod.exports }
  const style = compile('src/modules/site/domain/builder-style.ts')
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
