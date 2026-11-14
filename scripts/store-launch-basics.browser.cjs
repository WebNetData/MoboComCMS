// Focused launch corrections against an isolated local app and synthetic staff session.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium,expect:baseExpect}=require('@playwright/test')
const expect=baseExpect.configure({timeout:60000})
const fixturePath=process.env.STORE_LAUNCH_FIXTURE_PATH,output=process.env.STORE_LAUNCH_OUTPUT
if(!fixturePath||!output)throw Error('Explicit private fixture and evidence directory required')
const fixture=JSON.parse(fs.readFileSync(fixturePath,'utf8')),baseURL=fixture.baseURL
if(process.env.MOBOCOM_ISOLATED_FIXTURE!=='1'||new URL(baseURL).hostname!=='localhost'||new URL(baseURL).port!=='3118')throw Error('Task-local isolated preview required')
const progress=path.join(output,'progress.json')
const previous=process.env.STORE_LAUNCH_RESUME==='1'&&fs.existsSync(progress)?JSON.parse(fs.readFileSync(progress,'utf8')):null
const views=[],errors=[],operations=previous?.operations||[]
const digits=s=>s.replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/٬/g,',')
async function main(){
 fs.mkdirSync(output,{recursive:true})
 const browser=await chromium.launch({headless:true})
 try{
 for(const [width,theme]of [[1440,'light'],[1440,'dark'],[390,'dark']]){
  const context=await browser.newContext({baseURL,ignoreHTTPSErrors:true,viewport:{width,height:1000},reducedMotion:'reduce'})
  await context.addCookies([...fixture.staffCookies,{name:'theme',value:theme,url:baseURL}])
  await context.route('**/*',route=>new URL(route.request().url()).origin===baseURL?route.continue():route.abort())
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message))
  const visit=async url=>{const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});assert.equal(response.status(),200,url)}
  const capture=async(name,selector='main')=>{
   await page.evaluate(()=>document.fonts.ready)
   await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')})
   const violations=await page.locator(selector).evaluate(async root=>(await window.axe.run(root,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})))
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)
   views.push({name,width,theme,violations,overflow});fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify({views,errors,operations},null,2))
   await page.screenshot({path:path.join(output,`${name}-${theme}-${width}.png`),fullPage:true,caret:'initial',animations:'disabled'})
   assert.deepEqual(violations,[],name+' axe');assert.equal(overflow,false,name+' overflow')
   console.log(name+' '+theme+' '+width+' passed')
  }
  if(theme==='light'&&!operations.some(row=>row.startsWith('gateway '))){
   let fail=true
   await page.route('**/api/admin/gateways',route=>route.request().method()==='GET'&&fail?route.fulfill({status:503,json:{error:'خطای آزمایشی دریافت درگاه'}}):route.continue())
   await visit('/admin/gateways');await expect(page.locator('main').getByRole('alert')).toContainText('خطای آزمایشی');console.log('gateway read failure shown')
   await expect(page.getByText('هنوز درگاهی ثبت نشده است',{exact:false})).toHaveCount(0)
   fail=false;await page.getByRole('button',{name:'تلاش دوباره',exact:true}).click()
   await expect(page.locator('main fieldset')).toBeEnabled();console.log('gateway retry recovered')
   await page.locator('main button.btn-primary').first().click()
   const form=page.locator('main form'),name=form.locator('input').first()
   await name.fill('درگاه دستی آزمایشی');await form.locator('select').first().selectOption('MANUAL')
   await form.locator('textarea').fill('Synthetic instructions only')
   let release,entered
   const captured=new Promise(resolve=>entered=resolve),held=new Promise(resolve=>release=resolve)
   await page.route('**/api/admin/gateways',async route=>{if(route.request().method()!=='POST')return route.fallback();entered();await held;return route.fulfill({status:503,json:{error:'ذخیرهٔ آزمایشی ناموفق'}})})
   await form.locator('button[type=submit]').click();console.log('gateway submit clicked')
   await Promise.race([captured,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('gateway POST not started')),15000);timer.unref()})]).catch(async error=>{await page.screenshot({path:path.join(output,'gateway-submit-failure.png'),fullPage:true,caret:'initial'});throw error})
   await expect(form.locator('button[type=submit]')).toBeDisabled();await expect(name).toBeDisabled();release()
   await expect(page.locator('main').getByRole('status')).toContainText('ذخیرهٔ آزمایشی ناموفق')
   await expect(name).toHaveValue('درگاه دستی آزمایشی');await expect(form.locator('button[type=submit]')).toBeEnabled()
   await page.unroute('**/api/admin/gateways')
   const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/admin/gateways'&&r.request().method()==='POST')
   await form.locator('button[type=submit]').click();assert.equal((await saved).status(),200)
   await expect(page.getByRole('heading',{name:/درگاه دستی آزمایشی/})).toBeVisible()
   const rows=await (await context.request.get('/api/admin/gateways')).json();assert.equal(rows.gateways.filter(row=>row.name==='درگاه دستی آزمایشی').length,1)
   operations.push('gateway failed read/retry, pending lock, failed save retains draft, real save exactly once')
  }else{await visit('/admin/gateways');await expect(page.getByRole('heading',{name:/درگاه دستی آزمایشی/})).toBeVisible({timeout:60000})}
  await capture('gateways')
  if(theme==='light'&&!operations.some(row=>row.startsWith('shipping '))){
   let fail=true
   await page.route('**/api/admin/shipping/carriers',route=>route.request().method()==='GET'&&fail?route.fulfill({status:503,json:{error:'خطای آزمایشی ارسال'}}):route.continue())
   await visit('/admin/shipping-carriers');await expect(page.getByText('خطای آزمایشی ارسال',{exact:false})).toBeVisible()
   fail=false;await page.getByRole('button',{name:'تلاش دوباره',exact:true}).click()
   const city=page.getByLabel('شهر مبدأ',{exact:true}),weight=page.getByLabel('وزن بسته‌بندی (گرم)',{exact:true})
   await expect(city).toBeVisible();await city.fill('شهر آزمایشی');await weight.fill('۲۵۰');await expect(weight).toHaveValue('250')
   await page.route('**/api/admin/shipping/carriers',route=>route.request().method()==='PUT'?route.fulfill({status:503,json:{error:'خطای آزمایشی ذخیرهٔ ارسال'}}):route.fallback())
   await page.getByRole('button',{name:'ذخیره',exact:true}).click();await expect(page.getByText('خطای آزمایشی ذخیرهٔ ارسال')).toBeVisible();await expect(city).toHaveValue('شهر آزمایشی')
   await page.unroute('**/api/admin/shipping/carriers')
   const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/admin/shipping/carriers'&&r.request().method()==='PUT')
   await page.getByRole('button',{name:'ذخیره',exact:true}).click();assert.equal((await saved).status(),200)
   const stored=await (await context.request.get('/api/admin/shipping/carriers')).json();assert.equal(stored.settings.originCity,'شهر آزمایشی');assert.equal(stored.settings.packagingGrams,250)
   operations.push('shipping read/retry, Persian digits, failed save retains draft, persisted settings')
  }else{await visit('/admin/shipping-carriers');await expect(page.getByLabel('شهر مبدأ',{exact:true})).toHaveValue('شهر آزمایشی',{timeout:60000})}
  await capture('shipping','.sa')
  if(theme==='light'&&!operations.some(row=>row.startsWith('register '))){
   let fail=true
   await page.route('**/api/admin/store/counter?registerLocations=1',route=>fail?route.fulfill({status:503,json:{error:'خطای آزمایشی محل موجودی'}}):route.continue())
   await visit('/admin/store/registers');const open=page.getByRole('button',{name:'بازکردن صندوق برای من',exact:true})
   await expect(page.getByText('محل‌های موجودی دریافت نشدند.',{exact:false})).toBeVisible();await expect(open).toBeDisabled()
   fail=false;await page.getByRole('button',{name:'تلاش دوباره',exact:true}).click();await expect(open).toBeEnabled()
   await page.getByLabel('نام صندوق',{exact:true}).fill('صندوق آزمایشی افتتاح')
   const opened=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/admin/store/counter'&&r.request().method()==='POST')
   await open.click();const response=await opened;assert.equal(response.status(),200);const body=await response.json();assert(body.session.locationId,'register has inventory location')
   await expect(page.getByRole('heading',{name:'صندوق آزمایشی افتتاح',exact:true})).toBeVisible()
   operations.push('register locations read failure blocks opening; retry and real opening with default location')
  }else{await visit('/admin/store/registers');await expect(page.getByRole('heading',{name:'صندوق آزمایشی افتتاح',exact:true})).toBeVisible({timeout:60000})}
  await capture('registers','.sa')
  await visit('/admin/store/products?q='+fixture.productId)
  const row=page.locator('tr').filter({hasText:'کالای تنوع‌دار آزمایشی'})
  await expect(row).toHaveCount(1,{timeout:60000});await expect(row.locator('[data-label="قیمت"]')).toContainText('قیمت گونه‌ها از')
  assert(digits(await row.locator('[data-label="قیمت"]').innerText()).includes('100,000'))
  assert(digits(await row.locator('[data-label="موجودی"]').innerText()).includes('3'))
  await capture('products','.sa')
  await context.close()
 }
 assert.deepEqual(errors,[])
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({views,errors,operations},null,2))
 console.log('Launch browser passed: '+views.length+' views, recovery/persisted operations, scoped axe0 and no overflow')
 }finally{await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
