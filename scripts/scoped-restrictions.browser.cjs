// Persisted Admin workflow against an explicitly disposable, compiled local fixture.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
const { PrismaClient } = require('@prisma/client'), { encode } = require('next-auth/jwt')
const { chromium, expect: pwExpect } = require('@playwright/test')
const { fixtureTLS } = require('./e2e-fixture-tls.cjs')
const expect = pwExpect.configure({ timeout: 20000 })
const baseURL = process.env.E2E_BASE_URL
if (process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || baseURL !== 'https://e2e.mobocom.test:3443' || !process.env.DATABASE_URL || !process.env.NEXTAUTH_SECRET) throw Error('DISPOSABLE_COMPILED_FIXTURE_REQUIRED')
const db = new PrismaClient(), seed = `sr${Date.now().toString(36)}`, users = [], roles = []
let browser
async function main() {
  const role = await db.role.create({ data: { name: seed, permissions: 'dashboard.view,forum.moderate' } }); roles.push(role)
  const magazineRole = await db.role.create({ data: { name: seed + '-magazine', permissions: 'dashboard.view,cms.posts' } }); roles.push(magazineRole)
  for (const [name, data] of [['manager', { role: 'ADMIN', roleId: role.id }], ['member', {}], ['owner', { role: 'ADMIN' }], ['magazine', { role: 'ADMIN', roleId: magazineRole.id }]]) {
    const user = await db.user.create({ data: { email: `${seed}-${name}@example.invalid`, name: `${seed} ${name}`, passwordHash: 'fixture-only', totpEnabledAt: new Date(), ...data } }); users.push(user)
    await db.forumProfile.create({ data: { userId: user.id, username: seed + name } })
  }
  const tokenFor = user => encode({ secret: process.env.NEXTAUTH_SECRET, token: { uid: String(user.id), sub: String(user.id), email: user.email, role: user.role, authAt: Date.now() } })
  browser = await chromium.launch({ headless: true, args: fixtureTLS(baseURL).args })
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { Origin: baseURL } })
  await context.addCookies([{ name: '__Secure-next-auth.session-token', value: await tokenFor(users[0]), url: baseURL }])
  const page = await context.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/admin/forum?tab=users', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('جست‌وجوی کاربر').fill(users[1].email)
  const card = page.locator('.fa-user').filter({ hasText: users[1].email })
  const panel = card.locator('.fa-restrictions')
  await expect(card).toBeVisible()
  await panel.locator('summary').focus(); await page.keyboard.press('Enter')
  await expect(panel).toHaveAttribute('open', '')
  await expect(panel).toContainText('محدودیتی ثبت نشده است.')
  const add = panel.getByRole('button', { name: 'افزودن محدودیت', exact: true })
  await expect(add).toBeDisabled()
  await panel.getByLabel('دلیل محدودیت', { exact: true }).fill('دلیل مستقل اول')
  let release, intercepted
  const pending = new Promise(resolve => { release = resolve }), captured = new Promise(resolve => { intercepted = resolve })
  await page.route('**/api/admin/forum', async route => {
    if (route.request().method() === 'PATCH') { intercepted(); await pending }
    await route.continue()
  }, { times: 1 })
  await add.click(); await captured; await expect(add).toBeDisabled(); release()
  await expect(panel.locator('.fa-restriction-list li')).toHaveCount(1)
  await panel.getByLabel('مدت (روز)', { exact: true }).fill('10')
  await panel.getByLabel('دلیل محدودیت', { exact: true }).fill('دلیل مستقل دوم')
  await add.click(); await expect(panel.locator('.fa-restriction-list li')).toHaveCount(2)
  const rows = await db.accessRestriction.findMany({ where: { userId: users[1].id }, orderBy: { id: 'desc' } })
  assert.equal(rows.length, 2); assert(rows.every(row => row.issuanceAuditId && row.issuedByUserId === users[0].id))
  const out = process.env.E2E_ARTIFACT_DIR || '.mobocom/scoped-restrictions-browser'
  fs.mkdirSync(out, { recursive: true })
  await panel.getByRole('button', { name: `لغو محدودیت ${rows[0].id}`, exact: true }).click()
  const confirm = panel.getByRole('button', { name: 'تأیید لغو', exact: true })
  await expect(confirm).toBeDisabled()
  await panel.getByLabel(`دلیل لغو محدودیت ${rows[0].id.toLocaleString('fa-IR')}`).fill('فقط لغو دوم')
  await confirm.click(); await expect(panel.locator('.fa-restriction-list li').first()).toContainText('لغوشده')
  const remaining = await db.accessRestriction.findUniqueOrThrow({ where: { id: rows[1].id } })
  assert.equal(remaining.revokedAt, null)
  const projection = await db.forumProfile.findUniqueOrThrow({ where: { userId: users[1].id } })
  assert.equal(projection.silencedUntil.toISOString(), remaining.expiresAt.toISOString())
  const restricted = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, extraHTTPHeaders: { Origin: baseURL } })
  await restricted.addCookies([{ name: '__Secure-next-auth.session-token', value: await tokenFor(users[1]), url: baseURL }])
  const category = await db.forumCategory.findFirstOrThrow({ where: { access: 'PUBLIC' } })
  const deniedPost = await restricted.request.post('/api/forum/threads', { data: { categoryId: category.id, title: 'موضوع آزمایشی معتبر', content: 'متن آزمایشی معتبر برای ارسال در انجمن' } })
  assert.equal(deniedPost.status(), 403)
  assert.equal((await restricted.request.post('/api/forum/messages', { data: { to: users[0].email, title: 'پیام آزمایشی معتبر', content: 'متن آزمایشی پیام خصوصی' } })).status(), 403)
  assert.equal(await db.forumThread.count({ where: { userId: users[1].id } }), 0)
  assert.equal(await db.forumMessage.count({ where: { userId: users[1].id } }), 0)
  const session = await (await restricted.request.get('/api/auth/session')).json()
  assert(session.user, 'the same login session remains usable')
  for (const url of ['/api/music/my-playlists', '/api/cart']) assert.equal((await restricted.request.get(url)).status(), 200, `forum restriction leaves ${url} usable`)
  await restricted.close()
  await db.accessRestriction.create({ data: { userId: users[1].id, scope: 'MODULE', moduleKey: 'forum', effectKey: 'forum.silence', capabilities: '["forum.participate"]', source: 'LEGACY', reason: 'سابقهٔ قدیمی با زمان شروع نامشخص', startsAt: new Date(0), expiresAt: new Date('2000-01-01'), sourceMetadata: '{"issuerUnknown":true,"startUnknown":true}' } })
  // Persisted history survives a complete page reload and keyboard expansion.
  for (const theme of ['light', 'dark']) {
    await context.addCookies([{ name: 'theme', value: theme, url: baseURL }])
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await page.getByLabel('جست‌وجوی کاربر').fill(users[1].email)
    await expect(card).toBeVisible(); await panel.locator('summary').click()
    await expect(panel.locator('.fa-restriction-list li')).toHaveCount(3)
    await expect(panel.locator('.fa-restriction-list li').first()).toContainText('شروع: در سوابق قدیمی نامشخص')
    await panel.getByLabel('دلیل محدودیت', { exact: true }).fill('بررسی فرم بدون ذخیره')
    await panel.scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(out, `${theme}-1440.png`), fullPage: true })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await panel.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, 'dark-390.png'), fullPage: true })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'mobile page fits viewport')
  if (process.env.E2E_AXE_PATH) {
    await page.evaluate(fs.readFileSync(process.env.E2E_AXE_PATH, 'utf8'))
    const report = await page.evaluate(async () => window.axe.run({ include: [['.fa-restrictions[open]']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }))
    fs.writeFileSync(path.join(out, 'axe-dark-mobile.json'), JSON.stringify(report, null, 2))
    assert.deepEqual(report.violations.map(issue => ({ id: issue.id, impact: issue.impact, nodes: issue.nodes.map(node => node.target) })), [], 'new restriction panel has no axe WCAG A/AA violation')
    const contrast = await page.evaluate(targets => {
      const context = document.createElement('canvas').getContext('2d')
      const rgba = color => { context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data].map((value, index) => index === 3 ? value / 255 : value) }
      const over = (top, bottom) => { const alpha = top[3] + bottom[3] * (1 - top[3]); return alpha === 0 ? [0, 0, 0, 0] : [...top.slice(0, 3).map((value, index) => (value * top[3] + bottom[index] * bottom[3] * (1 - top[3])) / alpha), alpha] }
      const luminance = color => color.slice(0, 3).map(value => { const channel = value / 255; return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4 }).reduce((total, value, index) => total + value * [.2126, .7152, .0722][index], 0)
      return targets.map(selector => {
        const element = document.querySelector(selector), styles = getComputedStyle(element)
        let background = rgba(styles.backgroundColor), parent = element.parentElement
        while (background[3] < 1 && parent) { background = over(background, rgba(getComputedStyle(parent).backgroundColor)); parent = parent.parentElement }
        if (background[3] < 1) throw Error('Opaque background needed for contrast review')
        const foreground = over(rgba(styles.color), background), first = luminance(foreground), second = luminance(background)
        return { selector, foreground, background, ratio: (Math.max(first, second) + .05) / (Math.min(first, second) + .05) }
      })
    }, report.incomplete.filter(issue => issue.id === 'color-contrast').flatMap(issue => issue.nodes.map(node => node.target.join(' '))))
    fs.writeFileSync(path.join(out, 'contrast-review.json'), JSON.stringify(contrast, null, 2))
    assert(contrast.every(row => Number.isFinite(row.ratio) && row.ratio >= 4.5), 'incomplete axe text checks meet computed solid-surface 4.5:1 contrast')
  }
  // Existing full-access protection is enforced by the real API and displayed in this form.
  await page.getByLabel('جست‌وجوی کاربر').fill(users[2].email)
  const ownerPanel = page.locator('.fa-user').filter({ hasText: users[2].email }).locator('.fa-restrictions')
  await ownerPanel.locator('summary').click(); await expect(ownerPanel).toContainText('محدودیتی ثبت نشده است.')
  await ownerPanel.getByLabel('دلیل محدودیت', { exact: true }).fill('نباید مدیر کامل را محدود کند')
  await ownerPanel.getByRole('button', { name: 'افزودن محدودیت', exact: true }).click()
  await expect(ownerPanel.getByRole('alert')).toBeVisible()
  assert.equal(await db.accessRestriction.count({ where: { userId: users[2].id } }), 0)
  const wrong = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, extraHTTPHeaders: { Origin: baseURL } })
  await wrong.addCookies([{ name: '__Secure-next-auth.session-token', value: await tokenFor(users[3]), url: baseURL }])
  assert.equal((await wrong.request.get(`/api/admin/forum?section=restrictions&userId=${users[1].id}`)).status(), 403)
  assert.equal((await wrong.request.patch('/api/admin/forum', { data: { section: 'restrictions', action: 'issue', userId: users[1].id, effectKey: 'forum.silence', days: 2, reason: 'ممنوع' } })).status(), 403)
  await wrong.close()
  const visitor = await browser.newContext({ baseURL, ignoreHTTPSErrors: true })
  assert.equal((await visitor.request.get(`/api/admin/forum?section=restrictions&userId=${users[1].id}`)).status(), 403)
  await visitor.close()
  const noOrigin = await browser.newContext({ baseURL, ignoreHTTPSErrors: true })
  await noOrigin.addCookies([{ name: '__Secure-next-auth.session-token', value: await tokenFor(users[0]), url: baseURL }])
  assert.equal((await noOrigin.request.patch('/api/admin/forum', { data: { section: 'restrictions', action: 'revoke', userId: users[1].id, id: remaining.id, reason: 'بدون مبدا' } })).status(), 403)
  await noOrigin.close()
  assert.deepEqual(errors, [])
  console.log('Scoped restrictions browser: actual issue/overlap/single revoke, strict audits, pending/empty/error/reload, keyboard, light/dark 1440/mobile 390; owner, other section, visitor and missing Origin refused')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await browser?.close()
  try {
    await db.auditLog.deleteMany({ where: { actorUserId: { in: users.map(user => user.id) } } })
    await db.cart.deleteMany({ where: { userId: { in: users.map(user => user.id) } } })
    await db.user.deleteMany({ where: { id: { in: users.map(user => user.id) }, email: { startsWith: seed } } })
    await db.role.deleteMany({ where: { id: { in: roles.map(role => role.id) }, name: { startsWith: seed } } })
  } finally { await db.$disconnect() }
})
