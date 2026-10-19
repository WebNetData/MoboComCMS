// Real PostgreSQL staff members and their saved views through the saved-views service, plus the pure rules
// of the workspace shortcuts. Only this script's members and their views are touched.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `aview${Date.now()}`
const state = { admin: null }
const cache = new Map()
function load(file) {
  const full = path.resolve(file.endsWith('.ts') ? file : `${file}.ts`)
  if (cache.has(full)) return cache.get(full).exports
  const mod = { exports: {} }; cache.set(full, mod)
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(full, 'utf8'), { fileName: full, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText)(name => {
    if (name === '@/platform/database/prisma') return { db: prisma }
    if (name === '@/modules/identity/server/access') return { requireAdmin: async () => state.admin }
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}`)
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const views = load('src/modules/identity/server/saved-views.ts'), rules = load('src/modules/identity/domain/saved-views.ts')
const refused = async (promise, status, why) => { const error = await promise.then(() => null, caught => caught); assert.equal(error?.status, status, `${why}: expected ${status}, got ${error ? `${error.status} ${error.message}` : 'success'}`) }

async function main() {
  // ---- what may be saved: an address of the admin panel on this site
  assert.deepEqual(['/admin', '/admin/audit?targetType=posts&from=2026-10-01', '/admin/store/orders?status=PAID#top', '/dashboard', 'https://evil.invalid/admin', '//evil.invalid/admin', '/administrator', '/admin/../etc', '/admin?x=<script>', `/admin?${'x'.repeat(600)}`, ''].map(rules.normalizeViewHref),
    ['/admin', '/admin/audit?targetType=posts&from=2026-10-01', '/admin/store/orders?status=PAID', null, null, null, null, null, null, null, null])
  assert.deepEqual([rules.cleanViewName('  <b>paid</b>   orders  '), rules.cleanViewName('x'.repeat(200)).length], ['bpaid/b orders', rules.MAX_VIEW_NAME])

  // ---- shortcuts never take a key from writing
  const key = (k, extra = {}) => rules.shortcutFor({ key: k, typing: false, modifier: false, pending: false, ...extra })
  assert.deepEqual([key('/'), key('?'), key('s'), key('v'), key('g'), key('x'), key('m')], [{ kind: 'search' }, { kind: 'help' }, { kind: 'save' }, { kind: 'views' }, { kind: 'wait' }, null, null])
  assert.deepEqual([key('m', { pending: true }), key('M', { pending: true }), key('z', { pending: true }), key('s', { typing: true }), key('/', { typing: true }), key('s', { modifier: true }), key('m', { pending: true, typing: true })], [{ kind: 'go', href: '/admin/moderation' }, { kind: 'go', href: '/admin/moderation' }, null, null, null, null, null], 'g then a letter goes somewhere; while typing or with Ctrl held nothing happens')
  assert.equal(new Set(rules.ADMIN_GO.map(item => item.key)).size, rules.ADMIN_GO.length)

  // ---- a staff member's own list
  const staff = name => prisma.user.create({ data: { email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only', role: 'ADMIN' } })
  const ana = await staff('ana'), bob = await staff('bob')
  const names = async user => (await views.listSavedViews(user.id)).map(view => [view.name, view.href])
  const first = await views.saveView(ana.id, { name: 'paid orders', href: '/admin/store/orders?status=PAID' })
  await new Promise(resolve => setTimeout(resolve, 10)); await views.saveView(ana.id, { name: 'my audit', href: '/admin/audit?targetType=posts' })
  await views.saveView(bob.id, { name: 'paid orders', href: '/admin/store/orders?status=PAID&page=2' })
  assert.deepEqual([await names(ana), await names(bob)], [[['my audit', '/admin/audit?targetType=posts'], ['paid orders', '/admin/store/orders?status=PAID']], [['paid orders', '/admin/store/orders?status=PAID&page=2']]], 'newest first; the same name is another member\'s own view')
  const again = await views.saveView(ana.id, { name: 'paid orders', href: '/admin/store/orders?status=PAID&sort=new' })
  assert.deepEqual([again.id, (await names(ana)).length, (await names(ana)).find(view => view[0] === 'paid orders')[1]], [first.id, 2, '/admin/store/orders?status=PAID&sort=new'], 'the same name again replaces where it points')
  await refused(views.saveView(ana.id, { name: '  ', href: '/admin' }), 400, 'no name')
  await refused(views.saveView(ana.id, { name: 'outside', href: '/dashboard' }), 400, 'an address outside the admin panel')
  await refused(views.deleteView(bob.id, first.id), 404, 'deleting a colleague\'s view')
  assert.deepEqual([await views.deleteView(ana.id, first.id), (await names(ana)).length], [{ deleted: true }, 1])
  // The limit, and that replacing an existing name is still allowed at the limit.
  for (let n = (await names(bob)).length; n < rules.MAX_SAVED_VIEWS; n++) await views.saveView(bob.id, { name: `view ${n}`, href: `/admin?n=${n}` })
  await refused(views.saveView(bob.id, { name: 'one too many', href: '/admin' }), 409, 'past the limit')
  assert.equal((await views.saveView(bob.id, { name: 'paid orders', href: '/admin/store/orders' })).href, '/admin/store/orders')

  // ---- the address the panel calls
  const get = () => views.GET_views({ headers: new Headers() })
  const post = (body, headers = {}) => views.POST_views({ headers: new Headers(headers), json: async () => body })
  assert.deepEqual([(await get()).status, (await post({ name: 'x', href: '/admin' })).status], [403, 403], 'a member who is not staff has no views')
  state.admin = { id: ana.id }
  assert.deepEqual([(await (await get()).json()).views.length, (await post({ name: 'from elsewhere', href: '/admin' }, { origin: 'https://elsewhere.invalid', host: 'site.invalid' })).status, (await post({ name: 'kept', href: '/admin/moderation' })).status, (await post({ name: 'bad', href: 'javascript:alert(1)' })).status], [1, 403, 201, 400])
  console.log('PostgreSQL admin saved views: what may be saved, each staff member\'s own list, replacing by name, the limit, and shortcuts that never act while typing passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try { await prisma.user.deleteMany({ where: { email: { startsWith: seed } } }) } finally { await prisma.$disconnect() }
})
