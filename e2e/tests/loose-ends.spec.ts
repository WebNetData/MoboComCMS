import { PrismaClient } from '@prisma/client'
import { test, expect, watchErrors } from '../helpers'

const owned = (baseURL: string | undefined) => process.env.MOBOCOM_ISOLATED_FIXTURE === '1' && baseURL === 'https://e2e.mobocom.test:3443'

test('a body written in the older editor reads each paragraph in the direction of its own text', async ({ page, baseURL }) => {
  test.skip(!owned(baseURL), 'owned PostgreSQL fixture required')
  const db = new PrismaClient(), slug = `e2e-legacy-direction-${Date.now()}`
  const errors = watchErrors(page)
  try {
    await db.page.create({ data: { slug, title: 'جهت متن قدیمی', status: 'PUBLISHED', editorFormat: 'legacy', content: '<p>این یک خط فارسی است</p><p>This line is English</p><p>۱۴۰۳ سال خوبی بود</p><p>2024 was a good year</p><h2>Release notes</h2><ul><li>first item</li><li>مورد دوم</li></ul><p dir="rtl">Chosen by the writer</p>' } })
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/p/${slug}`)
      const body = page.locator('#article-body')
      await expect(body).toBeVisible()
      const sides = await body.evaluate((root) => [...root.querySelectorAll('p, h2, li')].map((node) => {
        const range = document.createRange(); range.selectNodeContents(node)
        const text = range.getBoundingClientRect(), box = node.getBoundingClientRect()
        return [node.textContent!.slice(0, 12), Math.abs(text.left - box.left) < Math.abs(box.right - text.right) ? 'left' : 'right']
      }))
      expect(sides, `width ${width}`).toEqual([['این یک خط فا', 'right'], ['This line is', 'left'], ['۱۴۰۳ سال خوب', 'right'], ['2024 was a g', 'left'], ['Release note', 'left'], ['first item', 'left'], ['مورد دوم', 'right'], ['Chosen by th', 'right']])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    }
    expect(errors).toEqual([])
  } finally { await db.page.deleteMany({ where: { slug } }); await db.$disconnect() }
})

test('a section in maintenance leaves search, the sitemap and the feed, and comes back when it is opened', async ({ admin, request, baseURL }) => {
  test.skip(!owned(baseURL), 'owned PostgreSQL fixture required')
  test.setTimeout(120_000)
  const db = new PrismaClient(), stamp = `maintloose${Date.now()}`
  const before = await db.setting.findUnique({ where: { key: 'site.maintenance.v1' } })
  let postId = 0
  const listed = async () => {
    const search = await (await request.get(`/api/search?q=${stamp}`)).json()
    const sitemap = await (await request.get('/sitemap.xml')).text(), feed = await (await request.get('/feed.xml')).text(), home = await (await request.get('/')).text()
    return { search: search.hits.some((hit: { type: string; url: string }) => hit.type === 'post' && hit.url.includes(stamp)), sitemap: sitemap.includes(`/blog/${stamp}`), feed: feed.includes(`/blog/${stamp}`), home: home.slice(home.indexOf('<main'), home.lastIndexOf('</main>')).includes('href="/blog'), otherSections: /\/(products|software|games)\b/.test(sitemap) }
  }
  try {
    postId = (await db.post.create({ data: { slug: stamp, title: `مقالهٔ ${stamp}`, excerpt: stamp, content: `<p>${stamp}</p>`, status: 'PUBLISHED', access: 'PUBLIC', publishedAt: new Date(Date.now() - 60_000) } })).id
    // The index is rebuilt on the next search when its time mark is gone: the new article is then in it.
    await db.setting.deleteMany({ where: { key: 'search.indexedAt' } })
    await expect.poll(async () => (await listed()).search, { timeout: 60_000, intervals: [2000] }).toBe(true)
    expect(await listed()).toEqual({ search: true, sitemap: true, feed: true, home: true, otherSections: true })
    expect((await admin.put('/api/admin/maintenance', { data: { section: 'magazine', enabled: true } })).status()).toBe(200)
    await expect.poll(listed, { timeout: 30_000, intervals: [1500] }).toEqual({ search: false, sitemap: false, feed: false, home: false, otherSections: true })
    // The page itself closes within the few seconds the middleware keeps the state.
    await expect.poll(async () => (await request.get(`/blog/${stamp}`, { maxRedirects: 0 })).status(), { timeout: 20_000, intervals: [1000] }).toBe(503)
    expect((await admin.put('/api/admin/maintenance', { data: { section: 'magazine', enabled: false } })).status()).toBe(200)
    await expect.poll(listed, { timeout: 30_000, intervals: [1500] }).toEqual({ search: true, sitemap: true, feed: true, home: true, otherSections: true })
  } finally {
    try {
      if (postId) await db.post.deleteMany({ where: { id: postId, slug: stamp } })
      await db.setting.deleteMany({ where: { key: 'search.indexedAt' } })
      if (before) await db.setting.update({ where: { key: before.key }, data: { value: before.value } }); else await db.setting.deleteMany({ where: { key: 'site.maintenance.v1' } })
    } finally { await db.$disconnect() }
  }
})

test('Google Translate translates a page under the content security policy', async ({ admin, browser, baseURL }) => {
  test.skip(!owned(baseURL) || process.env.E2E_EXTERNAL_NETWORK !== '1', 'owned fixture with access to Google required')
  test.setTimeout(120_000)
  const db = new PrismaClient(), key = 'extension.google-translate.state.v1'
  const before = await db.setting.findUnique({ where: { key } })
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, locale: 'en-US' })
  try {
    expect((await admin.patch('/api/admin/extensions', { data: { id: 'google-translate', enabled: true } })).status()).toBe(200)
    await context.addCookies([{ name: 'googtrans', value: '/fa/en', url: baseURL! }])
    const page = await context.newPage(), blocked: string[] = [], consoleCsp: string[] = []
    await page.addInitScript(() => { (window as unknown as { __csp: string[] }).__csp = []; document.addEventListener('securitypolicyviolation', (event) => (window as unknown as { __csp: string[] }).__csp.push(`${event.effectiveDirective} ${event.blockedURI}`)) })
    page.on('console', (message) => { if (/Content Security Policy|Refused to/i.test(message.text())) consoleCsp.push(message.text().slice(0, 200)) })
    page.on('requestfailed', (request) => { if (/google|gstatic/.test(request.url())) blocked.push(`${request.failure()?.errorText} ${request.url().slice(0, 120)}`) })
    await page.goto('/')
    await expect(page.locator('#mc-translate-script')).toHaveCount(1)
    // Google marks the document when it has translated it and wraps translated text in <font>.
    await expect(page.locator('html')).toHaveClass(/translated-ltr/, { timeout: 60_000 })
    await expect.poll(() => page.locator('font').count(), { timeout: 30_000 }).toBeGreaterThan(5)
    const violations = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)
    expect({ violations, consoleCsp, blocked }).toEqual({ violations: [], consoleCsp: [], blocked: [] })
  } finally {
    await context.close()
    try { if (before) await db.setting.update({ where: { key }, data: { value: before.value } }); else await db.setting.deleteMany({ where: { key } }) } finally { await db.$disconnect() }
  }
})
