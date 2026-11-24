const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
assert(process.env.DATABASE_URL && /test|check/i.test(new URL(process.env.DATABASE_URL).pathname), 'Use an isolated test database')
const load = require('./connected-source-loader.cjs')({ '@/platform/database/prisma': { db } })
const { crmSnapshot, crmProfile, crmSearch, agentConversation } = load('src/modules/livechat/server/livechat.ts')
const stamp = randomUUID().replace(/-/g, '')
const slugs = [`QA${stamp}A`, `QA${stamp}B`]
let user, role, conversation
const orderIds = []
const staffIds = []

async function main() {
  try {
    user = await db.user.create({ data: { email: `${stamp}@example.invalid`, role: 'CUSTOMER', passwordHash: '!' } })
    role = await db.role.create({ data: { name: `crm-${stamp}`, permissions: 'tickets.handle' } })
    await db.ticketDepartment.createMany({ data: slugs.map((slug, i) => ({ slug, nameFa: slug, nameEn: slug, roleIds: JSON.stringify(i === 0 ? [role.id] : []) })) })
    for (const [i, department] of slugs.entries()) await db.ticket.create({ data: { userId: user.id, department, subject: `private-${i}-${stamp}` } })
    for (const [currency, totalMinor] of [['IRT', 101n], ['IRR', 255n], ['USD', 999n]]) {
      const order = await db.order.create({ data: { userId: user.id, status: 'PAID', currency, totalMinor, totalAmount: Number(totalMinor) } })
      orderIds.push(order.id)
    }
    conversation = await db.chatConversation.create({ data: { token: stamp, userId: user.id } })
    const actors = []
    for (const [label, roleId, permissions] of [['scoped', role.id, ['tickets.handle']], ['manager', role.id, ['tickets.departments.manage']], ['full', null, []]]) {
      const staff = await db.user.create({ data: { email: `${label}-${stamp}@example.invalid`, role: 'ADMIN', roleId, passwordHash: '!' } })
      staffIds.push(staff.id)
      actors.push({ id: staff.id, role: 'ADMIN', roleId, permissions })
    }
    const [scoped, manager, full] = actors
    const before = await db.order.findMany({ where: { id: { in: orderIds } }, orderBy: { id: 'asc' }, select: { id: true, currency: true, totalMinor: true, totalAmount: true, status: true } })
    for (const [actor, count] of [[scoped, 1], [manager, 2], [full, 2], [undefined, 0]]) {
      const snapshot = await crmSnapshot(user.id, actor)
      assert.equal(snapshot.openTickets, count)
      assert.equal(snapshot.spendToman, 126.5)
      assert.equal(snapshot.orders, 2)
      assert.equal(snapshot.aov, 63)
      assert.equal(snapshot.needsAttention, count > 0)
      const profile = await crmProfile(user.id, actor)
      assert.equal(profile.counts.tickets, count)
      assert.equal(profile.timeline.filter(event => event.kind === 'ticket').length, count)
      assert.equal(profile.timeline.some(event => event.title.includes(`private-1-${stamp}`)), count === 2)
      assert.equal((await agentConversation(conversation.id, 0, actor)).customer.openTickets, count)
    }
    const row = (await crmSearch({ q: user.email })).rows.find(item => item.id === user.id)
    assert.equal(row.spend, 126.5)
    assert.equal(row.orders, 2)
    assert.deepEqual(await db.order.findMany({ where: { id: { in: orderIds } }, orderBy: { id: 'asc' }, select: { id: true, currency: true, totalMinor: true, totalAmount: true, status: true } }), before)
    console.log('CRM department visibility and mixed-currency aggregates passed')
  } finally {
    if (conversation) await db.chatConversation.deleteMany({ where: { id: conversation.id } })
    if (user) {
      await db.ticket.deleteMany({ where: { userId: user.id } })
      await db.order.deleteMany({ where: { id: { in: orderIds } } })
      await db.user.deleteMany({ where: { id: user.id } })
    }
    await db.ticketDepartment.deleteMany({ where: { slug: { in: slugs } } })
    await db.user.deleteMany({ where: { id: { in: staffIds } } })
    if (role) await db.role.deleteMany({ where: { id: role.id } })
    await db.$disconnect()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
