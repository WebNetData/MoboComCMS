// Real local app + PostgreSQL: a magazine-only manager edits their fixture and is refused other sections.
// DATABASE_URL and NEXTAUTH_SECRET must describe the test app; never run on production.
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')
const { chromium, expect } = require('@playwright/test')
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000'
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) throw Error('LOCAL_TEST_APP_REQUIRED')
if (!process.env.DATABASE_URL || !process.env.NEXTAUTH_SECRET) throw Error('TEST_APP_ENV_REQUIRED')
const db = new PrismaClient(), seed = `section-browser-${Date.now()}`
const baseline = process.argv.includes('--baseline')
let role, user, post, browser
async function main() {
  role = await db.role.create({ data: { name: seed, permissions: 'dashboard.view,cms.posts' } })
  user = await db.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'not-a-login-password', role: 'ADMIN', roleId: role.id, totpEnabledAt: new Date() } })
  post = await db.post.create({ data: { slug: seed, title: seed, content: '<p>نوشتهٔ آزمایشی</p>', status: 'DRAFT', authorId: user.id } })
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { uid: String(user.id), sub: String(user.id), role: 'ADMIN', email: user.email, authAt: Date.now() } })
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}) })
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { origin: baseURL } })
  await context.addCookies([{ name: 'next-auth.session-token', value: token, url: baseURL }])
  const page = await context.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`/admin/posts?edit=${post.id}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
  const form = page.locator('.cms-workspace form').first()
  await expect(form).toBeVisible({ timeout: 240000 })
  if (baseline) {
    assert.equal(await form.getByLabel(/عنوان|Title/, { exact: true }).count(), 0, 'baseline reproduced: title has no associated label')
    console.log('Baseline reproduced: CMS title input is not associated with its visible label')
    return
  }
  const title = form.getByLabel(/عنوان|Title/, { exact: true })
  await expect(title).toHaveValue(seed)
  await title.fill(`${seed} ویرایش مدیر مجله`)
  await form.getByLabel(/خلاصه|Excerpt/, { exact: true }).fill('خلاصهٔ آزمون دسترسی')
  const [save] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/admin/cms?type=posts') && r.request().method() === 'PATCH'),
    form.locator('button[type="submit"], button.btn-primary').filter({ hasText: /ذخیره|Save/ }).last().click(),
  ])
  expect(save.status()).toBe(200)
  await expect(form).not.toBeVisible()
  const saved = await db.post.findUniqueOrThrow({ where: { id: post.id } })
  assert.equal(saved.title, `${seed} ویرایش مدیر مجله`)
  assert.equal(saved.excerpt, 'خلاصهٔ آزمون دسترسی')
  assert.equal(saved.content, post.content, 'metadata edit preserves the existing body')
  assert.equal(saved.status, 'DRAFT')
  assert.ok(await db.contentRevision.count({ where: { entityType: 'posts', entityId: post.id } }), 'canonical revision history records the edit')
  const editorState = await (await context.request.get('/api/admin/editor')).json()
  if (editorState.enabled) {
    await page.goto(`/admin/editor/posts/${post.id}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
    const body = page.locator('.mc-rich-input').first()
    await expect(body).toBeVisible({ timeout: 240000 })
    await body.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' متن مدیر مجله')
    const [bodySave] = await Promise.all([
      page.waitForResponse(r => r.url().includes(`/api/admin/editor/posts/${post.id}`) && r.request().method() === 'PUT'),
      page.locator('.mc-editor-save').click(),
    ])
    expect(bodySave.status()).toBe(200)
    await expect(page.locator('.mc-editor-state')).toHaveClass(/is-saved/)
    const document = await db.post.findUniqueOrThrow({ where: { id: post.id } })
    assert.equal(document.editorFormat, 'blocks-v1')
    assert.ok(document.content.includes('متن مدیر مجله'))
    assert.ok(document.contentDocument.includes('متن مدیر مجله'))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(body).toContainText('متن مدیر مجله')
  }
  // AuthZ is tested at the API, independent of hidden navigation.
  for (const url of ['/api/admin/cms?type=products', '/api/admin/cms?type=pages']) {
    expect((await context.request.get(url)).status()).toBe(403)
    expect((await context.request.patch(url, { data: { id: post.id, title: 'forbidden' } })).status()).toBe(403)
  }
  expect((await context.request.get(`/api/admin/editor/pages/${post.id}`)).status()).toBe(403)
  expect((await context.request.put(`/api/admin/editor/pages/${post.id}`, { data: { updatedAt: saved.updatedAt.toISOString(), document: { version: 1, blocks: [] } } })).status()).toBe(403)
  const noOrigin = await browser.newContext({ baseURL })
  await noOrigin.addCookies([{ name: 'next-auth.session-token', value: token, url: baseURL }])
  expect((await noOrigin.request.patch('/api/admin/cms?type=posts', { data: { id: post.id, title: 'no origin' } })).status()).toBe(403)
  await noOrigin.close()
  await page.goto(`/admin/posts?edit=${post.id}`, { waitUntil: 'domcontentloaded' })
  await expect(title).toHaveValue(saved.title)
  await expect(page.locator('.cms-search input')).toBeVisible()
  const out = process.env.E2E_ARTIFACT_DIR || '.mobocom/section-manager-results'
  fs.mkdirSync(out, { recursive: true })
  for (const theme of ['light', 'dark']) {
    await context.addCookies([{ name: 'theme', value: theme, url: baseURL }])
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(title).toHaveValue(saved.title)
    await expect(page.locator('.cms-workspace table')).toBeVisible()
    await page.screenshot({ path: path.join(out, `${theme}-1440.png`), fullPage: true })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: path.join(out, 'dark-390.png'), fullPage: true })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'mobile page fits viewport')
  assert.deepEqual(errors, [])
  console.log(`Section manager browser: magazine-only metadata${editorState.enabled ? ' + block body' : ' (block plugin off; body flow not exercised)'} save/reopen/revisions; other-section reads/writes and missing Origin refused; light/dark 1440 + mobile 390 passed`)
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await browser?.close()
  try {
    if (post) {
      await db.contentRevision.deleteMany({ where: { entityType: 'posts', entityId: post.id } })
      await db.searchDocument.deleteMany({ where: { itemType: 'post', itemId: post.id } })
      await db.post.deleteMany({ where: { id: post.id, slug: seed } })
    }
    if (user) {
      await db.auditLog.deleteMany({ where: { actorUserId: user.id, actorEmail: user.email } })
      await db.user.deleteMany({ where: { id: user.id, email: user.email } })
    }
    if (role) await db.role.deleteMany({ where: { id: role.id, name: seed } })
  } finally { await db.$disconnect() }
})
