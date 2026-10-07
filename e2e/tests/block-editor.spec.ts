import { test, expect, hasAdmin, watchErrors } from '../helpers'
import { ADMIN_STATE } from '../paths'

test.use({ storageState: hasAdmin() ? ADMIN_STATE : undefined })

// The block editor, as an administrator uses it: a page is laid out in blocks, saved, opened again and read by a visitor.
// The page is this test's own and is removed; the editor's switch is put back as it was.
test('a page is built in the block editor, saved, reopened and shown to visitors', async ({ page, admin, baseURL, browser }) => {
  test.setTimeout(300_000)
  const slug = `e2e-block-editor-${Date.now()}`
  const was = await (await admin.get('/api/admin/editor')).json()
  const created = await (await admin.post('/api/admin/cms?type=pages', { data: { slug, title: 'E2E block page', content: '<p>old body</p>', status: 'PUBLISHED' } })).json()
  expect(created.id).toBeGreaterThan(0)
  const errors = watchErrors(page)
  try {
    // Off: the editor opens and lays out, and says it will not save.
    await admin.post('/api/admin/editor', { data: { enabled: false } })
    await page.goto(`/admin/editor/pages/${created.id}`, { waitUntil: 'domcontentloaded', timeout: 240_000 })
    await expect(page.locator('.mc-editor-bar')).toBeVisible({ timeout: 240_000 })
    await expect(page.locator('.mc-editor-save')).toBeDisabled()
    await admin.post('/api/admin/editor', { data: { enabled: true } })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('.mc-editor-save')).toBeEnabled({ timeout: 240_000 })
    await expect(page.locator('.mc-editor-notice').first()).toContainText('ویرایشگر قدیمی')

    const pick = async (name: string) => {
      const menu = page.locator('.block-editor-inserter__quick-inserter, .block-editor-inserter__menu').first()
      // A container that takes one kind of block inserts it at once, without a menu.
      if (!(await menu.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false))) return
      const search = menu.locator('input[type="search"]').first()
      if (await search.count()) await search.fill(name)
      await page.locator('.block-editor-block-types-list__item', { hasText: name }).first().click()
    }
    const insertTop = async (name: string) => { await page.locator('.mc-editor-bar .block-editor-inserter__toggle').first().click(); await pick(name) }
    const insertInto = async (selector: string, name: string) => { await page.locator(`${selector} .block-editor-button-block-appender`).last().click(); await pick(name) }

    await insertTop('بخش')
    await expect(page.locator('.mc-editor-document .mcb-layout-section')).toHaveCount(1)
    await insertInto('.mcb-layout-section', 'ستون‌ها')
    await insertInto('.mcb-layout-columns', 'ستون')
    await insertInto('.mcb-layout-columns', 'ستون')
    await expect(page.locator('.mcb-layout-columns .mcb-layout-column')).toHaveCount(2)
    await insertInto('.mcb-layout-column', 'متن')
    const text = page.locator('.mc-editor-document .mc-rich-input').first()
    await text.click()
    await page.keyboard.type('متن فارسی با English و ۱۲۳')
    await page.keyboard.press('Enter')
    await page.keyboard.type('خط دومx')
    await page.keyboard.press('Backspace')
    // Keys typed in the text belong to the text: the blocks around it are still there.
    await expect(page.locator('.mcb-layout-section')).toHaveCount(1)
    await expect(text).toContainText('متن فارسی با English و ۱۲۳')
    await expect(text).toHaveCSS('direction', 'rtl')

    // An image, uploaded through the site's own media upload.
    await insertTop('تصویر')
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAGCAYAAAD68A/GAAAAFklEQVR42mP8z8DwnwEJMDGgAcICAAAzAAH/Z7mEAAAAAElFTkSuQmCC', 'base64')
    await page.locator('.mc-editor-inspector .mc-field-upload input[type="file"]').first().setInputFiles({ name: 'e2e-block.png', mimeType: 'image/png', buffer: png })
    const address = page.locator('.mc-editor-inspector .mc-field-asset input').first()
    await expect(address).toHaveValue(/\.png$/, { timeout: 60_000 })
    await page.locator('.mc-editor-inspector .mc-field-asset input').nth(2).fill('تصویر آزمون')
    await expect(page.locator('.mc-editor-document img')).toHaveCount(1)

    // A heading, then moved one place up with the block's own tools.
    await insertTop('تیتر')
    await page.locator('.mc-editor-document .mc-heading-input').last().fill('تیتر صفحه')
    const order = () => page.evaluate(() => [...document.querySelectorAll('.mc-editor-document [data-type]')].map((el) => el.getAttribute('data-type')).filter((type) => type === 'mobocom/content-heading' || type === 'mobocom/content-image'))
    expect(await order()).toEqual(['mobocom/content-image', 'mobocom/content-heading'])
    await page.locator('.mc-editor-document .mc-heading-input').last().click()
    await page.locator('.mc-editor-blocktools button.block-editor-block-mover-button').first().click()
    await expect.poll(order).toEqual(['mobocom/content-heading', 'mobocom/content-image'])

    await page.locator('.mc-editor-save').click()
    await expect(page.locator('.mc-editor-state')).toHaveClass(/is-saved/, { timeout: 60_000 })
    const stored = await (await admin.get(`/api/admin/editor/pages/${created.id}`)).json()
    expect(stored.editorFormat).toBe('blocks-v1')
    const types: string[] = []
    const walk = (blocks: Array<{ type: string; children?: unknown[] }>) => blocks.forEach((block) => { types.push(block.type); walk((block.children || []) as Array<{ type: string }>) })
    walk(stored.document.blocks)
    expect(types).toEqual(expect.arrayContaining(['layout.section', 'layout.columns', 'layout.column', 'content.richText', 'content.heading', 'content.image']))
    expect(JSON.stringify(stored.document)).not.toContain('<p>')

    // Opened again: what was built is what is there.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('.mc-editor-bar')).toBeVisible({ timeout: 240_000 })
    await expect(page.locator('.mcb-layout-column')).toHaveCount(2)
    await expect(page.locator('.mc-rich-input').first()).toContainText('متن فارسی با English و ۱۲۳')
    await expect(page.locator('.mc-heading-input').first()).toHaveValue('تیتر صفحه')

    // A visitor reads the page, and is sent no part of the editor.
    const visitor = await (await browser.newContext({ baseURL })).newPage()
    await visitor.goto(`/p/${slug}`, { waitUntil: 'domcontentloaded', timeout: 180_000 })
    await expect(visitor.locator('.mcb-document .mcb-content-heading')).toHaveText('تیتر صفحه')
    await expect(visitor.locator('.mcb-document .mcb-content-richText')).toContainText('متن فارسی با English و ۱۲۳')
    await expect(visitor.locator('.mcb-document img')).toHaveAttribute('alt', 'تصویر آزمون')
    await expect(visitor.locator('h1')).toHaveCount(1)
    await expect(visitor.locator('body')).not.toContainText('old body')
    expect(await visitor.locator('.block-editor-block-list__layout').count()).toBe(0)
    await visitor.close()
    expect(errors).toEqual([])
  } finally {
    await admin.delete(`/api/admin/cms?type=pages&id=${created.id}`)
    await admin.post('/api/admin/editor', { data: { enabled: was?.enabled === true } })
  }
})
