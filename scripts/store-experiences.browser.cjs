// One local synthetic journey per owner, with scoped responsive/RTL/a11y evidence.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const fixture=JSON.parse(fs.readFileSync(process.env.STORE_EXPERIENCES_FIXTURE,'utf8'));
assert.equal(fixture.baseURL,'http://localhost:3117');
const output=process.env.STORE_EXPERIENCES_OUTPUT;assert(output);fs.mkdirSync(output,{recursive:true});
const progressFile=path.join(output,'progress.json'),progress=fs.existsSync(progressFile)?JSON.parse(fs.readFileSync(progressFile)):{};
const phase=process.env.STORE_EXPERIENCES_PHASE||'all';
const prior=phase!=='all'&&fs.existsSync(path.join(output,'summary.json'))?JSON.parse(fs.readFileSync(path.join(output,'summary.json'))):null;
const proof={views:prior?.views||[],pageErrors:[],consoleErrors:[]};let browser,activePage;
const save=()=>fs.writeFileSync(progressFile,JSON.stringify(progress));
async function session(context,cookies,theme='light'){for(const page of context.pages())await page.goto('about:blank');await context.clearCookies();await context.addCookies([...cookies,{name:'theme',value:theme,url:fixture.baseURL}])}
async function views(page,label,selector){
  console.log('Checking '+label);
  for(const[width,theme]of [[1440,'light'],[1440,'dark'],[390,'dark']]){
    await page.setViewportSize({width,height:960});await page.context().addCookies([{name:'theme',value:theme,url:fixture.baseURL}]);await page.reload({waitUntil:'domcontentloaded'});
    if(label==='repair-work') await page.locator('.dk-card').first().click();
    await page.locator(selector).first().waitFor();
    if(label==='gift-checkout') { await page.getByRole('button',{name:'ثبت سفارش و پرداخت از کیف پول',exact:true}).waitFor();await page.getByLabel('این سفارش هدیه است').check();await page.getByLabel('نام گیرندهٔ هدیه').fill('گیرندهٔ تست مرورگر');await page.getByLabel('پیام همراه هدیه').fill('هدیهٔ آزمایشی'); }
    if(label==='returns') await page.getByRole('button',{name:'لغو سفارش',exact:true}).click();
    await page.evaluate(source=>{const script=document.createElement('script');script.nonce=document.querySelector('script[nonce]')?.nonce||'';if(!script.nonce)throw Error('CSP nonce missing');script.textContent=source;document.head.appendChild(script)},fs.readFileSync(require.resolve('axe-core'),'utf8'));
    const result=await page.locator(selector).first().evaluate(root=>window.axe.run(root,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));
    const name=`${label}-${width}-${theme}`;fs.writeFileSync(path.join(output,name+'.axe.json'),JSON.stringify(result.violations));
    await page.screenshot({path:path.join(output,name+'.png'),fullPage:true,caret:'initial',animations:'disabled'});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);proof.views.push({name,violations:result.violations.map(x=>x.id),overflow});
    assert(!overflow,name+' horizontal overflow');assert.equal(result.violations.length,0,name+' a11y: '+result.violations.map(x=>x.id));
  }
}
;(async()=>{
  browser=await chromium.launch({headless:true});const context=await browser.newContext({baseURL:fixture.baseURL,viewport:{width:1440,height:960}});context.setDefaultTimeout(60000);context.setDefaultNavigationTimeout(180000);
  await context.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===fixture.baseURL||['data:','blob:'].includes(url.protocol)?route.continue():route.abort('blockedbyclient')});
  const page=await context.newPage();activePage=page;page.on('pageerror',error=>proof.pageErrors.push(error.message));page.on('console',message=>{if(message.type()==='error')proof.consoleErrors.push(message.text())});
  await session(context,fixture.buyerCookies);
  if(phase==='compare'){
    await page.goto(`/compare?items=product:${fixture.productId},product:${fixture.serviceId}`,{waitUntil:'domcontentloaded'});await page.getByRole('rowheader',{name:'وضعیت کالا',exact:true}).waitFor();await page.getByRole('cell',{name:'کارکرده',exact:true}).waitFor();await views(page,'condition-comparison','.cmp-page');proof.ok=true;console.log('PASS existing product comparison condition, health and warranty rows');return;
  }
  if(phase==='services'||phase==='repair'){
    if(!progress.serviceOrderId){
      await context.request.delete('/api/cart',{headers:{Origin:fixture.baseURL}});
      const add=await context.request.post('/api/cart',{headers:{Origin:fixture.baseURL},data:{bundleId:fixture.bundleId}});assert.equal(add.status(),200,await add.text());const cart=(await add.json()).cart;assert.equal(cart.lines.length,2);
      await page.goto('/checkout/cart',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'ثبت سفارش و پرداخت از کیف پول',exact:true}).waitFor();await page.getByLabel('تحویل حضوری از فروشگاه').check();
      const placed=page.waitForResponse(r=>r.url().endsWith('/api/cart/checkout')&&r.request().method()==='POST');await page.getByRole('button',{name:'ثبت سفارش و پرداخت از کیف پول',exact:true}).click();const response=await placed,body=await response.json();assert.equal(response.status(),200,JSON.stringify(body));assert(body.paid);progress.serviceOrderId=body.orderId;save();
    }
    await session(context,fixture.staffCookies);
    if(phase!=='repair'){
    await page.goto(`/admin/store/products/${fixture.productId}`,{waitUntil:'domcontentloaded'});await page.getByLabel(/گزارش سلامت کالا/).fill('سلامت آزمایشی ۹۸٪، بازبینی فرم');
    const saved=page.waitForResponse(r=>r.url().includes('/api/admin/cms?type=products')&&r.request().method()==='PATCH');await page.getByRole('button',{name:'ذخیره',exact:true}).click();assert.equal((await saved).status(),200);await views(page,'product-editor','.sa');
    }
    await page.goto(`/admin/forms?form=${fixture.formId}&tab=inbox`,{waitUntil:'domcontentloaded'});await page.locator('.dk-card').first().click();
    if(await page.getByLabel('شمارهٔ سفارش مختلط پرداخت‌شده').count()){
      await page.getByLabel('شمارهٔ سفارش مختلط پرداخت‌شده').fill(String(progress.serviceOrderId));
      const attached=page.waitForResponse(r=>r.url().includes('/api/admin/forms/submissions')&&r.request().method()==='PATCH');await page.getByRole('button',{name:'اتصال به این تعمیر',exact:true}).click();assert.equal((await attached).status(),200);
    }
    await page.getByText('فاکتور تعمیر پرداخت شد',{exact:true}).waitFor();await views(page,'repair-work','.fp-work');proof.ok=true;console.log('PASS actual mixed bundle wallet checkout, product editor save and paid order attachment through repair UI');return;
  }
  if(phase==='all'){
  if(!progress.orderId){
    await context.request.delete('/api/cart',{headers:{Origin:fixture.baseURL}});
    const add=await context.request.post('/api/cart',{headers:{Origin:fixture.baseURL},data:{productId:fixture.productId,quantity:1}});assert.equal(add.status(),200,await add.text());
    console.log('Opening checkout');
    await page.goto('/checkout/cart',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'ثبت سفارش و پرداخت از کیف پول',exact:true}).waitFor();await page.getByLabel('این سفارش هدیه است').check();await page.getByLabel('نام گیرندهٔ هدیه').fill('گیرندهٔ تست مرورگر');await page.getByLabel('پیام همراه هدیه').fill('هدیهٔ آزمایشی شما مبارک');await page.getByLabel('بسته‌بندی هدیهٔ رایگان').check();
    // Persisted checkout is exercised once; visual reloads are taken after choices are re-entered below.
    await page.getByLabel('تحویل حضوری از فروشگاه').check();
    const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/cart/checkout')&&r.request().method()==='POST');
    await page.getByRole('button',{name:'ثبت سفارش و پرداخت از کیف پول',exact:true}).click();const response=await responsePromise,body=await response.json();assert.equal(response.status(),200,JSON.stringify(body));assert(body.paid&&body.orderId);progress.orderId=body.orderId;progress.invoiceNumber=body.invoiceNumber;save();console.log('Placed gift order');
  }
  await page.goto(`/dashboard/orders/${progress.orderId}`,{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'سفارش هدیه',exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:'مشاهده و چاپ رسید هدیه بدون قیمت'}).getAttribute('href'),`/dashboard/orders/${progress.orderId}/gift`);await page.goto(`/dashboard/orders/${progress.orderId}/gift`,{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'رسید هدیه',exact:true}).waitFor();
  const giftText=await page.locator('article.sx-my').innerText();assert(giftText.includes('گیرندهٔ تست مرورگر'));assert(!/۱۵۰٬۰۰۰|150000|تومان|کیف پول/.test(giftText));await views(page,'gift-receipt','article.sx-my');
  await page.emulateMedia({media:'print'});await page.pdf({path:path.join(output,'gift-receipt.pdf'),format:'A4',printBackground:true});await page.emulateMedia({media:'screen'});
  await session(context,fixture.foreignCookies);const forbidden=await context.request.get(`/dashboard/orders/${progress.orderId}/gift`);const deniedHtml=await forbidden.text();assert([200,404].includes(forbidden.status()));assert(!deniedHtml.includes('گیرندهٔ تست مرورگر')&&!deniedHtml.includes('SSD آزمایشی کارکرده'),'foreign streamed not-found must contain no receipt data');
  await session(context,fixture.buyerCookies);
  await context.request.post('/api/cart',{headers:{Origin:fixture.baseURL},data:{productId:fixture.productId,quantity:1}});await page.goto('/checkout/cart',{waitUntil:'domcontentloaded'});await views(page,'gift-checkout','.sh-panel:has(#sh-gift-title)');await context.request.delete('/api/cart',{headers:{Origin:fixture.baseURL}});
  await session(context,fixture.buyerCookies);await page.goto(`/dashboard/orders/${progress.orderId}`,{waitUntil:'domcontentloaded'});
  await page.route(`**/api/store/orders/${progress.orderId}/returns`,route=>route.request().method()==='GET'?route.fulfill({status:503,body:'{}',contentType:'application/json'}):route.continue());await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'دریافت دوباره',exact:true}).waitFor();await page.unroute(`**/api/store/orders/${progress.orderId}/returns`);await page.getByRole('button',{name:'دریافت دوباره',exact:true}).click();await page.getByRole('button',{name:'لغو سفارش',exact:true}).waitFor();
  await page.getByRole('button',{name:'لغو سفارش',exact:true}).click();await page.getByLabel('از خرید منصرف شدم').check();
  await page.route(`**/api/store/orders/${progress.orderId}/returns`,async route=>{if(route.request().method()!=='POST')return route.continue();await new Promise(resolve=>setTimeout(resolve,600));return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'خطای ساختگی ثبت درخواست'})})});
  await page.locator('.rp-form').getByRole('button',{name:'لغو سفارش',exact:true}).click();assert(await page.locator('.rp-form textarea').isDisabled());await page.getByRole('alert').filter({hasText:'خطای ساختگی ثبت درخواست'}).waitFor();await page.unroute(`**/api/store/orders/${progress.orderId}/returns`);await views(page,'returns','.rp');
  }
  if(phase==='all'||phase==='catalog'){
  await page.goto(`/dashboard/orders/${progress.orderId}/gift`,{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'رسید هدیه',exact:true}).waitFor();await page.emulateMedia({media:'print'});await page.pdf({path:path.join(output,'gift-receipt.pdf'),format:'A4',printBackground:true});await page.emulateMedia({media:'screen'});
  await page.goto(`/products/${fixture.slug}`,{waitUntil:'domcontentloaded'});await page.locator('#product-condition-title').waitFor();await page.waitForFunction(()=>Object.keys(document.querySelector('#device-compatibility-model')||{}).some(key=>key.startsWith('__reactProps$')));await page.locator('#device-compatibility-model').fill('Laptop QA 2026');await page.getByRole('button',{name:'بررسی',exact:true}).click();await page.getByText('نیازمند شکاف M.2 NVMe',{exact:false}).first().waitFor();await views(page,'condition','section:has(#product-condition-title)');
  }
  await session(context,fixture.staffCookies);
  if(phase!=='desk'){
  await page.goto(`/admin/store/inventory/purchases?product=${fixture.productId}`,{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'خرید و تأمین کالا'}).waitFor();await page.getByLabel('تأمین‌کننده').fill('تأمین‌کنندهٔ آزمایشی');await page.getByLabel('بهای خرید هر عدد').fill('100000');await page.getByRole('button',{name:'ثبت سفارش خرید',exact:true}).click();await page.getByText(/سفارش PO-.* ثبت شد/).waitFor();await page.getByRole('button',{name:'مشاهده و دریافت'}).first().click();await page.getByLabel('دریافت SSD آزمایشی کارکرده',{exact:true}).fill('1');await page.getByRole('button',{name:'ثبت دریافت انتخاب‌شده'}).click();await page.getByText('دریافت ثبت شد و موجودی به‌روز شد.').waitFor();await views(page,'purchases','.sa');
  await page.goto('/admin/products',{waitUntil:'domcontentloaded'});await page.locator('#product-quality-title').waitFor();await views(page,'catalog-quality','section:has(#product-quality-title)');
  }
  await page.goto('/admin/store/orders?work=unassigned',{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'سفارش‌های فروشگاه',exact:true}).waitFor();await views(page,'order-desk','.sa');
  await page.goto('/admin/analytics',{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'قیف خرید فروشگاه',exact:true}).waitFor();await views(page,'funnel','section:has-text("قیف خرید فروشگاه")');
  assert.equal(proof.pageErrors.length,0,JSON.stringify(proof.pageErrors));proof.ok=true;console.log('PASS Store buyer gift/ownership/returns recovery, device disclosure, purchase receipt, quality, desk and funnel; '+proof.views.length+' responsive themed views');
})().catch(async error=>{proof.failure=error.stack;console.error(error.message);process.exitCode=1;if(activePage){await activePage.screenshot({path:path.join(output,'failure.png'),fullPage:true,caret:'initial'}).catch(()=>{});fs.writeFileSync(path.join(output,'failure-state.txt'),(await activePage.locator('body').innerText().catch(()=>''))+'\nURL:'+activePage.url())}}).finally(async()=>{fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(proof,null,2));await browser?.close()});
