// Actual task-owned PostgreSQL pages; no real users, payments, sends, or remote navigation.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium,expect}=require('@playwright/test')
const fixturePath=process.env.PLATFORM_FIXTURE_PATH,output=process.env.PLATFORM_BROWSER_OUTPUT
if(!fixturePath||!output)throw Error('Explicit private fixture and output paths required')
const fixture=JSON.parse(fs.readFileSync(fixturePath,'utf8')),baseURL=fixture.baseURL
if(new URL(baseURL).hostname!=='localhost'||new URL(baseURL).port!=='3117')throw Error('Task-local preview required')
const progress=path.join(output,'progress.json')
const previous=process.env.PLATFORM_RESUME==='1'&&fs.existsSync(progress)?JSON.parse(fs.readFileSync(progress,'utf8')):{views:[],errors:[]}
const views=previous.views.filter(v=>v.violations.length===0&&!v.overflow),errors=previous.errors
async function main(){
 fs.mkdirSync(output,{recursive:true})
 const browser=await chromium.launch({headless:true})
 try{
  for(const [width,theme]of [[1440,'light'],[1440,'dark'],[390,'dark']]){
   const context=await browser.newContext({baseURL,ignoreHTTPSErrors:true,viewport:{width,height:1000},reducedMotion:'reduce'})
   await context.addCookies([...fixture.staffCookies,{name:'theme',value:theme,url:baseURL}])
   await context.route('**/*',route=>new URL(route.request().url()).hostname==='localhost'?route.continue():route.abort())
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
   const done=name=>views.some(v=>v.name===name&&v.width===width&&v.theme===theme)
   const visit=async(url,ready)=>{const r=await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});assert.equal(r.status(),200,url);await ready();await page.evaluate(()=>document.fonts.ready)}
   const capture=async(name,selector='main')=>{
    await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')})
    const violations=await page.evaluate(async selector=>(await window.axe.run(document.querySelector(selector),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),selector)
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)
    const record={name,width,theme,violations,overflow};views.push(record)
    fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify({views,errors},null,2))
    await page.screenshot({path:path.join(output,`${name}-${width}-${theme}.png`),fullPage:true,caret:'initial'})
    assert.equal(violations.length,0,JSON.stringify(record));assert.equal(overflow,false,JSON.stringify(record))
   }
   if(!done('workdesk')){
   await visit('/admin',()=>expect(page.getByRole('heading',{name:'کارهای امروز',exact:true})).toBeVisible({timeout:120000}))
   await expect(page.getByRole('link',{name:/پذیرش تعمیر آزمایشی/}).first()).toBeVisible()
   await capture('workdesk','section[aria-labelledby="daily-workdesk-title"]')
   if(width===1440&&theme==='light'){
    await page.route('**/api/admin/workdesk',r=>r.fulfill({status:503,body:'{}',contentType:'application/json'}))
    await page.getByRole('region',{name:'کارهای امروز'}).getByRole('button',{name:'به‌روزرسانی'}).click()
    await expect(page.getByText('دریافت صف‌ها ناموفق بود.')).toBeVisible()
    await page.unroute('**/api/admin/workdesk');await page.getByRole('region',{name:'کارهای امروز'}).getByRole('button',{name:'تلاش دوباره'}).click()
    await expect(page.getByRole('link',{name:/پذیرش تعمیر آزمایشی/}).first()).toBeVisible()
   }
   }
   if(!done('editorial')){
   await visit('/admin/journal',()=>expect(page.getByText('مطلب زمان‌بندی‌شده آزمایشی').first()).toBeVisible({timeout:120000}))
   await capture('editorial','.sa')
   }
   if(!done('crm')){
   await visit('/admin/crm/'+fixture.buyerId,()=>expect(page.getByRole('heading',{name:'خدمات و تعمیرات',exact:true})).toBeVisible({timeout:120000}))
   await page.getByRole('button',{name:'خدمات و تعمیرات',exact:true}).click()
   await expect(page.locator('.crm-timeline')).toContainText('پذیرش تعمیر آزمایشی')
   assert(!await page.locator('main').innerText().then(t=>t.includes('DO-NOT-EXPOSE')))
   await capture('crm','.sa')
   }
   if(!done('health')){
   await visit('/admin/monitoring',()=>expect(page.getByRole('heading',{name:'سلامت عملیاتی و اقدام‌های لازم'})).toBeVisible({timeout:120000}))
   await expect(page.getByText('بکاپ خودکار غیرفعال است')).toBeVisible()
   await capture('health','.sa')
   }
   if(!done('search')){
   await visit('/search?q=PlatformNebulla&type=game',()=>expect(page.getByText('منظورتان',{exact:false})).toBeVisible({timeout:120000}))
   const correction=page.getByRole('link',{name:'platformnebula',exact:true});await expect(correction).toBeVisible()
   await capture('search','main')
   await Promise.all([page.waitForURL('**/search?q=platformnebula&type=game'),correction.click()]);await expect(page.getByRole('heading',{name:'PlatformNebula',exact:true})).toBeVisible({timeout:60000})
   }
   if(!done('connections')){
   await visit(fixture.productPath,()=>expect(page.getByText('مطالب و رویدادهای مرتبط',{exact:true})).toBeVisible({timeout:120000}))
   await page.getByText('مطالب و رویدادهای مرتبط',{exact:true}).click()
   await expect(page.getByRole('link',{name:'راهنمای آزمایشی بازی و کالا',exact:true})).toBeVisible({timeout:60000})
   await capture('connections','details[open]')
   }
   await context.close()
  }
  const limited=await browser.newContext({baseURL,ignoreHTTPSErrors:true});await limited.addCookies(fixture.handlerCookies)
  const page=await limited.newPage();await page.goto('/admin',{waitUntil:'domcontentloaded',timeout:120000});await expect(page.getByRole('heading',{name:'کارهای امروز',exact:true})).toBeVisible({timeout:60000})
  const desk=await (await limited.request.get('/api/admin/workdesk')).json();assert(desk.queues.find(q=>q.key==='forms').available);assert.equal(desk.queues.find(q=>q.key==='store').reason,'forbidden')
  await limited.close()
  const member=await browser.newContext({baseURL,ignoreHTTPSErrors:true});await member.addCookies(fixture.buyerCookies)
  assert.equal((await member.request.get('/api/admin/workdesk')).status(),403);assert.equal((await member.request.get('/api/admin/performance')).status(),403)
  await member.close()
  const guest=await browser.newContext({baseURL,ignoreHTTPSErrors:true});assert.equal((await guest.request.get('/api/admin/workdesk')).status(),403);await guest.close()
  assert.deepEqual(errors,[])
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({views,errors,scopedAxe:views.length,actualRoleDenials:true},null,2))
  console.log(`Platform browser passed ${views.length} actual views; scoped axe0, no overflow/errors; limited staff and member/guest denials`)
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
