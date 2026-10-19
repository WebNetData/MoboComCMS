import { test, expect, hasAdmin, watchErrors } from '../helpers'
import { ADMIN_STATE } from '../paths'

test.use({ storageState: hasAdmin() ? ADMIN_STATE : undefined })

test('editor templates create independent canonical copies and survive reopening', async ({ page, admin }) => {
  test.setTimeout(180_000)
  const slug = `e2e-authoring-pattern-${Date.now()}`, errors = watchErrors(page)
  const was = await (await admin.get('/api/admin/editor')).json()
  const created = await (await admin.post('/api/admin/cms?type=posts', { data: { slug, title: slug, content: '', status: 'DRAFT' } })).json()
  expect(created.id).toBeGreaterThan(0)
  try {
    expect((await admin.patch('/api/admin/extensions', { data: { id: 'block-editor', enabled: true } })).ok()).toBeTruthy()
    const opened = await (await admin.get(`/api/admin/editor/posts/${created.id}`)).json()
    expect((await admin.put(`/api/admin/editor/posts/${created.id}`, { data: { updatedAt: opened.updatedAt, document: { version: 1, blocks: [{ id: 'e2e_locked_heading', type: 'content.heading', version: 1, props: { text: 'چیدمان قابل استفادهٔ دوباره', level: 2 }, lock: { move: true, remove: true } }] } } })).ok()).toBeTruthy()
    await page.goto(`/admin/editor/posts/${created.id}`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await page.getByRole('button', { name: 'الگوها و چیدمان‌ها', exact: true }).click()
    await page.getByLabel('نام الگو', { exact: true }).fill(slug)
    await page.getByRole('button', { name: 'ذخیرهٔ الگو', exact: true }).click()
    await page.getByRole('button', { name: `درج ${slug}`, exact: true }).click()
    await expect(page.getByLabel('متن تیتر')).toHaveCount(2)
    await page.getByRole('button', { name: 'ذخیره', exact: true }).click()
    await expect(page.locator('.mc-editor-state')).toContainText('ذخیره شد')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('متن تیتر')).toHaveCount(2)
    const saved = await (await admin.get(`/api/admin/editor/posts/${created.id}`)).json()
    expect(new Set(saved.document.blocks.map((block: { id: string }) => block.id)).size).toBe(2)
    expect(saved.document.blocks.map((block: { lock: unknown }) => block.lock)).toEqual([{ move: true, remove: true }, { move: true, remove: true }])
    expect(errors).toEqual([])
  } finally {
    const patterns = await (await admin.get('/api/admin/editor/patterns?entity=posts')).json()
    for (const pattern of patterns.patterns || []) if (pattern.title === slug) await admin.delete('/api/admin/editor/patterns?entity=posts', { data: { id: pattern.id, updatedAt: pattern.updatedAt } })
    await admin.delete(`/api/admin/cms?type=posts&id=${created.id}`)
    await admin.patch('/api/admin/extensions', { data: { id: 'block-editor', enabled: was.enabled !== false } })
  }
})
