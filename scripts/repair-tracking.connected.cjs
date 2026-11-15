const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { NextRequest } = require('next/server')
const loader = require('./connected-source-loader.cjs')
assert(process.env.DATABASE_URL && /test|check/i.test(new URL(process.env.DATABASE_URL).pathname), 'disposable test database required')
if (typeof process.getuid === 'function') assert.notEqual(process.getuid(), 0, 'run as a non-root user')
const db = new PrismaClient(), stamp = `repair-${crypto.randomUUID()}`
const phones = Array.from({ length: 3 }, () => `+989${String(crypto.randomInt(0, 1e9)).padStart(9, '0')}`)
const token = () => crypto.randomBytes(18).toString('base64url')
const oldKey = process.env.PANEL_CREDENTIAL_KEY
process.env.PANEL_CREDENTIAL_KEY = crypto.randomBytes(32).toString('hex')
let calls = [], limits = [], allowLimit = true, human = true, before, last, formId, userId, owned = false
const mocks = {
  '@/platform/database/prisma': { db },
  '@/platform/config/env': { authSecret: () => stamp },
  '@/platform/observability/logger': { logEvent() {}, requestIdFrom: () => stamp },
  '@/modules/settings/server': { getSettings: async () => ({ siteUrl: 'http://site.invalid', brandName: 'FixtureBrand' }) },
  '@/platform/http/rate-limit': { clientIp: () => stamp, rateLimitStrict: async key => { limits.push(key); return { ok: allowLimit } } },
  '@/modules/identity/server/human-check': { verifyHuman: async () => human },
  '@/modules/sms/server/ippanel': { sendText: async (...args) => { calls.push(args); return { ok: true, id: '123', error: '' } }, sendPattern: async (...args) => { calls.push(args); return { ok: true, id: '123', error: '' } } },
  react: { ...require('react'), cache: fn => fn },
}
const load = loader(mocks), sms = load('src/modules/sms/server/sms.ts')
const tracking = load('src/modules/forms/server/tracking.ts'), codes = load('src/modules/forms/server/tracking-code.ts')
const api = load('src/modules/forms/server/http/tracking.ts')
async function config(changes) {
  const visible = sms.publicSmsConfig(await sms.getSmsConfig())
  await sms.saveSmsConfig({ ...visible, ...changes })
  last = (await db.setting.findUniqueOrThrow({ where: { key: 'sms.config.v1' } })).value
}
async function post(body, origin = 'http://site.invalid') {
  const headers = { host: 'site.invalid', 'content-type': 'application/json' }
  if (origin) headers.origin = origin
  const res = await api.POST(new NextRequest('http://site.invalid/api/repair-tracking', { method: 'POST', headers, body: JSON.stringify(body) }))
  assert.match(res.headers.get('cache-control'), /private, no-store/)
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer')
  return { status: res.status, body: await res.json() }
}
async function main() {
  before = await db.setting.findUnique({ where: { key: 'sms.config.v1' } })
  assert.equal(await db.user.count({ where: { phone: { in: phones } } }), 0)
  assert.equal(await db.otpCode.count({ where: { phone: { in: phones } } }), 0)
  assert.equal(await db.smsLog.count({ where: { phone: { in: phones } } }), 0); owned = true
  const settings = { service: true, receipt: { enabled: true }, workflow: [{ key: 'OPEN', label: 'Open' }] }
  const form = await db.siteForm.create({ data: { slug: stamp, title: stamp, settings: JSON.stringify(settings) } }); formId = form.id
  const data = JSON.stringify([{ id: 'name', type: 'text', value: 'PRIVATE_NAME' }, { id: 'password', type: 'secret', value: 'PRIVATE_PASSWORD' }, { id: 'mobile', type: 'mobile', value: phones[0] }, { id: 'other', type: 'tel', value: phones[1] }])
  const user = await db.user.create({ data: { email: `${stamp}@example.invalid`, name: stamp, passwordHash: 'fixture-only', phone: phones[0] } }); userId = user.id
  const row = await db.formSubmission.create({ data: { formId, userId, data, receiptToken: token(), pickupCode: '734921', reply: 'Ready' } })
  const other = await db.formSubmission.create({ data: { formId, data, receiptToken: token(), pickupCode: '734921' } })
  const paper = codes.repairTrackingCode(row.id, row.receiptToken)
  const expected = crypto.createHash('sha256').update(`mobocom:repair-tracking:v1:${row.id}:${row.receiptToken}`).digest('hex').slice(0, 20).toUpperCase()
  assert.equal(paper.split('-').slice(1).join(''), expected)
  const view = await tracking.lookupRepair(paper), serialized = JSON.stringify(view)
  assert.deepEqual(Object.keys(view).sort(), ['createdAt', 'number', 'receivedAt', 'repair', 'reply', 'stage', 'stageLabel', 'steps', 'title'].sort())
  assert.deepEqual(Object.keys(view.repair).sort(), ['dueAt', 'estimate', 'history', 'historyTruncated', 'overdue'].sort())
  assert.equal(view.repair.estimate, null); assert.deepEqual(view.repair.history, [])
  for (const secret of ['PRIVATE_NAME', 'PRIVATE_PASSWORD', phones[0], row.receiptToken, row.pickupCode, 'staff', 'answers']) assert(!serialized.includes(secret), secret)
  for (const bad of [`${row.id}-0000-0000-0000-0000-0000`, `${row.id}-${row.pickupCode}`, `${other.id}-${paper.split('-').slice(1).join('-')}`]) await assert.rejects(tracking.lookupRepair(bad))
  await db.formSubmission.update({ where: { id: row.id }, data: { receiptToken: token() } }); await assert.rejects(tracking.lookupRepair(paper))
  await db.formSubmission.update({ where: { id: row.id }, data: { receiptToken: row.receiptToken, status: 'SPAM' } }); await assert.rejects(tracking.lookupRepair(paper))
  await db.formSubmission.update({ where: { id: row.id }, data: { status: 'NEW' } })
  for (const change of [{ service: false }, { receipt: { enabled: false } }]) {
    await db.siteForm.update({ where: { id: formId }, data: { settings: JSON.stringify({ ...settings, ...change }) } }); await assert.rejects(tracking.lookupRepair(paper))
  }
  await db.siteForm.update({ where: { id: formId }, data: { settings: JSON.stringify(settings) } })
  await config({ enabled: true, apiKey: stamp, fromNumber: '3000505', otpText: 'GLOBAL {code}', otpTemplates: { repair: { text: 'REPAIR {service} {brand} {code}', pattern: '', param: 'code' } }, otpTemplateOverrides: { repair: true } })
  let visible = sms.publicSmsConfig(await sms.getSmsConfig()); assert.equal(visible.otpText, 'GLOBAL {code}'); assert.equal(visible.otpTemplateOverrides.repair, true)
  await config(visible); visible = sms.publicSmsConfig(await sms.getSmsConfig()); assert.equal(visible.otpText, 'GLOBAL {code}'); assert.equal(visible.otpTemplates.repair.text, 'REPAIR {service} {brand} {code}')
  await assert.rejects(sms.saveSmsConfig({ ...visible, otpTemplates: { ...visible.otpTemplates, repair: { text: '{code} {evil}', pattern: '', param: 'code' } } }))
  const request = (number, phone) => tracking.requestRepairCode({ number, phone, ip: stamp })
  const miss = await request(row.id + 100000, phones[0]); assert.deepEqual(await request(row.id, phones[1]), miss); assert.equal(calls.length, 0)
  assert.deepEqual(await request(row.id, phones[0]), miss); assert.equal(calls.length, 1)
  assert.equal(calls[0][1], '+983000505'); assert(calls[0][3].includes('REPAIR') && calls[0][3].includes(stamp) && calls[0][3].includes('FixtureBrand')); const code = calls[0][3].match(/\b[1-9]\d{5}\b/)?.[0]; assert(code)
  await assert.rejects(sms.verifyOtp({ phone: phones[0], purpose: 'LOGIN', code }))
  await assert.rejects(sms.verifyOtp({ phone: phones[0], purpose: 'RESET', code }))
  await assert.rejects(tracking.verifyRepairCode({ number: other.id, phone: phones[0], code }))
  const wrong = code === '100000' ? '100001' : '100000'
  for (let i = 1; i <= 5; i++) { await assert.rejects(tracking.verifyRepairCode({ number: row.id, phone: phones[0], code: wrong })); assert.equal((await db.otpCode.findFirstOrThrow({ where: { phone: phones[0], purpose: `REPAIR:${row.id}` }, orderBy: { id: 'desc' } })).attempts, i) }
  await assert.rejects(tracking.verifyRepairCode({ number: row.id, phone: phones[0], code }))
  await db.otpCode.updateMany({ where: { phone: phones[0] }, data: { createdAt: new Date(Date.now() - 61000) } })
  await request(row.id, phones[0]); const fresh = calls.at(-1)[3].match(/\b[1-9]\d{5}\b/)[0]
  await db.formSubmission.update({ where: { id: row.id }, data: { data: data.replace(phones[0], phones[2]) } }); await assert.rejects(tracking.verifyRepairCode({ number: row.id, phone: phones[0], code: fresh }))
  await db.formSubmission.update({ where: { id: row.id }, data: { data } })
  const race = await Promise.allSettled([1, 2].map(() => tracking.verifyRepairCode({ number: row.id, phone: phones[0], code: fresh })))
  assert.equal(race.filter(x => x.status === 'fulfilled').length, 1)
  assert.equal(await db.user.count({ where: { phone: { in: phones } } }), 1)
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: userId } })).phoneVerifiedAt, null)
  await config({ enabled: false }); assert.deepEqual(await request(other.id, phones[0]), miss); assert.equal(calls.length, 2)
  visible = sms.publicSmsConfig(await sms.getSmsConfig()); await config({ ...visible, otpTemplateOverrides: { ...visible.otpTemplateOverrides, repair: false } })
  visible = sms.publicSmsConfig(await sms.getSmsConfig()); assert.equal(visible.otpTemplates.repair.text, 'GLOBAL {code}'); assert.equal(visible.otpTemplateOverrides.repair, false)
  limits = []; assert.equal((await post({ action: 'lookup', trackingCode: paper }, null)).status, 403); assert.equal(limits.length, 0)
  assert.equal((await post({ action: 'lookup', trackingCode: paper }, 'http://foreign.invalid')).status, 403); assert.equal(limits.length, 0)
  assert.equal((await post({ action: 'lookup', trackingCode: paper, extra: 'x'.repeat(4000) })).status, 413)
  human = false; assert.equal((await post({ action: 'lookup', trackingCode: paper })).status, 400); human = true
  allowLimit = false; assert.equal((await post({ action: 'lookup', trackingCode: paper })).status, 429); allowLimit = true
  const ok = await post({ action: 'lookup', trackingCode: paper }); assert.equal(ok.status, 200); assert(limits.some(x => x.startsWith('repair:tracking:receipt:')))
  assert.equal(typeof load('src/app/api/repair-tracking/route.ts').GET, 'undefined')
  console.log('PASS repair tracking connected checks')
}
main().finally(async () => {
  try {
    if (owned) { await db.smsLog.deleteMany({ where: { phone: { in: phones } } }); await db.otpCode.deleteMany({ where: { phone: { in: phones } } }); if (formId) await db.siteForm.deleteMany({ where: { id: formId } }); if (userId) await db.user.deleteMany({ where: { id: userId } }) }
    if (last !== undefined) { const restored = before ? await db.setting.updateMany({ where: { key: 'sms.config.v1', value: last }, data: { value: before.value } }) : await db.setting.deleteMany({ where: { key: 'sms.config.v1', value: last } }); assert.equal(restored.count, 1, 'settings changed concurrently; preserve them') }
  } finally { if (oldKey === undefined) delete process.env.PANEL_CREDENTIAL_KEY; else process.env.PANEL_CREDENTIAL_KEY = oldKey; await db.$disconnect() }
}).catch(error => { console.error(error); process.exitCode = 1 })
