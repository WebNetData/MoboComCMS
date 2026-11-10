// Real PostgreSQL: who sees a popup and how often, on two connections like two server processes. Every kind of site group
// is read from its own real rows. Only the module switches are a double. POPUP_FAULT=claim drops the claim on the row;
// POPUP_FAULT=expired reads a VIP period that has ended as if it were live.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), other = new PrismaClient(), prefix = `site-popups-${Date.now()}`, ids = { users: [], popups: [], roles: [], plans: [], forum: [], products: [] }
const fault = process.env.POPUP_FAULT || ''

function instance(db) {
  const cache = new Map()
  const mocks = {
    '@/platform/database/prisma': { db },
    '@/platform/observability/logger': { logEvent: () => {} },
    '@/extensions/server/modules': { isModuleEnabled: async () => true },
    '@/extensions/generated/catalog': { extensionPermissionIds: ['popups.manage'] },
  }
  const load = (file) => {
    if (cache.has(file)) return cache.get(file).exports
    const mod = { exports: {} }; cache.set(file, mod)
    let text = fs.readFileSync(file, 'utf8')
    if (fault === 'claim' && file.endsWith('server/popups.ts')) text = text.replace('where: { id: seen.id, views: seen.views }', 'where: { id: seen.id }')
    if (fault === 'expired' && file.endsWith('server/site-groups.ts')) text = text.replace(', endsAt: { gt: now } })', ' })')
    new Function('require', 'module', 'exports', ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText)((name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name]
      // Owners import by @/ path or relative to their own file; JSON manifests are data.
      if (name.startsWith('@/') || name.startsWith('.')) {
        const base = name.startsWith('@/') ? `src/${name.slice(2)}` : path.relative(process.cwd(), path.resolve(path.dirname(file), name)).split(path.sep).join('/')
        if (base.endsWith('.json')) return JSON.parse(fs.readFileSync(base, 'utf8'))
        return load(fs.existsSync(`${base}.ts`) ? `${base}.ts` : `${base}/index.ts`)
      }
      return require(name)
    }, mod, mod.exports)
    return mod.exports
  }
  return Object.assign({}, load('src/modules/popups/server/popups.ts'), { __catalog: load('src/modules/account/server/site-groups.ts').siteGroupCatalog })
}

const member = async (key) => { const row = await prisma.user.create({ data: { email: `${prefix}-${key}@example.invalid`, passwordHash: 'test-only' } }); ids.users.push(row.id); return { id: row.id, email: row.email, role: 'CUSTOMER', roleId: null, permissions: null, twoFactor: false } }
const manager = (id, permissions) => ({ id, email: 'x', role: 'ADMIN', roleId: permissions ? 1 : null, permissions, twoFactor: true })
const HOUR = 3_600_000

async function main() {
  const one = instance(prisma), two = instance(other)
  const make = async (fields) => { one.forgetLivePopups(); two.forgetLivePopups(); const row = await one.savePopup({ title: `${prefix} ${ids.popups.length}`, status: 'ACTIVE', ...fields }, null); ids.popups.push(row.id); return row }
  const sees = async (user, id, now = new Date()) => { one.forgetLivePopups(); return (await one.popupsFor(user, now)).some((popup) => popup.id === id) }
  const show = (user, id, now) => { one.forgetLivePopups(); return one.recordSeen(id, user, now) }

  // Every 24 hours, ten times in all.
  const ali = await member('ali'), start = new Date()
  const daily = await make({ repeatHours: 24, maxViews: 10 })
  assert.equal(await sees(ali, daily.id, start), true, 'first visit')
  assert.equal(await show(ali, daily.id, start), true)
  assert.equal(await sees(ali, daily.id, new Date(start.getTime() + 23 * HOUR)), false, 'not before its time')
  assert.equal(await show(ali, daily.id, new Date(start.getTime() + 23 * HOUR)), false, 'a request cannot count it early')
  for (let day = 1; day < 10; day++) {
    const at = new Date(start.getTime() + day * 24 * HOUR)
    assert.equal(await sees(ali, daily.id, at), true, `day ${day}`)
    assert.equal(await show(ali, daily.id, at), true)
  }
  const after = new Date(start.getTime() + 40 * 24 * HOUR)
  assert.equal(await sees(ali, daily.id, after), false, 'never past ten')
  assert.equal(await show(ali, daily.id, after), false)
  assert.equal((await prisma.sitePopupSeen.findFirst({ where: { popupId: daily.id, userId: ali.id } })).views, 10)

  // Every 48 hours, and only once.
  const sara = await member('sara')
  const everyOther = await make({ repeatHours: 48 }), once = await make({ repeatHours: 0 })
  await show(sara, everyOther.id, start); await show(sara, once.id, start)
  assert.equal(await sees(sara, everyOther.id, new Date(start.getTime() + 47 * HOUR)), false)
  assert.equal(await sees(sara, everyOther.id, new Date(start.getTime() + 49 * HOUR)), true)
  assert.equal(await sees(sara, once.id, new Date(start.getTime() + 999 * HOUR)), false, 'once means once')

  // Two tabs or devices at the same moment count once, first and later showings alike.
  const reza = await member('reza')
  const raced = await make({ repeatHours: 24 })
  one.forgetLivePopups(); two.forgetLivePopups()
  await Promise.all([one.recordSeen(raced.id, reza, start), two.recordSeen(raced.id, reza, start)])
  assert.equal((await prisma.sitePopupSeen.findFirst({ where: { popupId: raced.id, userId: reza.id } })).views, 1)
  const later = new Date(start.getTime() + 25 * HOUR)
  one.forgetLivePopups(); two.forgetLivePopups()
  for (let round = 0; round < 8; round++) await Promise.all([one.recordSeen(raced.id, reza, new Date(later.getTime() + round * 25 * HOUR)), two.recordSeen(raced.id, reza, new Date(later.getTime() + round * 25 * HOUR))])
  assert.equal((await prisma.sitePopupSeen.findFirst({ where: { popupId: raced.id, userId: reza.id } })).views, 9, 'one count for each day')

  // Each audience, with every kind of site group built from its own rows.
  const plain = await member('plain'), staffRow = await member('staff')
  const person = async (key, build) => { const user = await member(key); await build(user); return user }
  const role = await prisma.role.create({ data: { name: `${prefix}-role`, nameFa: 'پشتیبان', permissions: 'dashboard.view' } }); ids.roles.push(role.id)
  const plan = await prisma.membershipPlan.create({ data: { slug: prefix, name: 'طلایی', days: 30 } }), plan2 = await prisma.membershipPlan.create({ data: { slug: `${prefix}-2`, name: 'نقره‌ای', days: 30 } }); ids.plans.push(plan.id, plan2.id)
  const forum = await prisma.forumGroup.create({ data: { slug: prefix, name: 'گروه تالار' } }); ids.forum.push(forum.id)
  const hour = (n) => new Date(Date.now() + n * HOUR)
  const product = await prisma.product.create({ data: { slug: prefix, name: prefix, price: 1, priceMinor: 1n, currency: 'IRT', stock: 1, approval: 'APPROVED' } }); ids.products.push(product.id)
  const order = (user, status, key) => prisma.order.create({ data: { userId: user.id, productId: product.id, status, totalAmount: 1, totalMinor: 1n, currency: 'IRT', idempotencyKey: `${prefix}-${key}` } })
  const roled = await person('roled', (u) => prisma.user.update({ where: { id: u.id }, data: { roleId: role.id } }))
  const vip = await person('vip', (u) => prisma.userMembership.create({ data: { userId: u.id, planId: plan.id, startsAt: hour(-1), endsAt: hour(100) } }))
  const lapsed = await person('lapsed', (u) => prisma.userMembership.create({ data: { userId: u.id, planId: plan.id, startsAt: hour(-100), endsAt: hour(-1) } }))
  const revoked = await person('revoked', (u) => prisma.userMembership.create({ data: { userId: u.id, planId: plan.id, startsAt: hour(-1), endsAt: hour(100), revokedAt: hour(-1) } }))
  const buyer = await person('buyer', (u) => order(u, 'PAID', 'paid'))
  const unpaid = await person('unpaid', (u) => order(u, 'PENDING', 'pending'))
  const seller = await person('seller', (u) => prisma.seller.create({ data: { userId: u.id, slug: `${prefix}-s`, shopName: 'فروشگاه', status: 'ACTIVE' } }))
  const pendingSeller = await person('pendingseller', (u) => prisma.seller.create({ data: { userId: u.id, slug: `${prefix}-p`, shopName: 'منتظر', status: 'PENDING' } }))
  const tagged = await person('tagged', (u) => prisma.crmTag.create({ data: { userId: u.id, tag: 'مشتری ویژه' } }))
  const forumer = await person('forumer', (u) => prisma.forumGroupMember.create({ data: { groupId: forum.id, userId: u.id } }))
  const waiting = await person('waiting', (u) => prisma.forumGroupMember.create({ data: { groupId: forum.id, userId: u.id, status: 'PENDING' } }))
  const magazine = manager(staffRow.id, ['dashboard.view', 'cms.posts']), store = manager(staffRow.id, ['dashboard.view', 'cms.products', 'orders.manage']), partial = manager(staffRow.id, ['dashboard.view', 'cms.products']), full = manager(staffRow.id, null)
  const table = [
    [{ audience: 'ALL' }, { guest: true, plain: true, magazine: true }],
    [{ audience: 'GUESTS' }, { guest: true, plain: false, vip: false, magazine: false, full: false }],
    [{ audience: 'MEMBERS' }, { guest: false, plain: true, magazine: true }],
    [{ audience: 'GROUPS', groupIds: [`role:${role.id}`] }, { guest: false, plain: false, roled: true, vip: false }],
    [{ audience: 'GROUPS', groupIds: ['vip'] }, { guest: false, plain: false, vip: true, lapsed: false, revoked: false }],
    [{ audience: 'GROUPS', groupIds: [`vip-plan:${plan.id}`] }, { vip: true, lapsed: false, plain: false }],
    [{ audience: 'GROUPS', groupIds: [`vip-plan:${plan2.id}`] }, { vip: false }],
    [{ audience: 'GROUPS', groupIds: ['buyers'] }, { buyer: true, unpaid: false, plain: false, guest: false }],
    [{ audience: 'GROUPS', groupIds: ['sellers'] }, { seller: true, pendingSeller: false, plain: false }],
    [{ audience: 'GROUPS', groupIds: ['crm:مشتری ویژه'] }, { tagged: true, plain: false }],
    [{ audience: 'GROUPS', groupIds: [`forum:${forum.id}`] }, { forumer: true, waiting: false, plain: false }],
    [{ audience: 'GROUPS', groupIds: ['buyers', 'crm:مشتری ویژه'] }, { buyer: true, tagged: true, vip: false }],
    [{ audience: 'ALL_MANAGERS' }, { guest: false, plain: false, vip: false, magazine: true, store: true, full: true }],
    [{ audience: 'SECTION_MANAGERS', sections: ['magazine'] }, { guest: false, plain: false, magazine: true, store: false, full: true }],
    [{ audience: 'SECTION_MANAGERS', sections: ['store'] }, { magazine: false, store: true, partial: false, full: true }],
  ]
  const people = { guest: null, plain, roled, vip, lapsed, revoked, buyer, unpaid, seller, pendingSeller, tagged, forumer, waiting, magazine, store, partial, full }
  for (const [fields, wanted] of table) {
    const row = await make(fields)
    for (const [name, expected] of Object.entries(wanted)) assert.equal(await sees(people[name], row.id), expected, `${JSON.stringify(fields)} / ${name}`)
    await one.setPopupStatus(row.id, 'PAUSED')
  }
  const catalog = await one.__catalog()
  const count = (key) => catalog.find((group) => group.key === key)?.count
  assert.equal(count(`role:${role.id}`), 1); assert.equal(count(`vip-plan:${plan.id}`), 1, 'lapsed and revoked periods are not counted')
  assert.equal(count(`forum:${forum.id}`), 0, 'its own stored count'); assert.equal(count('crm:مشتری ویژه'), 1)
  for (const key of ['vip', 'buyers', 'subscribers', 'sellers', 'resellers']) assert.ok(catalog.some((group) => group.key === key), key)
  // A viewer outside the audience cannot add to a count by asking.
  const managersOnly = await make({ audience: 'ALL_MANAGERS' })
  assert.equal(await show(plain, managersOnly.id, start), false)
  assert.equal(await prisma.sitePopupSeen.count({ where: { popupId: managersOnly.id } }), 0)

  // Schedule, pause and starting again.
  const scheduled = await make({ startsAt: new Date(Date.now() + HOUR), endsAt: new Date(Date.now() + 2 * HOUR) })
  assert.equal(await sees(plain, scheduled.id), false, 'not before its start')
  assert.equal(await sees(plain, scheduled.id, new Date(Date.now() + 1.5 * HOUR)), true)
  assert.equal(await sees(plain, scheduled.id, new Date(Date.now() + 3 * HOUR)), false, 'not after its end')
  const paused = await make({})
  await one.setPopupStatus(paused.id, 'PAUSED')
  assert.equal(await sees(plain, paused.id), false)
  const again = await make({ repeatHours: 0 })
  await show(plain, again.id, start)
  assert.equal(await sees(plain, again.id), false)
  await one.restartPopup(again.id)
  assert.equal(await sees(plain, again.id), true, 'shown to everyone again')
  assert.equal((await prisma.sitePopup.findUnique({ where: { id: again.id } })).revision, 2, 'guests start again too')

  // Guests are counted on the popup; the browser keeps their own rule.
  const open = await make({})
  assert.equal(await show(null, open.id, start), true)
  assert.equal((await prisma.sitePopup.findUnique({ where: { id: open.id } })).guestViews, 1)
  await assert.rejects(() => one.savePopup({ title: 'x y', actionLabel: 'رفتن', actionUrl: 'javascript:alert(1)' }, null), /نشانی/)
  await assert.rejects(() => one.savePopup({ title: 'x y', audience: 'GROUPS' }, null), /گروه/)
  // A popup saved with the forum's group ids keeps those groups, and repeating the step changes nothing.
  const older = await prisma.sitePopup.create({ data: { title: `${prefix} older`, audience: 'GROUPS', groupIds: '[3,4]' } }); ids.popups.push(older.id)
  const step = fs.readFileSync('prisma/migrations/20270206120000_popup_site_groups/migration.sql', 'utf8').split('\n').filter((line) => !line.startsWith('--')).join('\n')
  for (let run = 0; run < 2; run++) await prisma.$executeRawUnsafe(step)
  assert.deepEqual(JSON.parse((await prisma.sitePopup.findUnique({ where: { id: older.id } })).groupIds), ['forum:3', 'forum:4'])
  console.log('Site popups: 24h with a total, 48h, once, concurrent showings, six audiences, every kind of site group, schedule, pause, restart, guests and stored groups passed')
}

main().catch((error) => { console.error(error.stack); process.exitCode = 1 }).finally(async () => {
  try {
    await prisma.sitePopup.deleteMany({ where: { id: { in: ids.popups } } })
    await prisma.order.deleteMany({ where: { userId: { in: ids.users } } })
    await prisma.seller.deleteMany({ where: { userId: { in: ids.users } } })
    await prisma.crmTag.deleteMany({ where: { userId: { in: ids.users } } })
    await prisma.userMembership.deleteMany({ where: { userId: { in: ids.users } } })
    await prisma.forumGroup.deleteMany({ where: { id: { in: ids.forum } } })
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
    await prisma.role.deleteMany({ where: { id: { in: ids.roles } } })
    await prisma.membershipPlan.deleteMany({ where: { id: { in: ids.plans } } })
    await prisma.product.deleteMany({ where: { id: { in: ids.products } } })
  } finally { await prisma.$disconnect(); await other.$disconnect() }
})
