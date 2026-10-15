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

test('section bar entries follow the editor order and hide list', () => {
  const items = ['a', 'b', 'c', 'd'].map((key) => ({ key }))
  assert.deepEqual(mm.arrangeItems(items, { itemOrder: ['c', 'a'], hiddenItems: ['b'] }).map((i) => i.key), ['c', 'a', 'd'])
  assert.deepEqual(mm.arrangeItems(items, { itemOrder: [], hiddenItems: [] }).map((i) => i.key), ['a', 'b', 'c', 'd'])
  const cfg = mm.normalizeSectionConfig({ hiddenItems: ['x', 'x', '', 5], itemOrder: 'bad', maxItems: 99, showSearch: false })
  assert.deepEqual(cfg.hiddenItems, ['x', '5'])
  assert.deepEqual(cfg.itemOrder, [])
  assert.equal(cfg.maxItems, 20)
  assert.equal(cfg.showSearch, false)
  assert.equal(cfg.showQuick, true)
  // Settings saved before these options existed keep working.
  const old = mm.normalizeSectionConfig({}, { enabled: true, columns: 4, linksPerColumn: 8, features: 2, links: [], hideAutoLinks: false, promo: { enabled: false, title: '', text: '', href: '', image: '', cta: '' } })
  assert.deepEqual([old.hiddenItems, old.itemOrder, old.maxItems, old.showSearch], [[], [], 0, true])
})

test('the site header: it can stay at the top, its links carry icons, and the account menu and the phone drawer close properly', () => {
  const fs = require('node:fs'), path = require('node:path')
  const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n')
  const client = read('src/themes/code/mobocom/client.tsx'), css = read('src/themes/code/mobocom/theme.css'), icons = read('src/themes/code/mobocom/icons.tsx')
  // A sticky header inside a wrapper as tall as itself never sticks: the wrapper that names the theme is not a box.
  assert.match(client, /<div data-code-theme="mobocom" className="mb-shell"><MobocomHeader/)
  assert.match(css, /\n\.mb-shell \{ display: contents; \}/)
  assert.match(css, /\n\.mb-header \{ position: sticky; top: 0;/)
  // Other pages pin their side columns 76px from the top: the bar is never taller than that.
  assert.match(css, /\n\.mb-header \{[^}]*padding-block: 10px 2px;/)
  assert.match(css, /\n\.mb-header-bar \{[^}]*min-height: 62px;/)
  // Two tiers: the links hang under the header without adding to its height, and a spacer keeps the page clear of them at the top.
  assert.match(css, /\n\.mb-navbar \{ position: absolute; inset-inline: 0; top: 100%;/)
  assert.match(client, /<div className="mb-navbar-space" aria-hidden="true"\/>/)
  // Away, the links are hidden from the keyboard too, and focus inside them always brings them back.
  assert.match(css, /\.mb-header\[data-nav-away\] \.mb-navbar \{[^}]*visibility: hidden;/)
  assert.match(client, /<div className="mb-navbar" onFocus=\{\(\) => setNavAway\(false\)\}>/)
  // Inside a section its own bar rides under the header (74px) and the site links wait for the top of the page.
  assert.match(css, /html\[data-design="mobocom"\] \.mm-bar-wrap \{ position: sticky; top: 74px;/)
  assert.match(client, /const sectionBar = document\.querySelector\('\.mm-bar-wrap'\)/)
  // The member's picture rides in the session (refreshed by the check that runs on every request), so the header, the
  // dashboard and the admin shell can draw it without another request; the forum falls back to the same picture.
  const auth = read('src/modules/identity/auth.ts')
  assert.match(auth, /select: \{ status: true, passwordChangedAt: true, name: true, telegramPhoto: true, userProfile: \{ select: \{ avatar: true \} \} \}/)
  assert.match(auth, /token\.picture = pictureOf\(current\) \|\| null/)
  assert.match(auth, /session\.user\.image = typeof token\.picture === 'string' && token\.picture \? token\.picture : null/)
  for (const shell of ['src/app/dashboard/layout.tsx', 'src/app/admin/layout.tsx']) assert.match(read(shell), /session\?\.user\?\.image \? <img src=\{session\.user\.image\} alt="" \/> : initial/, shell)
  assert.match(read('src/modules/forum/server/forum.ts'), /avatar: profile\?\.avatar \|\| pictureOf\(user\)/)
  // An article tells its whole path once: home, the magazine, the categories above it, its category, the title — on the page and to search engines.
  const article = read('src/modules/site/server/pages/blog/[slug]/page.tsx')
  assert.match(article, /const filedUnder = post\.category \?\? postCategories\(post\)\[0\] \?\? null/)
  assert.match(article, /depth < 4/, 'a loop in the category tree cannot hang the page')
  assert.match(article, /breadcrumbJsonLd\(base, \[\.\.\.trail\.map/)
  assert.doesNotMatch(article, /breadcrumbs=\{\[/, 'the header no longer repeats the path above the navigation')
  // A wrapper around the header must not be a box, or the header cannot stay at the top (the journal had one).
  assert.match(read('src/app/journal-design.css'), /\.journal-header-shell \{\n  display: contents;\n\}/)
  // Every icon the navigation or the menus name exists in the theme's own set (an unknown one would show the shield).
  const named = [...client.matchAll(/(?:name="|: ')([a-z]+)(?="|')/g)].map((m) => m[1]).filter((name) => /^[a-z]+$/.test(name))
  const used = new Set([...Object.values(Object.fromEntries([...client.matchAll(/(\w+): '(\w+)'/g)].map((m) => [m[1] + m[2], m[2]]))), ...[...client.matchAll(/Icon name="(\w+)"/g)].map((m) => m[1]), 'home', 'sparkles', 'logout', 'grid'])
  assert.ok(named.length > 5)
  for (const name of used) assert.ok(new RegExp('\\n  ' + name + ': ').test(icons), 'icon ' + name)
  // The ruler that decides how many links fit measures the same content as the links themselves.
  assert.match(client, /mb-nav-measure" aria-hidden="true">\{links\.map\(link => <span key=\{link\.href\}><Icon name=\{navIcon\(link\.href\)\} size=\{17\}\/>/)
  // Popovers close on Escape, a press outside and a change of address; the drawer also holds the page still.
  assert.match(client, /function useDismiss\(/)
  assert.equal((client.match(/useDismiss\(/g) || []).length, 3)
  assert.match(client, /document\.body\.style\.overflow = 'hidden'/)
  assert.match(client, /return \(\) => \{ document\.body\.style\.overflow = before;/)
  assert.match(client, /role="dialog" aria-modal="true"/)
  // Motion is dropped for readers who ask for less; the reading line needs a browser that ties it to scrolling.
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.mb-pop, \.mb-drawer, \.mb-drawer-shade \{ animation: none; \}/)
  assert.match(css, /@supports \(animation-timeline: scroll\(\)\)/)
  // The stylesheet the site loads is the generated one; it must carry the same header.
  assert.ok(read('src/themes/generated.css').includes('.mb-shell { display: contents; }'), 'run scripts/generate-extensions.mjs')
})

test('cinema, games, software and the forum take the width of the header and are told how to use it', () => {
  const fs = require('node:fs'), path = require('node:path')
  const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n')
  const css = read('src/app/sections-wide.css'), layout = read('src/app/layout.tsx')
  // Section widths follow section styles; the owner's shared native-select fix loads last.
  const imports = [...layout.matchAll(/^import '\.\/([\w\/-]+\.css)'/gm)].map((m) => m[1])
  assert.deepEqual(imports.slice(-2), ['sections-wide.css', 'selects.css'])
  for (const section of ['cinema', 'games', 'software', 'forum']) assert.ok(css.includes(`.md-${section} .container:not(.mm-bar)`), section)
  assert.match(css, /width: var\(--mb-chrome, min\(1680px, 100% - 48px\)\); max-width: none; padding-inline: 0; \}/)
  // A short shelf takes half a row with its cards capped (a poster never grows into a billboard); full shelves share the width.
  assert.match(css, /\.md-cinema \.md-body > :has\(\.md-rail\):not\(:has\(\.md-rail > :nth-child\(6\)\)\) \{ grid-column: auto;/)
  assert.match(css, /\.md-rail \{ grid-auto-columns: calc\(\(100% - 3 \* 20px\) \/ 4\); \}/)
  assert.match(css, /\.md-games:has\(> \.gv-rail-slot\) \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); grid-auto-flow: dense; \}/, 'only the games home becomes a grid, not every games page')
  // Rules written after the sections' own media queries bring the phone sizes with them.
  assert.match(css, /@media \(max-width: 640px\) \{ \.md-games \.gx-rail-track \{ grid-auto-columns: 42%; \} \}/)
  // The forum's one-column layout is left alone: a second column there squeezed a topic to a sliver.
  assert.doesNotMatch(css, /\.fx-layout-wide/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
})
