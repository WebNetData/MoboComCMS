const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

// Minimal TS loader with "@/" path mapping (domain modules only import each other).
const cache = new Map()
function load(relative) {
  const file = path.resolve(__dirname, '..', relative.endsWith('.ts') ? relative : `${relative}.ts`)
  if (cache.has(file)) return cache.get(file).exports
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  cache.set(file, mod)
  const localRequire = (specifier) => (specifier.startsWith('@/') ? load(`src/${specifier.slice(2)}`) : require(specifier))
  new Function('require', 'module', 'exports', source)(localRequire, mod, mod.exports)
  return mod.exports
}

const mm = load('src/modules/navigation/domain/megamenu')
const tt = load('src/modules/site/domain/theme-templates')

test('a category dropdown lists the sub-tree of one top-level category', () => {
  const nodes = [
    { id: 1, parentId: null, label: 'ویندوز', href: '/w' },
    { id: 2, parentId: 1, label: 'امنیت', href: '/w/s' },
    { id: 3, parentId: 2, label: 'آنتی‌ویروس', href: '/w/s/a' },
    { id: 4, parentId: 1, label: 'اداری', href: '/w/o' },
    { id: 5, parentId: null, label: 'اندروید', href: '/a' },
    { id: 6, parentId: 5, label: 'بازی', href: '/a/g' },
  ]
  const columns = mm.subtreeColumns(nodes, 1, { columns: 4, perColumn: 8, looseTitle: 'دسته‌های ویندوز' })
  assert.deepEqual(columns.map((c) => c.title), ['دسته‌های ویندوز', 'امنیت'])
  assert.deepEqual(columns[0].links.map((l) => l.label), ['اداری'])
  assert.deepEqual(columns[1].links.map((l) => l.label), ['آنتی‌ویروس'])
  assert.ok(!JSON.stringify(columns).includes('اندروید'), 'other top-level categories stay out')
  assert.deepEqual(mm.subtreeColumns(nodes, 6, { columns: 4, perColumn: 8, looseTitle: 'x' }), [])
})

test('hrefs and images accept only site paths and https', () => {
  assert.equal(mm.safeHref('/products?category=x'), '/products?category=x')
  assert.equal(mm.safeHref('https://example.com/a'), 'https://example.com/a')
  for (const bad of ['javascript:alert(1)', '//evil.com', 'http://x.com', 'data:text/html,1', '/a"onmouseover=1', ' /\\evil']) assert.equal(mm.safeHref(bad), '', bad)
  assert.equal(mm.safeImage('/uploads/a.jpg'), '/uploads/a.jpg')
  assert.equal(mm.safeImage('javascript:1'), '')
})

test('section settings clamp numbers and validate links and the promo', () => {
  const s = mm.normalizeSectionConfig({ columns: 40, linksPerColumn: 1, features: -2, links: [{ label: 'حراج', href: '/products?sale=1' }, { label: '', href: '' }] })
  assert.equal(s.columns, 6)
  assert.equal(s.linksPerColumn, 3)
  assert.equal(s.features, 0)
  assert.deepEqual(s.links, [{ label: 'حراج', href: '/products?sale=1' }])
  assert.throws(() => mm.normalizeSectionConfig({ links: [{ label: 'بد', href: 'javascript:1' }] }), /لینک/)
  assert.throws(() => mm.normalizeSectionConfig({ promo: { enabled: true, title: 'x', href: '' } }), /بنر/)
  const kept = mm.normalizeMegaConfig({ sections: { games: { enabled: false } } }, mm.defaultMegaConfig())
  assert.equal(kept.sections.games.enabled, false)
  assert.equal(kept.sections.software.enabled, true, 'untouched sections keep their settings')
})

test('category trees become columns: branches as columns, loose roots together', () => {
  const nodes = [
    { id: 1, parentId: null, label: 'لپ‌تاپ', href: '/c/1' },
    { id: 2, parentId: 1, label: 'گیمینگ', href: '/c/2' },
    { id: 3, parentId: 1, label: 'اداری', href: '/c/3' },
    { id: 4, parentId: null, label: 'کارت هدیه', href: '/c/4' },
    { id: 5, parentId: 99, label: 'یتیم', href: '/c/5' },
    { id: 6, parentId: null, label: 'موبایل', href: '/c/6' },
    { id: 7, parentId: 6, label: 'اندروید', href: '/c/7' },
  ]
  const columns = mm.treeColumns(nodes, { columns: 4, perColumn: 1, looseTitle: 'دسته‌ها' })
  assert.deepEqual(columns.map((c) => c.title), ['دسته‌ها', 'لپ‌تاپ', 'موبایل'])
  assert.deepEqual(columns[0].links.map((l) => l.label), ['کارت هدیه'], 'per-column limit applies')
  assert.equal(columns[1].href, '/c/1')
  assert.equal(mm.treeColumns(nodes, { columns: 1, perColumn: 5, looseTitle: 'x' }).length, 1)
})

test('facets split comma lists and rank by frequency', () => {
  assert.deepEqual(mm.facetCounts(['Action, RPG', 'RPG', 'Action', 'اکشن، RPG', ''], 2), [{ name: 'RPG', count: 3 }, { name: 'Action', count: 2 }])
})

test('built-in sections accept a placed landing page; other reserved slugs do not', () => {
  const place = (slug) => tt.validateTemplateMeta({ id: 'tpl-page-a1b2c3', name: 'x', status: 'draft', conditions: [], placement: { kind: 'section', slug } })
  assert.equal(place('software').placement.slug, 'software')
  assert.equal(place('games').placement.slug, 'games')
  assert.throws(() => place('admin'), /رزرو/)
  assert.throws(() => place('compare'), /رزرو/)
})
