// Run against a disposable local database and server with matching DATABASE_URL.
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')
const db = new PrismaClient()
const base = process.env.TEST_BASE_URL
if (!base || !['localhost', '127.0.0.1'].includes(new URL(base).hostname) || !process.env.DATABASE_URL?.includes('.tools/')) throw Error('Disposable local test database and TEST_BASE_URL required')
const tag = `incident-qa-${Date.now()}`
const users = [], panels = [], subs = [], incidents = []
let plan, ticketId
async function cookie(user) { return `next-auth.session-token=${await encode({ secret: process.env.NEXTAUTH_SECRET, token: { uid: String(user.id) }, maxAge: 600 })}` }
async function request(path, method, body, auth) {
  const response = await fetch(base + path, { method: method || 'GET', headers: { ...(auth ? { cookie: auth } : {}), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  return { status: response.status, data: await response.json() }
}
async function main() {
  for (const role of ['ADMIN', 'CUSTOMER', 'CUSTOMER']) users.push(await db.user.create({ data: { email: `${tag}-${users.length}@example.invalid`, passwordHash: 'invalid', role } }))
  const [admin, owner, stranger] = await Promise.all(users.map(cookie))
  for (let i = 0; i < 2; i++) panels.push(await db.panel.create({ data: { name: `${tag}-${i}`, type: 'REMNAWAVE', url: 'https://example.invalid', token: 'fake', active: false } }))
  plan = await db.plan.create({ data: { name: tag, trafficGB: 10, days: 30, price: 1, priceMinor: 100n, active: false } })
  for (const panel of panels) subs.push(await db.subscription.create({ data: { userId: users[1].id, planId: plan.id, panelId: panel.id, username: `${tag}-${panel.id}`, subToken: `${tag}-${panel.id}`, expiresAt: new Date(Date.now() + 86400000) } }))
  const body = { panelId: panels[0].id, status: 'INVESTIGATING', titleFa: 'اختلال آزمایشی', titleEn: 'Test outage', messageFa: 'در حال بررسی', messageEn: 'Investigating' }
  assert.equal((await request('/api/admin/incidents', 'POST', body, owner)).status, 403)
  const created = await request('/api/admin/incidents', 'POST', body, admin)
  assert.equal(created.status, 200); incidents.push(created.data.id)
  const feed = id => `/api/incidents?subscriptionId=${id}`
  assert.equal((await request(feed(subs[0].id), 'GET', null, stranger)).status, 404)
  assert.equal((await request(feed(subs[0].id), 'GET', null, owner)).data.length, 1)
  assert.equal((await request(feed(subs[1].id), 'GET', null, owner)).data.length, 0)
  assert.equal((await request('/api/admin/incidents', 'PATCH', { ...body, id: incidents[0], status: 'RESOLVED' }, admin)).status, 200)
  assert.equal((await request(feed(subs[0].id), 'GET', null, owner)).data[0].status, 'RESOLVED')
  await db.serviceIncident.update({ where: { id: incidents[0] }, data: { updatedAt: new Date(Date.now() - 2 * 86400000) } })
  assert.equal((await request(feed(subs[0].id), 'GET', null, owner)).data.length, 0)
  const report = { subject: 'Connection issue', message: 'Cannot connect', subscriptionId: subs[0].id, device: 'android', issueType: 'connection' }
  assert.equal((await request('/api/tickets', 'POST', report, stranger)).status, 404)
  const submitted = await request('/api/tickets', 'POST', report, owner)
  assert.equal(submitted.status, 200); ticketId = submitted.data.id
  const detail = await request(`/api/tickets/${ticketId}`, 'GET', null, admin)
  assert.equal(detail.data.subscriptionId, subs[0].id); assert.equal(detail.data.device, 'android')
  assert.equal((await request(`/api/tickets/${ticketId}`, 'GET', null, stranger)).status, 403)
  assert.equal((await request(`/api/tickets/${ticketId}`, 'POST', { message: 'Issue fixed', close: true }, admin)).status, 200)
  const resolved = await request(`/api/tickets/${ticketId}`, 'GET', null, owner)
  assert.equal(resolved.data.status, 'CLOSED'); assert.equal(resolved.data.messages.length, 2)
  console.log('PASS: incident authorization, targeting, resolution visibility, report ownership, admin reply and customer tracking')
}
main().catch(e => { console.error(e); process.exitCode = 1 }).finally(async () => {
  if (ticketId) { await db.ticketMessage.deleteMany({ where: { ticketId } }); await db.ticket.delete({ where: { id: ticketId } }) }
  await db.serviceIncident.deleteMany({ where: { id: { in: incidents } } })
  await db.subscription.deleteMany({ where: { id: { in: subs.map(s => s.id) } } })
  if (plan) await db.plan.delete({ where: { id: plan.id } })
  await db.panel.deleteMany({ where: { id: { in: panels.map(p => p.id) } } })
  await db.user.deleteMany({ where: { id: { in: users.map(u => u.id) } } })
  await db.$disconnect()
})
