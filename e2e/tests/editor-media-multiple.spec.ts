import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from '@playwright/test'

test.skip(!process.env.E2E_EDITOR_MEDIA_FIXTURE, 'explicit owned local fixture required')

test('three consecutive visual audio insertions survive publication and reopening', async ({ browser, baseURL }, info) => {
  test.setTimeout(180_000)
  expect(new URL(baseURL!).hostname).toBe('localhost')
  const f = JSON.parse(fs.readFileSync(process.env.E2E_EDITOR_MEDIA_FIXTURE!, 'utf8'))
  const context = await browser.newContext({ baseURL, reducedMotion: 'reduce' })
  await context.addCookies([{ name: 'next-auth.session-token', value: f.tokens.manager, url: baseURL! }, { name: 'mc-translate-dismissed', value: '1', url: baseURL! }])
  const page = await context.newPage()
  try {
    const bytes = fs.readFileSync(path.join(process.env.E2E_EDITOR_MEDIA_FILES!, 'voice.mp3'))
    let response = await context.request.post('/api/admin/uploads', { headers: { Origin: baseURL! }, data: { op: 'start', name: f.stamp + '-' + Date.now() + '-multiple.mp3', size: bytes.length, section: 'pages' } })
    expect(response.status()).toBe(200)
    const upload = await response.json()
    response = await context.request.put('/api/admin/uploads?id=' + upload.id + '&offset=0', { headers: { Origin: baseURL!, 'Content-Type': 'application/octet-stream' }, data: bytes })
    expect(response.status()).toBe(200)
    response = await context.request.post('/api/admin/uploads', { headers: { Origin: baseURL! }, data: { op: 'finish', id: upload.id } })
    expect(response.status()).toBe(200)
    const { url } = await response.json()
    expect((await context.request.patch('/api/admin/cms?type=pages', { headers: { Origin: baseURL! }, data: { id: f.page, status: 'DRAFT', content: '<p>آغاز نوشته</p>' } })).status()).toBe(200)
    await page.goto('/admin/pages?edit=' + f.page)
    const old = page.getByRole('button', { name: 'ادامه با ویرایشگر قدیمی', exact: true })
    if (await old.count()) await old.click()
    const classic = page.locator('.ce'), frame = classic.frameLocator('.tox-edit-area iframe')
    await expect(frame.locator('body')).toBeVisible()
    // Do not manually reposition the caret between inserts: this is the reported authoring flow.
    for (let i = 1; i <= 3; i++) {
      await classic.getByRole('button', { name: 'درج موسیقی و پادکست', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'درج موسیقی و پادکست', exact: true })
      await dialog.getByLabel('لینک فایل صوتی', { exact: true }).fill(url + '?part=' + i)
      await dialog.getByLabel('عنوان رسانه', { exact: true }).fill('صدای ' + i)
      await dialog.getByRole('button', { name: 'درج در نوشته', exact: true }).click()
      await expect(frame.locator('audio')).toHaveCount(i)
      await expect(frame.locator('figure figure')).toHaveCount(0)
    }
    await frame.locator('body').pressSequentially('متن پس از رسانه')
    await expect(frame.locator('p').filter({ hasText: 'متن پس از رسانه' })).toBeVisible()
    await expect(frame.locator('figure').filter({ hasText: 'متن پس از رسانه' })).toHaveCount(0)
    await page.getByLabel('وضعیت', { exact: true }).selectOption('PUBLISHED')
    await page.getByRole('button', { name: 'بازبینی و انتشار', exact: true }).click()
    const saving = page.waitForResponse(r => r.url().includes('/api/admin/cms?type=pages') && r.request().method() === 'PATCH')
    await page.getByRole('button', { name: 'تأیید و انتشار', exact: true }).click()
    expect((await saving).status()).toBe(200)
    await page.goto('/admin/pages?edit=' + f.page)
    if (await old.count()) await old.click()
    await expect(frame.locator('audio')).toHaveCount(3)
    await expect(frame.locator('figure figure')).toHaveCount(0)
    const visitor = await browser.newContext({ baseURL, reducedMotion: 'reduce' })
    try {
      await visitor.addCookies([{ name: 'mc-translate-dismissed', value: '1', url: baseURL! }])
      const view = await visitor.newPage()
      expect((await view.goto('/p/' + f.slug))?.status()).toBe(200)
      await expect(view.locator('.mc-audio')).toHaveCount(3)
      for (let i = 0; i < 3; i++) {
        const player = view.locator('.mc-audio').nth(i)
        await expect(player.getByText('صدای ' + (i + 1), { exact: true })).toBeVisible()
        await expect(player.locator('audio')).toHaveAttribute('src', url + '?part=' + (i + 1))
        await player.getByRole('button', { name: 'پخش فایل صوتی', exact: true }).click()
        await expect.poll(() => player.locator('audio').evaluate((e: HTMLAudioElement) => e.currentTime)).toBeGreaterThan(0)
        expect(await view.locator('audio').evaluateAll(nodes => nodes.filter(n => !(n as HTMLAudioElement).paused).length)).toBe(1)
      }
      await view.screenshot({ path: info.outputPath('three-audio.png'), fullPage: true })
      // Reproduce the old persisted shape without changing real owner content. Public
      // enhancement must retain all three, even before an author edits the old post.
      const legacy = await frame.locator('body').evaluate(body => {
        const figures = [...body.querySelectorAll('figure[data-mc-media]')].map(node => node.cloneNode(true) as Element)
        figures[1].querySelector('[data-mc-player]')!.append(figures[2])
        figures[0].querySelector('[data-mc-player]')!.append(figures[1])
        return figures[0].outerHTML
      })
      expect((await context.request.patch('/api/admin/cms?type=pages', { headers: { Origin: baseURL! }, data: { id: f.page, content: legacy } })).status()).toBe(200)
      await view.reload()
      await expect(view.locator('.mc-audio')).toHaveCount(3)
      await expect(view.locator('figure figure')).toHaveCount(0)
      for (let i = 0; i < 3; i++) await expect(view.locator('.mc-audio').nth(i).getByText('صدای ' + (i + 1), { exact: true })).toBeVisible()
      await view.locator('.mc-audio').nth(2).getByRole('button', { name: 'پخش فایل صوتی', exact: true }).click()
      await expect.poll(() => view.locator('.mc-audio audio').nth(2).evaluate((e: HTMLAudioElement) => e.currentTime)).toBeGreaterThan(0)
      await view.screenshot({ path: info.outputPath('legacy-three-audio.png'), fullPage: true })
    } finally { await visitor.close() }
  } finally { await context.close() }
})
