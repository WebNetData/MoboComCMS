import fs from 'node:fs'
import { test, expect } from '@playwright/test'

test.skip(!process.env.E2E_PROMPT_FIXTURE, 'requires the explicitly owned Prompt Master fixture')
test('Prompt pages share site width and related samples stay aligned across viewports and themes', async ({ browser, baseURL }, info) => {
  test.setTimeout(180_000)
  expect(baseURL).toBe('http://localhost:3230')
  expect(JSON.parse(fs.readFileSync(process.env.E2E_PROMPT_FIXTURE!, 'utf8')).db).toBe('mobocom_prompt_master_test_20261101')
  const context = await browser.newContext({ baseURL, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] })
  const page = await context.newPage(), errors: string[] = [], measurements: object[] = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    for (const theme of ['light', 'dark']) for (const width of [390, 1440, 1920, 2560]) {
      await context.addCookies([{ name: 'theme', value: theme, url: baseURL! }])
      await page.setViewportSize({ width, height: 1050 })
      for (const path of ['/prompts', '/prompts/library', '/prompts/history', '/prompts/templates/design-blueprint-gt']) {
        await page.goto(path)
        await expect(page.locator('main')).toBeVisible()
        const main = (await page.locator('main').boundingBox())!, chrome = (await page.locator('.mb-header-bar').boundingBox())!
        expect(Math.abs(main.width - chrome.width)).toBeLessThan(2)
        expect(main.width / width).toBeGreaterThanOrEqual(.945)
        expect(main.width / width).toBeLessThanOrEqual(.98)
        expect(Math.abs(main.x - (width - main.width) / 2)).toBeLessThan(2)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        measurements.push({ theme, width, path, contentWidth: main.width, chromeWidth: chrome.width })
      }
      const related = page.getByRole('region', { name: 'در همین حال‌وهوا کشف کن', exact: true }), cards = related.getByRole('article')
      await expect(cards).toHaveCount(2)
      for (const image of await related.locator('img').all()) { await image.scrollIntoViewIfNeeded(); await image.evaluate(node => (node as HTMLImageElement).decode()) }
      const a = (await cards.nth(0).boundingBox())!, b = (await cards.nth(1).boundingBox())!
      if (width > 900) { expect(Math.abs(a.y-b.y)).toBeLessThan(2); expect(Math.abs(a.height-b.height)).toBeLessThan(2); expect(a.height).toBeLessThan(400) }
      else { expect(b.y).toBeGreaterThanOrEqual(a.y+a.height+12); expect(a.height).toBeLessThan(650) }
      const push = page.getByRole('dialog', { name: 'اعلان‌ها', exact: true }); if (await push.isVisible()) await push.getByRole('button', { name: 'بعداً', exact: true }).click()
      await page.evaluate(source=>{const script=document.createElement('script');script.nonce=document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce||'';script.textContent=source;document.head.append(script)},fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8'))
      expect(await related.evaluate(async node=>(await (window as any).axe.run(node,{iframes:false,runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations)).toEqual([])
      await related.screenshot({ path: info.outputPath(`related-${theme}-${width}.png`) })
    }
    const related = page.getByRole('region', { name: 'در همین حال‌وهوا کشف کن', exact: true }), first = related.getByRole('article').first()
    await first.getByRole('button', { name: /کپی پرامپت/ }).focus(); await page.keyboard.press('Enter')
    await expect(first.getByRole('status')).toHaveText('پرامپت کپی شد')
    expect((await page.evaluate(() => navigator.clipboard.readText())).length).toBeGreaterThan(40)
    const target = await first.locator('h3 a').getAttribute('href'); await first.locator('h3 a').click(); await expect(page).toHaveURL(baseURL!+target)
    expect(errors).toEqual([])
    fs.writeFileSync(info.outputPath('width-measurements.json'), JSON.stringify(measurements, null, 2))
  } finally { await context.close() }
})
