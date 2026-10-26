import fs from 'node:fs'
import { test, expect, type Page } from '@playwright/test'

// Explicit opt-in: the target must have web-push, translation and store livechat
// enabled. Never toggle the owner's settings or request notification permission.
test.skip(process.env.E2E_PWA_PROMPTS !== '1', 'set E2E_PWA_PROMPTS=1 against a configured local target')

async function audit(page: Page) {
  if (!process.env.E2E_AXE_PATH) return
  const source = fs.readFileSync(process.env.E2E_AXE_PATH, 'utf8')
  await page.evaluate(code => {
    if ((window as any).axe) return
    const script = document.createElement('script')
    script.nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce || ''
    script.textContent = code
    document.head.append(script)
  }, source)
  const violations = await page.evaluate(async () => (await (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations)
  expect(violations).toEqual([])
}

async function clearOfWidgets(page: Page) {
  await expect.poll(() => page.locator('.pwa-chip').evaluate(chip => {
    if (getComputedStyle(chip).visibility !== 'visible' || chip.inert) return false
    const a = chip.getBoundingClientRect()
    if (a.top < 15 || a.bottom > innerHeight || a.left < 0 || a.right > innerWidth) return false
    const nodes = document.querySelectorAll('.lc-root, .lc-panel, .mc-translate, .support-dock, .cmp-tray, .mu-player, .mu-queue')
    return [...nodes].every(node => {
      if (getComputedStyle(node).visibility === 'hidden') return true
      const b = node.getBoundingClientRect()
      return !b.width || !b.height || a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom
    })
  })).toBe(true)
  const buttons = page.locator('.pwa-chip button')
  for (const button of await buttons.all()) {
    expect(await button.evaluate(el => {
      const r = el.getBoundingClientRect()
      return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
    }), 'invitation buttons are not occluded').toBe(true)
  }
}

for (const theme of ['light', 'dark'] as const) for (const width of [1440, 390]) {
  test(`PWA invitation yields to existing widgets: ${theme} ${width}`, async ({ browser, baseURL }, info) => {
    const context = await browser.newContext({ baseURL, viewport: { width, height: 1000 }, reducedMotion: 'reduce' })
    try {
      await context.addCookies([{ name: 'theme', value: theme, url: baseURL! }])
      const page = await context.newPage(), errors: string[] = [], writes: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      page.on('request', request => {
        if (request.method() !== 'GET' && /\/api\/(push|chat)/.test(new URL(request.url()).pathname)) writes.push(request.url())
      })
      // Exercise the real third-visit condition, not a fabricated prompt DOM.
      for (const route of ['/', '/blog', '/products']) {
        expect((await page.goto(route))?.status()).toBe(200)
        await page.waitForLoadState('networkidle')
      }
      expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme)
      const prompt = page.getByRole('dialog', { name: 'اعلان‌ها', exact: true })
      await expect(prompt).toBeVisible()
      await expect(page.getByRole('button', { name: 'گفت‌وگوی آنلاین', exact: true })).toBeVisible()
      await clearOfWidgets(page)
      await audit(page)
      await page.screenshot({ path: info.outputPath('closed.png'), animations: 'disabled' })

      await page.getByRole('button', { name: 'گفت‌وگوی آنلاین', exact: true }).click()
      const chat = page.getByRole('dialog', { name: 'گفت‌وگوی آنلاین', exact: true })
      await expect(chat).toBeVisible()
      if (width === 390) {
        await expect(page.locator('.pwa-chip')).toHaveAttribute('data-placement', 'deferred')
        await expect(prompt).toBeHidden()
        expect(await page.locator('.pwa-chip').evaluate(el => el.inert)).toBe(true)
      } else await clearOfWidgets(page)
      await page.screenshot({ path: info.outputPath('chat-open.png'), animations: 'disabled' })
      await chat.getByRole('button', { name: 'بستن گفت‌وگو', exact: true }).click()
      await clearOfWidgets(page)

      await page.getByRole('button', { name: 'Language', exact: true }).click()
      await expect(page.getByRole('listbox', { name: 'Language', exact: true })).toBeVisible()
      await clearOfWidgets(page)
      await page.keyboard.press('Escape')
      await expect(page.getByRole('listbox', { name: 'Language', exact: true })).toBeHidden()
      await clearOfWidgets(page)

      // Layout-only fixture: variable-height tray/player, using the
      // real page/CSS/placement hook. This is not music/compare domain evidence.
      await page.evaluate(() => {
        for (const [cls, bottom, height] of [['cmp-tray', 16, 180], ['mu-player', 210, 160]] as const) {
          const node = document.createElement('div')
          node.className = cls
          node.dataset.pwaLayoutFixture = '1'
          node.style.cssText = `position:fixed;inset-inline:12px;bottom:${bottom}px;height:${height}px;transform:none;`
          document.body.append(node)
        }
      })
      await clearOfWidgets(page)
      const beforeResize = (await page.locator('.pwa-chip').boundingBox())!.y
      await page.evaluate(() => { (document.querySelector('[data-pwa-layout-fixture].mu-player') as HTMLElement).style.height = '230px' })
      await expect.poll(async () => (await page.locator('.pwa-chip').boundingBox())!.y).toBeLessThan(beforeResize)
      await clearOfWidgets(page)
      await page.evaluate(() => document.querySelectorAll('[data-pwa-layout-fixture]').forEach(el => el.remove()))
      await clearOfWidgets(page)

      // Keyboard access and real dismissal persist through a fresh page load.
      const later = prompt.getByRole('button', { name: 'بعداً', exact: true })
      await later.focus()
      await expect(later).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(prompt).toBeHidden()
      await page.reload()
      // This widget is client-only and arrives after the initial effects. A
      // missing prompt alone is not evidence that hydration has completed.
      await expect(page.getByRole('button', { name: 'گفت‌وگوی آنلاین', exact: true })).toBeVisible()
      await expect(page.locator('.pwa-chip.is-push')).toHaveCount(0)

      // Browser-install-event fixture: real component flow, no OS installation.
      await page.evaluate(() => {
        const event = new Event('beforeinstallprompt', { cancelable: true })
        Object.assign(event, { prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'dismissed' }) })
        window.dispatchEvent(event)
      })
      const install = page.getByRole('dialog', { name: 'نصب اپلیکیشن', exact: true })
      await expect(install).toBeVisible()
      await clearOfWidgets(page)
      await install.getByRole('button', { name: 'بستن', exact: true }).click()
      await expect(install).toBeHidden()
      expect(await page.evaluate(() => localStorage.getItem('mobocom.install.dismissed'))).toBe('1')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)

      await audit(page)
      expect(writes, 'no chat message or push subscription created').toEqual([])
      expect(errors).toEqual([])
    } finally { await context.close() }
  })
}
