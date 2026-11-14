const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{chromium,expect:baseExpect}=require('@playwright/test')
const expect=baseExpect.configure({timeout:60000}),fixture=JSON.parse(fs.readFileSync(process.env.ORDEROPS_FIXTURE_PATH,'utf8')),output=process.env.ORDEROPS_OUTPUT,baseURL=fixture.baseURL
if(process.env.MOBOCOM_ISOLATED_FIXTURE!=='1'||baseURL!=='https://localhost:3121'||!output)throw Error('Explicit isolated order-operations preview required')
fs.mkdirSync(output,{recursive:true});const progress=path.join(output,'progress.json'),prior=fs.existsSync(progress)?JSON.parse(fs.readFileSync(progress,'utf8')):{operations:{}}
const operations=prior.operations,views=[],errors=[]
const record=()=>fs.writeFileSync(progress,JSON.stringify({operations,views,errors},null,2))
async function main(){
 const browser=await chromium.launch({headless:true})
 const contexts=[]
 try{
  async function open(width,theme,staff){
   const context=await browser.newContext({baseURL,ignoreHTTPSErrors:true,viewport:{width,height:1000},reducedMotion:'reduce'});contexts.push(context)
   await context.addCookies([...(staff?fixture.staffCookies:fixture.buyerCookies),{name:'theme',value:theme,url:baseURL}])
   await context.route('**/*',route=>new URL(route.request().url()).origin===baseURL?route.continue():route.abort())
   const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message))
   const visit=async url=>{console.log('Visit '+url);for(let attempt=0;attempt<3;attempt++){try{const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});assert.equal(response.status(),200);return}catch(error){if(attempt===2||!String(error).includes('net::ERR_EMPTY_RESPONSE'))throw error;console.log('Local dev preview restarting; waiting for readiness');await expect.poll(async()=>{try{return(await context.request.get('/api/health/ready')).status()}catch{return 0}},{timeout:30000}).toBe(200)}}}
   const post=async(url,body)=>{const response=await context.request.post(url,{headers:{Origin:baseURL},data:body}),data=await response.json();assert(response.ok(),url+' '+JSON.stringify(data));return data}
   const capture=async(name,selector)=>{await page.evaluate(()=>document.fonts.ready);await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});const violations=await page.locator(selector).evaluate(async root=>(await window.axe.run(root,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(item=>({id:item.id,nodes:item.nodes.map(node=>({target:node.target,summary:node.failureSummary}))})));const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);views.push({name,width,theme,violations,overflow});record();await page.screenshot({path:path.join(output,`${name}-${theme}-${width}.png`),fullPage:true,caret:'initial',animations:'disabled'});assert.deepEqual(violations,[],name+' axe');assert(!overflow,name+' overflow');console.log(name+' '+theme+' '+width+' passed')}
   return {context,page,visit,post,capture}
  }
  // One real browser purchase through the canonical wallet/payment/order pipeline.
  const buyer=await open(390,'dark',false)
  if(!operations.purchase){
   await buyer.visit(fixture.productPath);const added=buyer.page.waitForResponse(r=>r.url().endsWith('/api/cart')&&r.request().method()==='POST');await buyer.page.getByRole('button',{name:'افزودن به سبد خرید',exact:true}).click();assert((await added).ok())
   await buyer.visit('/checkout/cart');await expect(buyer.page.getByRole('button',{name:'ثبت سفارش و پرداخت از کیف پول',exact:true})).toBeEnabled();await buyer.capture('mobile-checkout','.sh-checkout')
   const paid=buyer.page.waitForResponse(r=>r.url().endsWith('/api/cart/checkout')&&r.request().method()==='POST');await buyer.page.getByRole('button',{name:'ثبت سفارش و پرداخت از کیف پول',exact:true}).click();const response=await paid,data=await response.json();assert.equal(response.status(),200,JSON.stringify(data));assert.equal(data.paid,true);operations.purchase=data.orderId;record()
  }
  if(!operations.addressRequest){
   await buyer.visit('/dashboard/orders/'+fixture.amendmentOrderId);const panel=buyer.page.locator('.sx-delivery-change');await expect(panel.getByLabel('نشانی ذخیره‌شده',{exact:true})).toBeVisible();await panel.getByLabel('نشانی ذخیره‌شده',{exact:true}).selectOption(String(fixture.newAddressId));const saved=buyer.page.waitForResponse(r=>r.url().endsWith('/delivery-changes')&&r.request().method()==='POST');await panel.getByRole('button',{name:'ثبت درخواست تغییر نشانی',exact:true}).click();assert.equal((await saved).status(),201);await expect(panel.getByText('در انتظار بررسی',{exact:true})).toBeVisible();operations.addressRequest=true;record()
  }
  const staff=await open(1440,'light',true)
  if(!operations.addressApproved){
   await staff.visit('/admin/store/orders/'+fixture.amendmentOrderId);const panel=staff.page.locator(`[aria-labelledby="delivery-change-admin-${fixture.amendmentOrderId}"]`);await expect(panel.getByRole('button',{name:'تأیید و اعمال نشانی',exact:true})).toBeVisible();await panel.getByRole('checkbox').check();const saved=staff.page.waitForResponse(r=>r.url().endsWith('/delivery-changes')&&r.request().method()==='POST');await panel.getByRole('button',{name:'تأیید و اعمال نشانی',exact:true}).click();assert.equal((await saved).status(),200);await expect(panel.getByText('تأیید شد',{exact:true})).toBeVisible();operations.addressApproved=true;record()
  }
  if(!operations.dispatched){
   await staff.visit('/admin/store/orders/'+operations.purchase);const panel=staff.page.getByRole('region',{name:'چک‌لیست بسته‌بندی و تحویل',exact:true});await expect(panel.getByRole('checkbox').first()).toBeVisible();for(const checkbox of await panel.getByRole('checkbox').all())await checkbox.check();const saved=staff.page.waitForResponse(r=>r.url().endsWith('/packing')&&r.request().method()==='POST');await panel.getByRole('button',{name:'ثبت کنترل کالاها',exact:true}).click();assert.equal((await saved).status(),200);await expect(panel.getByText('کنترل کالاها و مسئول تحویل ثبت شد',{exact:true})).toBeVisible()
   const status=(await(await staff.context.request.get('/api/admin/store/orders/'+operations.purchase)).json()).fulfilment
   for(const [target,label]of [...(status==='PENDING'?[['PROCESSING','شروع پردازش']]:[]),['PACKED','بسته‌بندی شد'],['SHIPPED','ارسال شد']]){
    await expect(staff.page.getByRole('radio',{name:label,exact:true})).toBeVisible();await staff.page.getByRole('radio',{name:label,exact:true}).click();const updated=staff.page.waitForResponse(r=>r.url().endsWith('/api/admin/store/orders/'+operations.purchase)&&r.request().method()==='POST');await staff.page.getByRole('button',{name:`ثبت «${label}»`,exact:true}).click();assert.equal((await updated).status(),200)
   }
   operations.dispatched=true;record()
  }
  await buyer.visit('/dashboard/orders/'+operations.purchase);await expect(buyer.page.locator('.sx-track')).toContainText('تحویل به مرسوله‌رسان');await buyer.capture('mobile-tracking','.sx-my-detail')
  if(!operations.reordered){const panel=buyer.page.locator('.sx-reorder');await expect(panel.getByRole('button',{name:/افزودن .* ردیف به سبد/})).toBeEnabled();const saved=buyer.page.waitForResponse(r=>r.url().endsWith('/reorder')&&r.request().method()==='POST');await panel.getByRole('button',{name:/افزودن .* ردیف به سبد/}).click();assert.equal((await saved).status(),200);await expect(panel.getByRole('link',{name:'بررسی سبد خرید',exact:true})).toBeVisible();operations.reordered=true;record()}
  if(!operations.register){const data=await staff.post('/api/admin/store/counter',{op:'register.open',requestId:randomUUID(),register:'صندوق گردش سفارش',currency:'IRT',openingCashMinor:'0',locationId:fixture.locationId});operations.register=Number(data.session.id);record()}
  if(!operations.returnId){
   const source=await staff.post('/api/admin/store/counter',{requestId:randomUUID(),confirmed:true,packingConfirmed:true,sessionId:operations.register,method:'CASH',customerId:fixture.buyerId,customerName:'مشتری آزمایشی',lines:[{productId:fixture.productId,variantId:null,quantity:2,expectedUnitMinor:'1000',inputs:{}}]});operations.sourceSale=source.orderId;record()
   const returned=await staff.post('/api/admin/store/counter/returns',{requestId:randomUUID(),orderId:source.orderId,sessionId:operations.register,refund:'CASH',reason:'exchange',restock:true,expectedRefundMinor:'2000',confirmed:true,lines:[{line:0,quantity:2}]});operations.returnId=returned.result.id;record()
  }
  if(!operations.inspected){
   await staff.visit('/admin/store/returns/'+operations.returnId);const panel=staff.page.getByRole('region',{name:'بررسی سلامت کالای مرجوعی',exact:true});await expect(panel.getByLabel('تعداد سالم',{exact:true})).toBeVisible();await panel.getByLabel('تعداد سالم',{exact:true}).fill('۱');await panel.getByLabel('تعداد معیوب',{exact:true}).fill('۱');await panel.getByLabel('انبار مقصد تعداد سالم',{exact:true}).selectOption(String(fixture.locationId));const saved=staff.page.waitForResponse(r=>r.url().endsWith('/inspection')&&r.request().method()==='POST');await panel.getByRole('button',{name:'ثبت نتیجهٔ بررسی و آزادسازی تعداد سالم',exact:true}).click();assert.equal((await saved).status(),200);await expect(panel.getByText(/مسئول بررسی/).first()).toBeVisible();operations.inspected=true;record()
  }
  if(!operations.replacement){
   await staff.visit('/admin/store/counter?exchange='+operations.returnId);await expect(staff.page.getByRole('region',{name:'تعویض کالا',exact:true})).toContainText('بازپرداخت ثبت‌شده');await staff.page.getByLabel('نوبت صندوق',{exact:true}).selectOption(String(operations.register));await staff.page.locator('#counter-product').selectOption(String(fixture.productId));await staff.page.getByRole('button',{name:'افزودن به فروش',exact:true}).click();await expect(staff.page.getByRole('checkbox',{name:/کل مبلغ را دریافت کرده‌ام/})).toBeEnabled();await staff.page.getByRole('checkbox',{name:/مدل، رنگ و گونه/}).check();await staff.page.getByRole('checkbox',{name:/کل مبلغ را دریافت کرده‌ام/}).check();const sold=staff.page.waitForResponse(r=>r.url().endsWith('/api/admin/store/counter')&&r.request().method()==='POST'&&r.request().postDataJSON()?.op!=='quote');await staff.page.getByRole('button',{name:'ثبت فروش و صدور فاکتور',exact:true}).click();const response=await sold,data=await response.json();assert.equal(response.status(),200,JSON.stringify(data));operations.replacement=data.orderId;record()
  }
  await buyer.context.close();await staff.context.close()
  for(const [width,theme]of [[1440,'light'],[1440,'dark'],[390,'dark']]){
   const customer=await open(width,theme,false),admin=await open(width,theme,true)
   await customer.visit('/dashboard/orders/'+fixture.amendmentOrderId);await expect(customer.page.locator('.sx-delivery-change')).toContainText('تأیید شد');await customer.capture('customer-amendment','.sx-delivery-change')
   await customer.visit('/dashboard/orders/'+operations.purchase);await expect(customer.page.locator('.sx-reorder')).toContainText('قیمت فعلی هر عدد');await customer.capture('reorder','.sx-reorder')
   await admin.visit('/admin/store/orders/'+fixture.amendmentOrderId);await expect(admin.page.locator(`[aria-labelledby="delivery-change-admin-${fixture.amendmentOrderId}"]`)).toContainText('تأیید شد');await admin.capture('admin-amendment',`[aria-labelledby="delivery-change-admin-${fixture.amendmentOrderId}"]`)
   await admin.visit('/admin/store/orders/'+operations.purchase);await expect(admin.page.getByRole('region',{name:'چک‌لیست بسته‌بندی و تحویل',exact:true})).toContainText('آخرین کنترل');await admin.capture('packing','[aria-label="چک‌لیست بسته‌بندی و تحویل"]')
   await admin.visit('/admin/store/returns/'+operations.returnId);await expect(admin.page.getByRole('region',{name:'بررسی سلامت کالای مرجوعی',exact:true})).toContainText('معیوب');await admin.capture('inspection','[aria-label="بررسی سلامت کالای مرجوعی"]');await expect(admin.page.getByRole('region',{name:'اسناد تعویض کالا',exact:true})).toContainText('فاکتور جایگزین');await admin.capture('exchange','[aria-label="اسناد تعویض کالا"]')
   await customer.context.close();await admin.context.close()
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({views,operations,errors},null,2));console.log('Order operations browser passed '+views.length+' actual views plus persisted mobile purchase/amendment/dispatch/reorder/inspection/exchange')
 }catch(error){for(const context of contexts)for(const page of context.pages())await page.screenshot({path:path.join(output,'failure.png'),fullPage:true,caret:'initial'}).catch(()=>{});record();throw error}finally{await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
