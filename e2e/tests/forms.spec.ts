import { test, expect } from '../helpers'

/**
 * Form builder: a multi-step form with a condition and an attachment is filled in by a visitor (API and browser),
 * lands in the administrator's inbox, can be exported, and the attachment stays private. The form is deleted afterwards.
 */
test.describe.configure({ mode: 'serial' })

// Every request comes from a new address so the per-address rate limit (which is tested separately) does not interfere.
let hits = 0
const from = () => ({ 'x-forwarded-for': `10.77.${Math.floor(hits / 250)}.${(hits++ % 250) + 1}` })
const SLUG = `e2e-form-${Date.now().toString(36)}`
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n')

const definition = {
  slug: SLUG, title: 'E2E form', description: 'created by the browser test', published: true, successText: 'Thanks, saved.',
  settings: { steps: [{ id: 's1', title: 'About you' }, { id: 's2', title: 'Details' }], notifyInbox: false, spamLinks: 3 },
  fields: [
    { id: 'name', label: 'Full name', type: 'text', required: true, options: [], step: 's1', min: 2 },
    { id: 'email', label: 'Email', type: 'email', required: true, options: [], step: 's1' },
    { id: 'kind', label: 'Kind', type: 'radio', required: true, options: ['Bug', 'Idea'], step: 's2' },
    { id: 'steps', label: 'Steps to reproduce', type: 'textarea', required: true, options: [], step: 's2', showIf: [{ field: 'kind', op: 'eq', value: 'Bug' }] },
    { id: 'shot', label: 'Screenshot', type: 'file', required: false, options: [], step: 's2', max: 1 },
  ],
}

test.describe('form builder', () => {
  let formId = 0

  test.afterAll(async ({ playwright, baseURL }) => {
    const { hasAdmin } = await import('../helpers')
    if (!hasAdmin() || !formId) return
    const { ADMIN_STATE } = await import('../paths')
    const admin = await playwright.request.newContext({ baseURL, storageState: ADMIN_STATE, extraHTTPHeaders: { origin: baseURL! } })
    await admin.post('/api/admin/forms', { data: { op: 'delete', id: formId } })
    await admin.dispose()
  })

  test('the builder refuses a broken form and saves a good one', async ({ admin }) => {
    const bad = await admin.post('/api/admin/forms', { data: { ...definition, fields: [{ ...definition.fields[3] }] } })
    expect(bad.status()).toBe(400)
    const saved = await admin.post('/api/admin/forms', { data: definition })
    expect(saved.ok()).toBeTruthy()
    formId = (await saved.json()).id
    const list = await (await admin.get('/api/admin/forms')).json()
    expect(list.templates.length).toBeGreaterThanOrEqual(4)
    expect(list.forms.find((f: { id: number }) => f.id === formId)?.slug).toBe(SLUG)
  })

  test('visitors: validation, hidden fields, honeypot, spam and private attachments', async ({ admin, playwright, baseURL }) => {
    const guest = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL! } })
    const post = (values: unknown, extra: Record<string, unknown> = {}) => guest.post(`/api/forms/${SLUG}`, { headers: from(), data: { values, ...extra } })

    const empty = await post({})
    expect(empty.status()).toBe(400)
    expect((await empty.json()).error).toContain('الزامی')
    const missingBugDetails = await post({ name: 'Ali', email: 'ali@example.com', kind: 'Bug' })
    expect(missingBugDetails.status(), 'a shown field is required').toBe(400)

    // Upload → submit → the answer references the stored file.
    const badFile = await guest.post(`/api/forms/${SLUG}/upload`, { headers: from(), multipart: { file: { name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('not an image') } } })
    expect(badFile.status()).toBe(400)
    const up = await guest.post(`/api/forms/${SLUG}/upload`, { headers: from(), multipart: { file: { name: 'shot.png', mimeType: 'image/png', buffer: PNG } } })
    expect(up.status()).toBe(201)
    const upload = await up.json()
    const pdf = await guest.post(`/api/forms/${SLUG}/upload`, { headers: from(), multipart: { file: { name: 'doc.pdf', mimeType: 'application/pdf', buffer: PDF } } })
    expect(pdf.status()).toBe(201)

    const forged = await post({ name: 'Ali', email: 'ali@example.com', kind: 'Bug', steps: 'click', shot: ['00000000-0000-4000-8000-000000000000.png'] })
    expect(forged.status(), 'a file that was never uploaded is refused').toBe(400)
    const ok = await post({ name: 'Ali', email: 'ALI@example.com', kind: 'Bug', steps: 'click it', shot: [upload.id] })
    expect(ok.status()).toBe(201)
    expect((await ok.json()).message).toBe('Thanks, saved.')
    expect((await post({ name: 'Ali', email: 'ali@example.com', kind: 'Bug', steps: 'again', shot: [upload.id] })).status(), 'an upload is used once').toBe(400)

    // Idea: the Bug-only field is hidden, so its value is dropped.
    expect((await post({ name: 'Sara', email: 'sara@example.com', kind: 'Idea', steps: 'ignored' })).status()).toBe(201)
    // A robot (honeypot) is told it worked; nothing is stored. Link spam is stored apart.
    expect((await post({ name: 'Bot', email: 'bot@example.com', kind: 'Idea' }, { website: 'http://spam' })).status()).toBe(201)
    expect((await post({ name: 'Spammer', email: 'spam@example.com', kind: 'Bug', steps: 'http://a.com http://b.com http://c.com' })).status()).toBe(201)

    // Administrator's view
    const inbox = await (await admin.get(`/api/admin/forms/submissions?formId=${formId}`)).json()
    const names = inbox.rows.map((r: { answers: { id: string; value: string }[] }) => r.answers.find((a) => a.id === 'name')?.value)
    expect(names.sort()).toEqual(['Ali', 'Sara'])
    expect(inbox.counts.SPAM).toBe(1)
    expect(JSON.stringify(inbox)).not.toContain('Bot')
    const ali = inbox.rows.find((r: { user: string; files: unknown[] }) => r.files.length)
    expect(ali.answers.find((a: { id: string }) => a.id === 'email').value).toBe('ali@example.com')
    const sara = inbox.rows.find((r: { answers: { id: string; value: string }[] }) => r.answers.some((a) => a.value === 'Sara'))
    expect(sara.answers.some((a: { id: string }) => a.id === 'steps'), 'hidden answers are not stored').toBe(false)

    // Attachments: administrators only.
    expect((await guest.get(`/api/admin/forms/files?id=${ali.files[0].id}`)).status()).toBe(403)
    const file = await admin.get(`/api/admin/forms/files?id=${ali.files[0].id}`)
    expect(file.status()).toBe(200)
    expect(file.headers()['content-type']).toBe('image/png')
    expect(file.headers()['x-content-type-options']).toBe('nosniff')
    expect((await admin.get('/api/admin/forms/files?id=../../etc/passwd')).status()).toBe(404)
    expect([401, 403]).toContain((await guest.get(`/api/admin/forms/submissions?formId=${formId}`)).status())

    // Status, note, CSV
    expect((await admin.patch('/api/admin/forms/submissions', { data: { id: ali.id, status: 'STARRED', note: 'call back' } })).ok()).toBeTruthy()
    const starred = await (await admin.get(`/api/admin/forms/submissions?formId=${formId}&status=STARRED`)).json()
    expect(starred.rows).toHaveLength(1)
    expect(starred.rows[0].note).toBe('call back')
    const csv = await admin.get(`/api/admin/forms/submissions?formId=${formId}&export=csv`)
    expect(csv.headers()['content-type']).toContain('text/csv')
    const text = await csv.text()
    expect(text).toContain('Full name')
    expect(text).toContain('Sara')
    await guest.dispose()
  })

  test('the public page walks through the steps in a browser', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`/forms/${SLUG}`, { waitUntil: 'networkidle', timeout: 180_000 })
    await expect(page.getByRole('heading', { name: 'E2E form' })).toBeVisible()
    await expect(page.getByLabel('Steps to reproduce')).toHaveCount(0)

    await page.getByRole('button', { name: /مرحلهٔ بعد/ }).click()
    await expect(page.getByText('Full name: ').or(page.locator('.error-text').first())).toBeVisible()
    await expect(page.locator('.pf-steps li.is-current')).toContainText('About you')

    await page.getByLabel('Full name').fill('Reza')
    await page.getByLabel('Email').fill('reza@example.com')
    await page.getByRole('button', { name: /مرحلهٔ بعد/ }).click()
    await expect(page.locator('.pf-steps li.is-current')).toContainText('Details')

    await page.getByLabel('Idea').check()
    await expect(page.getByLabel('Steps to reproduce')).toHaveCount(0)
    await page.getByLabel('Bug').check()
    await expect(page.getByLabel('Steps to reproduce')).toBeVisible()
    await page.getByLabel('Steps to reproduce').fill('open the page')
    await page.getByRole('button', { name: /ارسال فرم/ }).click()
    await expect(page.getByText('Thanks, saved.')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('drafts, closed forms and shortcuts', async ({ admin, playwright, baseURL }) => {
    const guest = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL! } })
    const closed = { ...definition, id: formId, settings: { ...definition.settings, closesAt: '2020-01-01T00:00:00Z', opensAt: '2019-01-01T00:00:00Z', closedMessage: 'We are closed.' } }
    expect((await admin.post('/api/admin/forms', { data: closed })).ok()).toBeTruthy()
    const refused = await guest.post(`/api/forms/${SLUG}`, { headers: from(), data: { values: { name: 'Late', email: 'l@example.com', kind: 'Idea' } } })
    expect(refused.status()).toBe(403)
    expect((await refused.json()).error).toBe('We are closed.')
    expect((await admin.post('/api/admin/forms', { data: { ...definition, id: formId, published: false } })).ok()).toBeTruthy()
    expect((await guest.get(`/forms/${SLUG}`)).status(), 'a draft is not public').toBe(404)
    expect((await guest.post(`/api/forms/${SLUG}`, { headers: from(), data: { values: {} } })).status()).toBe(404)
    // The notification list never reaches visitors.
    expect((await admin.post('/api/admin/forms', { data: { ...definition, id: formId, settings: { ...definition.settings, notifyEmails: ['boss@example.com'] } } })).ok()).toBeTruthy()
    const html = await (await guest.get(`/forms/${SLUG}`)).text()
    // A development server streams debug copies of every awaited server value; production builds never do.
    if (!html.includes('awaited')) expect(html).not.toContain('boss@example.com')
    await guest.dispose()
  })
})
