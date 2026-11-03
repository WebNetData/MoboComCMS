// Fresh PostgreSQL, real current Identity/permissions, audited prices, wallet checkout, grants and private byte delivery.
// Declared doubles: request-session presentation, module/config availability, external providers, notifications and cache transport.
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict')
const ts=require('typescript-api'),{PrismaClient}=require('@prisma/client'),{encode}=require('next-auth/jwt'),{NextRequest}=require('next/server')
const db=new PrismaClient(),prefix='digital-pricing-'+Date.now(),users=[],groups=[],roles=[],products=[],prompts=[],posts=[],blobs=[],cache=new Map(),checks=[]
const secret=crypto.randomBytes(32).toString('hex');process.env.NEXTAUTH_SECRET=secret;process.env.NEXTAUTH_URL='http://localhost:3000'
let viewerId=0,failAudit=false,membershipOn=true,paywallOn=true,storeOn=true
const wrapped=new Proxy(db,{get(target,key){if(key==='$transaction')return fn=>target.$transaction(tx=>fn(new Proxy(tx,{get(inner,field){if(field==='auditLog'&&failAudit)return{create:async()=>{throw Error('OWNED_AUDIT_FAILURE')}};return typeof inner[field]==='function'?inner[field].bind(inner):inner[field]}})));return typeof target[key]==='function'?target[key].bind(target):target[key]}})
function load(file){if(cache.has(file))return cache.get(file).exports;let source=fs.readFileSync(file,'utf8')
 if(process.env.DIGITAL_PRICING_FAULT==='price'&&file.endsWith('/price-adjustments.ts'))source=source.replace("if (rule.mode === 'FREE') return 0n","if (rule.mode === 'FREE') return regular")
 if(process.env.DIGITAL_PRICING_FAULT==='download'&&file.endsWith('/http/product-files.ts'))source=source.replace('if (!access.open) return reply','if (false) return reply')
 if(process.env.DIGITAL_PRICING_FAULT==='redaction'&&file.endsWith('/prompts/server/queries.ts'))source=source.replace("content: '', example: '', defaults: '{}'","content: row.content, example: row.example, defaults: row.defaults")
 const mod={exports:{}};cache.set(file,mod)
 new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText)(name=>{
  if(name==='@/platform/database/prisma')return{db:wrapped}
  if(name==='next-auth')return{getServerSession:async()=>viewerId?{user:{id:String(viewerId)}}:null}
  if(name==='@/modules/identity/auth')return{authOptions:{}}
  if(name==='@/extensions/server/modules')return{isModuleEnabled:async id=>id==='membership'?membershipOn:id==='paywall'?paywallOn:id==='store'?storeOn:true,moduleGuard:async()=>null,getModuleSettings:async()=>({}),getModuleStates:async()=>Object.fromEntries(['journal','music','cinema','games','software','store','prompt-master','membership','forum'].map(id=>[id,id==='store'?storeOn:id==='membership'?membershipOn:true]))}
  if(name==='@/extensions/server/state')return{getExtensionState:async()=>({settings:{}})}
  if(name==='@/modules/ai/server/generation')return{getAiConfig:async()=>{throw Error('Unexpected AI call')}}
  if(name==='@/platform/cache/kv')return{kv:async()=>({kind:'memory'}),cached:async(k,t,fn)=>fn(),invalidate:async()=>{}}
  if(name==='@/modules/shipping/server/carriers')return{getCarrierSettings:async()=>({enabled:false})}
  if(name==='@/modules/notifications/server/inbox')return{createInboxEvent:async()=>null,invoicePaidEvent:async()=>{}}
  if(name==='@/modules/sms/server/sms')return{notifyAdmins:async()=>{}}
  if(name==='@/modules/automation/server/engine')return{emitAutomation:async()=>{}}
  if(name==='@/modules/referrals/server/referrals')return{awardReferralForInvoice:async()=>{}}
  if(name==='@/extensions/server/runtime')return{emitExtensionEvent:async()=>{}}
  if(name==='@/platform/observability/logger')return{logEvent:()=>{},requestIdFrom:()=>prefix}
  if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?'src/'+name.slice(2):path.posix.join(path.posix.dirname(file),name);for(const candidate of[base,base+'.ts',base+'/index.ts'])if(fs.existsSync(candidate)&&fs.statSync(candidate).isFile())return candidate.endsWith('.json')?JSON.parse(fs.readFileSync(candidate,'utf8')):load(candidate)}return require(name)
 },mod,mod.exports);return mod.exports}
async function request(user,url='/api/admin/paywall',method='GET',body,extra={}){const headers={Origin:'http://localhost:3000',Host:'localhost:3000',...extra};if(user)headers.cookie=`next-auth.session-token=${await encode({secret,token:{uid:String(user.id),authAt:Date.now()}})}`;if(body!==undefined&&!headers['Content-Type'])headers['Content-Type']='application/json';return new NextRequest('http://localhost:3000'+url,{method,headers,...(body!==undefined?{body:typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body)}:{})})}
async function makeUser(kind,role){let roleId=null;if(role){const row=await db.role.create({data:{name:prefix+'-'+kind,permissions:role}});roles.push(row.id);roleId=row.id}const row=await db.user.create({data:{email:prefix+'-'+kind+'@example.invalid',name:kind,passwordHash:'test-only',role:role?'ADMIN':'CUSTOMER',roleId}});users.push(row.id);return row}
const mark=name=>{checks.push(name);console.log('ok '+name)}
async function main(){let nativeFile
 try{
  const admin=await makeUser('admin','cms.products,prompts.manage,cms.posts'),outsider=await makeUser('outsider'),member=await makeUser('member'),vip=await makeUser('vip'),buyer=await makeUser('buyer'),wrong=await makeUser('wrong','music.manage')
  const adminReq=await request(admin)
  for(let i=0;i<2;i++){const row=await db.userGroup.create({data:{name:prefix+'-group'+i}});groups.push(row.id);await db.userGroupMember.create({data:{userId:member.id,groupId:row.id}})}
  await db.userMembership.create({data:{userId:vip.id,startsAt:new Date(0),endsAt:new Date(Date.now()+86400000),source:'owned fixture',dedupeKey:prefix}})
  const p=await db.product.create({data:{slug:prefix,name:prefix,kind:'VIRTUAL',price:250000,priceMinor:250000n,currency:'IRT'}});products.push(p.id)
  const fileOwner=load('src/modules/store/server/product-files.ts'),fileHttp=load('src/modules/store/server/http/product-files.ts'),audience=load('src/modules/account/server/audience-command.ts'),benefits=load('src/modules/account/server/user-groups.ts'),pricing=load('src/modules/store/server/pricing.ts'),pay=load('src/modules/paywall/server/paywall.ts')
  let state=await fileOwner.productFilesSnapshot(p.id)
  const content=Buffer.from('PK\x03\x04 PRIVATE OWNED ARCHIVE '+prefix),url=`/api/admin/store/products/${p.id}/files?revision=${state.revision}`
  const uploaded=await fileHttp.POST_files(await request(admin,url,'POST',content,{'Content-Type':'application/octet-stream','x-file-name':encodeURIComponent(prefix+'.zip')}),String(p.id));assert.equal(uploaded.status,200);const json=await uploaded.json();assert.equal(JSON.stringify(json).includes('storageKey'),false)
  nativeFile=await db.productFile.findFirstOrThrow({where:{productId:p.id}});blobs.push(nativeFile.storageKey)
  state=await fileOwner.productFilesSnapshot(p.id);await fileOwner.writeProductFiles(adminReq,p.id,{action:'delivery',mode:'FILES',revision:state.revision})
  assert.equal((await db.product.findUniqueOrThrow({where:{id:p.id}})).stock,-1)
  mark('private streaming upload and explicit FILES mode, no storage key in metadata')
  viewerId=outsider.id
  const shopQuery=load('src/modules/store/domain/store.ts').parseShopQuery({q:prefix,kind:'VIRTUAL',files:'1'})
  const listingFiles=await load('src/modules/store/server/catalog.ts').shopListing(shopQuery)
  assert.ok(JSON.stringify(listingFiles).includes(prefix),'file-store discovery uses the existing catalogue')
  const policies=[{audience:'vip',mode:'PRICE',value:'100000'},{audience:`group:${groups[0]}`,mode:'PERCENT',value:'20'},{audience:`group:${groups[1]}`,mode:'AMOUNT',value:'70000'}]
  let snap=await audience.audienceSnapshot('product',p.id)
  await audience.saveItemAudience(adminReq,'product',p.id,{groups:[],pricingRules:policies,revision:snap.revision})
  const product=await db.product.findUniqueOrThrow({where:{id:p.id}}),deal=await benefits.groupDeal(member.id,[p.id]);assert.equal(pricing.unitPrice(product,null,false,undefined,deal).unitMinor,180000n);assert.equal(pricing.unitPrice(product,null,true).unitMinor,100000n)
  assert.equal((await fileOwner.productFileAccess(p.id,outsider.id)).open,false)
  let response=await fileHttp.GET_download(await request(outsider,`/api/store/files/${nativeFile.id}`),String(nativeFile.id));assert.equal(response.status,403,'unguarded download mutation must fail here')
  assert.equal((await fileHttp.GET_download(await request(null),String(nativeFile.id))).status,401)
  mark('lowest VIP/two-group pricing without stacking, outsider403 and guest401')
  snap=await audience.audienceSnapshot('product',p.id);failAudit=true;await assert.rejects(()=>audience.saveItemAudience(adminReq,'product',p.id,{groups:[],pricingRules:[],revision:snap.revision}),/OWNED_AUDIT_FAILURE/);failAudit=false;assert.equal((await audience.audienceSnapshot('product',p.id)).revision,snap.revision)
  await assert.rejects(()=>audience.saveItemAudience(adminReq,'product',p.id,{groups:[],pricingRules:policies,revision:'stale'}),e=>e.status===409)
  assert.equal((await fileHttp.POST_files(await request(wrong,'/api/admin/store/products/'+p.id+'/files','POST',{action:'delivery',mode:'MANUAL',revision:state.revision}),String(p.id))).status,403)
  assert.equal((await fileHttp.POST_files(await request(admin,'/api/admin/store/products/'+p.id+'/files','POST',{}, {Origin:'https://foreign.invalid'}),String(p.id))).status,403)
  const beforeFiles=await fsp.readdir(path.resolve('storage/private-media'));state=await fileOwner.productFilesSnapshot(p.id);failAudit=true
  await assert.rejects(async()=>fileHttp.POST_files(await request(admin,`/api/admin/store/products/${p.id}/files?revision=${state.revision}`,'POST',content,{'Content-Type':'application/octet-stream','x-file-name':'orphan.zip'}),String(p.id)),/OWNED_AUDIT_FAILURE/);failAudit=false;assert.deepEqual(await fsp.readdir(path.resolve('storage/private-media')),beforeFiles)
  mark('current permissions, Origin, revision conflicts, price/file audit rollback and orphan cleanup')
  for(const u of[member,buyer])await db.walletAccount.create({data:{userId:u.id,currency:'IRT',balanceMinor:1000000n}})
  const checkout=load('src/modules/checkout/server/checkout.ts'),args={userId:member.id,productId:p.id,payWith:'wallet',idempotencyKey:prefix+'-file',expectedQuote:{amountMinor:'180000',currency:'IRT'}}
  assert.equal((await checkout.executeCheckout({...args,expectedQuote:{amountMinor:'179999',currency:'IRT'}})).code,'PRICE_CHANGED')
  assert.equal(await db.order.count({where:{userId:member.id}}),0)
  const paid=await checkout.executeCheckout(args);assert.equal(paid.ok,true,JSON.stringify(paid));assert.equal((await db.invoice.findUniqueOrThrow({where:{orderId:paid.data.orderId}})).totalMinor,180000n)
  assert.equal((await db.walletAccount.findUniqueOrThrow({where:{userId_currency:{userId:member.id,currency:'IRT'}}})).balanceMinor,820000n)
  assert.equal((await checkout.executeCheckout(args)).data.orderId,paid.data.orderId)
  viewerId=member.id;response=await fileHttp.GET_download(await request(member,'/api/store/files/'+nativeFile.id),String(nativeFile.id));assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),content);assert.equal(response.headers.get('cache-control'),'private, no-store')
  response=await fileHttp.GET_download(await request(member,'/api/store/files/'+nativeFile.id,'GET',undefined,{range:'bytes=1-4'}),String(nativeFile.id));assert.equal(response.status,206);assert.deepEqual(Buffer.from(await response.arrayBuffer()),content.subarray(1,5))
  assert.equal((await fileHttp.GET_download(await request(member,'/api/store/files/'+nativeFile.id,'GET',undefined,{range:'bytes=999999-'}),String(nativeFile.id))).status,416)
  mark('real wallet/invoice/idempotency, changed-price rejection before writes, private full/range bytes')
  await db.invoice.updateMany({where:{orderId:paid.data.orderId,status:'PAID'},data:{status:'REFUNDED'}});await db.order.updateMany({where:{id:paid.data.orderId,status:'PAID'},data:{status:'REFUNDED'}})
  assert.equal((await fileHttp.GET_download(await request(member),String(nativeFile.id))).status,403)
  snap=await audience.audienceSnapshot('product',p.id);await audience.saveItemAudience(adminReq,'product',p.id,{groups:[],pricingRules:[{audience:`group:${groups[1]}`,mode:'FREE',value:''}],revision:snap.revision})
  assert.equal((await fileOwner.productFileAccess(p.id,member.id)).reason,'free');await db.userGroupMember.updateMany({where:{userId:member.id},data:{expiresAt:new Date(0)}})
  assert.equal((await fileOwner.productFileAccess(p.id,member.id)).open,false)
  membershipOn=false;assert.equal((await fileOwner.productFileAccess(p.id,vip.id)).open,false);membershipOn=true
  storeOn=false;assert.equal(await fileOwner.productFileAccess(p.id,member.id),null);storeOn=true
  mark('refund closes paid file access; free membership expires; module-off denies download')
  const prompt=await db.promptTemplate.create({data:{slug:prefix,title:prefix,content:'SENSITIVE PROMPT '+prefix+' {{idea}}',example:'SENSITIVE EXAMPLE '+prefix,defaults:JSON.stringify({role:'SENSITIVE ROLE '+prefix}),status:'PUBLISHED',publishedAt:new Date(0)}});prompts.push(prompt.id)
  let panel=await pay.getPaidItem('prompt',prompt.id)
  await pay.savePaidItem('prompt',prompt.id,{price:'85000',currency:'IRT',vipAccess:'NONE',pricingRules:[{audience:'vip',mode:'FREE',value:''},{audience:`group:${groups[0]}`,mode:'PERCENT',value:'20'}],revision:panel.revision},{req:adminReq,permissions:['prompts.manage']})
  const query=load('src/modules/prompts/server/queries.ts');viewerId=outsider.id
  let entry=await query.templateBySlug(prompt.slug);assert.equal(entry.content,'');assert.equal(entry.example,'');assert.equal(entry.defaults,'{}');assert.equal(entry.paywall.open,false)
  const listing=await query.templateDirectory({q:prefix});assert.equal(listing.templates.find(row=>row.id===prompt.id).content,'')
  await assert.rejects(async()=>load('src/modules/prompts/server/generation.ts').generatePrompt(await request(outsider),{idea:'A detailed product photograph for a campaign',kind:'TEXT',templateSlug:prompt.slug}),e=>e.status===402)
  viewerId=vip.id;assert.ok((await query.templateBySlug(prompt.slug)).content.includes('SENSITIVE PROMPT'))
  viewerId=buyer.id
  const quote=await pay.quoteContent({ownerType:'prompt',ownerId:prompt.id},{userId:buyer.id,member:false});assert.equal(quote.amountMinor,85000n)
  const contentPaid=await checkout.executeCheckout({userId:buyer.id,contentKey:'prompt:'+prompt.id,payWith:'wallet',idempotencyKey:prefix+'-prompt',expectedQuote:{amountMinor:'85000',currency:'IRT'}});assert.equal(contentPaid.ok,true,JSON.stringify(contentPaid))
  await pay.fulfillContentOrder(contentPaid.data.orderId);await pay.fulfillContentOrder(contentPaid.data.orderId)
  assert.equal(await db.contentPurchase.count({where:{userId:buyer.id,ownerType:'prompt',ownerId:prompt.id}}),1)
  assert.ok((await query.templateBySlug(prompt.slug)).content.includes('SENSITIVE PROMPT'));assert.ok((await pay.myPurchases(buyer.id)).some(row=>row.url==='/prompts/templates/'+prompt.slug))
  mark('paid Prompt source/default/example redaction across list/detail/generation, VIP free, wallet purchase and library')
  await db.invoice.updateMany({where:{orderId:contentPaid.data.orderId,status:'PAID'},data:{status:'REFUNDED'}});await db.order.updateMany({where:{id:contentPaid.data.orderId,status:'PAID'},data:{status:'REFUNDED'}})
  assert.equal((await query.templateBySlug(prompt.slug)).content,'');assert.equal((await pay.purchasePreview(buyer.id)).total,0)
  const repaid=await checkout.executeCheckout({userId:buyer.id,contentKey:'prompt:'+prompt.id,payWith:'wallet',idempotencyKey:prefix+'-prompt-again'});assert.equal(repaid.ok,true,JSON.stringify(repaid));await pay.fulfillContentOrder(repaid.data.orderId)
  assert.ok((await query.templateBySlug(prompt.slug)).content.includes('SENSITIVE PROMPT'));assert.equal((await db.contentPurchase.findFirstOrThrow({where:{userId:buyer.id,ownerType:'prompt',ownerId:prompt.id}})).orderId,repaid.data.orderId)
  mark('stored refunded content order closes access and library count; repurchase restores the same canonical grant')
  panel=await pay.getPaidItem('prompt',prompt.id);failAudit=true;await assert.rejects(()=>pay.savePaidItem('prompt',prompt.id,{price:'90000',currency:'IRT',vipAccess:'NONE',pricingRules:[],revision:panel.revision},{req:adminReq,permissions:['prompts.manage']}),/OWNED_AUDIT_FAILURE/);failAudit=false;assert.equal((await pay.getPaidItem('prompt',prompt.id)).revision,panel.revision)
  const paidHttp=load('src/modules/paywall/server/http/paywall.ts')
  assert.equal((await paidHttp.PUT(await request(wrong,'/api/admin/paywall','PUT',{ownerType:'prompt',ownerId:prompt.id,price:'5'}))).status,403)
  assert.equal((await paidHttp.PUT(await request(admin,'/api/admin/paywall','PUT',{}, {Origin:'https://foreign.invalid'}))).status,403)
  const grant=await db.contentPurchase.findFirstOrThrow({where:{userId:buyer.id,ownerType:'prompt',ownerId:prompt.id}});await pay.revokePurchase(grant.id);assert.equal((await query.templateBySlug(prompt.slug)).content,'')
  mark('section-only pricing permission, strict audited price rollback, current grant revocation')
  console.log('PASS digital-content-pricing '+checks.length+' connected scenarios; no external provider invoked')
 } finally {
  failAudit=false;viewerId=0
  const orderIds=(await db.order.findMany({where:{userId:{in:users}},select:{id:true}})).map(row=>row.id)
  await db.auditLog.deleteMany({where:{actorUserId:{in:users}}});await db.contentPurchase.deleteMany({where:{userId:{in:users}}});await db.paidItem.deleteMany({where:{OR:[{ownerType:'prompt',ownerId:{in:prompts}},{ownerType:'post',ownerId:{in:posts}}]}})
  await db.fulfillmentJob.deleteMany({where:{orderId:{in:orderIds}}});await db.payment.deleteMany({where:{userId:{in:users}}});await db.walletTx.deleteMany({where:{userId:{in:users}}});await db.invoice.deleteMany({where:{userId:{in:users}}});await db.inventoryReservation.deleteMany({where:{orderId:{in:orderIds}}});await db.order.deleteMany({where:{userId:{in:users}}})
  await db.productFile.deleteMany({where:{productId:{in:products}}});await db.product.deleteMany({where:{id:{in:products}}});await db.promptTemplate.deleteMany({where:{id:{in:prompts}}});await db.post.deleteMany({where:{id:{in:posts}}});await db.userGroup.deleteMany({where:{id:{in:groups}}});await db.user.deleteMany({where:{id:{in:users}}});await db.role.deleteMany({where:{id:{in:roles}}})
  const media=load('src/modules/media/server/private-files.ts');for(const key of blobs)await media.discardPrivateFile(key);await db.$disconnect()
 }
}
main().catch(error=>{console.error(error);process.exitCode=1})
