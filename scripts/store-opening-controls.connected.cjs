const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server')
assert(/test|check/i.test(new URL(process.env.DATABASE_URL).pathname),'disposable database required')
const db=new PrismaClient(),stamp='opening-'+Date.now(),users=[],products=[],orderIds=[]
let viewer=null,pauseAtTransaction=false,transactionIntercepted=false
const key='store.merchandising.v1',prior=db.setting.findUnique({where:{key}})
const wrapped=new Proxy(db,{get(target,property){if(property==='$transaction')return async(work,options)=>{if(pauseAtTransaction&&typeof work==='function'){pauseAtTransaction=false;transactionIntercepted=true;await setPaused(true)}return target.$transaction(work,options)};return target[property]}})
const load=require('./connected-source-loader.cjs')({
 '@/platform/database/prisma':{db:wrapped},react:{...require('react'),cache:fn=>fn},'next-auth/jwt':{getToken:async()=>viewer?{uid:String(viewer.id),authAt:Date.now()}:null},
 '@/extensions/server/modules':{isModuleEnabled:async()=>true,moduleGuard:async()=>null},'@/extensions/server/runtime':{emitExtensionEvent:async()=>{}},
 '@/modules/catalog/server/storefront':{isStoreEnabled:async()=>true},'@/modules/account/server/section-access':{userOpensSection:async()=>true},
 '@/modules/account/server/item-audience':{userOpensAudience:async raw=>!raw},'@/modules/account/server/user-groups':{groupDeal:async()=>({percent:0,prices:new Map()})},
 '@/modules/membership/server/membership':{isMember:async()=>false,opensMembersOnly:async()=>true},'@/modules/membership/server/tiers':{tierStanding:async()=>null},'@/modules/membership/server/rules':{ruleRefusal:async()=>null},
})
const checkout=load('src/modules/checkout/server/checkout.ts'),acceptance=load('src/modules/store/server/order-acceptance.ts'),settingsApi=load('src/modules/store/server/http/routes.ts'),money=load('src/shared/money/index.ts'),shipping=load('src/modules/shipping/domain/shipping.ts')
async function setPaused(paused,notice='توقف آزمایشی ثبت سفارش'){await db.setting.upsert({where:{key},create:{key,value:JSON.stringify({ordersPaused:paused,orderPauseNotice:notice})},update:{value:JSON.stringify({ordersPaused:paused,orderPauseNotice:notice})}})}
const req=(method,body,revision)=>new NextRequest('http://localhost/api/admin/store/settings',{method,headers:{Origin:'http://localhost','Content-Type':'application/json',...(revision?{'If-Match':revision}:{})},...(method==='GET'?{}:{body:JSON.stringify(body)})})
async function main(){
 await prior
 const customer=await db.user.create({data:{email:stamp+'@example.invalid',role:'CUSTOMER',passwordHash:'!'}});users.push(customer.id)
 const staff=await db.user.create({data:{email:stamp+'staff@example.invalid',role:'ADMIN',passwordHash:'!'}});users.push(staff.id)
 const p=await db.product.create({data:{slug:stamp,name:stamp,currency:'IRT',price:100,priceMinor:100n,stock:5,kind:'VIRTUAL',active:true,approval:'APPROVED'}});products.push(p.id)
 const command={userId:customer.id,productId:p.id,payWith:'wallet',idempotencyKey:randomUUID(),siteUrl:'http://localhost'}
 await setPaused(true);const paused=await checkout.executeCheckout(command);assert.equal(paused.code,'STORE_ORDERS_PAUSED');assert.equal(await db.order.count({where:{userId:customer.id}}),0);assert.equal((await db.product.findUniqueOrThrow({where:{id:p.id}})).stock,5)
 const old=await db.order.create({data:{userId:customer.id,productId:p.id,idempotencyKey:randomUUID(),totalAmount:100,totalMinor:100n,currency:'IRT',status:'PENDING'}});orderIds.push(old.id)
 const replay=await checkout.executeCheckout({...command,idempotencyKey:old.idempotencyKey});assert(replay.ok&&replay.data.replayed,'existing order remains retrievable during pause')
 await db.walletAccount.create({data:{userId:customer.id,currency:'IRT',balanceMinor:1000n}})
 await setPaused(false);await acceptance.assertStoreAcceptsOrders();pauseAtTransaction=true
 const raced=await checkout.executeCheckout({...command,idempotencyKey:randomUUID()});assert(transactionIntercepted);assert.equal(raced.code,'STORE_ORDERS_PAUSED','pause rechecked before order transaction writes');assert.equal(await db.order.count({where:{userId:customer.id}}),1);assert.equal((await db.walletAccount.findUniqueOrThrow({where:{userId_currency:{userId:customer.id,currency:'IRT'}}})).balanceMinor,1000n)
 viewer=staff;const initial=await(await settingsApi.GET_storeSettings(req('GET'))).json();const saved=await settingsApi.POST_storeSettings(req('POST',{ordersPaused:false,servicePromises:[{icon:'truck',title:'ارسال مالک',text:'زمان مورد تأیید'}]},initial.settingsRevision));assert.equal(saved.status,200);const next=await saved.json();assert.equal(next.settings.ordersPaused,false);assert.deepEqual(next.settings.servicePromises,[{icon:'truck',title:'ارسال مالک',text:'زمان مورد تأیید'}]);assert.equal((await settingsApi.POST_storeSettings(req('POST',{ordersPaused:true},initial.settingsRevision))).status,409)
 viewer=customer;assert.equal((await settingsApi.POST_storeSettings(req('POST',{ordersPaused:true}))).status,403)
 for(const value of ['12.34','۱۲٫۳۴','١٢.٣٤'])assert.equal(money.toMinor(value,'USD'),1234n)
 assert.throws(()=>money.toMinor('۱۲٫۳۴۵','USD'));assert.throws(()=>money.toMinor('۱,۲','USD'))
 assert.throws(()=>shipping.validateAddress({recipient:'مشتری تست',mobile:'123'}),error=>error.field==='mobile')
 console.log('Opening controls PostgreSQL passed: initial/transaction pause refusal without money/stock writes, old replay, revisioned settings/permissions and exact localized money/address fields')
}
main().finally(async()=>{const before=await prior;if(before)await db.setting.upsert({where:{key},create:before,update:{value:before.value}});else await db.setting.deleteMany({where:{key}});await db.contentRevision.deleteMany({where:{entityType:'settings-storefront',actorId:{in:users}}});await db.auditLog.deleteMany({where:{actorUserId:{in:users}}});await db.order.deleteMany({where:{id:{in:orderIds}}});await db.walletAccount.deleteMany({where:{userId:{in:users}}});await db.product.deleteMany({where:{id:{in:products}}});await db.user.deleteMany({where:{id:{in:users}}});await db.$disconnect()}).catch(error=>{console.error(error);process.exitCode=1})
