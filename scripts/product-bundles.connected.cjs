const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript-api'),{PrismaClient}=require('@prisma/client');const db=new PrismaClient(),seed=`bundle-${Date.now()}`,products=[];let user,cart,order,admin,settingsBefore,settingsRead=false,browser
async function apiChecks(source,target,hidden,variant,definition,bundleId){
 const {encode}=require('next-auth/jwt'),base='http://localhost:3000',key='store.merchandising.v1'
 settingsBefore=await db.setting.findUnique({where:{key}});settingsRead=true
 admin=await db.user.create({data:{email:`${seed}-admin@example.invalid`,passwordHash:'test-only',role:'ADMIN',totpEnabledAt:new Date()}})
 const jwt=async who=>encode({secret:process.env.NEXTAUTH_SECRET,token:{uid:String(who.id),sub:String(who.id),email:who.email,role:who.role,authAt:Date.now()}}),adminToken=await jwt(admin),userToken=await jwt(user)
 const call=(path,method='GET',body,token=adminToken)=>fetch(base+path,{method,headers:{origin:base,'content-type':'application/json',...(token?{cookie:`next-auth.session-token=${token}`}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)})
 const save=async body=>{const r=await call('/api/admin/store/settings','POST',body);assert.equal(r.status,200,await r.clone().text());return(await r.json()).settings}
 const publicPath=`/api/products/${source.slug}/bundles`,patch=body=>call('/api/admin/cms?type=products','PATCH',{id:source.id,...body})
 await save({showProductBundles:false});assert.equal((await call(publicPath,'GET',undefined,null)).status,404)
 await save({showProductBundles:true});assert.equal((await save({})).showProductBundles,true)
 assert.equal((await call('/api/admin/store/settings','POST',{showProductBundles:false},null)).status,403)
 assert.equal((await call('/api/admin/cms?type=products','PATCH',{id:source.id,bundles:[]},userToken)).status,403)
 const current={...definition,id:bundleId,name:'بسته آزمایشی',nameEn:'Test bundle'}
 let response=await patch({bundles:[current]});assert.equal(response.status,200,await response.clone().text())
 assert.equal((await patch({name:source.name})).status,200)
 let rows=await(await call(`/api/admin/cms?type=products&id=${source.id}`)).json();assert.deepEqual(rows[0].bundles,[current])
 const before=await db.product.findUniqueOrThrow({where:{id:source.id}}),points=await db.productPricePoint.count({where:{productId:source.id}})
 response=await patch({price:99,name:'must-roll-back',bundles:[{...current,components:[current.components[0],{productId:hidden.id,variantId:null,quantity:1}]}]});assert.equal(response.status,400)
 assert.equal((await db.product.findUniqueOrThrow({where:{id:source.id}})).priceMinor,before.priceMinor);assert.equal((await db.product.findUniqueOrThrow({where:{id:source.id}})).name,before.name);assert.equal(await db.productPricePoint.count({where:{productId:source.id}}),points)
 response=await call(publicPath,'GET',undefined,null);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private.*no-store/)
 const data=await response.json();assert.equal(data.items[0].total,5);assert.equal(data.items[0].components[1].variantId,variant.id);assert.equal(data.items[0].components[1].quantity,2)
 assert.ok(!JSON.stringify(data).includes('downloadUrl'));assert.ok(!JSON.stringify(data).includes('password'))
 if(process.env.HURL_BIN){const{spawn}=require('node:child_process');await new Promise((resolve,reject)=>{const child=spawn(process.env.HURL_BIN,['--test','--variable',`base_url=${base}`,'--variable',`slug=${source.slug}`,'--variable',`bundle_id=${bundleId}`,'--variable',`variant_id=${variant.id}`,'docs/specs/store-product-relationships/product-bundles.hurl'],{stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`Hurl exited ${code}`)))})}
 await call('/api/cart','DELETE',undefined,userToken)
 response=await call('/api/cart','POST',{bundleId},userToken);assert.equal(response.status,200,await response.clone().text());assert.equal((await response.json()).cart.itemsTotal,5)
 assert.equal((await call('/api/cart','POST',{bundleId,productId:source.id},userToken)).status,400)
 await db.productVariant.update({where:{id:variant.id},data:{stock:2}})
 assert.equal((await call('/api/cart','POST',{bundleId},userToken)).status,409)
 assert.deepEqual((await db.cartLine.findMany({where:{cartId:cart.id},orderBy:{productId:'asc'}})).map(l=>l.quantity),[1,2])
 await db.productVariant.update({where:{id:variant.id},data:{stock:30}})
 await db.product.update({where:{id:target.id},data:{access:'MEMBERS'}});assert.equal((await call('/api/cart','POST',{bundleId},userToken)).status,403);await db.product.update({where:{id:target.id},data:{access:'PUBLIC',active:false}})
 assert.deepEqual((await(await call(publicPath,'GET',undefined,null)).json()).items,[]);assert.equal((await patch({bundles:[current]})).status,200)
 await db.product.update({where:{id:target.id},data:{active:true}})
 await db.product.update({where:{id:source.id},data:{active:false}});assert.equal((await call(publicPath,'GET',undefined,null)).status,404);await db.product.update({where:{id:source.id},data:{active:true}})
 if(process.env.BUNDLE_BROWSER==='1')await browserChecks(source,target,variant,bundleId,adminToken,userToken)
 await save({showProductBundles:false});assert.equal((await call(publicPath,'GET',undefined,null)).status,404);assert.equal((await call('/api/cart','POST',{bundleId},userToken)).status,404);assert.equal(await db.productBundle.count({where:{id:bundleId}}),1)
 console.log('Actual bundle CMS/public/cart/settings API permissions, omitted fields, atomic price/name/history rollback, fixed variants/current sum, private caching/data, ambiguity, capped all-or-nothing add, member/source/target/rollout gates passed')
}
async function browserChecks(source,target,variant,bundleId,adminToken,userToken){
 const {chromium}=require('playwright'),base='http://localhost:3000'
 const accessibility=async locator=>{if(!process.env.BUNDLE_AXE)return;await page.addScriptTag({path:process.env.BUNDLE_AXE});const violations=await locator.evaluate(async node=>(await window.axe.run(node,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}})).violations.map(row=>({id:row.id,impact:row.impact,nodes:row.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));assert.deepEqual(violations,[],'scoped WCAG accessibility')}
 const alternate=await db.productVariant.create({data:{productId:target.id,sku:`${seed}-alternate`,name:'Alternate variant',price:3,priceMinor:300n,stock:30}})
 browser=await chromium.launch({headless:true});const context=await browser.newContext({locale:'fa-IR',timezoneId:'Asia/Tehran'}),page=await context.newPage()
 await context.addCookies([{name:'next-auth.session-token',value:adminToken,url:base}])
 await page.goto(base+'/admin/store/settings',{waitUntil:'domcontentloaded',timeout:60000})
 const checkbox=page.getByLabel('نمایش و خرید بسته‌های محصول',{exact:true});await checkbox.waitFor();assert.equal(await checkbox.isChecked(),true)
 await checkbox.uncheck();let saving=page.waitForResponse(r=>r.url().endsWith('/api/admin/store/settings')&&r.request().method()==='POST');await page.getByRole('button',{name:'ذخیره',exact:true}).click();assert.equal((await saving).status(),200)
 await page.reload({waitUntil:'domcontentloaded'});await checkbox.waitFor();assert.equal(await checkbox.isChecked(),false)
 await checkbox.check();saving=page.waitForResponse(r=>r.url().endsWith('/api/admin/store/settings')&&r.request().method()==='POST');await page.getByRole('button',{name:'ذخیره',exact:true}).click();assert.equal((await saving).status(),200)
 await page.goto(base+'/admin/products',{waitUntil:'domcontentloaded',timeout:60000});await page.getByRole('row').filter({hasText:source.name}).getByRole('button',{name:'ویرایش',exact:true}).click()
 const region=page.getByRole('region',{name:'بسته‌های قابل خرید',exact:true}),existing=region.locator('fieldset.mb-3').first(),targetGroup=existing.getByRole('group',{name:target.name,exact:true})
 await region.getByText(target.name,{exact:true}).waitFor()
 await targetGroup.getByLabel('گونهٔ ثابت بسته',{exact:true}).selectOption(String(alternate.id));await targetGroup.getByLabel('تعداد در بسته',{exact:true}).fill('3')
 await region.getByRole('button',{name:'افزودن بسته',exact:true}).click();const added=region.locator('fieldset.mb-3').nth(1)
 await added.getByLabel('نام بسته',{exact:true}).fill('بسته دوم');await added.getByLabel('نام انگلیسی بسته',{exact:true}).fill('Second bundle');await added.getByLabel('بسته فعال',{exact:true}).check()
 await added.getByLabel('جست‌وجوی مورد',{exact:true}).fill(target.name);await added.getByRole('button',{name:`${target.name} +`,exact:true}).click()
 await added.getByRole('group',{name:target.name,exact:true}).getByLabel('گونهٔ ثابت بسته',{exact:true}).selectOption(String(variant.id))
 saving=page.waitForResponse(r=>r.url().includes('/api/admin/cms?type=products')&&r.request().method()==='PATCH');await page.getByRole('button',{name:'ذخیره',exact:true}).click();assert.equal((await saving).status(),200)
 await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('row').filter({hasText:source.name}).getByRole('button',{name:'ویرایش',exact:true}).click()
 await region.getByRole('group',{name:target.name,exact:true}).first().getByLabel('تعداد در بسته',{exact:true}).waitFor();assert.equal(await region.locator('fieldset.mb-3').count(),2)
 assert.equal(await region.locator('fieldset.mb-3').first().getByRole('group',{name:target.name,exact:true}).getByLabel('تعداد در بسته',{exact:true}).inputValue(),'3')
 assert.equal((await db.productBundle.findUniqueOrThrow({where:{id:bundleId}})).name,'بسته آزمایشی')
 let variantPhase='error',releaseVariants;const variantHold=new Promise(resolve=>{releaseVariants=resolve})
 await page.route('**/api/admin/products/relationship-items?variants=1**',async route=>{if(variantPhase==='error')await route.fulfill({status:503,contentType:'application/json',body:'{"error":"injected variant lookup"}'});else{await variantHold;await route.continue()}})
 await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('row').filter({hasText:source.name}).getByRole('button',{name:'ویرایش',exact:true}).click();await region.getByRole('alert').filter({hasText:'دریافت گونه‌های محصول ناموفق بود.'}).first().waitFor()
 variantPhase='hold';await region.getByRole('button',{name:'تلاش دوباره برای گونه‌ها',exact:true}).first().click();await region.getByRole('status').filter({hasText:'در حال دریافت گونه‌های محصول…'}).first().waitFor();releaseVariants()
 await region.getByRole('group',{name:target.name,exact:true}).first().getByLabel('گونهٔ ثابت بسته',{exact:true}).waitFor();await region.getByRole('button',{name:'تلاش دوباره برای گونه‌ها',exact:true}).first().click();await region.getByRole('status').filter({hasText:'در حال دریافت گونه‌های محصول…'}).first().waitFor({state:'hidden'});await page.unroute('**/api/admin/products/relationship-items?variants=1**')
 await region.screenshot({path:'.mobocom/product-bundles-editor.png'})
 await accessibility(region)
 await context.addCookies([{name:'next-auth.session-token',value:userToken,url:base}])
 for(const theme of ['dark','light'])for(const width of [390,1440]){
  await context.addCookies([{name:'theme',value:theme,url:base}]);await page.setViewportSize({width,height:900});await page.goto(base+`/products/${source.slug}`,{waitUntil:'domcontentloaded',timeout:60000})
  const publicRegion=page.getByRole('region',{name:'بسته‌های قابل خرید',exact:true});await publicRegion.getByRole('heading',{name:'بسته آزمایشی',exact:true}).waitFor()
  assert.equal(await publicRegion.getByRole('article').count(),2);assert.ok(await publicRegion.getByText('Alternate variant',{exact:false}).count())
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${theme}/${width} overflow`);await publicRegion.screenshot({path:`.mobocom/product-bundles-${theme}-${width}.png`})
  await accessibility(publicRegion)
 }
 // Clear only this fixture owner's cart through its normal API, then exercise the actual buy button.
 await page.request.delete(base+'/api/cart');await page.getByRole('article',{name:'بسته آزمایشی',exact:true}).getByRole('button',{name:'افزودن بسته به سبد',exact:true}).click()
 await page.getByRole('status').filter({hasText:'همهٔ اجزای بسته به سبد اضافه شدند.'}).waitFor();await page.getByRole('link',{name:'مشاهدهٔ سبد',exact:true}).click();await page.waitForURL('**/cart')
 const actual=await(await page.request.get(base+'/api/cart')).json();assert.equal(actual.cart.itemsTotal,10);assert.deepEqual(actual.cart.lines.map(l=>l.quantity),[1,3]);assert.equal(actual.cart.lines[1].variantId,alternate.id)
 await page.getByText('Alternate variant',{exact:false}).first().waitFor()
 // New panel states are verified independently of the existing tabs.
 let phase='error',release;const hold=new Promise(resolve=>{release=resolve})
 await page.route('**/api/products/*/bundles',async route=>{if(phase==='error')await route.fulfill({status:503,contentType:'application/json',body:'{"error":"injected unavailable"}'});else{await hold;await route.continue()}})
 await page.goto(base+`/products/${source.slug}`,{waitUntil:'domcontentloaded',timeout:60000});await page.getByRole('alert').filter({hasText:'دریافت بسته‌ها ناموفق بود.'}).waitFor()
 phase='hold';await page.getByRole('button',{name:'تلاش دوباره',exact:true}).click();await page.getByRole('status').filter({hasText:'در حال دریافت بسته‌ها…'}).waitFor();release()
 await page.getByRole('heading',{name:'بسته آزمایشی',exact:true}).waitFor();await page.unroute('**/api/products/*/bundles')
 await page.route('**/api/cart',async route=>route.request().method()==='POST'?route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'بسته کامل موجود نیست',code:'QUANTITY_LIMIT'})}):route.continue())
 await page.getByRole('article',{name:'بسته آزمایشی',exact:true}).getByRole('button',{name:'افزودن بسته به سبد',exact:true}).click();await page.getByRole('alert').filter({hasText:'بسته کامل موجود نیست'}).waitFor();await page.getByRole('heading',{name:'بسته آزمایشی',exact:true}).waitFor();assert.ok(await page.getByRole('alert').filter({hasText:'بسته کامل موجود نیست'}).isVisible(),'cart failure remains visible after availability refresh')
 await page.unroute('**/api/cart')
 await db.productBundle.updateMany({where:{productId:source.id},data:{active:false}});await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('region',{name:'بسته‌های قابل خرید',exact:true}).waitFor({state:'hidden'});await db.productBundle.updateMany({where:{productId:source.id},data:{active:true}})
 await browser.close();browser=undefined
 console.log('Actual Admin rollout save/reload and bundle create/search/variant/quantity/save/reload, RTL dark/light390/1440 product display/overflow, buy/cart totals, panel error/loading/retry/empty and persistent cart failure checks passed'+(process.env.BUNDLE_AXE?'; five scoped axe WCAG checks passed':''))
}
function load(file){const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText)(name=>{
 if(name==='@/platform/database/prisma')return{db}
 if(name==='@/modules/catalog/server/storefront')return{isStoreEnabled:async()=>true}
 if(name==='@/modules/store/server/catalog')return{getStoreSettings:async()=>({showProductBundles:true})}
 if(name==='@/modules/membership/server/membership')return{isMember:async()=>false}
 if(name==='@/modules/shipping/server/shipping'||name==='@/modules/shipping/server/carriers'||name==='@/modules/shipping/domain/shipping')return{}
 if(name.startsWith('@/')){const base=`src/${name.slice(2)}`;return load(fs.existsSync(base+'.ts')?base+'.ts':base+'/index.ts')}
 return require(name)
},mod,mod.exports);return mod.exports}
(async()=>{
 user=await db.user.create({data:{email:`${seed}@example.invalid`,passwordHash:'test-only'}})
 for(let i=0;i<3;i++)products.push(await db.product.create({data:{slug:`${seed}-${i}`,name:`${seed}-${i}`,price:i+1,priceMinor:BigInt((i+1)*100),currency:'USD',stock:30,approval:i===2?'PENDING':'APPROVED'}}))
 const [source,target,hidden]=products,variant=await db.productVariant.create({data:{productId:target.id,name:'Fixed variant',sku:seed,price:2,priceMinor:200n,stock:30}})
 const definition={name:'Starter',nameEn:'Starter',active:true,components:[{productId:source.id,variantId:null,quantity:1},{productId:target.id,variantId:variant.id,quantity:2}]}
 const catalog=load('src/modules/catalog/server/product-bundles.ts'),store=load('src/modules/store/server/bundles.ts'),carts=load('src/modules/store/server/cart.ts')
 await db.$transaction(tx=>catalog.replaceProductBundles(tx,source.id,[definition]));let saved=await catalog.productBundleDefinitions(source.id);const bundleId=saved[0].id
 const read=await store.readProductBundles(source.id,null);assert.equal(read.items[0].total,5);assert.equal(read.items[0].buyable,true);assert.deepEqual(read.items[0].components.map(c=>c.quantity),[1,2])
 await assert.rejects(db.$transaction(tx=>catalog.replaceProductBundles(tx,source.id,[{...definition,id:bundleId,components:[definition.components[0],{productId:hidden.id,variantId:null,quantity:1}]}])),/public product/)
 assert.equal(await db.productBundleComponent.count({where:{bundleId}}),2)
 await assert.rejects(db.$transaction(tx=>catalog.replaceProductBundles(tx,target.id,[{...definition,id:bundleId}])),/belong/)
 await db.$transaction(tx=>catalog.replaceProductBundles(tx,source.id,[{...definition,id:bundleId,name:'Updated'}]));assert.equal((await catalog.productBundleDefinitions(source.id))[0].id,bundleId)
 cart=await db.cart.create({data:{userId:user.id,token:seed}});const owner={userId:user.id,token:null}
 await store.addProductBundle(owner,bundleId);assert.deepEqual((await db.cartLine.findMany({where:{cartId:cart.id},orderBy:{productId:'asc'}})).map(l=>l.quantity),[1,2])
 await db.productVariant.update({where:{id:variant.id},data:{stock:2}})
 const before=await db.cart.findUniqueOrThrow({where:{id:cart.id}})
 await assert.rejects(store.addProductBundle(owner,bundleId),e=>e.code==='QUANTITY_LIMIT')
 assert.deepEqual((await db.cartLine.findMany({where:{cartId:cart.id},orderBy:{productId:'asc'}})).map(l=>l.quantity),[1,2]);assert.equal((await db.cart.findUniqueOrThrow({where:{id:cart.id}})).updatedAt.getTime(),before.updatedAt.getTime())
 await db.productVariant.update({where:{id:variant.id},data:{stock:30}});await carts.clearCart(owner)
 await Promise.all(Array.from({length:3},()=>store.addProductBundle(owner,bundleId)))
 assert.deepEqual((await db.cartLine.findMany({where:{cartId:cart.id},orderBy:{productId:'asc'}})).map(l=>l.quantity),[3,6])
 await db.product.update({where:{id:target.id},data:{currency:'IRT'}});await assert.rejects(store.addProductBundle(owner,bundleId),e=>e.code==='BUNDLE_NOT_FOUND');await db.product.update({where:{id:target.id},data:{currency:'USD',access:'MEMBERS'}})
 await assert.rejects(store.addProductBundle(owner,bundleId),e=>e.code==='MEMBERS_ONLY');await db.product.update({where:{id:target.id},data:{access:'PUBLIC',active:false}})
 await db.$transaction(tx=>catalog.replaceProductBundles(tx,source.id,[{...definition,id:bundleId}]));assert.deepEqual((await store.readProductBundles(source.id,null)).items,[])
 await db.product.update({where:{id:target.id},data:{active:true}})
 // Normal order lines/reservation service still reserve every component atomically.
 order=await db.order.create({data:{userId:user.id,productId:source.id,totalAmount:5,totalMinor:500n,currency:'USD'}})
 await db.orderLine.createMany({data:definition.components.map((c,line)=>({orderId:order.id,line,productId:c.productId,variantId:c.variantId,name:seed,quantity:c.quantity,totalMinor:100n}))})
 const inventory=load('src/modules/catalog/server/inventory.ts')
 await db.productVariant.update({where:{id:variant.id},data:{stock:1}});assert.equal((await inventory.reserveInventory({orderId:order.id})).ok,false)
 assert.equal((await db.product.findUniqueOrThrow({where:{id:source.id}})).stock,30,'later component shortage rolls back earlier source hold')
 assert.equal(await db.inventoryReservation.count({where:{orderId:order.id}}),0)
 await db.productVariant.update({where:{id:variant.id},data:{stock:30}});assert.equal((await inventory.reserveInventory({orderId:order.id})).ok,true)
 assert.equal((await db.product.findUniqueOrThrow({where:{id:source.id}})).stock,29);assert.equal((await db.productVariant.findUniqueOrThrow({where:{id:variant.id}})).stock,28)
 await inventory.releaseInventoryReservation(order.id);assert.equal((await db.product.findUniqueOrThrow({where:{id:source.id}})).stock,30)
 if(process.env.BUNDLE_API==='1')await apiChecks(source,target,hidden,variant,definition,bundleId)
 await db.product.delete({where:{id:target.id}});assert.equal((await db.productBundleComponent.findFirstOrThrow({where:{bundleId,productId:null}})).productId,null);assert.deepEqual((await store.readProductBundles(source.id,null)).items,[])
 await assert.rejects(db.productBundleComponent.create({data:{bundleId,productId:source.id,variantKey:999,quantity:0}}))
 console.log('Real PG bundles: fixed variant pricing, owned stable IDs, fresh private rejection/rollback, retained withdrawal, all-or-nothing capped cart/concurrency/membership/currency, canonical inventory hold/release and deleted-target unavailability passed (rollout/membership providers stubbed)')
})().catch(async e=>{console.error(e);process.exitCode=1;if(browser){const page=browser.contexts()[0]?.pages()[0];if(page){await page.screenshot({path:'.mobocom/product-bundles-browser-failure.png',fullPage:true});console.log((await page.locator('section[aria-label="بسته‌های قابل خرید"]').innerText().catch(()=>page.locator('body').innerText())).slice(0,4000))}}}).finally(async()=>{try{await browser?.close();if(settingsRead){const key='store.merchandising.v1';if(settingsBefore)await db.setting.upsert({where:{key},create:{key,value:settingsBefore.value},update:{value:settingsBefore.value}});else await db.setting.deleteMany({where:{key}})}if(order){await load('src/modules/catalog/server/inventory.ts').releaseInventoryReservation(order.id);await db.order.deleteMany({where:{id:order.id}})}if(user)await db.cart.deleteMany({where:{userId:user.id}});if(admin)await db.cart.deleteMany({where:{userId:admin.id}});await db.searchDocument.deleteMany({where:{itemType:'product',itemId:{in:products.map(p=>p.id)}}});await db.product.deleteMany({where:{id:{in:products.map(p=>p.id)}}});if(user)await db.user.deleteMany({where:{id:user.id}});if(admin)await db.user.deleteMany({where:{id:admin.id}})}finally{await db.$disconnect()}})
