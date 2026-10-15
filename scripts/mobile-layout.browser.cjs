// Actual local public pages; no settings, sessions or database records are written.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), { chromium, expect } = require('@playwright/test')
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000', output = process.env.E2E_OUTPUT_DIR || path.resolve('.mobocom/mobile-layout-evidence')
if (new URL(baseURL).hostname !== 'localhost') throw Error('Mobile layout checks require localhost')
async function bounds(locator) {
  return locator.evaluate(el => { const r = el.getBoundingClientRect(); return { left:r.left, right:r.right, width:r.width, viewport:innerWidth, scroll:el.scrollWidth, client:el.clientWidth } })
}
function inside(box, label) { assert.ok(box.left >= -1 && box.right <= box.viewport + 1 && box.width > 0, `${label}: ${JSON.stringify(box)}`) }
async function main() {
  fs.mkdirSync(output,{recursive:true})
  const browser = await chromium.launch({headless:true}), ctx = await browser.newContext({baseURL,reducedMotion:'reduce'}), page = await ctx.newPage(), errors = [], evidence = []
  page.on('pageerror',error=>errors.push(error.message))
  try {
    for(const [theme,width] of [['dark',320],['light',320],['dark',360],['dark',361],['dark',375],['dark',390],['light',390],['dark',620],['dark',768],['dark',1440],['light',1440]]) {
      await ctx.addCookies([{name:'theme',value:theme,url:baseURL}]); await page.setViewportSize({width,height:1000})
      const response = await page.goto('/',{waitUntil:'domcontentloaded',timeout:180000}); assert.equal(response.status(),200)
      await page.waitForFunction(theme=>document.documentElement.dataset.theme === theme,theme); await page.evaluate(()=>document.fonts.ready)
      await expect(page.locator('.mb-guest')).not.toHaveAttribute('data-loading','true',{timeout:30000})
      const header = page.locator('.mb-header'), actions = page.locator('.mb-header-actions'), brand = header.locator('.mb-brand')
      inside(await bounds(header),'header'); inside(await bounds(actions),'actions'); inside(await bounds(brand),'brand')
      const island=await bounds(page.locator('.mb-header-bar')),actionBox=await bounds(actions)
      assert.ok(actionBox.left>=island.left-1 && actionBox.right<=island.right+1,'actions remain inside the header island')
      inside(await bounds(header.locator('.mb-search')),'search')
      await expect(header.locator('.mb-account')).toHaveAccessibleName('ثبت‌نام')
      for(const control of await actions.locator('button,a').all()) if(await control.isVisible()) { inside(await bounds(control),'visible header control'); await expect(control).toBeEnabled() }
      const pageWidth = await page.evaluate(()=>document.documentElement.scrollWidth)
      assert.ok(pageWidth <= width+1,`Homepage overflows at ${width}: ${pageWidth}`)
      const footer = page.getByTestId('site-footer'); inside(await bounds(footer),'full-width footer')
      assert.ok(Math.abs((await bounds(footer)).width-width)<=1,'footer remains edge to edge')
      const railRows = []
      for(const rail of await page.locator('.mbx-products,.mbx-posters').all()) {
        if(!await rail.isVisible()) continue
        const original = await bounds(rail); inside(original,'home rail')
        if(width<=620 && original.scroll>original.client+1) {
          const last = rail.locator(':scope > *').last(); await last.focus(); await expect(last).toBeInViewport()
          inside(await bounds(last),'last card after keyboard focus')
          const scrolled = await rail.evaluate(el=>Math.abs(el.scrollLeft)); assert.ok(scrolled>0,'rail retains native horizontal scrolling')
          railRows.push({width:original.width,scrolled})
          await rail.evaluate(el=>{el.scrollLeft=0})
        }
      }
      await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}))
      await page.screenshot({path:path.join(output,`after-${theme}-${width}.png`),animations:'disabled'})
      if(width<=620) {
        await header.locator('.mb-search').click(); await expect(page.locator('.ss-dialog')).toBeVisible()
        await page.locator('.ss-close').click(); await expect(page.locator('.ss-dialog')).not.toBeVisible()
        const menu=header.locator('.mb-menu-button'); await menu.click(); await expect(page.locator('#mb-mobile-nav')).toBeVisible()
        inside(await bounds(page.locator('#mb-mobile-nav')),'mobile drawer'); await page.keyboard.press('Escape'); await expect(page.locator('#mb-mobile-nav')).toHaveCount(0)
      }
      if(process.env.E2E_AXE_PATH) {
        await page.evaluate(fs.readFileSync(process.env.E2E_AXE_PATH,'utf8'))
        const violations = await page.evaluate(async()=> (await window.axe.run(document.querySelector('.mb-header'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})))
        assert.deepEqual(violations,[],`header accessibility ${theme}/${width}`)
      }
      evidence.push({route:'/',theme,width,pageWidth,header:await bounds(header),actions:await bounds(actions),rails:railRows})
      console.log(`Homepage ${theme}/${width}: controls, page width, native rails, footer and accessibility passed.`)
    }
    await page.setViewportSize({width:320,height:1000})
    for(const route of ['/blog','/music','/products','/games','/cinema','/software','/forum','/businesses']) {
      const response=await page.goto(route,{waitUntil:'domcontentloaded',timeout:180000}); assert.equal(response.status(),200,route)
      await expect(page.locator('.mb-header-actions')).toBeVisible(); await page.evaluate(()=>document.fonts.ready)
      const actions=await bounds(page.locator('.mb-header-actions')); inside(actions,route+' header actions')
      const footer=await bounds(page.getByTestId('site-footer')); assert.ok(Math.abs(footer.width-320)<=1,route+' full-width footer')
      evidence.push({route,width:320,actions}); console.log(`${route}: narrow header controls and full-width footer passed.`)
    }
    assert.deepEqual(errors,[],'runtime/hydration errors')
    fs.writeFileSync(path.join(output,'checks.json'),JSON.stringify(evidence,null,2)+'\n')
  } finally {fs.writeFileSync(path.join(output,'runtime-errors.json'),JSON.stringify(errors,null,2)+'\n'); await browser.close()}
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
