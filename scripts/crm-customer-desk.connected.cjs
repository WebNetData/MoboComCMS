const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const parse = new URL(process.env.DATABASE_URL)
assert(parse.protocol === 'file:' ? /test|check/i.test(parse.pathname) : /^postgres(?:ql)?:$/.test(parse.protocol) && /test|check/i.test(parse.pathname))
const db = new PrismaClient()
const load = require('./connected-source-loader.cjs')({ '@/platform/database/prisma': { db } })
const { crmSearch } = load('src/modules/livechat/server/crm-desk.ts')
const { crmDeskFilters } = load('src/modules/livechat/domain/crm-desk.ts')
const { customerSegment } = load('src/modules/livechat/domain/livechat.ts')
const stamp = randomUUID().slice(0, 10)
const now = new Date('2026-11-27T09:00:00Z')
const day = 86400000
const ago = (days, ms = 0) => new Date(now.getTime() - days * day + ms)
const email = key => `${stamp}-${key}@example.invalid`
const all = () => db.user.findMany({ where: { email: { startsWith: stamp } }, select: { id: true } })
const search = filters => crmSearch(crmDeskFilters(new URLSearchParams({ q: stamp, ...filters })), now)

async function main() {
  const make = (key, data = {}) => db.user.create({ data: { email: email(key), name: `${stamp} ${key}`, passwordHash: 'fixture-only', ...data } })
  const order = (userId, createdAt, currency = 'IRT', totalMinor = 10n, status = 'PAID') =>
    db.order.create({ data: { userId, createdAt, currency, totalMinor, totalAmount: Number(totalMinor), status } })
  const older = await make('older', { phone: '+989121234567' })
  await order(older.id, ago(181), 'IRR', 125n)
  await order(older.id, ago(182), 'IRT', 250n)
  await order(older.id, ago(1), 'IRT', 990n, 'PENDING')
  await db.crmTag.create({ data: { userId: older.id, tag: stamp } })
  await db.user.createMany({ data: Array.from({ length: 70 }, (_, i) => ({ email: email(`latest-${i}`), name: `${stamp} مشتری ${i}`, passwordHash: 'fixture-only' })) })
  const blocked = await make('blocked', { status: 'BANNED' })
  await db.crmTag.create({ data: { userId: blocked.id, tag: stamp } })
  await make('staff', { role: 'ADMIN' })
  await make('erased', { erasedAt: now, status: 'BANNED' })
  const loyalty = await make('loyal')
  for (let i = 0; i < 5; i++) await order(loyalty.id, ago(61, 1))
  const atRisk = await make('at-risk')
  await order(atRisk.id, ago(91))
  const stillNew = await make('new')
  await order(stillNew.id, ago(91, 1))

  const first = await search({})
  const second = await search({ page: '2' })
  const last = await search({ page: '1000' })
  assert.equal(first.rows.length, 25)
  assert.deepEqual(first.summary, { total: 75, buyers: 4, needsFollowUp: 2 })
  assert(second.rows.every(row => !first.rows.some(firstRow => firstRow.id === row.id)))
  assert.equal(last.page, 3)
  assert(last.rows.some(row => row.id === older.id))
  assert.deepEqual((await search({ segment: 'lost' })).rows.map(row => row.id), [older.id])
  assert.deepEqual((await search({ segment: 'lead', status: 'BANNED', tag: stamp })).rows.map(row => row.id), [blocked.id])
  assert.equal((await search({ q: '۰۹۱۲۱۲۳۴۵۶۷' })).rows.find(row => row.id === older.id)?.spend, 262.5)
  assert.equal((await search({ q: older.id.toLocaleString('fa', { useGrouping: false }) })).rows[0].id, older.id)
  assert.deepEqual((await search({ q: `${stamp}%` })).rows, [], 'percent should be searched literally')
  assert.equal((await search({ sort: 'spend' })).rows[0].id, older.id)
  assert.equal((await search({ sort: 'lastOrder' })).rows[0].id, loyalty.id)
  for (const [user, count, lastOrderAt, segment] of [
    [loyalty, 5, ago(61, 1), 'loyal'], [atRisk, 1, ago(91), 'at-risk'], [stillNew, 1, ago(91, 1), 'new'],
  ]) {
    const row = (await search({ segment })).rows.find(row => row.id === user.id)
    assert.equal(row?.segment.key, customerSegment({ orders: count, spendToman: 0, lastOrderAt, openTickets: 0 }, now).segment.key)
  }
  console.log('CRM desk connected passed: complete segments, filters, stable pages, Persian search, currencies and date boundaries')
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    const ids = (await all()).map(user => user.id)
    await db.order.deleteMany({ where: { userId: { in: ids } } })
    await db.crmTag.deleteMany({ where: { userId: { in: ids } } })
    await db.user.deleteMany({ where: { id: { in: ids } } })
  } finally { await db.$disconnect() }
})
