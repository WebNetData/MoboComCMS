// PostgreSQL contract checks. Authentication tokens and availability are injected;
// identity/permission resolution, transactions, claims, audit and category reads are real.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api')
process.env.NEXTAUTH_SECRET ||= 'owned-navigation-contract-fixture-secret'
if (!/^\/mobocom_navigation_/.test(new URL(process.env.DATABASE_URL).pathname)) throw Error('Use a disposable mobocom_navigation_* database for this contract suite')
const { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server'), db = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] })
let productReads = 0
db.$on('query', event => { if (event.query.startsWith('SELECT') && event.query.includes('"Product".') && !event.query.includes('"ProductCategory".')) productReads++ })
const stamp = `owned-navigation-${Date.now()}`, keys = ['site.config.v1', 'site.megamenu.v1'], snapshots = new Map(), cache = new Map(), users = [], roles = [], categories = [], productCategories = [], pages = [], vocabulary = [], disabledSources = new Set()
let token, storeOn = true, apiOn = true, runtime = {}
const mocks = {
  '@/platform/database/prisma': { db }, react: { cache: fn => fn },
  '@/platform/cache/kv': { cached: async (_key, _ttl, work) => work(), invalidate: async () => {} },
  '@/platform/observability/logger': { logEvent: () => {}, requestIdFrom: () => stamp },
  'next-auth/jwt': { getToken: async () => token },
  '@/extensions/server/modules': { isModuleEnabled: async id => !disabledSources.has(id), moduleGuard: async () => null },
  '@/extensions/server/state': { getPublicExtensionRuntime: async () => runtime },
  '@/modules/catalog/server/storefront': { isStoreEnabled: async () => storeOn },
  '@/modules/public-api/server/availability': { isPublicApiEnabled: async () => apiOn },
  '@/modules/forum/server/forum': { visibleCategories: async () => [] },
  '@/modules/forum/server/community': { viewerFor: async () => ({}) },
}
function load(relative) {
  const file = path.resolve(__dirname, '..', relative)
  if (cache.has(file)) return cache.get(file).exports
  const mod = { exports: {} }; cache.set(file, mod)
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
  function local(name) {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.resolve(__dirname, '../src', name.slice(2)) : path.resolve(path.dirname(file), name)
      if (base.endsWith('.json')) return require(base)
      for (const ext of ['.ts', '.tsx', '/index.ts']) if (fs.existsSync(base + ext)) return load(path.relative(path.resolve(__dirname, '..'), base + ext))
    }
    return require(name)
  }
  new Function('require', 'module', 'exports', code)(local, mod, mod.exports)
  return mod.exports
}
const request = (url, method = 'GET', body, revision) => new NextRequest('http://owned.invalid' + url, { method, headers: { origin: 'http://owned.invalid', 'content-type': 'application/json', ...(revision === undefined ? {} : { 'if-match': revision }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
const link = (fa, href, extra = {}) => ({ label: { fa, en: fa }, href, ...extra })
async function main() {
  try {
    for (const key of keys) snapshots.set(key, await db.setting.findUnique({ where: { key } }))
    for (const [name, permissions] of [['full', null], ['journal', 'cms.posts']]) {
      const role = permissions ? await db.role.create({ data: { name: stamp + name, permissions } }) : null
      if (role) roles.push(role.id)
      users.push(await db.user.create({ data: { email: stamp + name + '@example.invalid', passwordHash: 'owned fixture', role: 'ADMIN', roleId: role?.id, totpEnabledAt: new Date() } }))
    }
    token = { uid: users[0].id, authAt: Date.now() }
    const site = load('src/modules/site/server/http/admin/site/route.ts'), mega = load('src/modules/navigation/server/http/routes.ts'), owner = load('src/modules/navigation/server/megamenu.ts'), settings = load('src/modules/settings/server.ts'), defaults = load('src/modules/site/config/defaults.ts').defaultSite
    await db.setting.upsert({ where: { key: keys[0] }, create: { key: keys[0], value: JSON.stringify(defaults) }, update: { value: JSON.stringify(defaults) } })
    const before = await (await site.GET(request('/api/admin/site'))).json()
    const contact = load('src/modules/site/domain/company-contact.ts').normalizeCompanyContact({phone:'+98 111 222 3333',email:'owner@example.invalid',telegram:'@mobocom',latitude:36.474506,longitude:52.872342,mapEnabled:true})
    const next = { ...before.config, contact, navigation: [link('parent', '/blog', { icon: '', menuDisplay: 'mega', menuColumns: 4, description: { fa: 'بخش‌های مجله', en: 'Journal sections' }, children: [link('child', '/blog?category=learn', { icon: 'book', description: { fa: 'آموزش‌ها', en: 'Guides' } })] })], footerAccount: [] }
    let response = await site.PUT(request('/api/admin/site', 'PUT', next, before.revision)); assert.equal(response.status, 200)
    assert.deepEqual(JSON.parse((await db.setting.findUniqueOrThrow({ where: { key: keys[0] } })).value).navigation, next.navigation)
    assert.deepEqual(JSON.parse((await db.setting.findUniqueOrThrow({ where: { key: keys[0] } })).value).contact, contact)
    assert.deepEqual((await load('src/modules/site/config/store.ts').getPublicSiteConfig()).contact, contact)
    const invalidContact = await site.PUT(request('/api/admin/site','PUT',{...next,contact:{...contact,telegram:'https://evil.invalid/mobocom'}}))
    assert.equal(invalidContact.status,400);assert.deepEqual((await (await site.GET(request('/api/admin/site'))).json()).config.contact,contact)
    const savedHeader = (await (await site.GET(request('/api/admin/site'))).json()).config.navigation
    const publicHeader = load('src/modules/site/config/menus.ts').localizeMenu(savedHeader, 'fa')[0]
    assert.equal(publicHeader.menuDisplay, 'mega'); assert.equal(publicHeader.menuColumns, 4); assert.equal(publicHeader.description, 'بخش‌های مجله'); assert.equal(publicHeader.children[0].description, 'آموزش‌ها')
    const validStored = (await db.setting.findUniqueOrThrow({ where: { key: keys[0] } })).value
    for (const invalid of [{ menuDisplay: 'raw-html' }, { menuColumns: 9 }, { description: { fa: 'x'.repeat(181), en: '' } }]) {
      assert.equal((await site.PUT(request('/api/admin/site', 'PUT', { ...next, navigation: [{ ...next.navigation[0], ...invalid }] }))).status, 400)
      assert.equal((await db.setting.findUniqueOrThrow({ where: { key: keys[0] } })).value, validStored)
    }
    // Origin is enforced by the canonical middleware; actual HTTP/browser checks exercise it.
    assert.equal((await site.PUT(request('/api/admin/site', 'PUT', before.config, before.revision))).status, 409, 'stale Studio tab rejected')
    const fresh = await (await site.GET(request('/api/admin/site'))).json()
    const race = await Promise.all([site.PUT(request('/api/admin/site', 'PUT', { ...next, brand: 'first' }, fresh.revision)), site.PUT(request('/api/admin/site', 'PUT', { ...next, brand: 'second' }, fresh.revision))])
    assert.deepEqual(race.map(r => r.status).sort(), [200, 409], 'one concurrent writer wins')
    const audit = load('src/platform/audit/server.ts'), original = audit.auditAdminStrict
    const stored = await db.setting.findUniqueOrThrow({ where: { key: keys[0] } }), revision = (await (await site.GET(request('/api/admin/site'))).json()).revision
    audit.auditAdminStrict = async () => { throw Error('owned audit outage') }
    try { assert.equal((await site.PUT(request('/api/admin/site', 'PUT', { ...next, brand: 'must roll back' }, revision))).status, 500); assert.equal((await db.setting.findUniqueOrThrow({ where: { key: keys[0] } })).value, stored.value) } finally { audit.auditAdminStrict = original }
    token = { uid: users[1].id, authAt: Date.now() }
    assert.equal((await site.GET(request('/api/admin/site'))).status, 403)
    assert.equal((await mega.POST(request('/api/admin/mega-menu', 'POST', { enabled: false }))).status, 403)
    token = { uid: users[0].id, authAt: Date.now() }
    const start = await owner.megaMenuAdminState()
    const customItems = [link('custom', '/blog', { icon: 'star', children: [link('deep', '/blog?category=learn', { icon: '' })] })]
    response = await mega.POST(request('/api/admin/mega-menu', 'POST', { sections: { blog: { customItems } } }, start.revision)); assert.equal(response.status, 200)
    assert.equal((await mega.POST(request('/api/admin/mega-menu', 'POST', { enabled: false }, start.revision))).status, 409)
    const configured = await owner.getMegaConfig(), saved = await db.setting.findUniqueOrThrow({ where: { key: keys[1] } })
    audit.auditAdminStrict = async () => { throw Error('owned audit outage') }
    try { assert.equal((await mega.POST(request('/api/admin/mega-menu', 'POST', { enabled: false }, owner.megaConfigRevision(configured)))).status, 500); assert.equal((await db.setting.findUniqueOrThrow({ where: { key: keys[1] } })).value, saved.value) } finally { audit.auditAdminStrict = original }
    await owner.getSectionBar('blog') // Warm the rendering instance's tree.
    cache.delete(path.resolve(__dirname, '../src/modules/navigation/server/megamenu.ts'))
    const writer = load('src/modules/navigation/server/megamenu.ts')
    await writer.saveMegaConfig({ sections: { blog: { homeLabel: 'Another process saved this' } } })
    assert.equal((await owner.getSectionBar('blog')).homeLabel, 'Another process saved this', 'a different module instance cannot leave a stale rendered tree')
    const root = await db.postCategory.create({ data: { name: stamp, slug: stamp } }); categories.push(root.id)
    const child = await db.postCategory.create({ data: { name: stamp + '-child', slug: stamp + '-child', parentId: root.id } }); categories.push(child.id)
    const deep = await db.postCategory.create({ data: { name: stamp + '-deep', slug: stamp + '-deep', parentId: child.id } }); categories.push(deep.id)
    const cfg = { ...configured.sections.blog, links: [{ label: 'hidden quick', href: '/blog?hidden=1', enabled: false }], customItems: [...customItems, link('off', '/music', { children: [link('unrelated child', '/blog')] })], nodeOverrides: { ['c' + root.id]: { icon: '', label: 'Renamed in menu' } } }
    runtime = { music: { enabled: false, settings: {}, paths: ['/music'] } }
    const bar = await owner.buildSectionBar('blog', cfg)
    assert.equal(bar.items.find(i => i.key === 'c' + root.id).label, 'Renamed in menu')
    assert.equal(bar.items.find(i => i.key === 'c' + root.id).icon, '')
    assert.ok(!bar.items.some(i => i.href === '/music'), 'disabled custom branch omitted')
    assert.ok(!bar.quick.some(i => i.href === '/blog?hidden=1'), 'hidden quick link omitted without removing its saved row')
    assert.equal((await db.postCategory.findUniqueOrThrow({ where: { id: root.id } })).name, stamp, 'menu overrides do not rename category')
    const hidden = await owner.buildSectionBar('blog', { ...cfg, nodeOverrides: { ['c' + root.id]: { hidden: true } } })
    assert.ok(!hidden.items.some(i => i.key === 'c' + root.id || i.key === 'c' + child.id || i.key === 'c' + deep.id))
    assert.ok(hidden.categoryCatalog.some(i => i.key === 'c' + deep.id), 'hidden descendants remain editable')
    const longId = 'a'.repeat(80)
    const longBar = await owner.buildSectionBar('blog', { ...cfg, customItems: [link('long identity', '/blog', { id: longId })] })
    const customKey = longBar.items.find(i => i.label === 'long identity').key
    assert.ok(customKey.length <= 80)
    assert.equal(load('src/modules/navigation/domain/megamenu.ts').normalizeSectionConfig({ nodeOverrides: { [customKey]: { icon: '' } } }).nodeOverrides[customKey].icon, '', 'every accepted custom ID can be configured again')
    for (let i = 0; i < 13; i++) categories.push((await db.postCategory.create({ data: { name: stamp + i, slug: stamp + '-root-' + i } })).id)
    const large = await owner.buildSectionBar('blog', { ...cfg, customItems: [], features: 1 })
    assert.equal(large.items.length, 14, 'roots beyond the former twelve-item cap remain reachable')
    for (let i = 0; i < 13; i++) productCategories.push((await db.productCategory.create({ data: { name: stamp + i, slug: stamp + '-shop-' + i } })).id)
    productReads = 0
    const shop = await owner.buildSectionBar('shop', { ...configured.sections.shop, customItems: [], features: 1 })
    assert.equal(shop.items.length, 13)
    assert.equal(productReads, 12, 'the previous featured-content database query budget remains bounded')
    runtime = {}
    for (const status of ['PUBLISHED','DRAFT']) pages.push(await db.page.create({data:{slug:stamp+'-'+status,title:stamp+status,status,showInNav:true,content:'<p>owned</p>'}}))
    const home = await owner.buildSectionBar('home',configured.sections.home)
    assert.ok(home.items.some(i=>i.href==='/p/'+pages[0].slug));assert.ok(!home.items.some(i=>i.href==='/p/'+pages[1].slug))
    const category = await db.vocabulary.create({data:{section:'businesses',list:'CATEGORY',code:stamp,name:'Owned category',nameEn:'Owned',icon:'star',active:true}});vocabulary.push(category.id)
    const businesses = await owner.buildSectionBar('businesses',configured.sections.businesses)
    assert.equal(businesses.categoryCatalog.find(i=>i.key==='c'+category.id).href,'/businesses?'+new URLSearchParams({category:stamp}))
    const preset = load('src/modules/navigation/domain/presets.ts').sectionMenuPreset('businesses',businesses)
    assert.ok(preset.children.some(i=>i.href==='/businesses?'+new URLSearchParams({category:stamp})))
    const artists = await owner.buildSectionBar('celebrities',configured.sections.celebrities)
    assert.ok(artists.items.some(i=>i.href==='/celebrities?role=actor'));assert.ok(artists.items.some(i=>i.href==='/celebrities?role=singer'))
    disabledSources.add('cinema')
    const musicOnly = await owner.buildSectionBar('celebrities',configured.sections.celebrities)
    assert.ok(musicOnly.items.some(i=>i.key==='singer'));assert.ok(!musicOnly.items.some(i=>i.key==='actor'));disabledSources.clear()
    runtime = {music:{enabled:false,paths:['/music']},cinema:{enabled:false,paths:['/cinema']}}
    const hiddenPeople = await owner.buildSectionBar('home',{...configured.sections.home,customItems:[load('src/modules/navigation/domain/presets.ts').sectionMenuPreset('celebrities',artists)]})
    assert.ok(!hiddenPeople.items.some(i=>i.href.startsWith('/celebrities')),'stored recipes also follow both source switches');runtime={}
    const history=load('src/modules/site/config/history.ts'),snapshot=history.siteSettingsSnapshot(next)
    const freshContact=(await (await site.GET(request('/api/admin/site'))).json())
    assert.equal((await site.PUT(request('/api/admin/site','PUT',{...freshContact.config,contact:{...contact,address:'changed'}},freshContact.revision))).status,200)
    await history.restoreSiteSettings(1,snapshot,async()=>{})
    assert.deepEqual((await (await site.GET(request('/api/admin/site'))).json()).config.contact,contact,'contact restore uses canonical Studio history')
    const mapOff = await (await site.GET(request('/api/admin/site'))).json()
    assert.equal((await site.PUT(request('/api/admin/site','PUT',{...mapOff.config,contact:{...contact,mapEnabled:false}},mapOff.revision))).status,200)
    const publicContact = (await load('src/modules/site/config/store.ts').getPublicSiteConfig()).contact
    assert.equal(publicContact.latitude,null);assert.equal(publicContact.longitude,null)
    assert.equal((await (await site.GET(request('/api/admin/site'))).json()).config.contact.latitude,contact.latitude,'map off hides public coordinates without deleting the saved pin')
    const layout=load('src/modules/site/server/page-layout.ts')
    await db.setting.create({data:{key:'page.layout.'+pages[0].id,value:JSON.stringify(layout.validatePageLayout({companyPanel:'contact'}))}})
    assert.equal((await layout.getPageLayout(pages[0].id)).companyPanel,'contact');assert.equal((await layout.getPageLayout(pages[1].id)).companyPanel,'none')
    await assert.rejects(() => settings.updateJsonSetting(keys[1], async () => { throw Error('owned work failure') }), /owned work failure/)
    console.log('Connected PostgreSQL: nested persistence, stale/concurrent claims, transactional audit rollback, real section permissions, canonical category IDs, hidden families and disabled custom branches passed.')
  } finally {
    await db.setting.deleteMany({where:{key:{in:pages.map(p=>'page.layout.'+p.id)}}});await db.page.deleteMany({where:{id:{in:pages.map(p=>p.id)},slug:{startsWith:stamp}}});await db.vocabulary.deleteMany({where:{id:{in:vocabulary},code:stamp}})
    for (const id of [...categories].reverse()) await db.postCategory.deleteMany({ where: { id, slug: { startsWith: stamp } } })
    await db.productCategory.deleteMany({ where: { id: { in: productCategories }, slug: { startsWith: stamp } } })
    for (const [key, row] of snapshots) { if (row) await db.setting.upsert({ where: { key }, create: row, update: { value: row.value } }); else await db.setting.deleteMany({ where: { key } }) }
    await db.contentRevision.deleteMany({ where: { actorId: { in: users.map(u => u.id) } } })
    await db.auditLog.deleteMany({ where: { actorUserId: { in: users.map(u => u.id) } } })
    await db.user.deleteMany({ where: { id: { in: users.map(u => u.id) }, email: { startsWith: stamp } } }); await db.role.deleteMany({ where: { id: { in: roles } } })
    await db.$disconnect()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
