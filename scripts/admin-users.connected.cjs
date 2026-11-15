const assert = require('node:assert/strict'), crypto = require('node:crypto')
const { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server'), { encode } = require('next-auth/jwt')
const loadSource = require('./connected-source-loader.cjs')
assert(process.env.DATABASE_URL && /test|check/i.test(new URL(process.env.DATABASE_URL).pathname), 'requires a disposable test/check database')
const db = new PrismaClient(), stamp = 'owned-users-' + crypto.randomUUID(), ids = [], roles = []
const oldSecret = process.env.NEXTAUTH_SECRET
process.env.NEXTAUTH_SECRET = crypto.randomBytes(32).toString('hex')
let failAudit = false, beforeTransaction = null
const wrapped = new Proxy(db, { get(target, key) {
  if (key === '$transaction') return async (fn, options) => {
    if (beforeTransaction) { const hook = beforeTransaction; beforeTransaction = null; await hook() }
    return target.$transaction(async tx => fn(new Proxy(tx, { get(inner, field) {
      if (field === 'auditLog' && failAudit) return { create: async () => { throw Error('owned audit failure') } }
      return typeof inner[field] === 'function' ? inner[field].bind(inner) : inner[field]
    } })), options)
  }
  return typeof target[key] === 'function' ? target[key].bind(target) : target[key]
} })
const load = loadSource({ '@/platform/database/prisma': { db: wrapped }, '@/platform/http/rate-limit': { rateLimitStrict: async () => ({ ok: true }) } })
const api = load('src/modules/identity/server/http/admin/users/route.ts'), access = load('src/modules/identity/server/access.ts')
const token = async user => encode({ secret: process.env.NEXTAUTH_SECRET, token: { uid: String(user.id), authAt: Date.now() } })
const req = (method, body, jwt, origin = 'https://owned.test', query = '') => new NextRequest('https://owned.test/api/admin/users' + query, { method, headers: { host: 'owned.test', ...(jwt ? { cookie: 'next-auth.session-token=' + jwt } : {}), ...(origin ? { origin } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
const payload = user => ({ id: user.id, updatedAt: user.updatedAt.toISOString(), confirm: true })
const del = (user, jwt, extra = {}, origin) => api.DELETE(req('DELETE', { ...payload(user), ...extra }, jwt, origin))
async function main() { try {
  const make = async (name, data = {}) => { const user = await db.user.create({ data: { email: `${stamp}-${name}@example.invalid`, passwordHash: 'unused', totpEnabledAt: new Date(), ...data } }); ids.push(user.id); return user }
  const role = await db.role.create({ data: { name: stamp, permissions: 'users.manage' } }); roles.push(role.id)
  const wrongRole = await db.role.create({ data: { name: stamp + '-wrong', permissions: 'music.manage' } }); roles.push(wrongRole.id)
  const full = await make('full', { role: 'ADMIN' }), manager = await make('manager', { role: 'ADMIN', roleId: role.id }), wrong = await make('wrong', { role: 'ADMIN', roleId: wrongRole.id }), member = await make('member')
  const fullToken = await token(full), managerToken = await token(manager), wrongToken = await token(wrong), memberToken = await token(member)
  let empty = await make('empty')
  assert.equal((await del(empty, fullToken, { confirm: false })).status, 400)
  assert.equal((await del(empty, null)).status, 403)
  assert.equal((await del(empty, wrongToken)).status, 403)
  assert.equal((await del(empty, fullToken, {}, null)).status, 403)
  assert.equal((await del(full, fullToken)).status, 403)
  assert.equal((await del(full, managerToken)).status, 403, 'scoped staff cannot delete full-access staff')
  assert.equal((await del(empty, fullToken, { updatedAt: new Date(0).toISOString() })).status, 409)
  beforeTransaction = () => db.user.update({ where: { id: manager.id }, data: { status: 'BANNED' } })
  assert.equal((await del(empty, managerToken)).status, 403, 'transaction rechecks current authority')
  await db.user.update({ where: { id: manager.id }, data: { status: 'ACTIVE' } })
  failAudit = true
  assert.equal((await del(empty, fullToken)).status, 503)
  failAudit = false
  assert(await db.user.findUnique({ where: { id: empty.id } }), 'audit failure rolls back deletion')
  const emptyToken = await token(empty)
  assert.equal((await del(empty, fullToken)).status, 200)
  assert.equal(await db.user.findUnique({ where: { id: empty.id } }), null)
  assert.equal(await access.requireUser(req('GET', null, emptyToken)), null, 'deleted account session is refused')
  const financial = await make('financial')
  const order = await db.order.create({ data: { userId: financial.id, totalAmount: 1, totalMinor: 100n } })
  const invoice = await db.invoice.create({ data: { userId: financial.id, orderId: order.id, number: stamp, total: 1, totalMinor: 100n } })
  assert.equal((await del(financial, fullToken)).status, 409)
  assert(await db.order.findUnique({ where: { id: order.id } })); assert(await db.invoice.findUnique({ where: { id: invoice.id } }))
  const social = await make('social'), post = await db.communityPost.create({ data: { authorId: social.id, content: stamp } })
  assert.equal((await del(social, fullToken)).status, 409)
  assert(await db.communityPost.findUnique({ where: { id: post.id } }), 'cascade-owned post is retained')
  const wallet = await make('wallet', { walletBalance: 1 })
  assert.equal((await del(wallet, fullToken)).status, 409)
  const race = await make('race'), outcomes = await Promise.all([del(race, fullToken), del(race, fullToken)])
  assert.equal(outcomes.filter(r => r.status === 200).length, 1)
  assert(outcomes.every(r => [200, 404, 409].includes(r.status)))
  const phone = await make('phone', { email: '989123456789@phone.mobocom.local', phone: '+989123456789' })
  for (const slim of ['', '&slim=1']) {
    const response = await api.GET(req('GET', null, fullToken, undefined, '?q=' + encodeURIComponent('۰۹۱۲۳۴۵۶۷۸۹') + slim))
    assert.equal(response.status, 200)
    const row = (await response.json()).users.find(u => u.id === phone.id)
    assert(row, 'Persian-digit search finds normalized phone'); assert(!row.identifier.includes('@'), 'placeholder is not displayed')
  }
  assert.equal((await api.GET(req('GET', null, memberToken))).status, 403)
  console.log('Admin users connected: authorization, history, audit rollback, concurrent deletion and phone search passed')
} finally {
  await db.auditLog.deleteMany({ where: { actorUserId: { in: ids } } })
  await db.communityPost.deleteMany({ where: { authorId: { in: ids } } })
  await db.invoice.deleteMany({ where: { userId: { in: ids } } })
  await db.order.deleteMany({ where: { userId: { in: ids } } })
  await db.user.deleteMany({ where: { id: { in: ids } } })
  await db.role.deleteMany({ where: { id: { in: roles } } })
  if (oldSecret === undefined) delete process.env.NEXTAUTH_SECRET; else process.env.NEXTAUTH_SECRET = oldSecret
  await db.$disconnect()
} }
main().catch(error => { console.error(error); process.exitCode = 1 })
