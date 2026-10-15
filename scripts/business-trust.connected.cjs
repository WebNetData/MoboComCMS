// Real PostgreSQL/current canonical guards, private files and expected-state decisions.
const assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),ts=require('typescript')
const {PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server')
const prisma=new PrismaClient(),repo=process.cwd(),stamp=`owned-business-trust-${Date.now()}`,cache=new Map(),snapshots=new Map(),users=[],roles=[],profiles=[],orders=[],sellers=[]
let actor=null,auditFault=false,temp
const authAt=Date.now()-5000
function wrap(target){return new Proxy(target,{get(target,key){if(key==='$transaction')return(work,options)=>target.$transaction(tx=>work(wrap(tx)),options);if(key==='auditLog')return new Proxy(target[key],{get(model,method){if(method==='create')return args=>{if(auditFault)throw Error('owned audit failure');return model.create(args)};return typeof model[method]==='function'?model[method].bind(model):model[method]}});return typeof target[key]==='function'?target[key].bind(target):target[key]}})}
const db=wrap(prisma),manifests=['businesses','reviews'].map(id=>require(path.join(repo,`src/plugins/${id}/manifest.json`)))
const mocks={
 '@/platform/database/prisma':{db},'next-auth/jwt':{getToken:async()=>actor?{uid:actor.id,authAt}:null},'@/platform/config/env':{authSecret:()=> 'owned fixture secret'},
 '@/extensions/generated/catalog':{extensionCatalog:manifests,extensionById:new Map(manifests.map(m=>[m.id,m])),extensionPermissionIds:['businesses.manage','reviews.moderate']},
 '@/themes/generated/catalog':{codeThemeCatalog:[]},'@/themes/registry':{bundledThemes:[]},react:{cache:fn=>fn},
 '@/modules/catalog/server/storefront':{isStoreEnabled:async()=>false},'@/modules/public-api/server/availability':{isPublicApiEnabled:async()=>false},
 '@/platform/observability/logger':{logEvent:()=>{},requestIdFrom:()=>stamp},'@/platform/cache/kv':{cached:async(key,ttl,work)=>work(),invalidate:async()=>{}},
}
function load(relative){const file=path.resolve(repo,relative);if(cache.has(file))return cache.get(file).exports;const mod={exports:{}};cache.set(file,mod);new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>{
 if(Object.hasOwn(mocks,name))return mocks[name]
 if(name==='@/modules/reviews/server/reviews')return load('src/modules/reviews/server/business-experiences.ts')
 if(name==='@/modules/marketplace/server/marketplace')return load('src/modules/marketplace/server/marketplace/reviews.ts')
 if(name==='@/modules/community/server/community')return load('src/modules/community/server/review-reports.ts')
 if(name.startsWith('@/')&&name.endsWith('.cjs'))return require(path.resolve(repo,'src',name.slice(2)))
 if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?path.resolve(repo,'src',name.slice(2)):path.resolve(path.dirname(file),name);return load(fs.existsSync(base+'.ts')?base+'.ts':path.join(base,'index.ts'))}
 return require(name)
},mod,mod.exports);return mod.exports}
const setting=(key,value)=>prisma.setting.upsert({where:{key},create:{key,value},update:{value}})
const req=new NextRequest('http://localhost:3000/api/businesses',{method:'POST',headers:{origin:'http://localhost:3000'}})
const denied=(work,status)=>assert.rejects(work,error=>error.status===status)
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2z8AAAAASUVORK5CYII=','base64')
async function main(){
 try{
  temp=await fsp.mkdtemp(path.join(os.tmpdir(),stamp));process.chdir(temp)
  for(const key of ['extension.businesses.state.v1','extension.reviews.state.v1','security.policy.v1'])snapshots.set(key,await prisma.setting.findUnique({where:{key}}))
  await setting('extension.businesses.state.v1','{"enabled":true,"settings":{}}');await setting('extension.reviews.state.v1','{"enabled":true,"settings":{}}');await setting('security.policy.v1','{"requireAdmin2fa":false}')
  for(const permissions of ['businesses.manage','reviews.moderate'])roles.push(await prisma.role.create({data:{name:`${stamp}-${roles.length}`,permissions}}))
  for(const [name,roleId]of [['owner',null],['reporter',null],['other',null],['manager',roles[0].id],['wrong-section',roles[1].id],['representative',null]])users.push(await prisma.user.create({data:{email:`${stamp}-${name}@example.invalid`,name,passwordHash:'owned fixture',...(roleId?{role:'ADMIN',roleId}:{})}}))
  const [owner,reporter,other,manager,wrong,representative]=users
  const business=await prisma.businessProfile.create({data:{name:stamp,slug:stamp,kind:'EXTERNAL',domain:`${stamp}.example`,website:`https://${stamp}.example`,status:'PUBLISHED',representativeId:representative.id}});profiles.push(business)
  const second=await prisma.businessProfile.create({data:{name:stamp+'-other',slug:stamp+'-other',kind:'EXTERNAL',domain:`${stamp}-other.example`,website:`https://${stamp}-other.example`,status:'PUBLISHED'}});profiles.push(second)
  const review=await prisma.itemReview.create({data:{itemType:'business',itemId:business.id,userId:owner.id,rating:4,body:'An actual external buying experience with enough detail.',status:'APPROVED',scores:{create:{key:'support',score:4}}}})
  const files=load('src/shared/files/private-images.ts'),proofs=load('src/modules/businesses/server/proofs.ts'),reports=load('src/modules/businesses/server/reports.ts'),queries={...load('src/modules/businesses/server/trust-queries.ts'),...load('src/modules/businesses/server/trust-admin.ts')},http=load('src/modules/businesses/server/proof-http.ts'),experiences=load('src/modules/businesses/server/experiences.ts')
  const input={businessId:business.id,reviewId:review.id},image=()=>files.preparePrivateImage(new File([png],'../private-receipt.png',{type:'text/plain'}))
  await denied(()=>files.preparePrivateImage(new File(['<script>evil()</script>'],'receipt.png',{type:'image/png'})),400)
  await denied(()=>files.readPrivateImage('business-proofs','../../outside.png'),404)
  actor=other;await denied(async()=>proofs.submitPurchaseProof(req,input,await image()),403)
  actor=owner;const proof=await proofs.submitPurchaseProof(req,{...input,status:'APPROVED',verified:'PURCHASE'},await image())
  assert.equal(proof.status,'PENDING');assert.equal((await queries.reviewedPurchaseProofs([review.id])).size,0)
  await denied(async()=>proofs.submitPurchaseProof(req,input,await image()),409)
  assert.deepEqual((await proofs.privatePurchaseProof(req,proof.id)).bytes,png)
  const download=await http.GET_proof(req,{params:Promise.resolve({id:String(proof.id)})});assert.equal(download.status,200);assert.equal(download.headers.get('cache-control'),'private, no-store');assert.equal(download.headers.get('x-content-type-options'),'nosniff');assert.match(download.headers.get('content-disposition'),/^attachment;/)
  for(const user of [null,other,representative,wrong]){actor=user;await denied(()=>proofs.privatePurchaseProof(req,proof.id),user?404:401)}
  actor=manager;assert.deepEqual((await proofs.privatePurchaseProof(req,proof.id)).bytes,png)
  const approval={proofId:proof.id,decision:'APPROVED',decisionNote:'The image and the external buying experience were independently matched.'}
  await denied(()=>proofs.decidePurchaseProof(req,approval),400)
  actor=wrong;await denied(()=>proofs.decidePurchaseProof(req,{...approval,acknowledgeProof:true}),403)
  await prisma.user.update({where:{id:owner.id},data:{role:'ADMIN',roleId:roles[0].id}});actor=owner
  await denied(()=>proofs.decidePurchaseProof(req,{...approval,acknowledgeProof:true}),403)
  await prisma.user.update({where:{id:owner.id},data:{role:'CUSTOMER',roleId:null}})
  actor=manager;auditFault=true;await assert.rejects(proofs.decidePurchaseProof(req,{...approval,acknowledgeProof:true}),/owned audit failure/);auditFault=false
  assert.equal((await prisma.businessPurchaseProof.findUniqueOrThrow({where:{id:proof.id}})).status,'PENDING')
  await proofs.decidePurchaseProof(req,{...approval,acknowledgeProof:true});assert.ok((await queries.reviewedPurchaseProofs([review.id])).has(review.id));await denied(()=>proofs.decidePurchaseProof(req,{...approval,acknowledgeProof:true}),409)
  assert.equal((await queries.reviewedPurchaseProofs([review.id],new Map([[review.id,'0'.repeat(64)]]))).size,0,'a stale displayed projection cannot borrow a badge from another current version')
  actor=owner;await experiences.submitBusinessExperience(req,{...input,rating:4,body:review.body,scores:{support:4}});assert.ok((await queries.reviewedPurchaseProofs([review.id])).has(review.id),'identical retry preserves reviewed fact')
  actor=representative;await experiences.respondToBusinessExperience(req,{...input,reply:'A sufficiently detailed representative response.'});assert.ok((await queries.reviewedPurchaseProofs([review.id])).has(review.id),'representative reply preserves proof')
  actor=reporter;const reportInput={...input,reason:'ABUSE',note:'This visible experience needs an independent moderation review.'}
  const [a,b]=await Promise.all([reports.reportBusinessExperience(req,reportInput),reports.reportBusinessExperience(req,reportInput)]);assert.ok(a.duplicate!==b.duplicate)
  assert.equal(await prisma.communityReport.count({where:{businessId:business.id,status:'OPEN'}}),1);assert.equal((await prisma.itemReview.findUniqueOrThrow({where:{id:review.id}})).status,'APPROVED','reporting does not hide negative reviews')
  const report=await prisma.communityReport.findFirstOrThrow({where:{businessId:business.id,status:'OPEN'}})
  const generic=load('src/modules/community/server/admin.ts');await denied(()=>generic.resolveReport(report.id,'resolve',manager.id,true),404)
  const decision={reportId:report.id,decision:'RESOLVED',decisionNote:'Independent review completed without a visibility change.'}
  actor=wrong;await denied(()=>reports.decideBusinessReport(req,decision),403)
  await prisma.user.update({where:{id:reporter.id},data:{role:'ADMIN',roleId:roles[0].id}});actor=reporter;await denied(()=>reports.decideBusinessReport(req,decision),403);await prisma.user.update({where:{id:reporter.id},data:{role:'CUSTOMER',roleId:null}})
  actor=manager;auditFault=true;await assert.rejects(reports.decideBusinessReport(req,decision),/owned audit failure/);auditFault=false;assert.equal((await prisma.communityReport.findUniqueOrThrow({where:{id:report.id}})).status,'OPEN')
  await reports.decideBusinessReport(req,decision);await denied(()=>reports.decideBusinessReport(req,decision),409);assert.equal((await prisma.itemReview.findUniqueOrThrow({where:{id:review.id}})).status,'APPROVED')
  actor=reporter;await reports.reportBusinessExperience(req,reportInput);const stale=await prisma.communityReport.findFirstOrThrow({where:{businessId:business.id,status:'OPEN'}})
  actor=owner;await experiences.submitBusinessExperience(req,{...input,rating:3,body:review.body+' The author changed this after the report.',scores:{support:3}})
  actor=manager;await experiences.decideBusinessExperience(req,{...input,action:'approve'});assert.equal((await queries.reviewedPurchaseProofs([review.id])).size,0,'real edit invalidates proof after re-publication')
  await denied(()=>reports.decideBusinessReport(req,{...decision,reportId:stale.id,hide:true}),409)
  await reports.decideBusinessReport(req,{...decision,reportId:stale.id,decision:'DISMISSED'})
  actor=owner;const staleProof=await proofs.submitPurchaseProof(req,input,await image());await experiences.submitBusinessExperience(req,{...input,rating:2,body:review.body+' Changed after the receipt submission.',scores:{support:2}})
  actor=manager;await denied(()=>proofs.decidePurchaseProof(req,{...approval,proofId:staleProof.id,acknowledgeProof:true}),409)
  await proofs.decidePurchaseProof(req,{...approval,proofId:staleProof.id,decision:'REJECTED'});await experiences.decideBusinessExperience(req,{...input,action:'approve'})
  actor=owner;const finalProof=await proofs.submitPurchaseProof(req,input,await image());actor=manager;await proofs.decidePurchaseProof(req,{...approval,proofId:finalProof.id,acknowledgeProof:true})
  actor=other;await denied(()=>proofs.withdrawPurchaseProof(req,{proofId:finalProof.id}),404);actor=owner;await proofs.withdrawPurchaseProof(req,{proofId:finalProof.id});await denied(()=>proofs.privatePurchaseProof(req,finalProof.id),404);assert.equal((await queries.reviewedPurchaseProofs([review.id])).size,0)
  assert.equal((await queries.myBusinessTrust(other.id)).proofs.length,0);assert.ok((await queries.myBusinessTrust(owner.id)).proofs.length>=3)
  await setting('extension.businesses.state.v1','{"enabled":true,"settings":{"allow-reports":false,"allow-purchase-proofs":false}}')
  actor=reporter;await denied(()=>reports.reportBusinessExperience(req,reportInput),403);actor=owner;await denied(async()=>proofs.submitPurchaseProof(req,input,await image()),403)
  await setting('extension.businesses.state.v1','{"enabled":false,"settings":{}}');await denied(()=>proofs.privatePurchaseProof(req,proof.id),404)
  await setting('extension.businesses.state.v1','{"enabled":true,"settings":{}}');actor=null;await denied(()=>reports.reportBusinessExperience(req,reportInput),401)
  actor=reporter;await denied(()=>reports.reportBusinessExperience(req,{...reportInput,businessId:second.id}),404)
  await reports.reportBusinessExperience(req,reportInput);const fresh=await prisma.communityReport.findFirstOrThrow({where:{businessId:business.id,status:'OPEN'}})
  actor=manager;await reports.decideBusinessReport(req,{...decision,reportId:fresh.id,hide:true});assert.equal((await prisma.itemReview.findUniqueOrThrow({where:{id:review.id}})).status,'REJECTED')
  // A SellerReview uses a different target binding and retains its existing table/history.
  const seller=await prisma.seller.create({data:{userId:representative.id,slug:stamp,shopName:stamp,status:'ACTIVE'}});sellers.push(seller)
  const order=await prisma.order.create({data:{userId:owner.id,totalAmount:1,totalMinor:100n,currency:'USD',status:'PAID'}});orders.push(order)
  const sellerReview=await prisma.sellerReview.create({data:{sellerId:seller.id,userId:owner.id,orderId:order.id,rating:2,body:'A preserved legacy seller experience.',status:'APPROVED'}})
  const sellerProfile=await prisma.businessProfile.create({data:{name:stamp+'-seller',slug:stamp+'-seller',kind:'SELLER',sellerId:seller.id,status:'PUBLISHED'}});profiles.push(sellerProfile)
  actor=reporter;await reports.reportBusinessExperience(req,{...reportInput,businessId:sellerProfile.id,reviewId:sellerReview.id});const sellerReport=await prisma.communityReport.findFirstOrThrow({where:{businessId:sellerProfile.id}});assert.equal(sellerReport.itemReviewId,null);assert.equal(sellerReport.sellerReviewId,sellerReview.id)
  actor=manager;await reports.decideBusinessReport(req,{...decision,reportId:sellerReport.id,hide:true});assert.equal((await prisma.sellerReview.findUniqueOrThrow({where:{id:sellerReview.id}})).status,'HIDDEN')
  await prisma.communityReport.createMany({data:Array.from({length:21},()=>({businessId:business.id,itemReviewId:review.id,reporterId:reporter.id,reason:'OTHER',note:'Owned paginated resolved history.',status:'RESOLVED',businessReviewDigest:'a'.repeat(64)}))})
  await prisma.businessPurchaseProof.createMany({data:Array.from({length:21},(_,index)=>({businessId:business.id,reviewId:review.id,userId:owner.id,status:'REJECTED',reviewDigest:'b'.repeat(64),filename:require('node:crypto').randomUUID()+'.png',originalName:`owned-history-${index}.png`,mimeType:'image/png',size:png.length,sha256:'c'.repeat(64)}))})
  const first=await queries.businessTrustAdmin(req,{reportStatus:'RESOLVED',proofStatus:'REJECTED'}),next=await queries.businessTrustAdmin(req,{reportStatus:'RESOLVED',proofStatus:'REJECTED',reportPage:2,proofPage:2})
  assert.equal(first.reports.rows.length,20);assert.equal(first.proofs.length,20);assert.ok(next.reports.rows.length>0&&next.reports.rows.length<=20);assert.ok(next.proofs.length>0&&next.proofs.length<=20)
  assert.ok(!first.reports.rows.some(a=>next.reports.rows.some(b=>a.id===b.id)));assert.ok(!first.proofs.some(a=>next.proofs.some(b=>a.id===b.id)))
  console.log('Business trust PostgreSQL/current guards passed: private byte delivery, no guest/other/representative/wrong-section access, no self-approval, acknowledgment, audit rollback, replay/duplicates, current digest/identical retry/reply, stale hide refusal, explicit hide, owner withdrawal, settings/modules and distinct SellerReview targets.')
 }finally{
  auditFault=false;process.chdir(repo)
  try{
   const ids=profiles.map(p=>p.id),userIds=users.map(u=>u.id)
   await prisma.businessProfile.deleteMany({where:{id:{in:ids},slug:{startsWith:stamp}}});await prisma.itemReview.deleteMany({where:{itemType:'business',itemId:{in:ids}}});await prisma.itemStat.deleteMany({where:{itemType:'business',itemId:{in:ids}}})
   await prisma.sellerReview.deleteMany({where:{sellerId:{in:sellers.map(s=>s.id)}}});await prisma.order.deleteMany({where:{id:{in:orders.map(o=>o.id)}}});await prisma.seller.deleteMany({where:{id:{in:sellers.map(s=>s.id)}}})
   await prisma.auditLog.deleteMany({where:{actorUserId:{in:userIds}}});await prisma.user.deleteMany({where:{id:{in:userIds},email:{startsWith:stamp}}});await prisma.role.deleteMany({where:{id:{in:roles.map(r=>r.id)},name:{startsWith:stamp}}})
  }finally{try{for(const[key,row]of snapshots){if(row)await setting(key,row.value);else await prisma.setting.deleteMany({where:{key}})}}finally{await prisma.$disconnect();if(temp&&path.dirname(temp)===os.tmpdir()&&path.basename(temp).startsWith(stamp))await fsp.rm(temp,{recursive:true,force:true})}}
 }
}
main().catch(error=>{console.error(error.stack);process.exitCode=1})
