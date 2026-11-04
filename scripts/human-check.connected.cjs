// Native PostgreSQL proof claims/settings and real HTTP intake. Delivery and unrelated module owners are doubles.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api'), crypto = require('node:crypto')
const { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server')
const db = new PrismaClient(), cache = new Map(), key = 'security.human-check.v1', stamp = 'owned-human-' + Date.now()
const secret = 'owned-human-check-fixture', users = [], salts = [], saved = new Map()
let actor = null, permitted = true, sends = 0, chatCalls = 0
const mocks = {
  '@/platform/database/prisma': { db }, '@/platform/config/env': { authSecret: () => secret },
  '@/platform/cache/kv': { cached: async (key, ttl, work) => work(), invalidate: async () => {}, kv: async () => ({ kind: 'memory' }) },
  '@/platform/observability/logger': { logEvent: () => {}, requestIdFrom: () => stamp },
  '@/modules/identity/server/access': { requirePerm: async () => permitted ? actor : null, requireUser: async () => actor },
  '@/modules/notifications/server/telegram': {}, '@/modules/identity/telegram-account': {},
  '@/extensions/server/modules': { moduleGuard: async () => null },
  '@/modules/sms/server/sms': { requestOtp: async () => { sends++; return { phone: '+989100000000' } } },
  '@/modules/identity/server/email-otp': { requestEmailCode: async () => { sends++; return {} } },
  '@/modules/livechat/server/livechat': { visitorConversation: async () => null, newChatToken: () => crypto.randomBytes(20).toString('hex'), visitorSend: async () => { chatCalls++; return { messages: [], status: 'BOT' } }, requestOperator: async () => { chatCalls++; return { messages: [] } } },
}
function load(relative) {
  let file = path.resolve(relative); if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file += fs.existsSync(file + '.ts') ? '.ts' : '/index.ts'
  if (file.endsWith('.json') || file.endsWith('.cjs')) return require(file)
  if (cache.has(file)) return cache.get(file).exports
  const mod = { exports: {} }; cache.set(file, mod)
  let source = fs.readFileSync(file, 'utf8')
  if (file.endsWith('/human-check.ts') || file.endsWith('\\human-check.ts')) {
    if (process.env.HUMAN_CHECK_FAULT === 'single-use') source = source.replace("return 'reused'", "return 'ok'")
    if (process.env.HUMAN_CHECK_FAULT === 'surface') source = source.replace(' || payload.s !== surface', '')
    if (process.env.HUMAN_CHECK_FAULT === 'signature') source = source.replace('!timingSafeEqual(expected, given)', 'false')
  }
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  new Function('require', 'module', 'exports', compiled)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('@/')) return load('src/' + name.slice(2))
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name))
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const request = (url, body, extra = {}) => new NextRequest('http://localhost:3000' + url, { method: body === undefined ? 'GET' : 'POST', headers: { origin: 'http://localhost:3000', host: 'localhost:3000', 'content-type': 'application/json', 'x-real-ip': stamp, ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
function solve(issued) {
  assert.equal(issued.provider, 'builtin')
  const payload = JSON.parse(Buffer.from(issued.challenge.split('.')[0], 'base64url'))
  salts.push(payload.r)
  for (let n = 0; ; n++) if (rules.leadingZeroBits(crypto.createHash('sha256').update(rules.proofInput(payload.r, n)).digest('hex')) >= issued.bits) return issued.challenge + '.' + n
}
function signed(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url'), derived = crypto.createHmac('sha256', secret).update('mobocom:human-check:v1').digest()
  return body + '.' + crypto.createHmac('sha256', derived).update(body).digest('base64url')
}
let rules, human
async function main() { try {
  for (const name of [key]) saved.set(name, await db.setting.findUnique({ where: { key: name } }))
  rules = load('src/modules/identity/domain/human-check'); human = load('src/modules/identity/server/human-check')
  await human.saveHumanCheck({ provider: 'builtin', difficulty: 'low', surfaces: Object.fromEntries(rules.HUMAN_SURFACES.map(s => [s.key, true])) })
  const headers = new Headers()
  for (const surface of rules.HUMAN_SURFACES) {
    assert.equal(await human.verifyHuman('', headers, surface.key), false)
    const issued = await human.issueHumanCheck(surface.key, Date.now() - 4000), token = solve(issued)
    assert.equal(await human.verifyHuman(token, headers, surface.key), true, surface.key)
    assert.equal(await human.verifyHuman(token, headers, surface.key), false, 'spent ' + surface.key)
  }
  const now = Date.now(), issued = await human.issueHumanCheck('comment', now), proof = solve(issued)
  assert.equal(await human.checkBuiltinProof(proof, 'comment', now + 100), 'too-fast')
  assert.equal(await human.checkBuiltinProof(proof, 'review', now + 4000), 'invalid')
  const parts = proof.split('.'); parts[1] = (parts[1][0] === 'a' ? 'b' : 'a') + parts[1].slice(1)
  assert.equal(await human.checkBuiltinProof(parts.join('.'), 'comment', now + 4000), 'invalid')
  assert.equal(await human.checkBuiltinProof(proof + '.hp', 'comment', now + 4000), 'invalid')
  assert.equal(await human.checkBuiltinProof(proof, 'comment', issued.expiresAt), 'expired')
  const invalidPayload = { v: 1, s: 'comment', r: crypto.randomBytes(16).toString('hex'), b: 24, i: now - 5000, e: now - 5000 + rules.CHALLENGE_TTL_MS }
  assert.equal(await human.checkBuiltinProof(signed(invalidPayload) + '.0', 'comment', now), 'invalid', 'weak work')
  const race = solve(await human.issueHumanCheck('login'))
  assert.equal((await Promise.all(Array.from({ length: 8 }, () => human.verifyHuman(race, headers, 'login')))).filter(Boolean).length, 1, 'only one database claim wins')
  for (const surface of rules.HUMAN_SURFACES) {
    await human.saveHumanCheck({ surfaces: { [surface.key]: false } })
    assert.equal((await human.issueHumanCheck(surface.key)).provider, 'off')
    assert.equal(await human.verifyHuman('', headers, surface.key), true)
    await human.saveHumanCheck({ surfaces: { [surface.key]: true } })
  }
  await Promise.all([human.saveHumanCheck({ surfaces: { forum: false } }), human.saveHumanCheck({ surfaces: { community: false } })])
  const settings = await human.getHumanCheck(); assert.equal(settings.surfaces.forum, false); assert.equal(settings.surfaces.community, false)
  await human.saveHumanCheck({ provider: 'builtin', surfaces: { forum: true, community: true } })
  for (const input of [{ provider: 'invalid' }, { provider: 'turnstile' }, { difficulty: 'extreme' }, { surfaces: { login: 'false' } }]) await assert.rejects(human.saveHumanCheck(input))
  actor = await db.user.create({ data: { email: stamp + '@example.invalid', name: 'Owned Human Check', role: 'ADMIN', passwordHash: 'disabled-fixture-login' } }); users.push(actor.id)
  const { sectionSettingsRevision } = load('src/modules/settings/server/section-history')
  const ctx = { actor, req: request('/api/admin/security'), expected: sectionSettingsRevision(await human.getHumanCheck()) }
  await human.saveHumanCheck({ difficulty: 'normal' }, ctx)
  await assert.rejects(human.saveHumanCheck({ difficulty: 'high' }, ctx), /هم‌زمان/)
  assert.ok(await db.auditLog.count({ where: { actorUserId: actor.id } }), 'strict audit persisted')
  await human.saveHumanCheck({ difficulty: 'low' })
  // Actual password provider: a proof cannot be omitted or replayed even with correct credentials.
  const bcrypt = require('bcryptjs'), password = 'Owned!Human-Password-7429'
  await db.user.update({ where: { id: actor.id }, data: { passwordHash: await bcrypt.hash(password, 4) } })
  const { authOptions } = load('src/modules/identity/auth')
  const authorize = authOptions.providers.find(provider => (provider.options.id || provider.id) === 'credentials').options.authorize
  const login = input => authorize({ email: actor.email, password, ...input }, { headers: { 'x-real-ip': stamp } })
  assert.equal(await login({}), null)
  const loginProof = solve(await human.issueHumanCheck('login'))
  assert.equal(Number((await login({ turnstileToken: loginProof })).id), actor.id)
  assert.equal(await login({ turnstileToken: loginProof }), null)
  const route = load('src/modules/identity/server/http/human-check')
  assert.equal((await route.GET(request('/api/human-check?surface=invalid'))).status, 400)
  const response = await route.GET(request('/api/human-check?surface=login'))
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store')
  const sms = load('src/modules/sms/server/http/public')
  assert.equal((await sms.POST_login_code(request('/api/sms/otp', { phone: '09100000000' }))).status, 400)
  assert.equal(sends, 0)
  assert.equal((await sms.POST_login_code(request('/api/sms/otp', { phone: '09100000000', turnstileToken: solve(await human.issueHumanCheck('entry')) }))).status, 200)
  assert.equal(sends, 1)
  const chat = load('src/modules/livechat/server/http/livechat')
  for (const body of [{ body: 'hello' }, { op: 'operator' }]) assert.equal((await chat.POST_visitor(request('/api/chat', body, { cookie: 'mc_chat=' + 'x'.repeat(32) }))).status, 400, 'fabricated cookie is not an existing conversation')
  assert.equal(chatCalls, 0)
  const chatProof = solve(await human.issueHumanCheck('message', Date.now() - 4000))
  assert.equal((await chat.POST_visitor(request('/api/chat', { body: 'hello', humanCheck: chatProof }))).status, 200)
  assert.equal(chatCalls, 1)
  const security = load('src/modules/identity/server/http/security')
  permitted = false
  assert.equal((await security.GET_policy(request('/api/admin/security?view=human-check'))).status, 403)
  permitted = true
  const current = await security.GET_policy(request('/api/admin/security?view=human-check'))
  const data = await current.json(); assert.equal(data.settings.provider, 'builtin'); assert.ok(data.settingsRevision)
  const put = new NextRequest('http://localhost:3000/api/admin/security?view=human-check', { method: 'PUT', headers: { 'content-type': 'application/json', 'if-match': data.settingsRevision }, body: JSON.stringify({ provider: 'off' }) })
  assert.equal((await security.PUT_policy(put)).status, 403, 'session without Origin cannot change policy')
  const update = new NextRequest('http://localhost:3000/api/admin/security?view=human-check', { method: 'PUT', headers: { origin: 'http://localhost:3000', host: 'localhost:3000', 'content-type': 'application/json', 'if-match': data.settingsRevision }, body: JSON.stringify({ provider: 'off' }) })
  assert.equal((await security.PUT_policy(update)).status, 200)
  assert.equal(await human.verifyHuman('', headers, 'login'), true)
  console.log('Human check: nine surfaces, signed/expired/fast/wrong proofs, single-use race, independent/concurrent switches, strict audit/CAS/Origin, SMS and chat intake passed')
} finally {
  if (salts.length) await db.humanCheckUse.deleteMany({ where: { salt: { in: salts } } })
  for (const [name, value] of saved) { if (value) await db.setting.upsert({ where: { key: name }, create: value, update: { value: value.value } }); else await db.setting.deleteMany({ where: { key: name } }) }
  if (users.length) { await db.auditLog.deleteMany({ where: { actorUserId: { in: users } } }); await db.contentRevision.deleteMany({ where: { actorId: { in: users } } }); await db.user.deleteMany({ where: { id: { in: users } } }) }
  await db.$disconnect()
} }
main().catch(error => { console.error(error); process.exitCode = 1 })
