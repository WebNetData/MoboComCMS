import { test, expect, watchErrors } from '../helpers'
import { ADMIN_STATE } from '../paths'
import { writeZip } from '../../src/modules/packages/domain/zip'

test('uploaded package keeps edits, settings and activation through the real admin editor', async ({ admin, browser, baseURL }) => {
  const id = `e2e-package-${Date.now().toString(36)}`
  const context = await browser.newContext({ baseURL, storageState: ADMIN_STATE })
  const page = await context.newPage(), errors = watchErrors(page)
  try {
    const manifest = { id, name: id, version: '1.0.0', kind: 'plugin', runtime: 'declarative', settings: [{ key: 'title', label: 'Title', type: 'text', default: 'original' }] }
    const upload = await admin.post('/api/admin/packages', { multipart: { file: { name: 'owned.zip', mimeType: 'application/zip', buffer: writeZip(new Map([
      ['manifest.json', Buffer.from(JSON.stringify(manifest))], ['a.txt', Buffer.from('original-a')], ['b.txt', Buffer.from('original-b')],
    ])) } } })
    expect(upload.status(), await upload.text()).toBe(200)
    expect((await upload.json()).package.enabled).toBe(false)
    await page.goto(`/admin/extensions/editor?package=${id}&file=a.txt`)
    const editor = page.getByRole('textbox', { name: 'a.txt', exact: true })
    await expect(editor).toHaveValue('original-a')
    await editor.fill('saved-through-browser')
    const saved = page.waitForResponse(response => response.url().endsWith(`/api/admin/packages/${id}/files`) && response.request().method() === 'PUT')
    await editor.press('Control+s')
    expect((await saved).status()).toBe(200)
    const invalid = await admin.patch(`/api/admin/packages/${id}`, { data: { enabled: true, settings: { unknown: 'invalid' } } })
    expect(invalid.status()).toBe(400)
    expect((await (await admin.get(`/api/admin/packages/${id}`)).json()).package).toMatchObject({ enabled: false, settings: { title: 'original' } })
    const combined = await admin.patch(`/api/admin/packages/${id}`, { data: { enabled: true, settings: { title: 'combined-title' } } })
    expect(combined.status(), await combined.text()).toBe(200)
    expect((await combined.json()).package).toMatchObject({ enabled: true, settings: { title: 'combined-title' } })
    const writes = await Promise.all([
      admin.put(`/api/admin/packages/${id}/files`, { data: { path: 'b.txt', content: 'saved-through-api' } }),
      admin.patch(`/api/admin/packages/${id}`, { data: { enabled: true } }),
      admin.patch(`/api/admin/packages/${id}`, { data: { settings: { title: 'current-title' } } }),
    ])
    for (const response of writes) expect(response.status(), await response.text()).toBe(200)
    const current = await (await admin.get(`/api/admin/packages/${id}?file=a.txt&revisions=1`)).json()
    expect(current.file.content).toBe('saved-through-browser')
    expect(current.package).toMatchObject({ enabled: true, settings: { title: 'current-title' } })
    expect(current.revisions.filter((revision: { note: string }) => revision.note === 'edited')).toHaveLength(2)
    expect((await (await admin.get(`/api/admin/packages/${id}?file=b.txt`)).json()).file.content).toBe('saved-through-api')
    await page.reload()
    await expect(editor).toHaveValue('saved-through-browser')
    expect((await admin.delete(`/api/admin/packages/${id}/files?path=b.txt`)).status()).toBe(200)
    expect((await (await admin.get(`/api/admin/packages/${id}?file=b.txt`)).json()).file.content).toBeNull()
    expect((await admin.post(`/api/admin/packages/${id}/revisions`, { data: { index: 0 } })).status()).toBe(200)
    expect((await (await admin.get(`/api/admin/packages/${id}?file=b.txt`)).json()).file.content).toBe('saved-through-api')
    expect(errors).toEqual([])
  } finally {
    await context.close()
    await admin.delete(`/api/admin/packages/${id}`)
  }
})
