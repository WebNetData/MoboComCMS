// Local real Admin writes and public routing/SEO. Requires an owned private fixture;
// the requested root-page/artist patterns intentionally remain enabled after success.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright')
const out=path.resolve(__dirname,'../.mobocom/permalink-management'),f=JSON.parse(fs.readFileSync(path.join(out,'fixture.json'),'utf8')),base='http://localhost:3000'
assert.ok(f.stamp.startsWith('permalink-browser-'))
async function main(){const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[],results=[];try{
 for(const theme of ['light','dark'])for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});await context.addCookies([{name:'next-auth.session-token',value:f.token,url:base},{name:'theme',value:theme,url:base}])
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
  assert.equal((await page.goto(base+'/admin/permalinks')).status(),200)
  await page.getByLabel('الگوی آدرس',{exact:true}).first().waitFor()
  await page.getByRole('button',{name:'صفحهٔ مستقیم و نام خواننده',exact:false}).focus();await page.keyboard.press('Enter')
  await page.locator('#permalink-page').fill('/{slug}')
  assert.ok((await page.locator('#permalink-track-preview').innerText()).includes('/music/komeil-nasri/track/banoo-jan'))
  await page.locator('#permalink-post').fill('/journal/{slug}');assert.ok((await page.locator('#permalink-post-preview').innerText()).includes('/journal/welcome'))
  // Keep the Magazine's existing owner choice. Its alternative URL save is covered by the native PostgreSQL suite.
  const state=await (await context.request.get(base+'/api/admin/site/routes')).json();await page.locator('#permalink-post').fill(state.permalinks.templates.post)
  const save=page.getByRole('button',{name:'ذخیرهٔ ساختار لینک‌ها',exact:true})
  if(await save.isEnabled()){const pending=page.waitForResponse(r=>r.url().endsWith('/api/admin/site/routes')&&r.request().method()==='PUT');await save.click();assert.equal((await pending).status(),200);await page.getByRole('status').filter({hasText:'پیوندهای یکتا ذخیره شدند'}).waitFor()}
  const axe=fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');await page.evaluate(axe)
  const violations=await page.evaluate(async()=> (await window.axe.run(document.querySelector('.admin-shell .app-main')||document.querySelector('main'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})))
  assert.deepEqual(violations,[],theme+' '+width)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no Admin overflow')
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,'admin-'+theme+'-'+width+'.png'),fullPage:true,caret:'initial'})
  const expectedPage='/'+encodeURIComponent(f.pageSlug),expectedTrack='/music/'+encodeURIComponent(f.artistSlug)+'/track/'+encodeURIComponent(f.trackSlug),expectedAlbum='/music/'+encodeURIComponent(f.artistSlug)+'/album/'+encodeURIComponent(f.albumSlug)
  // Separate Proxy/render caches converge within the existing five-second TTL.
  for(let i=0;i<20;i++){const probe=await context.request.get(base+'/p/'+f.pageSlug+'?campaign=1',{maxRedirects:0});if(probe.status()===308)break;if(i===19)throw Error('Routing did not refresh');await new Promise(r=>setTimeout(r,400))}
  for(const [old,target]of [['/p/'+f.pageSlug,expectedPage],['/music/track/'+f.trackSlug,expectedTrack],['/music/wrong-singer/track/'+f.trackSlug,expectedTrack],['/music/album/'+f.albumSlug,expectedAlbum]]){
   const response=await context.request.get(base+old+'?campaign=1',{maxRedirects:0});assert.equal(response.status(),308,old);const location=new URL(response.headers().location,base);assert.equal(location.pathname,target);assert.equal(location.search,'?campaign=1')
  }
  for(const [target,title,scope]of [[expectedPage,'صفحهٔ آزمون پیوند','page'],[expectedTrack,'آهنگ آزمون پیوند','track'],[expectedAlbum,'آلبوم آزمون','album'],['/blog/'+encodeURIComponent(f.postSlug),'مقالهٔ آزمون آدرس','post']]){
   const response=await page.goto(base+target);assert.equal(response.status(),200,target);await page.getByRole('heading',{level:1,name:title,exact:false}).waitFor()
   const canonical=await page.locator('link[rel="canonical"]').getAttribute('href');assert.equal(new URL(canonical,base).pathname,target,target+' canonical')
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no public overflow')
   if(scope==='album')assert.ok(await page.locator('a[href="'+expectedTrack+'"]').count()>0,'real track list uses canonical artist URL')
   await page.screenshot({path:path.join(out,scope+'-'+theme+'-'+width+'.png'),fullPage:true,caret:'initial'})
  }
  const head=await context.request.head(base+'/p/'+f.pageSlug,{maxRedirects:0});assert.equal(head.status(),308)
  const xml=await (await context.request.get(base+'/sitemap.xml')).text();assert.ok(xml.includes(expectedPage));assert.ok(xml.includes(expectedTrack));assert.ok(xml.includes(expectedAlbum));assert.ok(!xml.includes('/music/track/'+encodeURIComponent(f.trackSlug)));assert.ok(!xml.includes('/music/album/'+encodeURIComponent(f.albumSlug)));assert.ok(!xml.includes('/p/'+encodeURIComponent(f.pageSlug)))
  const refusal=await context.request.put(base+'/api/admin/site/routes',{headers:{Origin:'https://foreign.invalid'},data:{templates:{page:'/foreign/{slug}'}}});assert.equal(refusal.status(),403)
  results.push({theme,width,axe:0,publicRoutes:4});await context.close()
 }
 assert.deepEqual(errors,[])
 fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({results,pageErrors:errors},null,2));console.log('Permalink browser: real Admin preset/save, Magazine draft preview, 20 themed captures, axe0, query-preserving308/HEAD, canonical metadata, real album links, sitemap and foreign-Origin refusal passed.')
}finally{await browser.close()}}
main().catch(error=>{console.error(error);process.exitCode=1})
