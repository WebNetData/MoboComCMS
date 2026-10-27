const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

// Minimal TS loader with "@/" path mapping (domain modules only import each other).
const cache = new Map()
function load(relative) {
  const file = path.resolve(__dirname, '..', relative.endsWith('.ts') ? relative : `${relative}.ts`)
  if (cache.has(file)) return cache.get(file).exports
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  cache.set(file, mod)
  const localRequire = (specifier) => (specifier.startsWith('@/') ? load(`src/${specifier.slice(2)}`) : specifier.startsWith('.') ? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), specifier))) : require(specifier))
  new Function('require', 'module', 'exports', source)(localRequire, mod, mod.exports)
  return mod.exports
}

const mm = load('src/modules/navigation/domain/megamenu')
const tt = load('src/modules/site/domain/theme-templates')
const menus = load('src/modules/site/config/menus')
const { validateMenu, validateSite } = load('src/modules/site/config/validation')
const { menuNodes } = load('src/modules/navigation/domain/presentation')
const { sectionMenuPreset, mergeMenuPreset } = load('src/modules/navigation/domain/presets')
const contact = load('src/modules/site/domain/company-contact')

test('section recipes include deep canonical categories and repeat safely without replacing owner edits', () => {
  let n = 0
  const bar = { items: [], quick: [{ label: 'همه', href: '/blog' }], categoryCatalog: [
    { key: 'c1', parentKey: null, label: 'والد', href: '/blog?category=a', icon: '' },
    { key: 'c2', parentKey: 'c1', label: 'فرزند', href: '/blog?category=b', inMenu: false },
    { key: 'c3', parentKey: 'c2', label: 'نوه', href: '/blog?category=c' },
  ] }
  const preset = sectionMenuPreset('blog', bar, () => 'recipe-'+ ++n), child = preset.children[0]
  assert.equal(child.icon, ''); assert.equal(child.children[0].enabled, false); assert.equal(child.children[0].children[0].href, '/blog?category=c')
  const custom = { ...preset, label: { fa: 'نام دلخواه', en: '' }, icon: '', enabled: false, menuDisplay: 'dropdown', children: [{ ...child, label: { fa: 'والد دلخواه', en: '' }, children: [] }] }
  const result = mergeMenuPreset([custom], sectionMenuPreset('blog', bar, () => 'again-'+ ++n))
  assert.equal(result.length, 1); assert.equal(result[0].label.fa, 'نام دلخواه'); assert.equal(result[0].icon, ''); assert.equal(result[0].enabled, false); assert.equal(result[0].menuDisplay, 'dropdown'); assert.equal(result[0].children[0].label.fa, 'والد دلخواه')
  assert.equal(result[0].children[0].children[0].children.length, 1); assert.equal(custom.children[0].children.length, 0)
  assert.deepEqual(mergeMenuPreset(result, preset), result)
})

test('section recipes reject oversized, duplicate and cyclic category forests rather than silently dropping data', () => {
  const node = { key: 'c1', parentKey: null, label: 'دسته', href: '/blog' }, base = { items: [], quick: [], categoryCatalog: [node] }
  assert.throws(() => sectionMenuPreset('blog', { ...base, categoryCatalog: Array.from({length:120},(_,i)=>({...node,key:'c'+i})) }), /ظرفیت/)
  assert.throws(() => sectionMenuPreset('blog', { ...base, categoryCatalog: [node,node] }), /تکراری/)
  assert.throws(() => sectionMenuPreset('blog', { ...base, categoryCatalog: [{ ...node,parentKey:'c1' }] }), /حلقه/)
  assert.throws(() => sectionMenuPreset('blog', { ...base, categoryCatalog: [{ ...node,parentKey:'c2' },{...node,key:'c2',parentKey:'c1'}] }), /حلقه/)
})

test('map imports use selected pin rather than map camera or city coordinates and never fetch a URL', () => {
  assert.deepEqual(contact.coordinatesFromMapLink('https://www.google.com/maps/place/example/@36.4745071,52.8729857,19z/data=!3d36.4634867!4d52.8577787!3m3!8m2!3d36.474506!4d52.872342?entry=ttu'), {latitude:36.474506,longitude:52.872342})
  assert.deepEqual(contact.coordinatesFromMapLink('https://www.openstreetmap.org/?mlat=0&mlon=0'), {latitude:0,longitude:0})
  assert.deepEqual(contact.coordinatesFromMapLink('https://maps.google.com/?q=-33.7,151.2'), {latitude:-33.7,longitude:151.2})
  for(const url of ['https://www.openstreetmap.org/?mlat=&mlon=', 'https://maps.google.com/?q=91,0', 'https://maps.google.com/?q=0,181', 'https://evil.invalid/?q=1,2', 'https://www.google.com@evil.invalid/?q=1,2', 'http://www.google.com/?q=1,2', 'javascript:alert(1)']) assert.throws(()=>contact.coordinatesFromMapLink(url), undefined, url)
})

test('contact settings remain optional, validate all channels and only build explicit public map URLs', () => {
  assert.equal(contact.normalizeCompanyContact(undefined).mapEnabled,false)
  assert.equal(contact.companyMapLinks(contact.emptyCompanyContact()), null)
  assert.equal(contact.contactSocialHref('telegram','@mobocom'), 'https://t.me/mobocom')
  assert.equal(contact.contactSocialHref('x','https://twitter.com/mobocom/'), 'https://x.com/mobocom')
  for(const value of [{phone:'bad'}, {email:'bad'}, {latitude:1}, {latitude:NaN,longitude:1}, {mapEnabled:true}, {zoom:20}, {address:'<script>'}, {telegram:'https://evil.invalid/mobocom'}, {instagram:'https://instagram.com/user?redirect=evil'}, {x:'javascript:evil'}]) assert.throws(()=>contact.normalizeCompanyContact(value))
  const value=contact.normalizeCompanyContact({latitude:36.474506,longitude:52.872342,mapEnabled:true,phone:'+98 111 222 3333',email:'owner@example.invalid'})
  const links=contact.companyMapLinks(value),url=new URL(links.embed)
  assert.equal(url.origin,'https://www.openstreetmap.org');assert.equal(url.searchParams.get('marker'),'36.474506,52.872342')
  // The about and contact map links to the map apps visitors use, built only from the saved pin (owner, 2026-10-28).
  assert.equal(links.coordinates,'36.474506,52.872342')
  assert.equal(new URL(links.neshan).origin,'https://neshan.org');assert.ok(links.neshan.includes('@36.474506,52.872342,'))
  assert.equal(new URL(links.balad).searchParams.get('latitude'),'36.474506');assert.equal(new URL(links.waze).searchParams.get('ll'),'36.474506,52.872342')
  assert.equal(new URL(links.osm).searchParams.get('mlat'),'36.474506')
  const defaults=load('src/modules/site/config/defaults').defaultSite
  assert.equal(validateSite({...defaults,contact:value}),true);assert.equal(validateSite({...defaults,contact:{...value,email:'bad'}}),false)
})

test('company map frame allowlist is limited to managed pages and Studio without broadening other policies', () => {
  const { contentSecurityPolicy } = load('src/platform/http/csp')
  for(const path of ['/p/about','/p/contact','/admin/studio']) assert.ok(contentSecurityPolicy({path,nonce:null,production:true}).split(';').find(s=>s.trim().startsWith('frame-src')).includes('https://www.openstreetmap.org'))
  for(const path of ['/','/blog','/login','/api/admin/site']) assert.ok(!contentSecurityPolicy({path,nonce:null,production:true}).includes('openstreetmap.org'))
})

test('shared people navigation follows Music/Cinema switches without changing stored recipes', () => {
  const { siteLinkDisabled, hideDisabledModules } = load('src/modules/site/config/visibility')
  const off = { music: { enabled:false,paths:['/music'] },cinema:{ enabled:false,paths:['/cinema'] } }
  assert.equal(siteLinkDisabled('/celebrities',off),true)
  const musicOnly={...off,music:{...off.music,enabled:true}}
  assert.equal(siteLinkDisabled('/celebrities',musicOnly),false);assert.equal(siteLinkDisabled('/celebrities?role=actor',musicOnly),true);assert.equal(siteLinkDisabled('/celebrities?role=singer',musicOnly),false)
  const cinemaOnly={...off,cinema:{...off.cinema,enabled:true}}
  assert.equal(siteLinkDisabled('/celebrities?role=credit-COMPOSER',cinemaOnly),true);assert.equal(siteLinkDisabled('/celebrities?section=music',cinemaOnly),true);assert.equal(siteLinkDisabled('/celebrities?role=director',cinemaOnly),false)
  const original=load('src/modules/site/config/defaults').defaultSite,before=JSON.stringify(original),filtered=hideDisabledModules(original,off)
  assert.equal(filtered.navigation.some(i=>i.href==='/celebrities'),false);assert.equal(JSON.stringify(original),before)
})

test('header display choices and descriptions survive localization and visibility without rewriting legacy trees', () => {
  const child = { id: 'learn', label: { fa: 'آموزش', en: 'Learn' }, href: '/blog', icon: '', description: { fa: 'مطالب آموزشی', en: 'Learning articles' } }
  const links = [{ id: 'home', label: { fa: 'خانه', en: 'Home' }, href: '/', menuDisplay: 'mega', menuColumns: 4, description: { fa: 'بخش‌های سایت', en: 'Explore' }, children: [child, { ...child, id: 'hidden', enabled: false }] }]
  assert.equal(validateMenu(links), true)
  const before = JSON.stringify(links), projected = menus.localizeMenu(menus.filterMenu(links, () => true), 'fa')[0]
  assert.equal(projected.menuDisplay, 'mega'); assert.equal(projected.menuColumns, 4); assert.equal(projected.description, 'بخش‌های سایت')
  assert.equal(projected.children.length, 1); assert.equal(projected.children[0].description, 'مطالب آموزشی'); assert.equal(projected.children[0].icon, '')
  assert.equal(menus.localizeMenu(links, 'en')[0].children[0].description, 'Learning articles')
  assert.equal(JSON.stringify(links), before)
  assert.deepEqual(menus.localizeMenu([{ label: child.label, href: '/' }], 'fa'), [{ id: undefined, label: 'آموزش', href: '/' }])
})

test('header display configuration rejects unknown modes, wrong column types and invalid or oversized captions', () => {
  const link = { label: { fa: 'خانه', en: 'Home' }, href: '/' }
  for (const menuDisplay of ['html', '', 1, {}, true]) assert.equal(validateMenu([{ ...link, menuDisplay }]), false)
  for (const menuColumns of [0, 1, 5, '3', 3.5, null]) assert.equal(validateMenu([{ ...link, menuColumns }]), false)
  for (const description of ['raw', {}, { fa: 'a', en: 1 }, { fa: 'a'.repeat(181), en: '' }]) assert.equal(validateMenu([{ ...link, description }]), false)
  assert.equal(validateMenu([{ ...link, menuDisplay: 'dropdown', menuColumns: 3, description: { fa: '', en: '' } }]), true)
})

test('nested menus preserve old links, explicit icon removal and hidden ancestor semantics', () => {
  const links = [{ label: { fa: 'مجله', en: 'Magazine' }, href: '/blog', icon: '', children: [{ label: { fa: 'آموزش', en: 'Learn' }, href: '/blog?category=learn', icon: 'book' }] }]
  assert.equal(validateMenu(links), true)
  assert.equal(menus.localizeMenu(links, 'fa')[0].icon, '')
  assert.equal(menus.localizeMenu(links, 'fa')[0].children[0].label, 'آموزش')
  assert.deepEqual(menus.filterMenu([{ ...links[0], enabled: false }], () => true), [])
  assert.equal(links[0].children.length, 1, 'public filtering never mutates stored branches')
  assert.deepEqual(menus.filterMenu(links, link => !link.href.startsWith('/blog')), [])
})

test('menus bound depth/size, reject unsafe descendants, duplicate IDs and wrong child shapes', () => {
  const leaf = () => ({ label: { fa: 'یک', en: 'One' }, href: '/' })
  let tree = [leaf()]
  for (let i = 1; i < menus.MENU_DEPTH; i++) tree = [{ ...leaf(), children: tree }]
  assert.equal(validateMenu(tree), true)
  assert.equal(validateMenu([{ ...leaf(), children: tree }]), false)
  assert.equal(validateMenu(Array.from({ length: menus.MENU_ITEMS + 1 }, leaf)), false)
  for (const children of [{}, 'x', { length: 0 }]) assert.equal(validateMenu([{ ...leaf(), children }]), false)
  assert.equal(validateMenu([{ ...leaf(), children: [{ ...leaf(), href: 'javascript:alert(1)' }] }]), false)
  assert.equal(validateMenu([{ ...leaf(), icon: '<svg onload=x>' }]), false)
  assert.equal(validateMenu([{ ...leaf(), id: 'same' }, { ...leaf(), id: 'same' }]), false)
  const site = load('src/modules/site/config/defaults').defaultSite
  assert.equal(validateSite({ ...site, footerAccount: tree, footerExplore: [], automaticPageLinks: false }), true)
})

test('automatic categories keep canonical IDs, prune hidden families and apply menu-only overrides', () => {
  const nodes = [{ id: 1, parentId: null, label: 'root', href: '/a', icon: 'book' }, { id: 2, parentId: 1, label: 'child', href: '/b' }, { id: 3, parentId: 2, label: 'deep', href: '/c' }, { id: 4, parentId: null, label: 'other', href: '/d' }]
  const cfg = mm.defaultSectionConfig()
  assert.deepEqual(menuNodes(nodes, { ...cfg, nodeOverrides: { c1: { hidden: true } } }).map(n => n.id), [4])
  assert.deepEqual(menuNodes(nodes.map(n => n.id === 1 ? { ...n, inMenu: false } : n), cfg).map(n => n.id), [4])
  const displayed = menuNodes(nodes, { ...cfg, itemOrder: ['c4'], nodeOverrides: { c1: { label: 'Changed', icon: '' } } })
  assert.equal(displayed[0].id, 4); assert.equal(displayed[1].label, 'Changed'); assert.equal(displayed[1].icon, '')
  assert.equal(nodes[0].label, 'root'); assert.equal(nodes[0].icon, 'book')
})

test('section settings preserve custom trees, allow restoring automatic icons and reject executable links', () => {
  const cfg = mm.normalizeSectionConfig({ customItems: [{ label: { fa: 'تازه', en: 'New' }, href: '/games', children: [{ label: { fa: 'آرشیو', en: 'Browse' }, href: '/games/browse', icon: '' }] }], homeIcon: '', nodeOverrides: { c1: { icon: '', label: 'New' }, 'Windows PC': { hidden: true } } })
  assert.equal(cfg.customItems[0].children[0].icon, '')
  assert.equal(cfg.nodeOverrides.c1.icon, '')
  assert.equal(mm.normalizeSectionConfig({ homeIcon: null }, cfg).homeIcon, undefined)
  assert.throws(() => mm.normalizeSectionConfig({ customItems: [{ label: { fa: 'بد', en: 'Bad' }, href: 'data:text/html,test' }] }))
  assert.throws(() => mm.normalizeSectionConfig({ nodeOverrides: JSON.parse('{"__proto__":{"hidden":true}}') }))
  assert.equal(mm.normalizeSectionConfig({ links: [{ label: 'Saved', href: '/blog', enabled: false }] }).links[0].enabled, false)
  assert.throws(() => mm.normalizeSectionConfig({ links: [{ label: 'Bad', href: '/blog', enabled: 'false' }] }))
})

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
  // dashboard and the admin shell can draw it without another request; the forum reads the same canonical picture.
  const auth = read('src/modules/identity/auth.ts')
  assert.match(auth, /select: \{ status: true, passwordChangedAt: true, name: true, telegramPhoto: true, userProfile: \{ select: \{ avatar: true \} \} \}/)
  assert.match(auth, /token\.picture = pictureOf\(current\) \|\| null/)
  assert.match(auth, /session\.user\.image = typeof token\.picture === 'string' && token\.picture \? token\.picture : null/)
  for (const shell of ['src/app/dashboard/layout.tsx', 'src/app/admin/layout.tsx']) assert.match(read(shell), /session\?\.user\?\.image \? <img src=\{session\.user\.image\} alt="" \/> : initial/, shell)
  assert.match(read('src/modules/forum/server/forum.ts'), /avatar: pictureOf\(user\)/)
  assert.match(read('src/modules/forum/server/forum.ts'), /await ensureUserProfiles\(ids\)/)
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
  assert.match(client, /mb-nav-measure" aria-hidden="true">\{links\.map\(link => <span key=\{link\.id \|\| link\.href\}><EntryIcon link=\{link\}\/>/)
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
  // Music, film & series and games in the light theme (owner, 2026-10-27): after the sections' own styles.
  assert.ok(imports.indexOf('media-light.css') > Math.max(imports.indexOf('media-design.css'), imports.indexOf('games-portal.css'), imports.indexOf('games-posts.css')), 'the light theme loads after the sections')
  const light = read('src/app/media-light.css')
  for (const rule of ['html[data-theme="light"] .md-cinema {', 'html[data-theme="light"] .md-games {', 'html[data-theme="light"] .md-music :is(.mu-hero, .mu-detail-hero) {', '.md-page a.mu-playlist { color: #fff; }']) assert.ok(light.includes(rule), rule)
  assert.doesNotMatch(light, /html\[data-theme="dark"\]/, 'the dark theme is left as it was')
  for (const section of ['cinema', 'games', 'software', 'forum']) assert.ok(css.includes(`.md-${section} .container:not(.mm-bar)`), section)
  assert.match(css, /width: var\(--mb-chrome, min\(1680px, 100% - 48px\)\); max-width: none; padding-inline: 0; \}/)
  // Every page (owner, 2026-10-27): 95–98% of the window. A page's column takes the theme's width, a column inside
  // another fills it, and the panels fill the space beside their menu.
  assert.match(css, /html\[data-design="mobocom"\] \.container:not\(\.mm-bar\) \{ width: var\(--mb-chrome\); max-width: none; padding-inline: 0; \}/)
  assert.match(css, /html\[data-design="mobocom"\] :is\(\.container, \.app-main\) \.container:not\(\.mm-bar\) \{ width: 100%; \}/)
  assert.match(css, /html\[data-design\] \.app-shell \.app-main, \.app-main > \.container, \.app-main > main \{ max-width: none; \}/)
  for (const file of ['src/themes/code/mobocom/theme.css', 'src/themes/generated.css']) {
    assert.ok(read(file).includes('html[data-design="mobocom"] { --mb-chrome: min(97%, 100% - 32px); }'), file)
    assert.ok(read(file).includes('@media (max-width: 620px) { html[data-design="mobocom"] { --mb-chrome: calc(100% - 20px); } }'), file)
  }
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

test('every menu has one admin page: header, section bars, footer and automatic pages (owner, 2026-10-28)', () => {
  const fs = require('node:fs'), path = require('node:path')
  const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n')
  const page = read('src/app/admin/menus/page.tsx')
  for (const tab of ["id: 'header'", "id: 'sections'", "id: 'footer'", "id: 'pages'"]) assert.ok(page.includes(tab), tab)
  // Each menu keeps its owner: site settings with the revision claim, the section bars' own save, a page's own flag.
  assert.match(page, /fetch\('\/api\/admin\/site', \{ method: 'PUT', headers: \{ 'Content-Type': 'application\/json', 'If-Match': revision \}/)
  assert.match(page, /<MegaMenuManager embedded \/>/)
  assert.match(page, /fetch\('\/api\/admin\/cms\?type=pages', \{ method: 'PATCH'[^\n]+JSON\.stringify\(\{ id: page\.id, showInNav \}\)/)
  for (const list of ["key: 'footer'", "key: 'footerExplore'", "key: 'footerAccount'"]) assert.ok(page.includes(list), list)
  // Old addresses and links land on it; the sidebar lists it once; Studio points to it instead of editing menus.
  assert.match(read('src/app/admin/mega-menu/page.tsx'), /redirect\('\/admin\/menus\?tab=sections'\)/)
  const layout = read('src/app/admin/layout.tsx')
  assert.match(layout, /href: '\/admin\/menus', label: L\('مدیریت منوها[^\n]+perm: 'settings\.manage'/)
  assert.doesNotMatch(layout, /href: '\/admin\/mega-menu'/)
  const studio = read('src/app/admin/studio/DesignTab.tsx')
  assert.match(studio, /href="\/admin\/menus"/)
  assert.doesNotMatch(studio, /MenuTreeEditor|MenuSectionPicker/)
})

test('page design templates: about, contact with its form, legal documents, chosen per page (owner, 2026-10-28)', () => {
  const fs = require('node:fs'), path = require('node:path')
  const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n')
  const layout = load('src/modules/site/server/page-layout')
  for (const choice of ['none', 'about', 'contact', 'legal']) assert.equal(layout.validatePageLayout({ companyPanel: choice }).companyPanel, choice)
  assert.throws(() => layout.validatePageLayout({ companyPanel: 'landing' }))
  // The page route hands the page's own text and form to the chosen template; the plain layout stays for the rest.
  const route = read('src/modules/site/server/pages/p/[slug]/page.tsx')
  assert.match(route, /template === 'about' && <AboutTemplate title=\{title\} body=\{templateBody\} \/>/)
  assert.match(route, /template === 'contact' && <ContactTemplate title=\{title\} body=\{templateBody\} form=\{attachedForm\?\.published \? publicForm\(parseForm\(attachedForm\)\) : null\} \/>/)
  assert.match(route, /template === 'legal' && <LegalTemplate title=\{title\} body=\{templateBody\} updatedAt=\{page\.updatedAt\} related=\{related\} \/>/)
  assert.match(route, /const hasLegacy = template === 'none' &&/)
  // Pages admin names the template and opens a new page with it; the seed gives starter pages theirs and a contact form.
  const admin = read('src/app/admin/pages/page.tsx')
  assert.match(admin, /key: 'companyPanel', label: 'قالب طراحی صفحه[^\n]+value: 'legal'/)
  for (const link of ['new=1&companyPanel=about', 'new=1&companyPanel=contact&formSlug=contact', 'new=1&companyPanel=legal']) assert.ok(admin.includes(link), link)
  const seed = read('prisma/seed.cjs')
  assert.match(seed, /contact: \{ companyPanel: 'contact', formSlug: 'contact' \}, terms: \{ companyPanel: 'legal' \}, refund: \{ companyPanel: 'legal' \}/)
  assert.match(seed, /if \(!await prisma\.siteForm\.findUnique\(\{ where: \{ slug: 'contact' \}/)
  assert.doesNotMatch(seed, /showInNav: true/, 'starter pages do not join the header by themselves')
  // The breadcrumb is one capsule, in the theme and its bundle alike.
  for (const file of ['src/themes/code/mobocom/theme.css', 'src/themes/generated.css']) assert.match(read(file), /\.mb-crumbs \{ display: inline-flex;/, file)
  assert.match(read('src/themes/code/mobocom/client.tsx'), /<span className="mb-crumbs">/)
})
