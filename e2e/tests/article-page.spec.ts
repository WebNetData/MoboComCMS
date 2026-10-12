import { PrismaClient } from '@prisma/client'
import { test, expect, watchErrors } from '../helpers'
import { ADMIN_STATE } from '../paths'

// The magazine article page: the cover hero, reading progress, the rail, and the three ways an article is shown
// (plain, locked for members, placed by the page builder). Real pages on PostgreSQL.

const owned = (baseURL: string | undefined) => process.env.MOBOCOM_ISOLATED_FIXTURE === '1' && baseURL === 'https://e2e.mobocom.test:3443'
const BODY = '<p>بند نخست نوشته برای آزمون صفحهٔ مقاله.</p><h2>بخش یکم</h2><p>متن بخش یکم.</p><blockquote><p>یک نقل‌قول.</p></blockquote><h3>زیربخش</h3><ul><li>مورد یک</li><li>مورد دو</li></ul><h2>بخش دوم</h2><p>This paragraph is English.</p><table><thead><tr><th>ستون</th><th>مقدار</th></tr></thead><tbody><tr><td>الف</td><td>۱</td></tr></tbody></table><h2>بخش سوم</h2><ol><li>گام یک</li><li>گام دو</li></ol>' + '<p>متن بلند برای پیمایش. </p>'.repeat(40)

test('article page: hero over the cover, progress, rail and contents in both themes and on a phone', async ({ browser, baseURL }, testInfo) => {
  test.skip(!owned(baseURL), 'owned PostgreSQL fixture required')
  test.setTimeout(240_000)
  const db = new PrismaClient(), slug = `e2e-article-${Date.now()}`
  try {
    await db.post.create({ data: { slug, title: 'عنوان آزمایشی صفحهٔ مقاله با طول معمول', excerpt: 'خلاصهٔ کوتاه نوشته.', content: BODY, status: 'PUBLISHED', access: 'PUBLIC', publishedAt: new Date(Date.now() - 60_000) } })
    for (const [width, theme] of [[1440, 'light'], [1440, 'dark'], [390, 'light']] as const) {
      const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, viewport: { width, height: 900 }, colorScheme: theme })
      const page = await context.newPage(), errors = watchErrors(page)
      await page.goto(`/blog/${slug}`)
      if (theme === 'dark') await page.getByRole('button', { name: 'فعال کردن حالت تاریک' }).first().click()
      const hero = page.locator('.jp-hero')
      await expect(hero.getByRole('heading', { level: 1 })).toHaveText('عنوان آزمایشی صفحهٔ مقاله با طول معمول')
      // The cover is the hero's background and the separate figure is not repeated on the plain page.
      await expect(hero.locator('img.jp-hero-bg')).toHaveCount(1)
      await expect(page.locator('.journal-post-figure')).toBeHidden()
      expect(await hero.locator('img.jp-hero-bg').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), 'the cover really loaded').toBe(true)
      // The words on the picture are light whatever the theme.
      expect(await hero.getByRole('heading', { level: 1 }).evaluate((el) => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)')
      // Icons sit in the middle of their round buttons.
      const offsets = await page.locator('.ln-textsize button').evaluateAll((buttons) => buttons.map((button) => { const b = button.getBoundingClientRect(), i = button.querySelector('svg')!.getBoundingClientRect(); return Math.abs((i.left + i.width / 2) - (b.left + b.width / 2)) + Math.abs((i.top + i.height / 2) - (b.top + b.height / 2)) }))
      expect(Math.max(...offsets), 'text-size icons are centred').toBeLessThanOrEqual(1.5)
      const read = () => page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue('--jp-read')))
      expect(await read()).toBe(0)
      await page.evaluate(() => document.querySelectorAll('#article-body h2')[1].scrollIntoView({ block: 'start' }))
      await expect.poll(read).toBeGreaterThan(0)
      await expect(page.locator('.toc nav a.is-active')).toHaveCount(1)
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await expect.poll(read).toBe(100)
      const rail = page.locator('.jp-rail')
      if (width >= 1101) {
        await page.evaluate(() => document.querySelector('#article-body')!.scrollIntoView({ block: 'start' }))
        await expect(rail).toBeVisible()
        expect((await rail.boundingBox())!.y, 'the rail stays beside the text').toBeLessThan(220)
        await expect(rail.getByRole('link', { name: 'اشتراک در تلگرام' })).toHaveAttribute('href', /t\.me\/share\/url\?url=https/)
        await expect(page.locator('.jp-main .share-row')).toBeHidden()
      } else {
        // On a phone the corners belong to the floating helpers: no rail, the share row under the text instead.
        await expect(rail).toBeHidden()
        await expect(page.locator('.jp-main .share-row')).toBeVisible()
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${theme}/${width} fits the window`).toBe(true)
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({ path: testInfo.outputPath(`article-${theme}-${width}.png`) })
      await page.evaluate(() => document.querySelector('.journal-bio')!.scrollIntoView({ block: 'center' }))
      await page.screenshot({ path: testInfo.outputPath(`article-end-${theme}-${width}.png`) })
      if (process.env.E2E_AXE_PATH) {
        await page.evaluate(require('node:fs').readFileSync(process.env.E2E_AXE_PATH, 'utf8'))
        const violations = await page.evaluate(async () => {
          const axe = (window as unknown as { axe: { run: (selector: string, options: object) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[] }[] }[] }> } }).axe
          return (await axe.run('main.journal-post', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })).violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)
        })
        expect(violations, `${theme}/${width} axe`).toEqual([])
      }
      expect(errors).toEqual([])
      await context.close()
    }
  } finally { await db.post.deleteMany({ where: { slug } }); await db.$disconnect() }
})

test('article page: a members-only article shows its gate inside the reading layout, and a built layout keeps its own cover', async ({ browser, baseURL }, testInfo) => {
  test.skip(!owned(baseURL), 'owned PostgreSQL fixture required')
  test.setTimeout(180_000)
  const db = new PrismaClient(), stamp = `e2e-article-kinds-${Date.now()}`
  const builderState = await db.setting.findUnique({ where: { key: 'extension.page-builder.state.v1' } })
  let builtId = 0
  try {
    await db.post.create({ data: { slug: `${stamp}-locked`, title: 'نوشتهٔ ویژهٔ اعضا', excerpt: 'خلاصه.', content: BODY, status: 'PUBLISHED', access: 'MEMBERS', publishedAt: new Date(Date.now() - 60_000) } })
    builtId = (await db.post.create({ data: { slug: `${stamp}-built`, title: 'نوشتهٔ چیده‌شده با صفحه‌ساز', excerpt: 'خلاصه.', content: BODY, status: 'PUBLISHED', access: 'PUBLIC', publishedAt: new Date(Date.now() - 60_000) } })).id
    const widget = (id: string, type: string) => ({ id, type, props: {} })
    const section = (id: string, widgets: object[]) => ({ id, anchor: '', style: {}, columns: [{ id: `${id}-c`, width: 100, widgets }] })
    await db.setting.create({ data: { key: `page.builder.post-${builtId}`, value: JSON.stringify({ v: 2, mode: 'builder', code: { html: '', css: '', js: '', advanced: false }, sections: [section('s1', [widget('w1', 'post-header')]), section('s2', [widget('w2', 'post-cover')]), section('s3', [widget('w3', 'content')]), section('s4', [widget('w4', 'post-footer')])] }) } })
    await db.setting.upsert({ where: { key: 'extension.page-builder.state.v1' }, create: { key: 'extension.page-builder.state.v1', value: '{"enabled":true,"settings":{}}' }, update: { value: '{"enabled":true,"settings":{}}' } })

    const guest = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } })
    const page = await guest.newPage(), errors = watchErrors(page)
    await page.goto(`/blog/${stamp}-locked`)
    await expect(page.locator('.jp-hero').getByRole('heading', { level: 1 })).toHaveText('نوشتهٔ ویژهٔ اعضا')
    await expect(page.locator('.jp-main #article-body.vip-teaser')).toBeVisible()
    await expect(page.locator('.jp-main').getByText('ادامه این مطلب مخصوص اعضای ویژه است')).toBeVisible()
    // The teaser is all a guest gets: the rest of the body is not in the page at all.
    expect(await page.locator('#article-body').innerText()).not.toContain('بخش سوم')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('article-locked-1440.png') })

    // A built layout places the four slots itself: the hero and the figure it placed are both there, in its order.
    await expect.poll(async () => { await page.goto(`/blog/${stamp}-built`); return page.locator('main.journal-post-built').count() }, { timeout: 30_000, intervals: [2000] }).toBe(1)
    await expect(page.locator('.jp-hero')).toBeVisible()
    await expect(page.locator('.journal-post-figure')).toBeVisible()
    await expect(page.locator('.jp-main #article-body')).toContainText('بخش سوم')
    await expect(page.locator('.journal-bio')).toBeVisible()
    const order = await page.evaluate(() => ['.jp-hero', '.journal-post-figure', '#article-body', '.journal-bio'].map((selector) => Math.round(document.querySelector(selector)!.getBoundingClientRect().top + scrollY)))
    expect([...order].sort((a, b) => a - b), 'header, cover, text, footer in the order the layout gives').toEqual(order)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('article-built-1440.png') })
    expect(errors).toEqual([])
    await guest.close()
  } finally {
    try {
      await db.post.deleteMany({ where: { slug: { startsWith: stamp } } })
      if (builtId) await db.setting.deleteMany({ where: { key: `page.builder.post-${builtId}` } })
      if (builderState) await db.setting.update({ where: { key: builderState.key }, data: { value: builderState.value } }); else await db.setting.deleteMany({ where: { key: 'extension.page-builder.state.v1' } })
    } finally { await db.$disconnect() }
  }
})

test('the shared action buttons: favourite fills and empties, with a drawn icon in the middle of its disc', async ({ browser, baseURL }, testInfo) => {
  test.skip(!owned(baseURL), 'owned PostgreSQL fixture required')
  test.setTimeout(120_000)
  const db = new PrismaClient(), slug = `e2e-actions-${Date.now()}`
  const context = await browser.newContext({ baseURL, storageState: ADMIN_STATE, ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } })
  let postId = 0
  try {
    const post = await db.post.create({ data: { slug, title: 'نوشته برای دکمه‌ها', content: BODY, status: 'PUBLISHED', access: 'PUBLIC', publishedAt: new Date(Date.now() - 60_000) } })
    postId = post.id
    const page = await context.newPage(), errors = watchErrors(page)
    await page.goto(`/blog/${slug}`)
    const favourite = page.locator('.jp-hero .ea-btn').first()
    await expect(favourite).toHaveAttribute('aria-pressed', 'false')
    expect(await favourite.locator('svg.ea-icon').evaluate((svg) => svg.getAttribute('fill'))).toBe('none')
    const centred = () => favourite.evaluate((button) => { const icon = button.querySelector('svg.ea-icon')!.getBoundingClientRect(), box = button.getBoundingClientRect(); return Math.abs((icon.top + icon.height / 2) - (box.top + box.height / 2)) })
    expect(await centred()).toBeLessThanOrEqual(1.5)
    await favourite.click()
    await expect(favourite).toHaveAttribute('aria-pressed', 'true')
    await expect(favourite).toHaveClass(/is-on/)
    expect(await favourite.locator('svg.ea-icon').evaluate((svg) => svg.getAttribute('fill'))).toBe('currentColor')
    expect(await db.itemFavorite.count({ where: { itemType: 'post', itemId: post.id } }), 'really stored').toBe(1)
    await page.screenshot({ path: testInfo.outputPath('actions-pressed-1440.png'), clip: { x: 0, y: 200, width: 1440, height: 700 } })
    await favourite.click()
    await expect(favourite).toHaveAttribute('aria-pressed', 'false')
    expect(await db.itemFavorite.count({ where: { itemType: 'post', itemId: post.id } })).toBe(0)
    // The collection button opens its menu and says so.
    const collect = page.locator('.jp-hero .collections-picker .ea-btn')
    await collect.click()
    await expect(collect).toHaveAttribute('aria-expanded', 'true')
    await expect(collect).toHaveClass(/is-open/)
    expect(errors).toEqual([])
  } finally {
    await context.close()
    try { if (postId) await db.itemFavorite.deleteMany({ where: { itemType: 'post', itemId: postId } }); await db.post.deleteMany({ where: { slug } }) } finally { await db.$disconnect() }
  }
})
