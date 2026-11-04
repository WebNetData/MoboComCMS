// Local real-session/HTTP browser acceptance. The Telegram bridge is an explicit SDK double;
// no provider token, bot mutation, external Telegram authentication or payment is simulated as success.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright')
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'.mobocom/miniapp-platform'),base='http://localhost:3000'
const fixture=JSON.parse(fs.readFileSync(path.join(out,'fixture.json'),'utf8'))
assert.ok(fixture.email.startsWith('miniapp-browser-'),'owned fixture required')
const bridge=`window.__tgCalls=[];window.Telegram={WebApp:{version:'8.0',initData:'',ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},setBottomBarColor(){},onEvent(){},offEvent(){},HapticFeedback:{selectionChanged(){window.__tgCalls.push('haptic')}},BackButton:{show(){window.__tgCalls.push('show')},hide(){window.__tgCalls.push('hide')},onClick(fn){window.__tgBack=fn},offClick(){window.__tgBack=null}}}};`
const errors=[],results=[]
async function main(){
 const browser=await chromium.launch({channel:'msedge',headless:true})
 const axe=fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8')
 try{
  for(const theme of ['light','dark'])for(const width of [1440,390]){
   const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'})
   await context.addCookies([{name:'next-auth.session-token',value:fixture.token,url:base},{name:'theme',value:theme,url:base}])
   await context.route('https://telegram.org/js/telegram-web-app.js',route=>route.fulfill({contentType:'text/javascript',body:bridge}))
   const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message))
   for(const route of ['','/explore','/library','/account',...(width===390&&theme==='dark'?['/orders','/orders/'+fixture.orderId,'/wallet','/support','/notifications','/payments','/purchases']:[])]){
    const response=await page.goto(base+'/miniapp'+route,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200,route)
    await page.locator('.tg-nav').waitFor();await page.waitForFunction(()=>document.querySelectorAll('.tg-skeleton').length===0,{},{timeout:30000})
    if(route===''||route==='/explore')await page.locator('.tg-services').waitFor()
    if(route==='/library'||route==='/account')await page.locator('.tg-account-profile').waitFor()
    assert.equal(await page.locator('.tg-nav [aria-current="page"]').count(),1,'one active tab')
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow')
    await page.evaluate(axe)
    const violations=await page.evaluate(async()=> (await window.axe.run(document.querySelector('.tg-app'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})))
    assert.deepEqual(violations,[],route+' '+theme+' '+width)
    await page.screenshot({path:path.join(out,(route.replaceAll('/','-')||'home')+'-'+theme+'-'+width+'.png'),fullPage:true,caret:'initial'})
    results.push({route:'/miniapp'+route,theme,width,axe:violations.length})
    if(route==='/explore'){
     const finder=page.getByRole('searchbox');await finder.fill('هیچ‌بخشی‌بااین‌نام‌نیست');await page.getByRole('heading',{name:'بخشی پیدا نشد'}).waitFor();await finder.fill('')
     await page.locator('.tg-services a').first().waitFor()
    }
   }
   await page.goto(base+'/miniapp/account');await page.locator('.tg-account-profile').waitFor()
   await page.evaluate(()=>window.__tgBack?.());await page.waitForURL(base+'/miniapp')
   assert.ok((await page.evaluate(()=>window.__tgCalls)).includes('show'),'Telegram Back bridge used')
   const identity=await context.request.get(base+'/api/me');assert.equal(identity.status(),200);assert.equal((await identity.json()).email,fixture.email)
   // Recovery uses a controlled first failure, then the real PostgreSQL-backed read.
   let recovering=false;await context.route('**/api/public/miniapp-feed',route=>recovering?route.continue():route.fulfill({status:503,json:{error:'owned test outage'}}))
   await page.goto(base+'/miniapp/explore');await page.getByRole('heading',{name:'ارتباط برقرار نشد'}).waitFor();recovering=true;await page.getByRole('button',{name:'تلاش دوباره',exact:true}).click();await page.locator('.tg-services').waitFor()
   await context.close()
  }
  const guest=await browser.newContext({viewport:{width:390,height:844}})
  await guest.route('https://telegram.org/js/telegram-web-app.js',route=>route.abort())
  const page=await guest.newPage();await page.goto(base+'/miniapp');await page.getByRole('link',{name:'ورود',exact:true}).waitFor({timeout:20000});assert.equal(await page.locator('.tg-nav').count(),0)
  assert.equal((await guest.request.get(base+'/api/my/overview')).status(),401)
  await guest.close()
  const forged=await browser.newContext({viewport:{width:390,height:844}})
  await forged.addCookies([{name:'next-auth.session-token',value:fixture.token,url:base}])
  await forged.route('https://telegram.org/js/telegram-web-app.js',route=>route.fulfill({contentType:'text/javascript',body:bridge+`window.Telegram.WebApp.initData='forged';window.Telegram.WebApp.initDataUnsafe={user:{id:1,first_name:'Admin'}};`}))
  const forgedPage=await forged.newPage();await forgedPage.goto(base+'/miniapp/account');await forgedPage.getByRole('button',{name:'تلاش دوباره',exact:true}).waitFor({timeout:30000});assert.equal(await forgedPage.locator('.tg-account-profile').count(),0);assert.equal(await forgedPage.locator('.tg-nav').count(),0);await forged.close()
  assert.deepEqual(errors,[],'no page errors')
  fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({results,pageErrors:errors,checks:['real session identity','one active tab','finder empty/reset','real read retry','Telegram back SDK double','blocked SDK guest fallback','forged initData denial']},null,2))
  console.log('Mini App browser: '+results.length+' themed routes/captures and scoped axe checks; real account, finder/retry/back, blocked SDK fallback and forged initData denial passed; no page errors/overflow.')
 }finally{await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
