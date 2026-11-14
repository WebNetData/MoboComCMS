const assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server'),prisma=new PrismaClient(),stamp='cmanage'+Date.now()+process.pid
let actor,caseFault=false;const caseIds=[],createdTitleIds=[]
function wrap(client){return new Proxy(client,{get(target,key){if(key==='$transaction')return(work,options)=>target.$transaction(tx=>work(wrap(tx)),options);if(key==='moderationCase')return new Proxy(target[key],{get(model,method){if(method==='updateMany')return args=>{if(caseFault&&args.data.status==='DECIDED')throw Error('owned case failure');return model.updateMany(args)};return typeof model[method]==='function'?model[method].bind(model):model[method]}});return typeof target[key]==='function'?target[key].bind(target):target[key]}})}
const db=wrap(prisma),load=require('./connected-source-loader.cjs')({
 '@/platform/database/prisma':{db},'@/platform/observability/logger':{logEvent:()=>{},requestIdFrom:()=>stamp},
 '@/platform/cache/kv':{cached:async(_key,_ttl,work)=>work(),invalidate:async()=>{}},
 '@/extensions/server/modules':{isModuleEnabled:async()=>true,getModuleStates:async()=>({}),getModuleSettings:async()=>({})},
 '@/modules/identity/server/access':{requirePerm:async()=>actor},
 '@/modules/journal/server/comment-notification-intents':{queueCommentNotification:async()=>{}},
 '@/modules/store/server/marketing':{awardReviewBonus:async()=>{}},
 '@/modules/catalog/server/storefront':{isStoreEnabled:async()=>true},
 '@/modules/content/server/events':{contentChanged:()=>{},MEDIA_RESOURCE_TYPE:{}},react:{...require('react'),cache:fn=>fn},
})
const request=(path,body)=>new NextRequest('http://localhost:3000'+path,{method:'PATCH',headers:{origin:'http://localhost:3000',host:'localhost:3000','content-type':'application/json'},body:JSON.stringify(body)})
async function main(){try{
 actor=await db.user.create({data:{email:stamp+'@example.invalid',passwordHash:'unused'}})
 const caseFor=async(source,itemId)=>{const row=await db.moderationCase.create({data:{source,itemId,status:'CLAIMED',assigneeId:actor.id,claimedAt:new Date(),note:'owned note'}});caseIds.push(row.id);return row}
 const category=await db.postCategory.create({data:{slug:stamp,name:stamp}}),post=await db.post.create({data:{slug:stamp,title:stamp,content:'<p>original body</p>',authorId:actor.id,categoryId:category.id,categories:{create:{categoryId:category.id}}}})
 const comments=load('src/modules/site/server/http/admin/comments/route.ts'),cases=load('src/modules/moderation/server/cases.ts')
 const comment=await db.postComment.create({data:{postId:post.id,userId:actor.id,body:'owned pending'}}),work=await caseFor('article-comments',comment.id),unrelated=await caseFor('copyright',comment.id)
 caseFault=true;await assert.rejects(comments.PATCH(request('/api/admin/comments',{id:comment.id,status:'APPROVED'})),/owned case failure/);caseFault=false
 assert.equal((await db.postComment.findUnique({where:{id:comment.id}})).status,'PENDING','case failure rolls back owner mutation')
 assert.equal((await comments.PATCH(request('/api/admin/comments',{id:comment.id,status:'APPROVED'}))).status,200)
 const decided=await db.moderationCase.findUnique({where:{id:work.id}});assert.deepEqual([decided.status,decided.decision,decided.assigneeId],['DECIDED','approve',null]);assert.equal((await db.moderationCase.findUnique({where:{id:unrelated.id}})).status,'CLAIMED','same numeric ID in a different owner is untouched')
 await comments.PATCH(request('/api/admin/comments',{id:comment.id,status:'APPROVED'}));assert.equal((await db.moderationCase.findUnique({where:{id:work.id}})).decidedAt.getTime(),decided.decidedAt.getTime(),'repeated decisions are idempotent')
 await assert.rejects(cases.noteCase('article-comments',comment.id,'should not persist'),e=>e.status===409);assert.equal((await db.moderationCase.findUnique({where:{id:work.id}})).note,'owned note','refused notes have no partial write')
 const product=await db.product.create({data:{slug:stamp,name:'original product',description:'original description',price:10,priceMinor:1000n,currency:'USD',stock:7}}),question=await db.productQuestion.create({data:{productId:product.id,userId:actor.id,body:'owned question'}})
 const questionCase=await caseFor('product-questions',question.id),feedback=load('src/modules/catalog/server/http/admin/product-feedback/route.ts')
 assert.equal((await feedback.PATCH(request('/api/admin/product-feedback',{id:question.id,kind:'question',status:'APPROVED',answer:'owned answer'}))).status,200);assert.equal((await db.moderationCase.findUnique({where:{id:questionCase.id}})).status,'DECIDED')
 const revisions=load('src/modules/content/server/revisions.ts'),rules=load('src/modules/content/domain/revisions.ts'),productHistory=load('src/modules/catalog/server/revision-state.ts'),postHistory=load('src/modules/site/server/revision-state.ts')
 const productBefore=await productHistory.productRevisionState(product.id);await revisions.recordRevision({entityType:'products',entityId:product.id,before:null,after:productBefore,actor})
 await db.product.update({where:{id:product.id},data:{name:'changed product',description:'changed description',priceMinor:5000n,price:50,stock:2}})
 await productHistory.restoreProductRevision(product.id,await revisions.revisionSnapshot('products',product.id,1))
 const restored=await db.product.findUnique({where:{id:product.id}});assert.deepEqual([restored.name,restored.description,restored.priceMinor,restored.stock],['original product','original description',5000n,2],'catalogue history never rewinds inventory or money')
 const input=load('src/modules/catalog/server/product-input.ts'),compatibility=load('src/modules/catalog/server/device-compatibility.ts')
 const usedInput=await input.productInput({kind:'PHYSICAL',price:'50',currency:'USD',stock:'2',condition:'USED',conditionGrade:'B',conditionNotes:'Small case mark',healthReport:'Battery health checked',warranty:'Seven-day test'},restored)
 const compatRows=load('src/modules/catalog/domain/device-compatibility.ts').parseDeviceCompatibilityRows([{deviceModel:'Galaxy A55 ١٢٨',status:'CONDITIONAL',note:'Check NVMe slot',source:'Private QA manual'}])
 await db.$transaction(async tx=>{await tx.product.update({where:{id:product.id},data:usedInput.data});await compatibility.replaceDeviceCompatibility(tx,product.id,compatRows)})
 const persisted=await db.product.findUnique({where:{id:product.id}});assert.deepEqual([persisted.condition,persisted.conditionGrade,persisted.conditionNotes,persisted.healthReport,persisted.warranty],['USED','B','Small case mark','Battery health checked','Seven-day test'],'typed used-item form values persist through productInput')
 const exact=await compatibility.lookupDeviceCompatibility(product.slug,' galaxy   a55 ۱۲۸ ');assert.deepEqual([exact?.deviceModel,exact?.status,exact?.note],['Galaxy A55 ١٢٨','CONDITIONAL','Check NVMe slot']);assert.equal(Object.hasOwn(exact||{},'source'),false,'private verification source is not part of the public lookup')
 assert.equal(await compatibility.lookupDeviceCompatibility(product.slug,'Galaxy A55 Pro'),null,'model reads are exact after normalization')
 const usedSnapshot=rules.snapshotOf(await productHistory.productRevisionState(product.id))
 await db.product.update({where:{id:product.id},data:{condition:'REFURBISHED',conditionGrade:'A',conditionNotes:'Changed state',healthReport:'Changed report'}})
 await db.productDeviceCompatibility.deleteMany({where:{productId:product.id}})
 await productHistory.restoreProductRevision(product.id,usedSnapshot)
 const restoredUsed=await db.product.findUnique({where:{id:product.id}}),restoredCompatibility=await compatibility.lookupDeviceCompatibility(product.slug,'GALAXY A55 ۱۲۸')
 assert.deepEqual([restoredUsed.condition,restoredUsed.conditionGrade,restoredUsed.conditionNotes,restoredUsed.healthReport,restoredUsed.warranty,restoredCompatibility?.status],['USED','B','Small case mark','Battery health checked','Seven-day test','CONDITIONAL'],'revision restore recovers disclosure fields and exact compatibility rows')
 const articleBefore=await postHistory.postRevisionState(post.id),snapshot=rules.snapshotOf(articleBefore)
 await db.post.update({where:{id:post.id},data:{content:'changed',categoryId:null,categories:{deleteMany:{}}}})
 await postHistory.restorePostRevision(post.id,snapshot);assert.deepEqual([await db.postCategoryAssignment.count({where:{postId:post.id}}),(await db.post.findUnique({where:{id:post.id}})).content],[1,'<p>original body</p>'])
 await db.postCategory.delete({where:{id:category.id}});await assert.rejects(postHistory.restorePostRevision(post.id,snapshot),e=>e.status===409,'deleted categories refuse a whole restore')
 // Actual media owner records season/link/category-only edits and restores them without losing link reports/counters.
 const media=load('src/modules/media/server/admin.ts'),term=await db.taxonomyTerm.create({data:{taxonomy:'cinema',facet:'genres',slug:stamp,name:stamp+' Drama'}})
 const {row:series}=await media.saveMediaItem('cinema-titles',{slug:stamp,title:stamp,kind:'SERIES',terms:{ids:[term.id],primary:term.id},links:[{url:'https://example.invalid/'+stamp+'.mp4'}],seasons:[{number:1,name:'original season',episodes:[{number:1,title:'original episode',links:[{url:'https://example.invalid/'+stamp+'-episode.mp4'}]}]}]},null,actor)
 createdTitleIds.push(series.id)
 await assert.rejects(media.saveMediaItem('cinema-titles',{title:'must roll back with episode'},series.id,actor,{afterWrite:async(tx,id)=>{const ep=await tx.cinemaEpisode.findFirstOrThrow({where:{season:{titleId:id}}});await tx.cinemaEpisode.update({where:{id:ep.id},data:{title:'must roll back too'}});throw Error('owned episode failure')}}),/owned episode failure/)
 assert.equal((await db.cinemaTitle.findUnique({where:{id:series.id}})).title,stamp)
 assert.equal((await db.cinemaEpisode.findFirstOrThrow({where:{season:{titleId:series.id}}})).title,'original episode')
 const initial=await revisions.revisionSnapshot('cinema-titles',series.id,1),stableLink=await db.mediaLink.findFirst({where:{ownerType:'title',ownerId:series.id}})
 await db.mediaLink.update({where:{id:stableLink.id},data:{clicks:12}})
 await media.saveMediaItem('cinema-titles',{terms:{ids:[]},seasons:[{number:1,name:'changed season',episodes:[{number:1,title:'changed episode'}]}]},series.id,actor)
 assert.equal((await revisions.listRevisions('cinema-titles',series.id)).length,2,'relations-only save is a real version')
 await media.restoreMediaItem('cinema-titles',series.id,current=>rules.restoreValues(initial,current))
 const season=await db.cinemaSeason.findUnique({where:{titleId_number:{titleId:series.id,number:1}},include:{episodes:true}}),link=await db.mediaLink.findUnique({where:{id:stableLink.id}})
 assert.deepEqual([season.name,season.episodes[0].title,link.clicks],['original season','original episode',12]);assert.equal(await db.taxonomyAssignment.count({where:{taxonomy:'cinema',ownerId:series.id,termId:term.id}}),1)
 // A failed case write must also roll back the actual trash deletion and related link removals.
 await db.cinemaTitle.update({where:{id:series.id},data:{status:'TRASHED',trashedStatus:'DRAFT',trashedAt:new Date(),trashedById:actor.id}})
 const trashCase=await caseFor('trash-cinema',series.id)
 caseFault=true;await assert.rejects(media.deleteMediaItem('cinema-titles',series.id,actor.id),/owned case failure/);caseFault=false
 assert.equal((await db.cinemaTitle.findUnique({where:{id:series.id}})).status,'TRASHED');assert.equal(await db.mediaLink.count({where:{id:stableLink.id}}),1)
 await media.deleteMediaItem('cinema-titles',series.id,actor.id)
 assert.deepEqual(await db.moderationCase.findUnique({where:{id:trashCase.id},select:{status:true,decision:true}}),{status:'DECIDED',decision:'approve'})
 const cinema=load('src/modules/cinema/server/admin.ts'),music=load('src/modules/music/server/admin.ts'),keys=['cinema.portal.v1','music.portal.v1'],stored=await db.setting.findMany({where:{key:{in:keys}}})
 try{
  await db.setting.upsert({where:{key:keys[0]},create:{key:keys[0],value:JSON.stringify({unknown:{keep:true}})},update:{value:JSON.stringify({unknown:{keep:true}})}})
  await Promise.all([cinema.saveCinemaSettings({enableAssSubtitles:false}),cinema.saveCinemaSettings({enableSeparateAudio:false})]);const settings=await cinema.getCinemaSettings();assert.equal(settings.enableAssSubtitles,false);assert.equal(settings.enableSeparateAudio,false);assert.deepEqual(JSON.parse((await db.setting.findUnique({where:{key:keys[0]}})).value).unknown,{keep:true})
  await cinema.saveCinemaSettings({showImdb:false});assert.equal((await cinema.getCinemaSettings()).enableAssSubtitles,false,'old callers cannot reset new controls')
  await Promise.all([music.saveMusicSettings({showArtistBiography:false}),music.saveMusicSettings({showArtistFollow:false})]);assert.equal((await music.getMusicSettings()).showArtistBiography,false);assert.equal((await music.getMusicSettings()).showArtistFollow,false)
  await db.setting.update({where:{key:keys[0]},data:{value:'{broken owned JSON'}});await assert.rejects(cinema.saveCinemaSettings({showImdb:true}));assert.equal((await db.setting.findUnique({where:{key:keys[0]}})).value,'{broken owned JSON','corrupt stored settings are retained')
 }finally{for(const key of keys){const old=stored.find(row=>row.key===key);if(old)await db.setting.upsert({where:{key},create:old,update:{value:old.value}});else await db.setting.deleteMany({where:{key}})}}
 console.log('PostgreSQL content management: owner/case atomicity, product financial isolation, used-item input persistence/revision restore/exact compatibility reads, post categories, media relations/counters and strict setting merges passed')
 }finally{
  const titles=await db.cinemaTitle.findMany({where:{slug:stamp},select:{id:true,seasons:{select:{episodes:{select:{id:true}}}}}}),titleIds=[...new Set([...titles.map(row=>row.id),...createdTitleIds])],episodeIds=titles.flatMap(row=>row.seasons.flatMap(s=>s.episodes.map(e=>e.id)))
  await db.moderationCase.deleteMany({where:{id:{in:caseIds}}});await db.contentRevision.deleteMany({where:{OR:[{entityType:'cinema-titles',entityId:{in:titleIds}},{entityType:'products',entityId:{in:(await db.product.findMany({where:{slug:stamp},select:{id:true}})).map(row=>row.id)}}]}})
  await db.mediaLink.deleteMany({where:{OR:[{ownerType:'title',ownerId:{in:titleIds}},{ownerType:'episode',ownerId:{in:episodeIds}},{url:{contains:stamp}}]}});await db.taxonomyAssignment.deleteMany({where:{taxonomy:'cinema',ownerId:{in:titleIds}}});await db.taxonomyTerm.deleteMany({where:{slug:stamp}});await db.backgroundJob.deleteMany({where:{kind:'cinema.person-publication',OR:titleIds.map(id=>({dedupeKey:{contains:':title:'+id}}))}})
  await db.cinemaTitle.deleteMany({where:{id:{in:titleIds}}});await db.post.deleteMany({where:{slug:stamp}});await db.postCategory.deleteMany({where:{slug:stamp}});await db.product.deleteMany({where:{slug:stamp}});if(actor)await db.auditLog.deleteMany({where:{actorUserId:actor.id}});await db.user.deleteMany({where:{email:stamp+'@example.invalid'}});await prisma.$disconnect()
 }}
main().catch(error=>{console.error(error);process.exitCode=1})
