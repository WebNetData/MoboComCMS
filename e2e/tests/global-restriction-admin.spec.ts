import fs from 'node:fs'
import { PrismaClient } from '@prisma/client'
import { encode } from 'next-auth/jwt'
import { test, expect, watchErrors } from '../helpers'
import { ADMIN_STATE } from '../paths'

test('global restriction Admin preserves history, permissions and responsive themed controls', async ({ admin, page, playwright, baseURL }) => {
  test.skip(process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || baseURL !== 'https://e2e.mobocom.test:3443' || !process.env.NEXTAUTH_SECRET, 'owned compiled PostgreSQL fixture required')
  const db = new PrismaClient(), stamp = `e2e-global-admin-${Date.now()}`, users: number[] = [], roles: number[] = [], errors = watchErrors(page)
  const contexts: Awaited<ReturnType<typeof playwright.request.newContext>>[] = []
  try {
    const target = await db.user.create({ data: { email: `${stamp}-target@example.invalid`, name: 'کاربر آزمایشی محدودیت', passwordHash: 'fixture-only' } }); users.push(target.id)
    const endpoint = `/api/admin/users/${target.id}/restrictions`
    const privateHistory = await admin.get(endpoint)
    expect(privateHistory.status()).toBe(200)
    expect(privateHistory.headers()['cache-control']).toContain('no-store')
    await page.context().addCookies(JSON.parse(fs.readFileSync(ADMIN_STATE, 'utf8')).cookies)
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`/admin/users/${target.id}`, { waitUntil: 'networkidle' })
    const panel = page.getByTestId('global-restrictions')
    await expect(panel.getByText('محدودیت سراسری ثبت نشده است.')).toBeVisible()
    await panel.getByLabel('دلیل محدودیت', { exact: true }).focus()
    await page.keyboard.press('Tab')
    await expect(panel.getByRole('combobox', { name: /^مدت/ })).toBeFocused()
    await page.route(`**${endpoint}`, async route => {
      if (route.request().method() === 'POST') await new Promise(resolve => setTimeout(resolve, 750))
      await route.continue()
    })
    await panel.getByLabel('دلیل محدودیت', { exact: true }).fill('محدودیت اول آزمایشی')
    await panel.getByLabel('ثبت محدودیت برای این حساب را تأیید می‌کنم.').check()
    await panel.getByRole('button', { name: 'ثبت محدودیت', exact: true }).click()
    await expect(panel.getByRole('combobox', { name: /^مدت/ })).toBeDisabled()
    await expect(panel.getByText('محدودیت ثبت شد.', { exact: true })).toBeVisible()
    await page.unroute(`**${endpoint}`)
    const first = await db.accessRestriction.findFirstOrThrow({ where: { userId: target.id, scope: 'GLOBAL' } }); expect(first.issuanceAuditId).toBeTruthy()
    await panel.getByLabel('دلیل محدودیت', { exact: true }).fill('محدودیت دوم مستقل')
    await panel.getByRole('combobox', { name: /^مدت/ }).selectOption('forever')
    await panel.getByLabel('ثبت محدودیت برای این حساب را تأیید می‌کنم.').check()
    await panel.getByRole('button', { name: 'ثبت محدودیت', exact: true }).click()
    await expect.poll(() => db.accessRestriction.count({ where: { userId: target.id, revokedAt: null } })).toBe(2)
    await expect(panel.getByText('محدودیت دوم مستقل', { exact: true })).toBeVisible()
    const second = await db.accessRestriction.findFirstOrThrow({ where: { userId: target.id, id: { not: first.id } } }); expect(second.expiresAt).toBeNull()
    await page.route(`**${endpoint}`, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'بازخوانی آزمایشی ناموفق' }) }))
    await panel.getByRole('button', { name: 'بازخوانی تاریخچه' }).click()
    await expect(panel.getByRole('alert')).toHaveText('بازخوانی آزمایشی ناموفق')
    await expect(panel.getByRole('button', { name: 'ثبت محدودیت', exact: true })).toBeDisabled()
    expect(await db.accessRestriction.count({ where: { userId: target.id, revokedAt: null } })).toBe(2)
    await page.unroute(`**${endpoint}`)
    await panel.getByRole('button', { name: 'بازخوانی تاریخچه' }).click()
    await expect(panel.getByRole('button', { name: 'ثبت محدودیت', exact: true })).toBeEnabled()
    fs.mkdirSync('.mobocom', { recursive: true })
    for (const [width, theme] of [[1440, 'dark'], [1440, 'light'], [390, 'dark']] as const) {
      await page.setViewportSize({ width, height: 1000 })
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
      await panel.scrollIntoViewIfNeeded()
      expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
      await panel.screenshot({ path: `.mobocom/global-admin-${width}-${theme}.png` })
      if (process.env.E2E_AXE_PATH) {
        await page.evaluate(fs.readFileSync(process.env.E2E_AXE_PATH, 'utf8'))
        const violations = await page.evaluate(async () => {
          const axe = (window as unknown as { axe: { run: (context: string, options: object) => Promise<{ violations: { id: string; impact: string }[] }> } }).axe
          return (await axe.run('[data-testid="global-restrictions"]', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations
        })
        expect(violations).toEqual([])
      }
    }
    await panel.getByRole('button', { name: `لغو محدودیت #${second.id}`, exact: true }).click()
    await panel.getByLabel('دلیل لغو', { exact: true }).fill('لغو فقط محدودیت دوم')
    await panel.getByLabel('لغو همین محدودیت را تأیید می‌کنم.').check()
    await panel.getByRole('button', { name: 'تأیید لغو محدودیت', exact: true }).click()
    await expect(panel.getByText('محدودیت لغو شد؛ سایر محدودیت‌ها حفظ شدند.', { exact: true })).toBeVisible()
    expect((await db.accessRestriction.findUniqueOrThrow({ where: { id: second.id } })).revocationAuditId).toBeTruthy()
    expect((await db.accessRestriction.findUniqueOrThrow({ where: { id: first.id } })).revokedAt).toBeNull()
    expect((await db.user.findUniqueOrThrow({ where: { id: target.id } })).status).toBe('ACTIVE')
    const guest = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL! } }); contexts.push(guest)
    expect((await guest.get(endpoint)).status()).toBe(403)
    const before = await db.accessRestriction.count({ where: { userId: target.id } })
    expect((await admin.post(endpoint, { headers: { origin: 'https://evil.example.invalid' }, data: { action: 'issue', days: 1, reason: 'wrong origin' } })).status()).toBe(403)
    expect(await db.accessRestriction.count({ where: { userId: target.id } })).toBe(before)
    const forumRole = await db.role.create({ data: { name: stamp, permissions: 'forum.moderate' } }); roles.push(forumRole.id)
    const moderator = await db.user.create({ data: { email: `${stamp}-moderator@example.invalid`, passwordHash: 'fixture-only', role: 'ADMIN', roleId: forumRole.id } }); users.push(moderator.id)
    const token = await encode({ secret: process.env.NEXTAUTH_SECRET!, token: { uid: String(moderator.id), sub: String(moderator.id), role: 'ADMIN', roleId: forumRole.id, permissions: ['forum.moderate'], email: moderator.email, authAt: Date.now() } })
    const limited = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL! }, storageState: { cookies: [{ name: '__Secure-next-auth.session-token', value: token, domain: new URL(baseURL!).hostname, path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' }], origins: [] } }); contexts.push(limited)
    expect((await limited.get(endpoint)).status()).toBe(403)
    expect((await limited.post(endpoint, { data: { action: 'revoke', id: first.id, reason: 'wrong section' } })).status()).toBe(403)
    expect((await admin.post(endpoint, { data: { action: 'revoke', id: first.id, reason: 'authorized recovery' } })).status()).toBe(200)
    expect((await admin.post(endpoint, { data: { action: 'revoke', id: first.id, reason: 'duplicate recovery' } })).status()).toBe(409)
    const supportRole = await db.role.create({ data: { name: `${stamp}-support`, permissions: 'users.manage' } }); roles.push(supportRole.id)
    const support = await db.user.create({ data: { email: `${stamp}-support@example.invalid`, passwordHash: 'fixture-only', role: 'ADMIN', roleId: supportRole.id } }); users.push(support.id)
    await db.user.update({ where: { id: target.id }, data: { role: 'ADMIN', roleId: null } })
    const supportToken = await encode({ secret: process.env.NEXTAUTH_SECRET!, token: { uid: String(support.id), sub: String(support.id), role: 'ADMIN', roleId: supportRole.id, permissions: ['users.manage'], email: support.email, authAt: Date.now() } })
    await page.context().addCookies([{ name: '__Secure-next-auth.session-token', value: supportToken, domain: new URL(baseURL!).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }])
    await page.goto(`/admin/users/${target.id}`, { waitUntil: 'networkidle' })
    await expect(page.getByTestId('global-restrictions').getByText('برای مدیریت محدودیت این حساب دسترسی ندارید.')).toBeVisible()
    await expect(page.getByTestId('global-restrictions').getByLabel('دلیل محدودیت', { exact: true })).toHaveCount(0)
    expect(errors).toEqual([])
  } finally {
    for (const context of contexts) await context.dispose()
    try {
      const ids = (await db.accessRestriction.findMany({ where: { userId: { in: users } }, select: { issuanceAuditId: true, revocationAuditId: true } })).flatMap(r => [r.issuanceAuditId, r.revocationAuditId]).filter((id): id is number => id !== null)
      await db.accessRestriction.deleteMany({ where: { userId: { in: users } } })
      await db.auditLog.deleteMany({ where: { id: { in: ids } } })
      await db.user.deleteMany({ where: { id: { in: users }, email: { startsWith: stamp } } })
      await db.role.deleteMany({ where: { id: { in: roles }, name: { startsWith: stamp } } })
    } finally { await db.$disconnect() }
  }
})
