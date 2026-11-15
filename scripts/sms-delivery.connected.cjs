// Offline provider, real PostgreSQL, crypto and production SMS owners. Run on a disposable test database.
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const sourceLoader = require('./connected-source-loader.cjs')
const db = new PrismaClient()
const stamp = `owned-sms-${crypto.randomUUID()}`
const suffix = String(crypto.randomInt(0, 100000000)).padStart(8, '0')
const phone = n => `+989${String((Number(suffix) + n) % 1000000000).padStart(9, '0')}`
const phones = Array.from({ length: 10 }, (_, i) => phone(i))
const priorKey = process.env.PANEL_CREDENTIAL_KEY
let outcome = { ok: true, id: '123', error: '' }, calls = []
const provider = async (...args) => { calls.push(args); return outcome }
const load = sourceLoader({
  '@/platform/database/prisma': { db },
  '@/platform/config/env': { authSecret: () => stamp },
  '@/platform/observability/logger': { logEvent: () => {} },
  '@/modules/settings/server': { getSettings: async () => ({}) },
  '@/platform/http/rate-limit': { rateLimitStrict: async () => ({ ok: true }) },
  '@/modules/sms/server/ippanel': { sendText: provider, sendPattern: provider, credit: async () => ({ ok: true, credit: 0 }) },
})
async function main() {
  const owner = load('src/modules/sms/server/sms.ts')
  let before, last, read = false, phonesOwned = false
  try {
    before = await db.setting.findUnique({ where: { key: 'sms.config.v1' } }); read = true
    process.env.PANEL_CREDENTIAL_KEY = crypto.randomBytes(32).toString('hex')
    await owner.saveSmsConfig({ enabled: true, apiKey: stamp, fromNumber: '3000505' })
    last = (await db.setting.findUniqueOrThrow({ where: { key: 'sms.config.v1' } })).value
    assert.equal(await db.smsLog.count({ where: { phone: { in: phones } } }), 0, 'fixture phone must be unused')
    assert.equal(await db.otpCode.count({ where: { phone: { in: phones } } }), 0, 'fixture phone must be unused')
    phonesOwned = true
    const config = await owner.getSmsConfig(), input = { phone: phones[0], event: 'ORDER_STATUS', text: stamp, deliveryKey: `${stamp}:key` }
    const results = await Promise.all(Array.from({ length: 6 }, () => owner.sendSmsResult(input, config)))
    assert.equal(calls.length, 1); assert.equal(new Set(results.map(r => r.logId)).size, 1)
    assert.equal((await db.smsLog.findUniqueOrThrow({ where: { dedupeKey: input.deliveryKey } })).status, 'SENT')
    await assert.rejects(owner.sendSmsResult({ ...input, text: `${stamp}-collision` }, config), e => e.status === 409)
    const duplicate = await owner.sendSmsResult({ phone: phones[0], event: input.event, text: stamp }, config)
    assert.equal(duplicate.status, 'SKIPPED')
    // Simulate failure at the reservation boundary; no provider call may escape it.
    const failingDb = new Proxy(db, { get(target, prop) { if (prop === '$transaction') return async () => { throw Error('synthetic reservation failure') }; const value = target[prop]; return typeof value === 'function' ? value.bind(target) : value } })
    const failingLoad = sourceLoader({
      '@/platform/database/prisma': { db: failingDb },
      '@/platform/config/env': { authSecret: () => stamp },
      '@/platform/observability/logger': { logEvent: () => {} },
      '@/modules/settings/server': { getSettings: async () => ({}) },
      '@/platform/http/rate-limit': { rateLimitStrict: async () => ({ ok: true }) },
      '@/modules/sms/server/ippanel': { sendText: provider, sendPattern: provider, credit: async () => ({ ok: true, credit: 0 }) },
    })
    calls = []
    await assert.rejects(failingLoad('src/modules/sms/server/sms.ts').sendSmsResult({ phone: phones[9], event: 'TEST', text: stamp }, config), /synthetic reservation failure/)
    assert.equal(calls.length, 0)
    calls = []
    const many = await Promise.all(Array.from({ length: 16 }, (_, i) => owner.sendSmsResult({ phone: phones[1], event: 'ORDER_STATUS', text: `${stamp}-${i}`, deliveryKey: `${stamp}:cap:${i}` }, config)))
    assert.equal(many.filter(r => r.status === 'SENT').length, 12); assert.equal(calls.length, 12)
    await db.smsLog.create({ data: { phone: phones[2], event: 'ORDER_STATUS', body: stamp, status: 'SENT' } })
    assert.equal((await owner.sendSmsResult({ phone: phones[2], event: 'ORDER_STATUS', text: stamp }, config)).status, 'SKIPPED')
    outcome = { ok: false, unknown: true, id: '', error: 'transport' }; calls = []
    const unknown = { phone: phones[3], event: 'TEST', text: stamp, deliveryKey: `${stamp}:unknown` }
    assert.equal((await owner.sendSmsResult(unknown, config)).status, 'UNKNOWN')
    assert.equal((await owner.sendSmsResult(unknown, config)).status, 'UNKNOWN'); assert.equal(calls.length, 1)
    outcome = { ok: false, id: '', error: 'rejected' }; calls = []
    const failed = { phone: phones[4], event: 'TEST', text: stamp, deliveryKey: `${stamp}:failed` }
    assert.equal((await owner.sendSmsResult(failed, config)).status, 'FAILED')
    assert.equal((await owner.sendSmsResult(failed, config)).status, 'FAILED'); assert.equal(calls.length, 1)
    outcome = { ok: true, id: '123', error: '' }
    const secret = `${stamp}-123456`
    const otp = await owner.sendSmsResult({ phone: phones[5], event: 'OTP_LOGIN', kind: 'OTP', text: secret, deliveryKey: `${stamp}:secret` }, config)
    const row = await db.smsLog.findUniqueOrThrow({ where: { id: otp.logId } })
    assert(!JSON.stringify(row).includes(secret)); assert(!row.body.includes('123456'))
    calls = []
    const requests = await Promise.allSettled(Array.from({ length: 2 }, () => owner.requestOtp({ phone: phones[6], purpose: 'LOGIN', ip: stamp })))
    assert.equal(requests.filter(r => r.status === 'fulfilled').length, 1)
    assert.equal(calls.length, 1)
    const code = calls[0][3].match(/\b[1-9]\d{5}\b/)?.[0]
    assert(code, 'synthetic provider captured the OTP')
    const verifications = await Promise.allSettled(Array.from({ length: 2 }, () => owner.verifyOtp({ phone: phones[6], purpose: 'LOGIN', code })))
    assert.equal(verifications.filter(r => r.status === 'fulfilled').length, 1)
    outcome = { ok: false, unknown: true, id: '', error: 'transport' }
    assert.equal((await owner.requestOtp({ phone: phones[7], purpose: 'LOGIN', ip: stamp })).delivery, 'UNKNOWN')
    assert.equal((await db.otpCode.findFirstOrThrow({ where: { phone: phones[7] } })).consumedAt, null)
    outcome = { ok: false, id: '', error: 'rejected' }
    await assert.rejects(owner.requestOtp({ phone: phones[8], purpose: 'LOGIN', ip: stamp }))
    assert.notEqual((await db.otpCode.findFirstOrThrow({ where: { phone: phones[8] } })).consumedAt, null)
    const revision = owner.publicSmsConfig(config).revision
    await owner.saveSmsConfig({ ...owner.publicSmsConfig(config), revision, fromNumber: '3000506' })
    last = (await db.setting.findUniqueOrThrow({ where: { key: 'sms.config.v1' } })).value
    await assert.rejects(owner.saveSmsConfig({ ...owner.publicSmsConfig(config), revision, fromNumber: '3000507' }), e => e.status === 409)
    assert.equal((await db.setting.findUniqueOrThrow({ where: { key: 'sms.config.v1' } })).value, last)
    // An invalid audit actor forces the strict audit insert to fail; the setting update must roll back.
    const current = await owner.getSmsConfig()
    await assert.rejects(owner.saveSmsConfig({ ...owner.publicSmsConfig(current), fromNumber: '3000508' }, { actor: null, req: null }))
    assert.equal((await db.setting.findUniqueOrThrow({ where: { key: 'sms.config.v1' } })).value, last)
    console.log('SMS delivery PostgreSQL checks passed')
  } finally {
    try {
      if (phonesOwned) {
        await db.smsLog.deleteMany({ where: { phone: { in: phones } } })
        await db.otpCode.deleteMany({ where: { phone: { in: phones } } })
      }
      if (read && last !== undefined) {
        const restored = before ? await db.setting.updateMany({ where: { key: 'sms.config.v1', value: last }, data: { value: before.value } }) : await db.setting.deleteMany({ where: { key: 'sms.config.v1', value: last } })
        assert.equal(restored.count, 1, 'settings changed concurrently; preserve them for review')
      }
    } finally { if (priorKey === undefined) delete process.env.PANEL_CREDENTIAL_KEY; else process.env.PANEL_CREDENTIAL_KEY = priorKey; await db.$disconnect() }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
