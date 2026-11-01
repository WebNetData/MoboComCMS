import fs from 'node:fs'
import { test, expect, type Page, type BrowserContext } from '@playwright/test'

test.skip(!process.env.E2E_PROMPT_FIXTURE, 'requires the explicitly owned Prompt Master fixture')
test('Prompt Master studio, private history, templates and Admin controls work across themes and permissions', async ({ browser, baseURL }, info) => {
  test.setTimeout(360_000)
  expect(baseURL).toBe('http://localhost:3230')
  const fixture = JSON.parse(fs.readFileSync(process.env.E2E_PROMPT_FIXTURE!, 'utf8'))
  expect(fixture.db).toBe('mobocom_prompt_master_test_20261101')
  const contexts: BrowserContext[] = [], errors: string[] = []
  async function pageFor(key?: string) {
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1050 }, permissions: ['clipboard-read', 'clipboard-write'], reducedMotion: 'reduce' }); contexts.push(context)
    await context.addCookies([{ name: 'theme', value: 'light', url: baseURL! }])
    const page = await context.newPage(); page.setDefaultTimeout(20_000); page.on('pageerror', error => errors.push(error.message))
    if (key) { await page.goto('/login', { waitUntil: 'domcontentloaded' }); if (!(await page.locator('#login-email').isVisible())) await page.getByRole('button', { name: 'رمز عبور', exact: true }).click(); await page.locator('#login-email').fill(fixture.users[key].email); await page.locator('#login-password').fill(fixture.password); await page.locator('form.auth-form button.btn-primary').first().click(); await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 60_000 }) }
    return page
  }
  async function capture(page: Page, name: string, root = 'main') {
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.evaluate(source => { const script = document.createElement('script'); script.nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce || ''; script.textContent = source; document.head.append(script) }, fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'))
    const violations = await page.evaluate(async selector => (await (window as any).axe.run(document.querySelector(selector), { iframes: false, runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations, root)
    expect(violations).toEqual([])
    await page.locator(root).screenshot({ path: info.outputPath(name + '.png') })
  }
  const guest = await pageFor(), owner = await pageFor('owner')
  let createdId: number | null = null
  const origin = { Origin: baseURL! }
  try {
    await guest.goto('/prompts')
    await expect(guest.getByRole('heading', { name: /ایده‌ات را به یک پرامپت/ })).toBeVisible()
    await expect(guest.getByRole('link', { name: 'کتابخانهٔ الگوها', exact: true })).toBeVisible()
    for (const [kind, label] of [['TEXT','متن و محتوا'],['IMAGE','تصویر و طراحی'],['VIDEO','ویدئو و سینما'],['CODE','کدنویسی و وب']]) {
      await guest.getByRole('radio', { name: label, exact: true }).focus()
      await guest.getByRole('radio', { name: label, exact: true }).press('Space')
      await guest.getByLabel('ایده یا درخواستت را بنویس', { exact: false }).fill('ایدهٔ آزمایشی '+kind+' برای معرفی یک محصول واقعی با جزئیات روشن')
      await guest.getByRole('button', { name: 'ساخت پرامپت', exact: true }).click()
      await expect(guest.getByLabel('متن خروجی پرامپت', { exact: true })).toHaveValue(new RegExp('ایدهٔ آزمایشی '+kind))
    }
    await guest.route('**/api/prompts/generate',route=>route.fulfill({status:429,contentType:'application/json',body:JSON.stringify({error:'محدودیت آزمایشی؛ دوباره تلاش کنید'})}),{times:1})
    await guest.getByRole('button',{name:'ساخت پرامپت',exact:true}).click();await expect(guest.getByRole('alert').filter({hasText:'محدودیت آزمایشی'})).toBeVisible()
    await guest.getByRole('button',{name:'ساخت پرامپت',exact:true}).click();await expect(guest.getByRole('alert').filter({hasText:'محدودیت آزمایشی'})).toHaveCount(0)
    const malicious = '<script>window.__promptUnsafe=true</script> این فقط دادهٔ متن است'
    await guest.getByLabel('ایده یا درخواستت را بنویس', { exact: false }).fill(malicious)
    await guest.getByRole('button', { name: 'ساخت پرامپت', exact: true }).click()
    const output = guest.getByLabel('متن خروجی پرامپت', { exact: true }); await expect(output).toHaveValue(new RegExp('window.__promptUnsafe'))
    expect(await guest.evaluate(() => (window as any).__promptUnsafe)).toBeUndefined()
    await guest.getByRole('button', { name: 'کپی پرامپت', exact: true }).click()
    await expect(guest.getByText('پرامپت کپی شد', { exact: true })).toBeVisible()
    expect((await guest.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g,'\n')).toBe(await output.inputValue())
    const downloadPromise = guest.waitForEvent('download'); await guest.getByRole('button', { name: 'دریافت متن', exact: true }).click(); const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('mobocom-prompt.txt'); expect(fs.readFileSync((await download.path())!, 'utf8')).toBe(await output.inputValue())
    for (const theme of ['light','dark']) for (const width of [1440,390]) {
      await guest.context().addCookies([{ name:'theme',value:theme,url:baseURL! }]);await guest.setViewportSize({width,height:1050});await guest.goto('/prompts?template=product-studio')
      await expect(guest.locator('#prompt-idea')).toHaveValue(/عطر/)
      await capture(guest,`studio-${theme}-${width}`,'[data-testid="prompt-master"]')
    }
    await guest.setViewportSize({width:1440,height:1050}); await guest.context().addCookies([{name:'theme',value:'light',url:baseURL!}])
    await guest.goto('/prompts/library'); await expect(guest.locator('main article')).toHaveCount(12)
    await guest.getByRole('link',{name:'صفحهٔ بعد',exact:true}).click();await expect(guest.locator('main article')).toHaveCount(3)
    await guest.getByLabel('نوع پرامپت',{exact:false}).selectOption('VIDEO');await guest.getByRole('main').getByRole('button',{name:'جست‌وجو',exact:true}).click();await expect(guest.locator('main article')).toHaveCount(3)
    await capture(guest,'library-filtered')
    const member=await pageFor('member'),other=await pageFor('other'),magazine=await pageFor('magazine')
    expect((await magazine.request.get('/api/admin/prompts')).status()).toBe(403)
    for (const account of [member,other]) {
      const prior = await account.request.get('/api/prompts/history').then(r => r.json())
      for (const item of prior.items) expect((await account.request.post('/api/prompts/history',{headers:origin,data:{action:'delete',id:item.id,version:item.version}})).status()).toBe(200)
    }
    await member.goto('/prompts');await member.locator('#prompt-idea').fill('یک پرامپت خصوصی برای برنامه‌ریزی محتوای آزمایشی بساز')
    const savedResponse=member.waitForResponse(r=>r.url().endsWith('/api/prompts/generate')&&r.request().method()==='POST');await member.getByRole('button',{name:'ساخت پرامپت',exact:true}).click();const saved=await (await savedResponse).json()
    expect(saved.item.id).toBeGreaterThan(0)
    expect((await other.request.get('/api/prompts/history?id='+saved.item.id)).status()).toBe(404)
    expect((await other.request.post('/api/prompts/history',{headers:origin,data:{action:'delete',id:saved.item.id,version:saved.item.version}})).status()).toBe(404)
    await member.goto('/prompts/history');await expect(member.locator('main article')).toHaveCount(1)
    await member.getByRole('button',{name:'نگه‌داری',exact:true}).click();await expect(member.getByText('نگه‌داری‌شده',{exact:true})).toBeVisible()
    await member.getByRole('link',{name:'بازکردن و ویرایش',exact:true}).click();await expect(member.getByLabel('متن خروجی پرامپت',{exact:true})).toHaveValue(/پرامپت خصوصی/)
    await member.getByLabel('متن خروجی پرامپت',{exact:true}).fill('نسخهٔ ویرایش‌شدهٔ خصوصی با جزئیات جدید و دقیق')
    await member.getByRole('button',{name:'ذخیرهٔ ویرایش',exact:true}).click();await expect(member.getByText('ویرایش در تاریخچهٔ خصوصی ذخیره شد',{exact:true})).toBeVisible()
    await member.reload();await expect(member.getByLabel('متن خروجی پرامپت',{exact:true})).toHaveValue(/نسخهٔ ویرایش‌شده/)
    await owner.goto('/admin/prompts');await expect(owner.getByRole('heading',{name:'پرامپت مستر',exact:true})).toBeVisible();await expect(owner.locator('tbody tr')).toHaveCount(15)
    await owner.getByRole('button',{name:'الگوی جدید',exact:true}).click()
    const editor=owner.locator('section').filter({has:owner.getByRole('heading',{name:'الگوی جدید',exact:true})}),slug='owned-browser-'+Date.now()
    await editor.getByLabel('عنوان الگو',{exact:true}).fill('الگوی مرورگر اختصاصی')
    await editor.getByLabel('نشانی انگلیسی',{exact:false}).fill(slug)
    await editor.getByLabel('توضیح کاربرد',{exact:true}).fill('الگوی اصلی آزمایشی برای بررسی انتشار و دسترسی')
    await editor.getByLabel('دسته',{exact:false}).selectOption('WRITING')
    await editor.getByLabel('ایدهٔ نمونه',{exact:true}).fill('یک طرح مقاله برای آموزش عکاسی بنویس')
    const createResponse=owner.waitForResponse(r=>r.url().endsWith('/api/admin/prompts')&&r.request().method()==='POST')
    await editor.getByRole('button',{name:'ذخیرهٔ الگو',exact:true}).click();const created=await (await createResponse).json();createdId=created.template.id
    expect((await guest.request.get('/prompts/templates/'+slug)).status()).toBe(404)
    let row=owner.getByRole('row').filter({hasText:slug});await row.getByRole('button',{name:'ویرایش',exact:true}).click()
    await owner.getByLabel('وضعیت انتشار',{exact:false}).selectOption('PUBLISHED');const publishResponse=owner.waitForResponse(r=>r.url().endsWith('/api/admin/prompts')&&r.request().method()==='POST');await owner.getByRole('button',{name:'ذخیرهٔ الگو',exact:true}).click();expect((await publishResponse).status()).toBe(200);await expect(owner.getByText('الگو ذخیره شد',{exact:true})).toBeVisible()
    await guest.goto('/prompts/templates/'+slug);await expect(guest.getByRole('heading',{name:'الگوی مرورگر اختصاصی',exact:true})).toBeVisible()
    await member.goto('/prompts/templates/'+slug);await member.getByRole('button',{name:'ذخیرهٔ الگو در علاقه‌مندی‌ها',exact:true}).click();await expect(member.getByRole('button',{name:/الگوی ذخیره‌شده/})).toHaveAttribute('aria-pressed','true')
    await member.reload();await expect(member.getByRole('button',{name:/الگوی ذخیره‌شده/})).toHaveAttribute('aria-pressed','true');await member.getByRole('button',{name:/الگوی ذخیره‌شده/}).click()
    row=owner.getByRole('row').filter({hasText:slug});await row.getByRole('button',{name:'ویرایش',exact:true}).click()
    const current=(await (await owner.request.get('/api/admin/prompts?q='+slug)).json()).templates[0]
    const concurrent = await owner.request.post('/api/admin/prompts',{headers:origin,data:{...current,action:'save',title:'ویرایش هم‌زمان مدیر دیگر'}})
    expect(await concurrent.json()).toHaveProperty('template');expect(concurrent.status()).toBe(200)
    await owner.getByLabel('عنوان الگو',{exact:true}).fill('نسخهٔ قدیمی فرم')
    await owner.getByRole('button',{name:'ذخیرهٔ الگو',exact:true}).click();await expect(owner.getByRole('alert').filter({hasText:/مدیر دیگری تغییر کرده/})).toBeVisible()
    await owner.getByRole('button',{name:'بستن ویرایشگر',exact:true}).click();await owner.getByRole('button',{name:'تازه‌کردن فهرست',exact:true}).click();await expect(owner.getByText('ویرایش هم‌زمان مدیر دیگر',{exact:true})).toBeVisible()
    await owner.goto('/prompts/templates/'+slug);await owner.getByRole('link',{name:'ویرایش الگو',exact:true}).click();await expect(owner.getByLabel('عنوان الگو',{exact:true})).toHaveValue('ویرایش هم‌زمان مدیر دیگر')
    for (const theme of ['light','dark']) for (const width of [1440,390]) {
      await owner.context().addCookies([{name:'theme',value:theme,url:baseURL!}]);await owner.setViewportSize({width,height:1050});await owner.reload();await expect(owner.getByLabel('عنوان الگو',{exact:true})).toHaveValue('ویرایش هم‌زمان مدیر دیگر');await capture(owner,`admin-${theme}-${width}`,'[data-testid="prompt-admin"]')
    }
    await owner.setViewportSize({width:1440,height:1050})
    await owner.goto('/admin/sections/prompt-master');const aiSwitch=owner.getByLabel('بهبود با سرویس هوش مصنوعی برای اعضا فعال باشد',{exact:true});await aiSwitch.check()
    await owner.getByRole('button',{name:/ذخیره/}).last().click()
    await expect.poll(async()=>{const r=await owner.request.get('/api/admin/sections?id=prompt-master');return (await r.json()).section.settings['ai-enabled']}).toBe(true)
    await member.goto('/prompts');await member.getByLabel('بهبود با هوش مصنوعی',{exact:false}).check();await expect(member.getByRole('button',{name:'ساخت و بهبود هوشمند',exact:true})).toBeDisabled()
    await member.getByLabel('با ارسال این ورودی به سرویس هوش مصنوعی سایت موافقم.',{exact:true}).check();await member.locator('#prompt-idea').fill('یک پرامپت آزمایشی برای ساخت پاسخ روشن با اطلاعات موجود بساز')
    await member.getByRole('button',{name:'ساخت و بهبود هوشمند',exact:true}).click();await expect(member.getByLabel('متن خروجی پرامپت',{exact:true})).toHaveValue(/بهبود‌یافتهٔ آزمایشی/)
    const moduleOff=await owner.request.post('/api/admin/sections',{headers:origin,data:{id:'prompt-master',enabled:false}});expect(moduleOff.status()).toBe(200)
    expect((await guest.request.get('/prompts')).status()).toBe(404);expect((await member.request.get('/api/prompts/history')).status()).toBe(404)
    expect((await owner.request.post('/api/admin/sections',{headers:origin,data:{id:'prompt-master',enabled:true}})).status()).toBe(200)
    expect((await owner.request.put('/api/admin/maintenance',{headers:origin,data:{section:'prompts',enabled:true,title:'توقف آزمایشی پرامپت'}})).status()).toBe(200)
    await expect.poll(async()=>(await guest.request.get('/prompts')).status()).toBe(503);expect((await owner.request.get('/prompts')).status()).toBe(200)
    expect((await owner.request.put('/api/admin/maintenance',{headers:origin,data:{section:'prompts',enabled:false}})).status()).toBe(200)
    await expect.poll(async()=>(await guest.request.get('/prompts')).status()).toBe(200)
    expect(errors).toEqual([])
  } finally {
    await owner.request.put('/api/admin/maintenance',{headers:origin,data:{section:'prompts',enabled:false}}).catch(()=>{})
    await owner.request.post('/api/admin/sections',{headers:origin,data:{id:'prompt-master',enabled:true,settings:{'ai-enabled':false}}}).catch(()=>{})
    if(createdId){const data=await owner.request.get('/api/admin/prompts?q=owned-browser-').then(r=>r.json()).catch(()=>null),entry=data?.templates.find((v:any)=>v.id===createdId);if(entry)await owner.request.post('/api/admin/prompts',{headers:origin,data:{action:'delete',id:entry.id,version:entry.version}})}
    for(const context of contexts)await context.close()
  }
})
