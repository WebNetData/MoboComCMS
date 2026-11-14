const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { NextRequest } = require('next/server')

assert(/test|check/i.test(new URL(process.env.DATABASE_URL).pathname), 'disposable database required')
const prisma = new PrismaClient()
const stamp = `page-problem-${Date.now()}`
const users = [], postSlugs = []
let viewer = null, supportOff = false, journalOff = false, generalDenied = false, originValue = 'http://localhost'
const events = []

const db = new Proxy(prisma, { get(target, key) {
  const value = target[key]
  if (key === 'ticketDepartment') return new Proxy(value, { get(model, method) {
    if (method === 'findUnique') return async args => generalDenied && args?.where?.slug === 'GENERAL' ? { active: false } : model.findUnique(args)
    return typeof model[method] === 'function' ? model[method].bind(model) : model[method]
  } })
  return typeof value === 'function' ? value.bind(target) : value
} })

const runtime = async () => ({
  journal: { enabled: !journalOff, paths: ['/blog'] },
  ...(supportOff ? { support: { enabled: false, paths: ['/dashboard/tickets'] } } : {}),
})

const load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db },
  react: { ...require('react'), cache: fn => fn },
  'next-auth/jwt': { getToken: async () => viewer ? { uid: String(viewer.id), authAt: Date.now() } : null },
  '@/platform/config/env': { authSecret: () => 'report-problem-connected-fixture-secret' },
  '@/platform/http/rate-limit': { rateLimitStrict: async () => ({ ok: true }) },
  '@/extensions/server/state': { getPublicExtensionRuntime: runtime },
  '@/extensions/server/runtime': { emitExtensionEvent: async (...args) => { events.push(args) } },
  '@/modules/automation/server/engine': { emitAutomation: async (...args) => { events.push(['automation', ...args]) } },
  '@/modules/sms/server/sms': { notifyAdmins: async (...args) => { events.push(['notifyAdmins', ...args]) } },
  '@/modules/notifications/server/telegram-locale': { getUserLocale: async () => 'en' },
  '@/platform/observability/logger': { logEvent: () => undefined },
})

const reportRoute = load('src/app/api/support/report-problem/route.ts')
const ticketDetail = load('src/modules/support/server/http/tickets/[id]/route.ts')
const request = (url, body, signed = true) => new NextRequest(`http://localhost${url}`, {
  method: 'POST',
  headers: { Origin: originValue, Host: 'localhost', 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
const report = (path, kind = 'CONTENT', note = 'player error') => reportRoute.POST(request('/api/support/report-problem', { path, kind, note }))

async function main() {
  const generalBefore = await prisma.ticketDepartment.findUnique({ where: { slug: 'GENERAL' } })
  let generalCreated = false
  if (!generalBefore) {
    await prisma.ticketDepartment.create({ data: { slug: 'GENERAL', nameFa: 'پشتیبانی عمومی fixture', nameEn: 'General fixture', active: true } })
    generalCreated = true
  } else if (!generalBefore.active) {
    await prisma.ticketDepartment.update({ where: { slug: 'GENERAL' }, data: { active: true } })
  }
  const previousFetch = global.fetch
  global.fetch = async () => { throw new Error('report context must never fetch a user-supplied URL') }
  try {
    const customer = await prisma.user.create({ data: { email: `${stamp}-customer@example.invalid`, passwordHash: 'fixture-only', role: 'CUSTOMER' } })
    const foreign = await prisma.user.create({ data: { email: `${stamp}-foreign@example.invalid`, passwordHash: 'fixture-only', role: 'CUSTOMER' } })
    users.push(customer.id, foreign.id)
    const makePost = (slug, status, access = 'PUBLIC') => prisma.post.create({ data: { slug, title: `${stamp} ${slug}`, content: 'fixture content', status, access, publishedAt: new Date(Date.now() - 60_000) } })
    const liveSlug = `${stamp}-live`, draftSlug = `${stamp}-draft`, memberSlug = `${stamp}-members`
    postSlugs.push(liveSlug, draftSlug, memberSlug)
    await makePost(liveSlug, 'PUBLISHED')
    await makePost(draftSlug, 'DRAFT')
    await makePost(memberSlug, 'PUBLISHED', 'MEMBERS')

    viewer = null
    const beforeGuest = await prisma.ticket.count({ where: { userId: customer.id } })
    assert.equal((await report(`/blog/${liveSlug}`)).status, 401, 'guest cannot create a follow-up ticket')
    assert.equal(await prisma.ticket.count({ where: { userId: customer.id } }), beforeGuest)

    viewer = customer
    originValue = 'https://attacker.invalid'
    assert.equal((await report(`/blog/${liveSlug}`)).status, 403, 'foreign Origin cannot create a ticket with the signed-in session')
    originValue = 'http://localhost'
    const created = await report(`/blog/${liveSlug}`, 'VIDEO', 'Playback failed on this page')
    assert.equal(created.status, 201)
    const { ticketId } = await created.json()
    assert(Number.isSafeInteger(ticketId))
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, include: { messages: true } })
    assert.equal(ticket.userId, customer.id)
    assert.equal(ticket.department, 'GENERAL')
    assert.equal(ticket.messages.length, 1)
    assert.match(ticket.messages[0].body, new RegExp(`${stamp} ${liveSlug}`))
    assert.match(ticket.messages[0].body, new RegExp(`/blog/${liveSlug}`))
    assert.match(ticket.messages[0].body, /Video playback problem/)
    assert.match(ticket.messages[0].body, /Playback failed on this page/)
    assert(events.some(event => event[0] === 'ticket.created'), 'existing ticket-created extension event runs')

    const ownerRead = await ticketDetail.GET(new NextRequest(`http://localhost/api/tickets/${ticketId}`, { headers: { Origin: 'http://localhost' } }), { params: Promise.resolve({ id: String(ticketId) }) })
    assert.equal(ownerRead.status, 200, 'customer can follow up in the existing Support conversation')
    viewer = foreign
    const foreignRead = await ticketDetail.GET(new NextRequest(`http://localhost/api/tickets/${ticketId}`, { headers: { Origin: 'http://localhost' } }), { params: Promise.resolve({ id: String(ticketId) }) })
    assert.equal(foreignRead.status, 403, 'foreign member cannot read the conversation')
    viewer = customer

    const beforeInvalid = await prisma.ticket.count({ where: { userId: customer.id } })
    for (const path of [`https://example.invalid/${liveSlug}`, `/blog/${liveSlug}?private=value`, `/blog/999999999`, `/blog/${draftSlug}`, `/blog/${memberSlug}`, `/blog/../${liveSlug}`, `/files/download/${liveSlug}`]) {
      assert.equal((await report(path)).status, 404, `refuse non-public or non-canonical path ${path}`)
    }
    assert.equal(await prisma.ticket.count({ where: { userId: customer.id } }), beforeInvalid)
    journalOff = true
    assert.equal((await report(`/blog/${liveSlug}`)).status, 404, 'disabled content owner cannot be resolved')
    journalOff = false
    supportOff = true
    assert.equal((await report(`/blog/${liveSlug}`)).status, 404, 'disabled Support route refuses ticket creation')
    supportOff = false
    generalDenied = true
    assert.equal((await report(`/blog/${liveSlug}`)).status, 404, 'inactive GENERAL department refuses intake')
    generalDenied = false
    assert.equal(await prisma.ticket.count({ where: { userId: customer.id } }), beforeInvalid)
    assert.equal(events.some(event => event[0] === 'external-fetch'), false)
    console.log('Support page problem PostgreSQL passed: public-only resolver, no arbitrary fetch, origin/auth checks, current Support follow-up ownership, ticket event, forged/hidden/module-off/inactive-GENERAL refusals')
  } finally {
    global.fetch = previousFetch
    viewer = null; supportOff = false; journalOff = false; generalDenied = false; originValue = 'http://localhost'
    await prisma.ticketMessage.deleteMany({ where: { ticket: { userId: { in: users } } } })
    await prisma.ticket.deleteMany({ where: { userId: { in: users } } })
    if (postSlugs.length) await prisma.post.deleteMany({ where: { slug: { in: postSlugs } } })
    await prisma.user.deleteMany({ where: { id: { in: users } } })
    if (generalCreated) await prisma.ticketDepartment.deleteMany({ where: { slug: 'GENERAL' } })
    else if (generalBefore && !generalBefore.active) await prisma.ticketDepartment.update({ where: { slug: 'GENERAL' }, data: { active: generalBefore.active } })
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
