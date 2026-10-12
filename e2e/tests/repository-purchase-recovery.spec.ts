import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { encode } from 'next-auth/jwt'
import { test, expect, watchErrors } from '../helpers'
import { ADMIN_STATE } from '../paths'

for (const mode of ['restore', 'refund', 'stale'] as const) {
  test(`Repository recovery ${mode} uses reviewed historical payment through actual Admin controls`, async ({ page, baseURL }) => {
    test.skip(process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || baseURL !== 'https://e2e.mobocom.test:3443', 'owned compiled fixture required')
    const db = new PrismaClient(), id = `e2e-recover-${randomUUID()}`, snapshots = new Map<string, { key: string; value: string } | null>(), errors = watchErrors(page)
    let buyerId = 0, productId = 0, paymentId = 0
    try {
      const key = 'extension.repository.state.v1'; snapshots.set(key, await db.setting.findUnique({ where: { key } }))
      await db.setting.upsert({ where: { key }, create: { key, value: '{"enabled":true,"settings":{}}' }, update: { value: '{"enabled":true,"settings":{}}' } })
      const buyer = await db.user.create({ data: { email: `${id}@example.invalid`, passwordHash: 'owned fixture', role: 'CUSTOMER' } }); buyerId = buyer.id
      const product = await db.repoProduct.create({ data: { slug: id, name: 'محصول آزمایشی بازیابی', currency: 'IRT', priceMinor: 123n, siteLimit: 2, supportDays: 30, active: true } }); productId = product.id
      await db.walletAccount.create({ data: { userId: buyerId, currency: 'IRT', balanceMinor: 377n } })
      const payment = await db.walletTx.create({ data: { userId: buyerId, amount: -123, amountMinor: -123n, balanceAfter: 377, balanceAfterMinor: 377n, currency: 'IRT', type: 'PURCHASE', status: 'DONE', createdAt: new Date('2020-01-01T00:00:00Z'), idempotencyKey: `repo:buy:${buyerId}:${productId}:owned-recovery-12345` } }); paymentId = payment.id
      await page.context().addCookies(JSON.parse(fs.readFileSync(ADMIN_STATE, 'utf8')).cookies)
      await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/admin/repository/licenses')
      const panel = page.getByTestId('purchase-recovery'); await expect(panel).toBeVisible()
      await panel.getByRole('textbox', { name: 'شناسهٔ تراکنش پرداخت' }).fill(String(paymentId).replace(/[0-9]/g, digit => String.fromCharCode(1776 + Number(digit))))
      await panel.getByRole('textbox', { name: 'شناسهٔ تراکنش پرداخت' }).press('Enter')
      await expect(panel.getByRole('heading', { name: 'پرداخت انجام شده؛ مجوز صادر نشده است' })).toBeVisible()
      const restore = panel.getByRole('button', { name: 'صدور مجوز از پرداخت ثبت‌شده' }), refund = panel.getByRole('button', { name: 'بازگرداندن مبلغ به کیف پول' })
      await expect(restore).toBeDisabled(); await expect(refund).toBeDisabled()
      if (mode === 'restore') {
        fs.mkdirSync('.mobocom', { recursive: true })
        for (const [width, theme] of [[1440, 'dark'], [1440, 'light'], [390, 'dark']] as const) {
          await page.setViewportSize({ width, height: 1000 }); await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
          await panel.scrollIntoViewIfNeeded(); expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
          await panel.screenshot({ path: `.mobocom/recovery-${width}-${theme}.png` })
          if (process.env.E2E_AXE_PATH) {
            await page.evaluate(fs.readFileSync(process.env.E2E_AXE_PATH, 'utf8'))
            const violations = await page.evaluate(async () => (await (window as unknown as { axe: { run: (selector: string, options: object) => Promise<{ violations: object[] }> } }).axe.run('[data-testid="purchase-recovery"]', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations)
            expect(violations).toEqual([])
          }
        }
      }
      const reviewed = panel.getByRole('checkbox', { name: 'پرداخت، دریافت‌کننده و مبلغ را بررسی کردم.' })
      await reviewed.focus(); await page.keyboard.press('Space'); await expect(reviewed).toBeChecked()
      if (mode !== 'refund') await panel.getByRole('checkbox', { name: 'شرایط فعلی محصول و محاسبهٔ دوره از تاریخ پرداخت را تأیید می‌کنم.' }).check()
      if (mode === 'stale') await db.repoProduct.update({ where: { id: productId }, data: { siteLimit: 3 } })
      const decision = page.waitForResponse(response => response.url().endsWith('/api/admin/repository') && response.request().method() === 'POST' && response.request().postDataJSON()?.op === 'purchase.recover')
      await (mode === 'refund' ? refund : restore).click()
      expect((await decision).status()).toBe(mode === 'stale' ? 409 : 200)
      if (mode === 'stale') { await expect(panel.getByRole('alert')).toContainText('دوباره بررسی کنید'); expect(await db.repoLicense.count({ where: { productId } })).toBe(0) }
      else if (mode === 'restore') {
        await expect(panel.getByRole('status')).toContainText('مجوز ثبت شد')
        const receipt = await db.repoLicense.findFirstOrThrow({ where: { userId: buyerId, productId } })
        expect(receipt.createdAt.toISOString()).toBe('2020-01-01T00:00:00.000Z'); expect(receipt.updatesUntil?.toISOString()).toBe('2020-01-31T00:00:00.000Z')
        expect(receipt.keyEnc).not.toMatch(/^MBC-/)
      } else { await expect(panel.getByRole('status')).toContainText('بازگردانده شد'); expect((await db.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId: buyerId, currency: 'IRT' } } })).balanceMinor).toBe(500n) }
      expect(await db.walletTx.findUniqueOrThrow({ where: { id: paymentId } })).toEqual(payment)
      expect(errors).toEqual([])
    } finally {
      try {
        if (paymentId) await db.auditLog.deleteMany({ where: { action: 'repository.license.recover', targetType: 'repository', targetId: String(paymentId) } })
        if (productId) await db.repoProduct.deleteMany({ where: { id: productId, slug: id } })
        if (buyerId) { await db.walletTx.deleteMany({ where: { userId: buyerId } }); await db.walletAccount.deleteMany({ where: { userId: buyerId } }); await db.user.deleteMany({ where: { id: buyerId, email: `${id}@example.invalid` } }) }
      } finally { try { for (const [key, row] of snapshots) { if (row) await db.setting.upsert({ where: { key }, create: { key, value: row.value }, update: { value: row.value } }); else await db.setting.deleteMany({ where: { key } }) } } finally { await db.$disconnect() } }
    }
  })
}

test('Repository-only staff cannot see financial recovery controls or call the recovery API', async ({ browser, baseURL }) => {
  test.skip(process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || baseURL !== 'https://e2e.mobocom.test:3443' || !process.env.NEXTAUTH_SECRET, 'owned compiled fixture required')
  const db = new PrismaClient(), id = `e2e-recovery-role-${randomUUID()}`, snapshots = new Map<string, { key: string; value: string } | null>()
  let actorId = 0, roleId = 0
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, extraHTTPHeaders: { origin: baseURL! } })
  try {
    for (const [key, value] of [['extension.repository.state.v1', '{"enabled":true,"settings":{}}'], ['security.policy.v1', '{"requireAdmin2fa":false}']]) {
      snapshots.set(key, await db.setting.findUnique({ where: { key } })); await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
    }
    const role = await db.role.create({ data: { name: id, permissions: 'repository.manage' } }); roleId = role.id
    const actor = await db.user.create({ data: { email: `${id}@example.invalid`, passwordHash: 'owned fixture', role: 'ADMIN', roleId } }); actorId = actor.id
    const endpoint = '/api/admin/repository?view=purchase-recovery&paymentId=1'
    expect((await context.request.get(endpoint)).status()).toBe(403)
    const token = await encode({ secret: process.env.NEXTAUTH_SECRET!, token: { uid: String(actorId), sub: String(actorId), role: 'ADMIN', authAt: Date.now() } })
    await context.addCookies([{ name: '__Secure-next-auth.session-token', value: token, domain: new URL(baseURL!).hostname, path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' }])
    const page = await context.newPage(); await page.goto('/admin/repository/licenses')
    await expect(page.getByRole('heading', { name: 'لایسنس‌ها', exact: true })).toBeVisible()
    const list = await context.request.get('/api/admin/repository?view=licenses'); expect(list.status()).toBe(200); expect((await list.json()).canRecoverPurchases).toBe(false)
    await expect(page.getByTestId('purchase-recovery')).toHaveCount(0)
    expect((await context.request.get(endpoint)).status()).toBe(403)
    expect((await context.request.post('/api/admin/repository', { data: { op: 'purchase.recover', paymentId: 1, mode: 'refund', evidence: 'untrusted' } })).status()).toBe(403)
  } finally {
    try { await context.close(); if (actorId) await db.user.deleteMany({ where: { id: actorId, email: `${id}@example.invalid` } }); if (roleId) await db.role.deleteMany({ where: { id: roleId, name: id } }) }
    finally { try { for (const [key, row] of snapshots) { if (row) await db.setting.upsert({ where: { key }, create: { key, value: row.value }, update: { value: row.value } }); else await db.setting.deleteMany({ where: { key } }) } } finally { await db.$disconnect() } }
  }
})
