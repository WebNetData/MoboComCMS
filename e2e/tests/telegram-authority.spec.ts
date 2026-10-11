import http from 'node:http'
import crypto from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { encode } from 'next-auth/jwt'
import { test, expect } from '../helpers'

test('compiled Telegram account commands deny GLOBAL and preserve history on canonical merge', async ({ admin, playwright, baseURL }) => {
  test.skip(process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || baseURL !== 'https://e2e.mobocom.test:3443' || !process.env.NEXTAUTH_SECRET, 'owned compiled PostgreSQL fixture required')
  for (const key of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_USERNAME', 'TELEGRAM_API_BASE', 'TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_ENABLED']) expect(process.env[key] || '').toBe('')
  const db = new PrismaClient(), stamp = `e2e-telegram-authority-${Date.now()}`, tgId = String(8000000000000 + Date.now() % 1000000000000)
  const users: number[] = [], auditIds: number[] = [], tickets: string[] = [], messages: { method: string; payload: Record<string, unknown> }[] = []
  const settings = ['telegramBotToken', 'telegramBotUsername', 'telegramApiBase', 'telegramWebhookSecret', 'telegramEnabled']
  const before = await db.setting.findMany({ where: { key: { in: settings } } })
  const contexts: Awaited<ReturnType<typeof playwright.request.newContext>>[] = []
  const server = http.createServer(async (req, res) => {
    if (!req.url?.startsWith(`/bot${stamp}/`)) { res.writeHead(404); res.end(); return }
    const chunks = []; for await (const chunk of req) chunks.push(chunk)
    messages.push({ method: req.url.split('/').at(-1)!, payload: JSON.parse(Buffer.concat(chunks).toString('utf8')) })
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true, result: { message_id: messages.length } }))
  })
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as { port: number }).port
    const config = { telegramBotToken: stamp, telegramBotUsername: 'fixture_bot', telegramApiBase: `http://127.0.0.1:${port}`, telegramWebhookSecret: stamp, telegramEnabled: 'true' }
    for (const [key, value] of Object.entries(config)) await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
    const source = await db.user.create({ data: { email: `tg${tgId}.0123456789abcdef@telegram.local`, passwordHash: 'owned-fixture', name: `PRIVATE-${stamp}`, telegramId: tgId, lastLoginAt: new Date('2020-01-01'), walletBalance: 75 } }); users.push(source.id)
    const target = await db.user.create({ data: { email: `${stamp}-target@example.invalid`, passwordHash: 'owned-fixture' } }); users.push(target.id)
    const username = `tg_${Date.now()}`
    const profile = await db.userProfile.create({ data: { userId: source.id, username, bio: `kept-${stamp}`, privacy: '{"messages":"none"}', updatedAt: new Date('2021-02-03') } })
    await db.walletAccount.create({ data: { userId: source.id, currency: 'USD', balanceMinor: 7500n } })
    for (const key of [`telegram.locale.${tgId}`, `user.locale.${source.id}`]) await db.setting.create({ data: { key, value: 'fa' } })
    const from = { id: Number(tgId), first_name: 'incoming name', username: 'incoming_username' }
    const message = (text: string) => ({ message: { chat: { id: Number(tgId), type: 'private' }, from, text } })
    const callback = (data: string) => ({ callback_query: { id: stamp, from, message: { chat: { id: Number(tgId), type: 'private' }, message_id: 1 }, data } })
    const guest = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL! } }); contexts.push(guest)
    const send = (update: object, secret = stamp) => guest.post('/api/telegram/webhook', { headers: { 'x-telegram-bot-api-secret-token': secret }, data: update })
    const issue = async (id: number) => {
      const response = await admin.post(`/api/admin/users/${id}/restrictions`, { data: { action: 'issue', days: 1, reason: stamp } }); expect(response.status()).toBe(200)
      const row = await response.json(); auditIds.push(row.issuanceAuditId); return row
    }
    const revoke = async (id: number, restrictionId: number) => {
      const response = await admin.post(`/api/admin/users/${id}/restrictions`, { data: { action: 'revoke', id: restrictionId, reason: stamp } }); expect(response.status()).toBe(200)
      const row = await db.accessRestriction.findUniqueOrThrow({ where: { id: restrictionId } }); auditIds.push(row.revocationAuditId!)
    }
    const token = await encode({ secret: process.env.NEXTAUTH_SECRET!, token: { uid: String(target.id), sub: String(target.id), role: 'CUSTOMER', email: target.email, authAt: Date.now() } })
    const targetContext = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL! }, storageState: { cookies: [{ name: '__Secure-next-auth.session-token', value: token, domain: new URL(baseURL!).hostname, path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' }], origins: [] } }); contexts.push(targetContext)
    const ticket = async () => {
      const response = await targetContext.get('/api/telegram/link'); expect(response.status()).toBe(200)
      const data = await response.json(), value = new URL(data.deepLink).searchParams.get('start')!; tickets.push(value.slice(5)); return value
    }
    const oldTargetTicket = await ticket(), blocked = await issue(source.id)
    const sourceBefore = await db.user.findUniqueOrThrow({ where: { id: source.id } }), balanceBefore = await db.walletAccount.findMany({ where: { userId: source.id } })
    const privateMessages = () => messages.filter(item => item.payload.chat_id === Number(tgId) || item.payload.callback_query_id === stamp)
    for (const text of ['/start', `/start ${oldTargetTicket}`, '/link', '/me', '/sub', '/wallet']) expect((await send(message(text))).status()).toBe(200)
    for (const data of ['lang:en', 'plan:view:1', 'buy:wallet:1', 'buy:gateway:1', 'subs:list', 'sub:disable:1']) expect((await send(callback(data))).status()).toBe(200)
    expect(privateMessages().length).toBe(12)
    expect(privateMessages().every(item => String(item.payload.text).includes('حساب شما فعال نیست.'))).toBe(true)
    expect(await db.user.findUniqueOrThrow({ where: { id: source.id } })).toEqual(sourceBefore)
    expect(await db.walletAccount.findMany({ where: { userId: source.id } })).toEqual(balanceBefore)
    expect(await db.order.count({ where: { userId: { in: users } } })).toBe(0)
    expect(await db.invoice.count({ where: { userId: { in: users } } })).toBe(0)
    expect((await db.setting.findUniqueOrThrow({ where: { key: `telegram.locale.${tgId}` } })).value).toBe('fa')
    const count = privateMessages().length
    expect((await send(message('/me'), 'forged')).status()).toBe(403)
    expect((await send({ message: { ...message('/me').message, chat: { id: Number(tgId), type: 'group' } } })).status()).toBe(200)
    expect(privateMessages().length).toBe(count)
    await revoke(source.id, blocked.id)
    expect((await send(message('/me'))).status()).toBe(200)
    expect(String(privateMessages().at(-1)?.payload.text)).toContain(source.name)
    const targetBlock = await issue(target.id), targetBefore = await db.user.findUniqueOrThrow({ where: { id: target.id } })
    expect((await send(message(`/start ${oldTargetTicket}`))).status()).toBe(200)
    expect(await db.user.findUniqueOrThrow({ where: { id: target.id } })).toEqual(targetBefore)
    expect(await db.user.findUnique({ where: { id: source.id } })).not.toBeNull()
    await revoke(target.id, targetBlock.id)
    await db.accessRestriction.create({ data: { userId: source.id, scope: 'MODULE', moduleKey: 'forum', effectKey: 'forum.suspend', capabilities: '["forum.post"]', reason: stamp, expiresAt: new Date(Date.now() + 86400000) } })
    const history = await db.accessRestriction.findMany({ where: { userId: source.id }, orderBy: { id: 'asc' } })
    const oldPublic = await guest.get(`/u/${username}`); expect(oldPublic.status()).toBe(200); expect(await oldPublic.text()).toContain(`kept-${stamp}`)
    await db.userProfile.create({ data: { userId: target.id, username: `target_${Date.now()}` } })
    const beforeCollision = await db.user.findMany({ where: { id: { in: users } }, orderBy: { id: 'asc' } })
    expect((await send(message(`/start ${await ticket()}`))).status()).toBe(200)
    expect(await db.user.findMany({ where: { id: { in: users } }, orderBy: { id: 'asc' } })).toEqual(beforeCollision)
    expect(await db.userProfile.findUniqueOrThrow({ where: { username } })).toEqual(profile)
    expect((await db.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId: source.id, currency: 'USD' } } })).balanceMinor).toBe(7500n)
    await db.userProfile.delete({ where: { userId: target.id } })
    expect((await send(message(`/start ${await ticket()}`))).status()).toBe(200)
    expect(await db.user.findUnique({ where: { id: source.id } })).toBeNull()
    expect((await db.user.findUniqueOrThrow({ where: { id: target.id } })).telegramId).toBe(tgId)
    expect(await db.accessRestriction.findMany({ where: { id: { in: history.map(row => row.id) } }, orderBy: { id: 'asc' } })).toEqual(history.map(row => ({ ...row, userId: target.id })))
    expect((await db.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId: target.id, currency: 'USD' } } })).balanceMinor).toBe(7500n)
    expect(await db.walletAccount.count({ where: { userId: source.id } })).toBe(0)
    expect(await db.userProfile.findUniqueOrThrow({ where: { username } })).toEqual({ ...profile, userId: target.id })
    const keptPublic = await guest.get(`/u/${username}`); expect(keptPublic.status()).toBe(200); expect(await keptPublic.text()).toContain(`kept-${stamp}`)
  } finally {
    for (const context of contexts) await context.dispose()
    try {
      for (const key of settings) { const row = before.find(item => item.key === key); if (row) await db.setting.upsert({ where: { key }, create: { key, value: row.value }, update: { value: row.value } }); else await db.setting.deleteMany({ where: { key } }) }
      await db.accessRestriction.deleteMany({ where: { userId: { in: users } } })
      await db.auditLog.deleteMany({ where: { id: { in: auditIds } } })
      await db.walletAccount.deleteMany({ where: { userId: { in: users } } })
      await db.userProfile.deleteMany({ where: { userId: { in: users } } })
      await db.setting.deleteMany({ where: { key: { in: [`telegram.locale.${tgId}`, ...users.map(id => `user.locale.${id}`), ...tickets.map(value => `telegram.link.${crypto.createHash('sha256').update(value).digest('hex')}`)] } } })
      await db.user.deleteMany({ where: { id: { in: users } } })
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); await db.$disconnect() }
  }
})
