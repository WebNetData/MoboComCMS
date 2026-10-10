import type { Page } from '@playwright/test'
import { test, expect, hasAdmin, watchErrors } from '../helpers'
import { ADMIN_STATE } from '../paths'

test.use({ storageState: hasAdmin() ? ADMIN_STATE : undefined })

// The block editor is a plugin, and while it is on it is the site's editor for pages and magazine articles. Every item
// made here is this file's own and is removed; the plugin is left as it was found.

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAGCAYAAAD68A/GAAAAFklEQVR42mP8z8DwnwEJMDGgAcICAAAzAAH/Z7mEAAAAAElFTkSuQmCC', 'base64')

async function openEditor(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 240_000 })
  await expect(page.locator('.mc-editor-bar')).toBeVisible({ timeout: 240_000 })
}
function tools(page: Page) {
  const pick = async (name: string) => {
    const menu = page.locator('.block-editor-inserter__quick-inserter, .block-editor-inserter__menu').first()
    // A container that takes one kind of block inserts it at once, without a menu.
    if (!(await menu.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false))) return
    const search = menu.locator('input[type="search"]').first()
    if (await search.count()) await search.fill(name)
    await page.locator('.block-editor-block-types-list__item', { hasText: name }).first().click()
  }
  return {
    insertTop: async (name: string) => { await page.locator('.mc-editor-bar .block-editor-inserter__toggle').first().click(); await pick(name) },
    insertInto: async (selector: string, name: string) => { await page.locator(`${selector} .block-editor-button-block-appender`).last().click(); await pick(name) },
    save: async () => { await page.locator('.mc-editor-save').click(); await expect(page.locator('.mc-editor-state')).toHaveClass(/is-saved/, { timeout: 60_000 }) },
  }
}

test('a page is built in the block editor, saved, reopened and shown to visitors', async ({ page, admin, baseURL, browser }) => {
  test.setTimeout(300_000)
  const slug = `e2e-block-editor-${Date.now()}`
  const was = await (await admin.get('/api/admin/editor')).json()
  const created = await (await admin.post('/api/admin/cms?type=pages', { data: { slug, title: 'E2E block page', content: '', status: 'PUBLISHED' } })).json()
  expect(created.id).toBeGreaterThan(0)
  const errors = watchErrors(page)
  const { insertTop, insertInto, save } = tools(page)
  try {
    // The plugin switched off: the admin says its screen is off instead of opening the editor.
    await admin.patch('/api/admin/extensions', { data: { id: 'block-editor', enabled: false } })
    await page.goto(`/admin/editor/pages/${created.id}`, { waitUntil: 'domcontentloaded', timeout: 240_000 })
    await expect(page.locator('.module-off-card')).toBeVisible({ timeout: 240_000 })
    await expect(page.locator('.mc-editor-bar')).toHaveCount(0)
    await admin.patch('/api/admin/extensions', { data: { id: 'block-editor', enabled: true } })
    await openEditor(page, `/admin/editor/pages/${created.id}`)
    await expect(page.locator('.mc-editor-save')).toBeEnabled({ timeout: 240_000 })

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
    await page.locator('.mc-editor-inspector .mc-field-upload input[type="file"]').first().setInputFiles({ name: 'e2e-block.png', mimeType: 'image/png', buffer: PNG })
    await expect(page.locator('.mc-editor-inspector .mc-field-asset input').first()).toHaveValue(/\.png$/, { timeout: 60_000 })
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

    await save()
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
    expect(await visitor.locator('.block-editor-block-list__layout').count()).toBe(0)
    await visitor.close()
    expect(errors).toEqual([])
  } finally {
    await admin.delete(`/api/admin/cms?type=pages&id=${created.id}`)
    await admin.patch('/api/admin/extensions', { data: { id: 'block-editor', enabled: was?.enabled !== false } })
  }
})

test('a page written in the old editor opens as blocks and is not changed until it is saved', async ({ page, admin }) => {
  test.setTimeout(300_000)
  const slug = `e2e-block-legacy-${Date.now()}`
  const old = '<h1>عنوان قدیمی</h1><p>بند <strong>نخست</strong> با <a href="/blog">پیوند</a><img src="/og.svg" alt="تصویر میان متن"></p><p><img src="/uploads/old.png" alt="تصویر قدیمی"></p><ul><li>یک</li><li>دو</li></ul><table><tr><td>جدول</td></tr></table><script>window.x=1</script>'
  const was = await (await admin.get('/api/admin/editor')).json()
  const created = await (await admin.post('/api/admin/cms?type=pages', { data: { slug, title: 'E2E legacy page', content: old, status: 'DRAFT' } })).json()
  const { save } = tools(page)
  try {
    await admin.patch('/api/admin/extensions', { data: { id: 'block-editor', enabled: true } })
    await openEditor(page, `/admin/editor/pages/${created.id}`)
    await expect(page.locator('.mc-editor-notice').first()).toContainText('به بلوک تبدیل شده')
    // The words are rich text, the image that stood alone is an image block, and the first heading is one level down.
    await expect(page.locator('.mc-editor-document .mc-rich-input').first()).toContainText('بند نخست با پیوند')
    await expect(page.locator('.mc-editor-document .mc-rich-input h2').first()).toHaveText('عنوان قدیمی')
    await expect(page.locator('.mc-editor-document [data-type="mobocom/content-image"] img')).toHaveAttribute('alt', 'تصویر قدیمی')
    await expect(page.locator('.mc-editor-document .mc-rich-input li')).toHaveCount(2)
    // Opening changed nothing, and nothing saves by itself until the writer changes something.
    await expect(page.locator('.mc-editor-state')).toHaveClass(/is-clean/)
    await page.waitForTimeout(6000)
    const untouched = await (await admin.get(`/api/admin/editor/pages/${created.id}`)).json()
    expect([untouched.editorFormat, untouched.legacyHtml.includes('عنوان قدیمی')]).toEqual(['legacy', true])
    // A minor edit must not silently commit a lossy conversion through autosave.
    const input = page.locator('.mc-rich-input').first()
    await input.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' تغییر کوچک')
    await expect(page.locator('.mc-editor-state')).toHaveClass(/is-dirty/)
    await expect(page.locator('.mc-editor-save')).toHaveText('تأیید تبدیل و ذخیره')
    await page.waitForTimeout(6000)
    const pending = await (await admin.get(`/api/admin/editor/pages/${created.id}`)).json()
    expect(pending.editorFormat).toBe('legacy'); expect(pending.legacyHtml).toBe(untouched.legacyHtml)
    await save()
    const stored = await (await admin.get(`/api/admin/editor/pages/${created.id}`)).json()
    expect(stored.editorFormat).toBe('blocks-v1')
    expect(JSON.stringify(stored.document)).not.toMatch(/<script|window\.x|<table/)
    expect(stored.document.blocks.map((block: { type: string }) => block.type)).toEqual(expect.arrayContaining(['content.richText', 'content.image']))
    // Once explicitly converted, regular autosave resumes for subsequent edits.
    await input.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' ذخیره خودکار')
    await expect(page.locator('.mc-editor-state')).toHaveClass(/is-saved/, { timeout: 30_000 })
    const automatic = await (await admin.get(`/api/admin/editor/pages/${created.id}`)).json()
    expect(JSON.stringify(automatic.document)).toContain('ذخیره خودکار')
  } finally {
    await admin.delete(`/api/admin/cms?type=pages&id=${created.id}`)
    await admin.patch('/api/admin/extensions', { data: { id: 'block-editor', enabled: was?.enabled !== false } })
  }
})

test('block direction applies in the canvas and public page while paragraph overrides and auto remain available', async ({ page, admin, baseURL, browser }, testInfo) => {
  test.setTimeout(300_000)
  const slug = `e2e-block-direction-${Date.now()}`
  const was = await (await admin.get('/api/admin/editor')).json()
  const created = await (await admin.post('/api/admin/cms?type=pages', { data: { slug, title: 'E2E text direction', content: '', status: 'PUBLISHED' } })).json()
  const paragraph = (text: string, dir?: string) => ({ type: 'paragraph', ...(dir ? { attrs: { dir } } : {}), content: [{ type: 'text', text }] })
  try {
    await admin.patch('/api/admin/extensions', { data: { id: 'block-editor', enabled: true } })
    const opened = await (await admin.get(`/api/admin/editor/pages/${created.id}`)).json()
    const saved = await admin.put(`/api/admin/editor/pages/${created.id}`, { data: { updatedAt: opened.updatedAt, document: { version: 1, blocks: [{ id: 'direction_block', type: 'content.richText', version: 1, props: { dir: 'ltr', content: { type: 'doc', content: [paragraph('سلام'), paragraph('Hello', 'rtl'), paragraph('־Hello'), paragraph('ەHello')] } } }] } } })
    expect(saved.ok()).toBeTruthy()
    await openEditor(page, `/admin/editor/pages/${created.id}`)
    const paragraphs = page.locator('.mc-rich-input p')
    for (const [index, dir] of ['ltr', 'rtl', 'ltr', 'ltr'].entries()) await expect(paragraphs.nth(index)).toHaveCSS('direction', dir)
    const visitor = await (await browser.newContext({ baseURL })).newPage()
    try {
      await visitor.goto(`/p/${slug}`, { waitUntil: 'domcontentloaded', timeout: 180_000 })
      const publicParagraphs = visitor.locator('.mcb-document .mcb-content-richText p')
      for (const [index, dir] of ['ltr', 'rtl', 'ltr', 'ltr'].entries()) await expect(publicParagraphs.nth(index)).toHaveCSS('direction', dir)
      // Change the inspector choice without recreating or reloading the rich-text editor.
      await paragraphs.first().click()
      const direction = page.locator('.mc-editor-inspector select').first()
      await direction.selectOption('auto')
      for (const [index, dir] of ['rtl', 'rtl', 'ltr', 'rtl'].entries()) await expect(paragraphs.nth(index)).toHaveCSS('direction', dir)
      await tools(page).save()
      await visitor.reload({ waitUntil: 'domcontentloaded' })
      for (const [index, dir] of ['rtl', 'rtl', 'ltr', 'rtl'].entries()) await expect(publicParagraphs.nth(index)).toHaveCSS('direction', dir)
      const contrast = () => page.evaluate(() => {
        const canvas = document.querySelector('.mc-editor-canvas')!, paragraph = document.querySelector('.mc-rich-input p')!
        const luminance = (color: string) => {
          const [r, g, b] = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(n => { const c = n / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4 })
          return .2126 * r + .7152 * g + .0722 * b
        }
        const background = getComputedStyle(canvas).backgroundColor, a = luminance(background), b = luminance(getComputedStyle(paragraph).color)
        return { background, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) }
      })
      const light = await contrast()
      expect(light.ratio).toBeGreaterThanOrEqual(4.5)
      await page.screenshot({ path: testInfo.outputPath('editor-1440-light.png'), fullPage: true })
      await page.getByRole('button', { name: 'فعال کردن حالت تاریک' }).click()
      await expect(page.getByRole('button', { name: 'فعال کردن حالت روشن' })).toBeVisible()
      await expect(paragraphs.first()).toHaveCSS('direction', 'rtl')
      const dark = await contrast()
      expect(dark.background).not.toBe(light.background)
      expect(dark.ratio).toBeGreaterThanOrEqual(4.5)
      await expect(page.locator('.block-editor-block-inspector__no-blocks')).toHaveCSS('background-color', dark.background)
      await page.screenshot({ path: testInfo.outputPath('editor-1440-dark.png'), fullPage: true })
      await page.setViewportSize({ width: 390, height: 844 })
      await expect(page.locator('.mc-rich-input')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
      await page.screenshot({ path: testInfo.outputPath('editor-390-dark.png'), fullPage: true })
    } finally { await visitor.close() }
  } finally {
    await admin.delete(`/api/admin/cms?type=pages&id=${created.id}`)
    await admin.patch('/api/admin/extensions', { data: { id: 'block-editor', enabled: was?.enabled !== false } })
  }
})

test('a magazine article is written in the block editor and read on its own page', async ({ page, admin, baseURL, browser }) => {
  test.setTimeout(300_000)
  const slug = `e2e-block-article-${Date.now()}`
  const was = await (await admin.get('/api/admin/editor')).json()
  const created = await (await admin.post('/api/admin/cms?type=posts', { data: { slug, title: 'E2E block article', content: '', status: 'PUBLISHED' } })).json()
  expect(created.id).toBeGreaterThan(0)
  const { insertTop, save } = tools(page)
  try {
    await admin.patch('/api/admin/extensions', { data: { id: 'block-editor', enabled: true } })
    await openEditor(page, `/admin/editor/posts/${created.id}`)
    await insertTop('متن')
    await page.locator('.mc-editor-document .mc-rich-input').first().click()
    await page.keyboard.type('بدنهٔ مقاله در بلوک')
    await insertTop('نکته')
    await save()
    // The article form may still rename it, and may not write over its body.
    expect((await admin.patch('/api/admin/cms?type=posts', { data: { id: created.id, title: 'E2E block article renamed' } })).ok()).toBeTruthy()
    expect((await admin.patch('/api/admin/cms?type=posts', { data: { id: created.id, content: '<p>overwritten</p>' } })).status()).toBe(409)
    const visitor = await (await browser.newContext({ baseURL })).newPage()
    await visitor.goto(`/blog/${slug}`, { waitUntil: 'domcontentloaded', timeout: 180_000 })
    await expect(visitor.locator('#article-body.mcb-document .mcb-content-richText')).toContainText('بدنهٔ مقاله در بلوک')
    await expect(visitor.locator('#article-body .mcb-content-callout')).toHaveCount(1)
    await expect(visitor.locator('body')).not.toContainText('overwritten')
    await visitor.close()
  } finally {
    await admin.delete(`/api/admin/cms?type=posts&id=${created.id}`)
    await admin.patch('/api/admin/extensions', { data: { id: 'block-editor', enabled: was?.enabled !== false } })
  }
})

test('with the plugin off the page form is the old editor again, and what was written in blocks is kept', async ({ page, admin }) => {
  test.setTimeout(300_000)
  const slug = `e2e-block-off-${Date.now()}`
  const was = await (await admin.get('/api/admin/editor')).json()
  const created = await (await admin.post('/api/admin/cms?type=pages', { data: { slug, title: 'E2E plugin off', content: '<p>old words</p>', status: 'DRAFT' } })).json()
  try {
    await admin.patch('/api/admin/extensions', { data: { id: 'block-editor', enabled: false } })
    expect((await (await admin.get('/api/admin/editor')).json()).enabled).toBe(false)
    await page.goto('/admin/pages', { waitUntil: 'domcontentloaded', timeout: 240_000 })
    await page.locator('tr', { hasText: 'E2E plugin off' }).getByRole('button', { name: /ویرایش|Edit/ }).first().click()
    // The body is there, in the old editor, and no button leads to the block editor.
    await expect(page.locator('form .ProseMirror').first()).toContainText('old words', { timeout: 60_000 })
    await expect(page.locator('.cms-block-body')).toHaveCount(0)
    await expect(page.locator('a[href^="/admin/editor/"]')).toHaveCount(0)
    // No English body field: the site is written in one language.
    await expect(page.locator('form .ProseMirror')).toHaveCount(1)
    // Saving a document is refused while the plugin is off.
    const opened = await (await admin.get(`/api/admin/editor/pages/${created.id}`)).json()
    expect((await admin.put(`/api/admin/editor/pages/${created.id}`, { data: { document: { version: 1, blocks: [] }, updatedAt: opened.updatedAt } })).status()).toBe(404)
    // The old form still saves the body of a page written the old way.
    expect((await admin.patch('/api/admin/cms?type=pages', { data: { id: created.id, content: '<p>new words</p>' } })).ok()).toBeTruthy()
  } finally {
    await admin.delete(`/api/admin/cms?type=pages&id=${created.id}`)
    await admin.patch('/api/admin/extensions', { data: { id: 'block-editor', enabled: was?.enabled !== false } })
  }
})
