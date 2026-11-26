const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { readdir } = require('node:fs/promises')
const { PrismaClient } = require('@prisma/client')
const { NextRequest } = require('next/server')
const sourceLoader = require('./connected-source-loader.cjs')

const url = new URL(process.env.DATABASE_URL)
assert.match(url.protocol, /^postgres(?:ql)?:$/)
assert.match(url.pathname, /test|check/i, 'disposable PostgreSQL database required')

const prisma = new PrismaClient()
const users = new Map()
const notices = []
const roles = []
const stamp = randomUUID().slice(0, 12)
const department = `TICKET-CLAIM-${stamp}`
let raceRead

const db = prisma.$extends({ query: { ticket: {
  async findUnique({ args, query }) {
    const snapshot = await query(args)
    if (raceRead?.id === args.where.id) await raceRead.wait()
    return snapshot
  },
} } })
const viewer = req => users.get(Number(req.headers.get('x-fixture-user')))
const load = sourceLoader({
  '@/platform/database/prisma': { db },
  '@/modules/identity/server/access': {
    requireUser: async req => viewer(req),
    requirePerm: async (req, permission) => viewer(req)?.permissions.includes(permission) ? viewer(req) : null,
  },
  '@/modules/notifications/server/inbox': { createInboxEvent: async event => { notices.push(event) } },
  '@/platform/audit/server': { auditAdmin: async () => {} },
  '@/modules/subscriptions/server/happ-protocol': { safeHappLink: async () => '' },
})
const admin = load('src/modules/support/server/http/admin/tickets/route.ts')
const detail = load('src/modules/support/server/http/tickets/[id]/route.ts')
const attachments = load('src/modules/support/server/ticket-attachments.ts')

function request(path, method, id, body) {
  const headers = { Origin: 'http://localhost', 'x-fixture-user': String(id) }
  if (body instanceof FormData) return new NextRequest(`http://localhost${path}`, { method, headers, body })
  return new NextRequest(`http://localhost${path}`, {
    method, headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

function patch(actor, ticket, data) {
  return admin.PATCH(request('/api/admin/tickets', 'PATCH', actor.id, { id: ticket.id, ...data }))
}

function post(actor, ticket, data) {
  return detail.POST(request(`/api/tickets/${ticket.id}`, 'POST', actor.id, data), {
    params: Promise.resolve({ id: String(ticket.id) }),
  })
}

// Wait until both production handlers have read the same real row, then let both writes compete.
async function race(ticket, left, right) {
  let arrivals = 0
  let release
  const bothRead = new Promise(resolve => { release = resolve })
  const timer = setTimeout(release, 4000)
  raceRead = {
    id: ticket.id,
    async wait() { if (++arrivals === 2) release(); await bothRead },
  }
  try {
    const results = await Promise.all([left(), right()])
    assert.equal(arrivals, 2, 'both operations must read before either writes')
    return results
  } finally {
    clearTimeout(timer)
    raceRead = undefined
  }
}

async function oneWinner(responses) {
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409])
  assert.equal((await responses.find(response => response.status === 409).json()).code, 'TICKET_CHANGED')
  return responses.findIndex(response => response.status === 200)
}

async function role(name, permissions) {
  const row = await prisma.role.create({ data: { name: `${stamp}-${name}`, permissions: permissions.join(',') } })
  roles.push(row.id)
  return row
}

async function actor(name, roleRef, permissions = []) {
  const row = await prisma.user.create({ data: {
    email: `${stamp}-${name}@example.invalid`, passwordHash: 'fixture-only',
    role: roleRef ? 'ADMIN' : 'CUSTOMER', ...(roleRef ? { roleId: roleRef.id } : {}),
  } })
  const identity = { id: row.id, role: row.role, roleId: row.roleId, permissions }
  users.set(row.id, identity)
  return identity
}

function pngReply(message) {
  const png = Buffer.alloc(45)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png)
  png.writeUInt32BE(13, 8)
  png.write('IHDR', 12)
  png.writeUInt32BE(1, 16)
  png.writeUInt32BE(1, 20)
  png.write('IEND', 37)
  const form = new FormData()
  form.set('payload', JSON.stringify({ message }))
  form.set('files', new Blob([png], { type: 'image/png' }), `${stamp}.png`)
  return form
}

async function main() {
  const handle = ['tickets.handle']
  const manage = [...handle, 'tickets.departments.manage']
  const agentRole = await role('agent', handle)
  const a = await actor('a', agentRole, handle)
  const b = await actor('b', agentRole, handle)
  const manager = await actor('manager', await role('manager', manage), manage)
  const outsider = await actor('outsider', await role('outsider', handle), handle)
  const customer = await actor('customer')
  await prisma.ticketDepartment.create({ data: { slug: department, nameFa: department, nameEn: department, active: true, roleIds: JSON.stringify([agentRole.id]) } })
  const ticket = (data = {}) => prisma.ticket.create({ data: { userId: customer.id, subject: stamp, department, ...data } })
  const read = ({ id }) => prisma.ticket.findUniqueOrThrow({ where: { id }, include: { messages: { include: { attachments: true } } } })

  const unheld = await ticket()
  assert.equal((await patch(outsider, unheld, { assignedToId: outsider.id })).status, 403)
  assert.equal((await patch(a, unheld, { assignedToId: b.id })).status, 403)
  const takers = [a, b]
  const take = await oneWinner(await race(unheld, ...takers.map(actor => () => patch(actor, unheld, { assignedToId: actor.id }))))
  assert.equal((await read(unheld)).assignedToId, takers[take].id)
  assert.equal((await post(takers[1 - take], unheld, { message: 'Already held' })).status, 403)

  const withReplies = await ticket()
  const senders = [a, b]
  const sent = await oneWinner(await race(withReplies, ...senders.map(actor => () => post(actor, withReplies, pngReply(`Reply by ${actor.id}`)))))
  const answered = await read(withReplies)
  assert.equal(answered.assignedToId, senders[sent].id)
  assert.equal(answered.status, 'PENDING')
  assert.ok(answered.firstResponseAt instanceof Date)
  assert.equal(answered.messages.length, 1)
  assert.equal(answered.messages[0].userId, senders[sent].id)
  assert.equal(answered.messages[0].attachments.length, 1)
  assert.equal(notices.length, 1)
  const persisted = answered.messages[0].attachments[0]
  assert.ok((await readdir(attachments.ticketFileDirectory())).includes(persisted.filename))
  const orphanUploads = (await readdir(attachments.ticketFileDirectory())).filter(filename => !filesBefore.has(filename) && filename !== persisted.filename)
  assert.deepEqual(orphanUploads, [], 'losing reply must remove its staged file')

  const firstResponse = await ticket()
  const cross = await oneWinner(await race(firstResponse,
    () => patch(a, firstResponse, { assignedToId: a.id }),
    () => post(b, firstResponse, { message: 'First reply' }),
  ))
  const decided = await read(firstResponse)
  assert.equal(decided.assignedToId, [a.id, b.id][cross])
  assert.equal(decided.messages.length, cross)

  const held = await ticket({ assignedToId: a.id })
  const handoff = await oneWinner(await race(held,
    () => patch(manager, held, { assignedToId: b.id }),
    () => post(a, held, { message: 'An answer during reassignment' }),
  ))
  const transferred = await read(held)
  assert.equal(transferred.assignedToId, [b.id, a.id][handoff])
  assert.equal(transferred.messages.length, handoff)
  assert.equal((await patch(manager, held, { assignedToId: b.id })).status, 200)

  const noteTarget = await ticket({ assignedToId: a.id })
  const noteAndClose = await race(noteTarget,
    () => patch(a, noteTarget, { status: 'CLOSED' }),
    () => post(b, noteTarget, { message: 'Private note for the owner', internal: true }),
  )
  assert.deepEqual(noteAndClose.map(response => response.status), [200, 200])
  const closed = await read(noteTarget)
  assert.equal(closed.status, 'CLOSED')
  assert.ok(closed.closedAt instanceof Date)
  assert.equal(closed.assignedToId, a.id)
  assert.equal(closed.firstResponseAt, null)
  assert.equal(closed.messages[0].internal, true)
  assert.equal((await post(customer, noteTarget, { message: 'Customer follow-up' })).status, 200)
  const reopened = await read(noteTarget)
  assert.equal(reopened.status, 'OPEN')
  assert.equal(reopened.assignedToId, a.id)
  assert.equal(reopened.closedAt, null)
  assert.equal(notices.length, 1 + cross + handoff)
  console.log('Support ticket ownership PostgreSQL passed: competing claims, first replies, cross-action race, manager transfer, private note, customer reopening and losing-upload cleanup')
}

let filesBefore
async function run() {
  filesBefore = new Set(await readdir(attachments.ticketFileDirectory()).catch(error => { if (error.code === 'ENOENT') return []; throw error }))
  try { await main() }
  finally {
    const ids = [...users.keys()]
    const attachmentRows = await prisma.ticketAttachment.findMany({ where: { message: { ticket: { department, userId: { in: ids } } } }, select: { filename: true } })
    await attachments.removeTicketFiles(attachmentRows)
    await prisma.ticketMessage.deleteMany({ where: { ticket: { department, userId: { in: ids } } } })
    await prisma.ticket.deleteMany({ where: { department, userId: { in: ids } } })
    await prisma.ticketDepartment.deleteMany({ where: { slug: department } })
    await prisma.user.deleteMany({ where: { id: { in: ids } } })
    await prisma.role.deleteMany({ where: { id: { in: roles } } })
  }
}

run().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
