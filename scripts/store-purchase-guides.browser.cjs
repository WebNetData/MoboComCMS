const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium,expect:baseExpect}=require('@playwright/test')
const expect=baseExpect.configure({timeout:60000}),fixturePath=process.env.STORE_GUIDES_FIXTURE_PATH,output=process.env.STORE_GUIDES_OUTPUT
if(!fixturePath||!output)throw Error('Explicit private fixture and evidence directory required')
const fixture=JSON.parse(fs.readFileSync(fixturePath,'utf8')),baseURL=fixture.baseURL
if(process.env.MOBOCOM_ISOLATED_FIXTURE!=='1'||new URL(baseURL).hostname!=='localhost'||new URL(baseURL).port!=='3119')throw Error('Isolated loopback preview required')
const views=[],errors=[]
const resume=process.env.STORE_GUIDES_RESUME==='1'
let actualAdminSave=false
async function main(){
 fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true})
 try{
  for(const [width,theme]of [[1440,'light'],[1440,'dark'],[390,'dark']]){
   const context=await browser.newContext({baseURL,ignoreHTTPSErrors:true,viewport:{width,height:1000},reducedMotion:'reduce'})
   await context.addCookies([...fixture.staffCookies,{name:'theme',value:theme,url:baseURL}]);await context.route('**/*',route=>new URL(route.request().url()).origin===baseURL?route.continue():route.abort())
   const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message))
   const visit=async url=>{console.log('Visiting '+url);const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});assert.equal(response.status(),200,url)}
   const capture=async(name,selector)=>{
    await page.evaluate(()=>document.fonts.ready);await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')})
    const violations=await page.locator(selector).evaluate(async root=>(await window.axe.run(root,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})))
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);views.push({name,width,theme,violations,overflow})
    fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify({views,errors},null,2));await page.screenshot({path:path.join(output,`${name}-${theme}-${width}.png`),fullPage:true,caret:'initial',animations:'disabled'})
    assert.deepEqual(violations,[],name+' axe');assert.equal(overflow,false,name+' overflow');console.log(name+' '+theme+' '+width+' passed')
   }
   if(theme==='light'){
    const persisted=await (await context.request.get('/api/admin/store/settings')).json()
    if(resume){assert.deepEqual(persisted.settings.purchaseGuidePageIds,fixture.pages.map(item=>item.id));const prior=JSON.parse(fs.readFileSync(path.join(output,'progress.json'),'utf8'));assert(prior.views.some(view=>view.name==='admin-guides'&&view.theme==='light'&&!view.violations.length));actualAdminSave=true}
    else{assert.deepEqual(persisted.settings.purchaseGuidePageIds,[]);await visit(fixture.productPath);await expect(page.locator('.sx-buy')).toBeVisible();await expect(page.getByRole('navigation',{name:'راهنمای خرید',exact:true})).toHaveCount(0)
    await page.screenshot({path:path.join(output,'product-before-configuration.png'),fullPage:true,caret:'initial',animations:'disabled'})}
   }
   await visit('/admin/store/settings');const chooser=page.getByLabel('افزودن صفحه به راهنمای خرید',{exact:true});await expect(chooser).toBeVisible();console.log('Guide selector ready')
   assert(!(await chooser.textContent()).includes('PRIVATE_GUIDE'))
   if(theme==='light'&&!resume){
    for(const item of fixture.pages)await chooser.selectOption(String(item.id))
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/admin/store/settings'&&r.request().method()==='POST')
    await page.getByRole('button',{name:'ذخیره',exact:true}).click();const saved=await response;assert.equal(saved.status(),200,JSON.stringify(await saved.json()))
    await expect(page.getByText('تنظیمات ویترین ذخیره شد',{exact:true})).toBeVisible()
    actualAdminSave=true
   }
   await expect(page.getByLabel('صفحهٔ راهنمای خرید 1',{exact:true})).toHaveValue(String(fixture.pages[0].id));await capture('admin-guides','.sa-stack > section:first-child')
   await visit(fixture.productPath);const guides=page.getByRole('navigation',{name:'راهنمای خرید',exact:true});await expect(guides).toBeVisible();await expect(guides.getByRole('link')).toHaveCount(fixture.pages.length)
   assert(!(await guides.innerText()).includes('PRIVATE_GUIDE'));await capture('product','.sx-buy')
   await guides.getByRole('link',{name:fixture.pages[0].title,exact:true}).focus();await expect(guides.getByRole('link',{name:fixture.pages[0].title,exact:true})).toBeFocused()
   await Promise.all([page.waitForURL('**'+fixture.pages[0].path),guides.getByRole('link',{name:fixture.pages[0].title,exact:true}).press('Enter')])
   await expect(page.getByRole('heading',{name:fixture.pages[0].title,exact:true})).toBeVisible();await capture('legal','main')
   const contact=fixture.pages.find(item=>item.key==='contact')
   const footer=page.getByTestId('site-footer');await expect(footer.getByRole('link',{name:contact.title,exact:true})).toBeVisible()
   await Promise.all([page.waitForURL('**'+contact.path),footer.getByRole('link',{name:contact.title,exact:true}).click()])
   await expect(page.getByRole('heading',{name:contact.title,exact:true})).toBeVisible();await expect(page.getByRole('link',{name:/02100000000/}).first()).toHaveAttribute('href','tel:02100000000')
   await expect(page.locator('main')).toContainText('ساعات آزمایشی');await capture('contact','main')
   const publicLinks=await page.getByTestId('site-footer').getByRole('link').evaluateAll(links=>links.map(link=>link.getAttribute('href')).filter(Boolean))
   for(const item of fixture.pages)assert(publicLinks.includes(item.path),'footer includes '+item.path)
   await context.close()
  }
  const guest=await browser.newContext({baseURL,ignoreHTTPSErrors:true});assert.equal((await guest.request.get('/api/admin/store/settings')).status(),403);await guest.close()
  assert(actualAdminSave);assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({views,errors,actualAdminSave,resumed:resume,publicKeyboardNavigation:true,publicFooterGuides:true,guestDenial:true},null,2))
  console.log('Purchase guides browser passed: '+views.length+' actual themed/responsive views, persisted selection, real guide/footer/contact navigation, scoped axe0')
 }catch(error){for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:path.join(output,'failure.png'),fullPage:true,caret:'initial'}).catch(()=>{});fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({message:error.message},null,2));throw error}finally{await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
