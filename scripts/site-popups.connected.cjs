// Real PostgreSQL: who sees a popup and how often, on two connections like two server processes. Only the forum's group
// resolver is a double; rows, counts and the concurrency claim are real. POPUP_FAULT=claim drops the claim on the row.
const fs = require('node:fs'), assert = require('node:assert/strict')
const ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), other = new PrismaClient(), prefix = `site-popups-${Date.now()}`, ids = { users: [], popups: [] }
const fault = process.env.POPUP_FAULT || '', groups = new Map()

function instance(db) {
  const cache = new Map()
  const mocks = {
    '@/platform/database/prisma': { db },
    '@/platform/observability/logger': { logEvent: () => {} },
    '@/modules/forum/server/community': { viewerFor: async (id) => ({ groupIds: groups.get(id ?? 0) || [] }) },
    '@/extensions/generated/catalog': { extensionPermissionIds: ['popups.manage'] },
  }
  const load = (file) => {
    if (cache.has(file)) return cache.get(file).exports
    const mod = { exports: {} }; cache.set(file, mod)
    let text = fs.readFileSync(file, 'utf8')
    if (fault === 'claim' && file.endsWith('server/popups.ts')) text = text.replace('where: { id: seen.id, views: seen.views }', 'where: { id: seen.id }')
    new Function('require', 'module', 'exports', ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText)((name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name]
      if (name.startsWith('@/')) { const base = `src/${name.slice(2)}`; return load(fs.existsSync(`${base}.ts`) ? `${base}.ts` : `${base}/index.ts`) }
      return require(name)
    }, mod, mod.exports)
    return mod.exports
  }
  return load('src/modules/popups/server/popups.ts')
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

  // Each audience.
  const plain = await member('plain'), grouped = await member('grouped'), staffRow = await member('staff')
  groups.set(grouped.id, [7, 8]); groups.set(0, [1])
  const magazine = manager(staffRow.id, ['dashboard.view', 'cms.posts']), store = manager(staffRow.id, ['dashboard.view', 'cms.products', 'orders.manage']), partial = manager(staffRow.id, ['dashboard.view', 'cms.products']), full = manager(staffRow.id, null)
  const table = [
    [{ audience: 'ALL' }, { guest: true, plain: true, magazine: true }],
    [{ audience: 'GUESTS' }, { guest: true, plain: false, grouped: false, magazine: false, full: false }],
    [{ audience: 'MEMBERS' }, { guest: false, plain: true, magazine: true }],
    [{ audience: 'GROUPS', groupIds: [8] }, { guest: false, plain: false, grouped: true }],
    [{ audience: 'GROUPS', groupIds: [1] }, { guest: true, plain: false }],
    [{ audience: 'ALL_MANAGERS' }, { guest: false, plain: false, grouped: false, magazine: true, store: true, full: true }],
    [{ audience: 'SECTION_MANAGERS', sections: ['magazine'] }, { guest: false, plain: false, magazine: true, store: false, full: true }],
    [{ audience: 'SECTION_MANAGERS', sections: ['store'] }, { magazine: false, store: true, partial: false, full: true }],
  ]
  const people = { guest: null, plain, grouped, magazine, store, partial, full }
  for (const [fields, wanted] of table) {
    const row = await make(fields)
    for (const [name, expected] of Object.entries(wanted)) assert.equal(await sees(people[name], row.id), expected, `${JSON.stringify(fields)} / ${name}`)
    await one.setPopupStatus(row.id, 'PAUSED')
  }
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
  console.log('Site popups: 24h with a total, 48h, once, concurrent showings, six audiences, schedule, pause, restart and guests passed')
}

main().catch((error) => { console.error(error.stack); process.exitCode = 1 }).finally(async () => {
  try {
    await prisma.sitePopup.deleteMany({ where: { id: { in: ids.popups } } })
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
  } finally { await prisma.$disconnect(); await other.$disconnect() }
})
