// CRM sales routes and workers against disposable PostgreSQL with fixture identities.
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { NextRequest } = require('next/server')

assert(/test|check/i.test(new URL(process.env.DATABASE_URL).pathname), 'use an isolated test database')
if (process.getuid) assert.notEqual(process.getuid(), 0, 'run connected checks as a non-root user')
const db = new PrismaClient()
const stamp = randomUUID().slice(0, 12)
const ids = [], roles = [], departments = [], forms = []
const enabled = { livechat: true, forms: true, support: true }
const load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db },
  react: { ...require('react'), cache: fn => fn },
  'next-auth/jwt': { getToken: async ({ req }) => ({ uid: req.headers.get('x-fixture-user'), authAt: Date.now() }) },
  '@/platform/config/env': { authSecret: () => 'sales-check-fixture-only' },
  '@/extensions/server/modules': {
    moduleGuard: async id => enabled[id] === false ? new Response(null, { status: 404 }) : null,
    isModuleEnabled: async id => enabled[id] !== false,
  },
})
const opportunities = load('src/modules/livechat/server/http/crm-opportunities.ts')
const followUps = load('src/modules/livechat/server/http/crm-follow-ups.ts')
const { deliverOpportunityFollowUpReminder } = load('src/modules/livechat/server/crm-opportunity-reminders.ts')
const { erasePersonalRows } = load('src/modules/identity/server/erasure/personal.ts')
const { tehranDay } = load('src/shared/time/day.ts')

async function person(name, permissions, extra = {}) {
  let roleId
  if (permissions) {
    const role = await db.role.create({ data: { name: `${stamp}-${name}`, permissions } })
    roleId = role.id
    roles.push(role.id)
  }
  const user = await db.user.create({ data: {
    email: `${stamp}-${name}@example.invalid`, passwordHash: '!', name,
    ...(permissions ? { role: 'ADMIN', roleId } : {}), ...extra,
  } })
  ids.push(user.id)
  return user
}

function request(actor, path, method = 'GET', body) {
  return new NextRequest(`http://localhost/api/admin/crm/${path}`, {
    method, headers: { Origin: 'http://localhost', 'x-fixture-user': String(actor?.id ?? ''), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}
const invoke = (method, actor, query = '', body) =>
  opportunities[method](request(actor, `opportunities${query ? '?' + query : ''}`, method, body))
const follow = (method, actor, userId, body) =>
  followUps[method](request(actor, `follow-ups?userId=${userId}`, method, body))
async function expect(response, status) {
  const data = await response.json().catch(() => null)
  assert.equal(response.status, status, JSON.stringify(data))
  return data
}
const fields = { title: 'فرصت آزمایشی', amount: '12.50', currency: 'USD' }

async function main() {
  const manager = await person('manager', null, { role: 'ADMIN' })
  const a = await person('agent-a', 'tickets.handle,forms.handle')
  const b = await person('agent-b', 'tickets.handle,forms.handle')
  const denied = await person('denied', 'cms.posts')
  const customer = await person('customer')
  const other = await person('other')
  const department = await db.ticketDepartment.create({ data: { slug: `D${stamp}`, nameFa: 'آزمایش', nameEn: 'Test', roleIds: JSON.stringify([a.roleId]) } })
  departments.push(department.id)
  const ticket = await db.ticket.create({ data: { userId: customer.id, subject: 'محرمانه', department: department.slug, assignedToId: a.id } })
  const form = await db.siteForm.create({ data: { slug: `sales-${stamp}`, title: 'فرم آزمایشی', settings:JSON.stringify({handlers:[a.id,b.id]}) } })
  forms.push(form.id)
  const registered = await db.formSubmission.create({ data: { formId: form.id, userId: customer.id, assigneeId: a.id, data: '[]' } })
  const anonymous = await db.formSubmission.create({ data: { formId: form.id, data: '[]' } })
  const spam = await db.formSubmission.create({ data: { formId: form.id, data: '[]', status: 'SPAM' } })
  assert.equal((await invoke('GET', customer)).status, 403)
  assert.equal((await invoke('GET', denied)).status, 403)
  assert.equal((await invoke('GET', a, 'owner=all')).status, 403)
  assert.equal((await invoke('GET', b, `source=TICKET&sourceId=${ticket.id}`)).status, 403)
  const ticketPreview = await expect(await invoke('GET', a, `source=TICKET&sourceId=${ticket.id}`), 200)
  assert.equal(ticketPreview.userId, customer.id)
  assert.equal((await invoke('GET', b, `source=FORM&sourceId=${registered.id}`)).status, 403)
  assert.equal((await invoke('GET', manager, `source=FORM&sourceId=${spam.id}`)).status, 409)
  assert.equal((await expect(await invoke('GET', a, `source=FORM&sourceId=${anonymous.id}`), 200)).userId, null)
  assert.equal((await invoke('POST', a, '', { ...fields, userId: other.id, source: { type:'TICKET', id:ticket.id } })).status, 409)
  const byTicket = await expect(await invoke('POST', a, '', { ...fields, source:{ type:'TICKET', id:ticket.id } }), 201)
  assert.equal((await invoke('POST', a, '', { ...fields, source:{ type:'TICKET', id:ticket.id } })).status, 409)
  const byForm = await expect(await invoke('POST', a, '', { ...fields, source:{ type:'FORM', id:registered.id } }), 201)
  const races = await Promise.all([0,1].map(() => invoke('POST', manager, '', { ...fields, userId: customer.id, source:{ type:'FORM', id:anonymous.id } })))
  assert.deepEqual(races.map(row => row.status).sort(), [201,409])
  const byAnonymous = await races.find(row => row.status === 201).json()
  assert.equal((await db.crmOpportunity.findUniqueOrThrow({ where:{ id:byAnonymous.id } })).userId, customer.id)

  assert.equal((await invoke('GET', b, `id=${byTicket.id}`)).status, 404)
  assert.equal((await invoke('PATCH', b, '', { ...byTicket, stage:'QUALIFIED' })).status, 404)
  const revisions = await Promise.all(['QUALIFIED','PROPOSAL'].map(stage => invoke('PATCH', a, '', { ...byTicket, stage })))
  assert.deepEqual(revisions.map(row => row.status).sort(), [200,409])
  const changed = await revisions.find(row => row.status === 200).json()
  const detail = await expect(await invoke('GET', a, `id=${byTicket.id}`), 200)
  assert.equal(detail.history.length, 2)
  assert.equal(detail.history[0].fromStage, 'NEW')
  assert.equal(detail.history[1].toStage, 'NEW')
  assert.equal(detail.source.type, 'TICKET')
  assert.equal((await invoke('PATCH', a, '', { ...changed, stage:'LOST', reason:'کم' })).status, 400)
  assert.equal((await invoke('POST', a, '', { ...fields, userId:customer.id, assigneeId:b.id })).status, 403)
  const lost = await expect(await invoke('PATCH', a, '', { ...changed, stage:'LOST', reason:'مشتری تصمیم دیگری گرفت' }), 200)
  assert.equal((await invoke('PATCH', a, '', { ...lost, stage:'NEW' })).status, 409)

  const won = await expect(await invoke('PATCH', a, '', { ...byForm, stage:'WON' }), 200)
  assert.equal(won.version, 2)
  const toman = await expect(await invoke('POST', a, '', { userId:customer.id, title:'پیشنهاد دوم', amount:'1000', currency:'IRT' }), 201)
  await expect(await invoke('PATCH', a, '', { ...toman, stage:'WON' }), 200)
  const linked = await expect(await follow('POST', manager, customer.id, { title:'پیگیری فرصت', dueDay:tehranDay(), assigneeId:manager.id, opportunityId:byAnonymous.id }), 201)
  const queued = await db.backgroundJob.findFirstOrThrow({ where:{ kind:'crm.opportunity-reminder', dedupeKey:`crm:opportunity-reminder:${linked.id}:${linked.version}` } })
  assert(!queued.payload.includes('پیگیری فرصت'))
  const customerQueue = await expect(await followUps.GET_QUEUE(request(manager, 'follow-ups/queue?scope=mine')), 200)
  assert.equal(customerQueue.items.find(row => row.id === linked.id).opportunityId, byAnonymous.id)
  const payload = { taskId:linked.id, version:linked.version }
  assert.equal((await deliverOpportunityFollowUpReminder(payload, new Date(`${tehranDay()}T08:59:00+03:30`))).skipped, 'early')
  assert.deepEqual(await deliverOpportunityFollowUpReminder(payload, queued.runAt), { delivered:true })
  assert.deepEqual(await deliverOpportunityFollowUpReminder(payload, queued.runAt), { delivered:true })
  const noticeKey = `crm:opportunity-reminder:${linked.id}:${manager.id}:${tehranDay()}`
  const editedTask = await expect(await follow('PATCH', manager, customer.id, { ...linked, title:'ویرایش عنوان', dueDay:tehranDay() }), 200)
  assert.deepEqual(await deliverOpportunityFollowUpReminder({taskId:linked.id,version:editedTask.version}, queued.runAt), { delivered:true })
  assert.equal(await db.userNotification.count({ where:{ dedupeKey:noticeKey } }), 1)
  const notification = await db.userNotification.findFirstOrThrow({ where:{ dedupeKey:noticeKey } })
  assert.equal(notification.userId, manager.id)
  assert.equal(notification.deliveryChannels, '-')
  assert.equal(await db.backgroundJob.count({ where:{ kind:'notification.deliver', payload:{ contains:`"notificationId":${notification.id},` } } }), 0)
  const close = await expect(await invoke('PATCH', manager, '', { ...byAnonymous, stage:'LOST', reason:'درخواست پیگیری نشد' }), 200)
  assert.equal((await db.crmFollowUp.findUniqueOrThrow({where:{id:linked.id}})).status, 'CANCELLED')
  assert.equal((await deliverOpportunityFollowUpReminder({ taskId:linked.id, version:linked.version })).skipped, 'changed')
  assert.equal((await invoke('PATCH', manager, '', { ...close, stage:'NEW' })).status, 409)
  await db.crmOpportunity.update({ where:{ id:byAnonymous.id }, data:{ stage:'QUALIFIED', closedAt:null, stageChangedAt:new Date(Date.now()-15*86400000) } })
  const summary = await expect(await invoke('GET', manager, `userId=${customer.id}`), 200)
  assert.equal(summary.stats.counts.WON, 2)
  assert.equal(summary.stats.counts.LOST, 1)
  assert.equal(summary.stats.stale, 1)
  assert.equal(summary.stats.successRate, 66.7)
  assert.deepEqual(summary.stats.wonTotals, [{currency:'IRT',amountMinor:'1000'}, {currency:'USD',amountMinor:'1250'}])
  const stale = await expect(await invoke('GET', manager, `userId=${customer.id}&stale=1`), 200)
  assert.deepEqual(stale.rows.map(row => row.id), [byAnonymous.id])

  enabled.livechat = false
  assert.equal((await invoke('GET', manager)).status, 404)
  assert.equal((await deliverOpportunityFollowUpReminder({taskId:linked.id,version:linked.version})).skipped, 'disabled')
  enabled.livechat = true
  enabled.forms = false
  assert.equal((await invoke('GET', manager, `source=FORM&sourceId=${anonymous.id}`)).status, 404)
  enabled.forms = true
  enabled.support = false
  assert.equal((await invoke('GET', manager, `source=TICKET&sourceId=${ticket.id}`)).status, 404)
  enabled.support = true
  await db.$transaction(tx => erasePersonalRows(tx, customer.id))
  assert.equal(await db.crmOpportunity.count({where:{userId:customer.id}}),0)
  assert.equal(await db.crmFollowUp.count({where:{userId:customer.id}}),0)
  console.log('CRM opportunities PostgreSQL passed: source guards and dedupe, own scope, claims/history, per-currency reporting, reminder, closure and erasure')
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    const tasks = await db.crmFollowUp.findMany({ where:{ userId:{ in:ids } }, select:{ id:true } })
    // Erasure can remove tasks before cleanup, so also find our fixture's jobs by captured audit IDs.
    const audit = await db.auditLog.findMany({ where:{ actorUserId:{ in:ids }, action:'crm.follow_up.create' } })
    const taskIds = new Set([...tasks.map(row=>row.id), ...audit.map(row=>{try{return JSON.parse(row.metadata).followUpId}catch{return 0}})].filter(Boolean))
    for (const id of taskIds) {
      await db.backgroundJob.deleteMany({where:{kind:'crm.opportunity-reminder',dedupeKey:{startsWith:`crm:opportunity-reminder:${id}:`}}})
      await db.userNotification.deleteMany({where:{dedupeKey:{startsWith:`crm:opportunity-reminder:${id}:`}}})
    }
    await db.crmFollowUp.deleteMany({where:{userId:{in:ids}}})
    await db.crmOpportunity.deleteMany({where:{userId:{in:ids}}})
    await db.ticket.deleteMany({where:{userId:{in:ids}}})
    await db.siteForm.deleteMany({where:{id:{in:forms}}})
    await db.auditLog.deleteMany({where:{actorUserId:{in:ids}}})
    await db.user.deleteMany({where:{id:{in:ids}}})
    await db.ticketDepartment.deleteMany({where:{id:{in:departments}}})
    await db.role.deleteMany({where:{id:{in:roles}}})
  } finally { await db.$disconnect() }
})
