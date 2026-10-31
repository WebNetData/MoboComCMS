import fs from 'node:fs'
import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'

test.skip(!process.env.E2E_EDITOR_MEDIA_FIXTURE, 'explicit owned local fixture required')
async function axe(page: Page, selector: string) {
  if (!process.env.E2E_AXE_PATH) return
  await page.evaluate(source => { const script=document.createElement('script');script.nonce=document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce||'';script.textContent=source;document.head.append(script) },fs.readFileSync(process.env.E2E_AXE_PATH,'utf8'))
  const violations=await page.evaluate(async selector=>(await (window as any).axe.run(document.querySelector(selector),{iframes:false,runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations,selector)
  expect(violations.map((v:any)=>({id:v.id,nodes:v.nodes.map((n:any)=>({target:n.target,summary:n.failureSummary}))}))).toEqual([])
}

test('Classic inserts Library audio/video and four hosted players; real local playback, settings and form coexist on the saved public Page',async({browser,baseURL},info)=>{
 test.setTimeout(360_000);expect(new URL(baseURL!).hostname).toBe('localhost')
 const f=JSON.parse(fs.readFileSync(process.env.E2E_EDITOR_MEDIA_FIXTURE!,'utf8')),context=await browser.newContext({baseURL,viewport:{width:1440,height:1100},reducedMotion:'reduce'})
 context.setDefaultTimeout(20_000);await context.addCookies([{name:'next-auth.session-token',value:f.tokens.manager,url:baseURL!}])
 const page=await context.newPage(),publicContext=await browser.newContext({baseURL,reducedMotion:'reduce'}),view=await publicContext.newPage(),errors:string[]=[]
 // A visitor's ordinary dismissal preference keeps the unrelated translation invitation out of player captures.
 await publicContext.addCookies([{name:'mc-translate-dismissed',value:'1',url:baseURL!}])
 page.on('pageerror',e=>errors.push(e.message));view.on('pageerror',e=>errors.push(e.message))
 const files:Record<string,{url:string;name:string}>={},run=f.stamp+'-'+Date.now()
 try{
  for(const filename of ['voice.mp3','clip.mp4']){
   const bytes=fs.readFileSync(path.join(process.env.E2E_EDITOR_MEDIA_FILES!,filename)),name=run+'-'+filename
   let response=await context.request.post('/api/admin/uploads',{headers:{Origin:baseURL!},data:{op:'start',name,size:bytes.length,section:'pages'}});expect(response.status()).toBe(200);const upload=await response.json()
   response=await context.request.put('/api/admin/uploads?id='+upload.id+'&offset=0',{headers:{Origin:baseURL!,'Content-Type':'application/octet-stream'},data:bytes});expect(response.status()).toBe(200)
   response=await context.request.post('/api/admin/uploads',{headers:{Origin:baseURL!},data:{op:'finish',id:upload.id}});expect(response.status()).toBe(200);files[filename]={...(await response.json()),name}
  }
  expect((await context.request.patch('/api/admin/cms?type=pages',{headers:{Origin:baseURL!},data:{id:f.page,status:'DRAFT',content:'<p>آغاز نوشته</p>'}})).status()).toBe(200)
  await page.goto('/admin/pages?edit='+f.page)
  const old=page.getByRole('button',{name:'ادامه با ویرایشگر قدیمی',exact:true});if(await old.count())await old.click()
  const classic=page.locator('.ce');await expect(classic).toBeVisible();await expect(classic.locator('.tox-edit-area iframe')).toBeVisible()
  const body=classic.locator('textarea')
  await classic.getByRole('button',{name:'درج موسیقی و پادکست',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'درج موسیقی و پادکست',exact:true})
  await dialog.getByLabel('لینک فایل صوتی',{exact:true}).fill('javascript:alert(1)');await expect(dialog.getByRole('button',{name:'درج در نوشته'})).toBeDisabled()
  await dialog.getByRole('button',{name:/انتخاب از کتابخانه/}).first().click()
  const library=page.getByRole('dialog',{name:'کتابخانهٔ رسانه',exact:true})
  await library.getByRole('searchbox',{name:/جست/}).fill(run)
  await library.getByRole('checkbox',{name:new RegExp(run+'-voice.mp3')}).check()
  await library.getByRole('button',{name:/استفاده از این فایل/}).click()
  await expect(dialog.getByLabel('لینک فایل صوتی',{exact:true})).toHaveValue(files['voice.mp3'].url)
  await dialog.getByLabel('عنوان رسانه',{exact:true}).fill('پادکست آزمایشی "من"')
  await dialog.getByLabel('نوع فایل صوتی',{exact:true}).selectOption('podcast')
  await dialog.getByLabel('توضیح زیر رسانه (اختیاری)',{exact:true}).fill('از همان کتابخانه، بدون بارگذاری تکراری')
  for(const theme of ['light','dark'])for(const width of [1440,390]){
   await page.setViewportSize({width,height:1100});await page.evaluate(theme=>{document.documentElement.dataset.theme=theme},theme)
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await axe(page,'.ce-media-dialog');await dialog.screenshot({path:info.outputPath(`insert-${theme}-${width}.png`)})
  }
  await dialog.getByRole('button',{name:'درج در نوشته',exact:true}).click();await expect(dialog).toHaveCount(0)
  await expect(classic.frameLocator('.tox-edit-area iframe').locator('audio')).toHaveCount(1)
  await classic.getByRole('tab',{name:'متن',exact:true}).click();await expect(body).toHaveValue(/data-mc-media="audio"/)
  await page.setViewportSize({width:1440,height:1100});await classic.getByRole('button',{name:'درج ویدیو',exact:true}).click()
  const videoDialog=page.getByRole('dialog',{name:'درج ویدیو',exact:true})
  await videoDialog.getByRole('button',{name:/انتخاب از کتابخانه/}).first().click()
  await library.getByRole('searchbox',{name:/جست/}).fill(run);await library.getByRole('checkbox',{name:new RegExp(run+'-clip.mp4')}).check();await library.getByRole('button',{name:/استفاده از این فایل/}).click()
  await videoDialog.getByLabel('عنوان رسانه',{exact:true}).fill('ویدیوی کتابخانه')
  await videoDialog.getByRole('button',{name:'درج در نوشته',exact:true}).click()
  const providers=[['آپارات','https://www.aparat.com/v/abc123'],['یوتیوب','https://youtu.be/dQw4w9WgXcQ'],['نماشا','https://www.namasha.com/v/kDjys59P'],['تماشا','https://tamasha.com/v/xZlNe']]
  for(const [title,url]of providers){await classic.getByRole('button',{name:'درج ویدیو',exact:true}).click();await videoDialog.getByLabel('لینک ویدیو',{exact:true}).fill(url);await videoDialog.getByLabel('عنوان رسانه',{exact:true}).fill(title);await videoDialog.getByRole('button',{name:'درج در نوشته',exact:true}).click()}
  await body.fill(await body.inputValue()+`<p>[audio src="${files['voice.mp3'].url}" title="صدای دوم" kind="voice"]</p><p>[video src="${files['clip.mp4'].url}" title="ویدیوی دوم"]</p><p>[form slug="${f.formSlug}"]</p>`)
  await page.getByLabel('وضعیت',{exact:true}).selectOption('PUBLISHED');await page.getByRole('button',{name:'بازبینی و انتشار',exact:true}).click()
  const saving=page.waitForResponse(r=>r.url().includes('/api/admin/cms?type=pages')&&r.request().method()==='PATCH');await page.getByRole('button',{name:'تأیید و انتشار',exact:true}).click();expect((await saving).status()).toBe(200)
  await page.goto('/admin/pages?edit='+f.page);if(await old.count())await old.click();await page.locator('.ce').getByRole('tab',{name:'متن',exact:true}).click();await expect(page.locator('.ce textarea')).toHaveValue(/data-mc-media="audio"/)
  // Provider documents below are deterministic stand-ins, proving our allowlist/CSP/activation only, not live provider playback.
  let frames=0;await view.route(/^https:\/\/(?:www\.youtube-nocookie\.com|www\.aparat\.com|www\.namasha\.com|tamasha\.com)\//,route=>{frames++;return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Provider fixture</title><p>Controlled provider boundary</p>'})})
  expect((await view.goto('/p/'+f.slug))?.status()).toBe(200)
  const decline=view.getByRole('button',{name:'No thanks',exact:true});if(await decline.count())await decline.click()
  await expect(view.locator('.mc-audio')).toHaveCount(2);await expect(view.locator('.mc-video')).toHaveCount(6);await expect(view.getByText('فرم همراه رسانه',{exact:true})).toBeVisible()
  const audio=view.locator('.mc-audio').first();await expect(audio.getByText('پادکست آزمایشی "من"',{exact:true})).toBeVisible()
  await expect.poll(()=>audio.locator('audio').evaluate((e:HTMLAudioElement)=>e.duration)).toBeGreaterThan(30)
  await audio.getByRole('button',{name:'پخش فایل صوتی',exact:true}).click();await expect.poll(()=>audio.locator('audio').evaluate((e:HTMLAudioElement)=>e.currentTime)).toBeGreaterThan(0)
  await audio.getByRole('button',{name:'۱۵ ثانیه جلو',exact:true}).click();await expect.poll(()=>audio.locator('audio').evaluate((e:HTMLAudioElement)=>e.currentTime)).toBeGreaterThan(15)
  await audio.getByLabel('سرعت',{exact:true}).selectOption('1.5');expect(await audio.locator('audio').evaluate((e:HTMLAudioElement)=>e.playbackRate)).toBe(1.5)
  const failing='**'+files['voice.mp3'].url
  await view.route(failing,route=>route.abort());await audio.locator('audio').evaluate((e:HTMLAudioElement)=>e.load());await expect(audio.getByRole('alert')).toBeVisible()
  await view.unroute(failing);await audio.getByRole('button',{name:'تلاش دوباره',exact:true}).click();await expect(audio.getByRole('alert')).toHaveCount(0);await expect.poll(()=>audio.locator('audio').evaluate((e:HTMLAudioElement)=>e.currentTime)).toBeGreaterThan(0)
  await view.locator('.mc-audio').nth(1).getByRole('button',{name:'پخش فایل صوتی',exact:true}).click();await expect.poll(()=>audio.locator('audio').evaluate((e:HTMLAudioElement)=>e.paused)).toBe(true)
  const video=view.locator('.mc-video .vp').first();await view.locator('body').click({position:{x:5,y:5}});await view.keyboard.press('Space');expect(await video.locator('video').evaluate((e:HTMLVideoElement)=>e.paused)).toBe(true)
  await video.focus();await video.press('Space');await expect.poll(()=>video.locator('video').evaluate((e:HTMLVideoElement)=>e.currentTime)).toBeGreaterThan(0);expect(await view.locator('.mc-video .vp').nth(1).locator('video').evaluate((e:HTMLVideoElement)=>e.paused)).toBe(true)
  expect(frames).toBe(0);for(const [title]of providers){await view.getByRole('button',{name:new RegExp('^'+title+' نمایش ویدیو از')}).click()};await expect.poll(()=>frames).toBe(4)
  for(const theme of ['light','dark'])for(const width of [1440,390]){await publicContext.addCookies([{name:'theme',value:theme,url:baseURL!}]);await view.setViewportSize({width,height:1000});await view.evaluate(theme=>{document.documentElement.dataset.theme=theme},theme);expect(await view.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await axe(view,'.mc-audio');await axe(view,'.mc-video');await audio.screenshot({path:info.outputPath(`audio-${theme}-${width}.png`)});await video.locator('..').screenshot({path:info.outputPath(`video-${theme}-${width}.png`)})}
  const bundle=path.resolve(process.env.E2E_EDITOR_MEDIA_FILES!,'../fallback.js')
  if(fs.existsSync(bundle)){
   const response=await context.request.get('/api/admin/cms?type=pages&q='+f.stamp);expect(response.status()).toBe(200)
   const listing=await response.json(),html=(Array.isArray(listing)?listing:listing.rows).find((r:any)=>r.id===f.page).content
   await view.evaluate(source=>{const script=document.createElement('script');script.nonce=document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce||'';script.textContent=source;document.head.append(script)},fs.readFileSync(bundle,'utf8'))
   const result=await view.evaluate(html=>(window as any).editorMediaRoundTrip(html),html)
   expect(result.nodes).toHaveLength(8);expect(result.output).toBe(result.again);expect(result.output).toContain('data-mc-audio-kind="podcast"');expect(result.output).toContain('data-mc-media="embed"')
   console.log('Actual lightweight Tiptap media adapter: eight media nodes survive two DOM serializations.')
  }
  const released=await audio.locator('audio').elementHandle()
  await audio.getByRole('button',{name:'پخش فایل صوتی',exact:true}).click();await expect.poll(()=>released!.evaluate((e:HTMLAudioElement)=>e.paused)).toBe(false)
  await audio.evaluate(node=>node.closest('figure')?.remove());await expect.poll(()=>released!.evaluate((e:HTMLAudioElement)=>e.paused)).toBe(true)
  await view.goto('/');await view.goto('/p/'+f.slug);await expect(view.locator('.mc-audio')).toHaveCount(2);expect(errors).toEqual([])
 }finally{await publicContext.close();await context.close()}
})
