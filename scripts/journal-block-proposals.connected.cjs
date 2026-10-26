// Actual Editor/CMS/History commands on owned PostgreSQL rows. No provider calls.
const assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server')
const db=new PrismaClient(),stamp='block-proposal-'+Date.now(),start=new Date(),setting='journal.home.v1'
let viewer,original,editorOn=true,failAudit=false,actualAudit
const load=require('./connected-source-loader.cjs')({
 '@/platform/database/prisma':{db},
 '@/platform/observability/logger':{logEvent(){},requestIdFrom:()=>stamp},
 'next-auth/jwt':{getToken:async()=>viewer?{uid:viewer.id,authAt:start.toISOString()}:null},
 '@/extensions/server/modules':{isModuleEnabled:async id=>id!=='block-editor'||editorOn,requireModule:async()=>{},moduleGuard:async()=>null,getModuleStates:async()=>({journal:true}),getModuleSettings:async()=>({})},
 '@/platform/http/rate-limit':{rateLimitStrict:async()=>({ok:true}),rateLimitHit:async()=>({ok:true})},
 '@/modules/seo/server/indexnow':{publicPathFor:()=>null,queueIndexNow:async()=>{}},
 '@/platform/audit/server':{auditAdminStrict:async(...args)=>{if(failAudit)throw Error('owned audit failure');return actualAudit(...args)}},
 react:{...require('react'),cache:fn=>fn},
})
actualAudit=load('src/platform/audit/server.ts').auditAdminStrict
const editor=load('src/modules/editor/server/http/documents.ts'),cms=load('src/modules/site/server/http/admin/cms/route.ts'),history=load('src/modules/content/server/http/history.ts')
const publicCms=load('src/modules/site/server/http/public/cms/route.ts')
const request=(method,url,body,origin=true)=>new NextRequest('http://site.invalid'+url,{method,headers:{host:'site.invalid',...(origin?{origin:'http://site.invalid'}:{}),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
const result=async response=>({status:response.status,body:await response.json()})
const context=id=>({params:Promise.resolve({entity:'posts',id:String(id)})})
const get=async(id,query='')=>result(await editor.GET(request('GET','/api/admin/editor/posts/'+id+query),context(id)))
const put=async(id,body,origin=true)=>result(await editor.PUT(request('PUT','/api/admin/editor/posts/'+id,body,origin),context(id)))
const patch=async body=>result(await cms.PATCH(request('PATCH','/api/admin/cms?type=posts',body)))
const doc=text=>({version:1,blocks:[{id:'heading-one',type:'content.heading',version:1,props:{text,level:2,align:'start',anchor:''}}]})
const live=id=>db.post.findUniqueOrThrow({where:{id},include:{editProposal:true}})
const draft=async(id,text)=>{const r=await get(id);assert.equal(r.status,200);return {intent:'proposal',document:doc(text),updatedAt:r.body.updatedAt,proposalAt:r.body.proposalAt}}
const decide=async(id,decision='apply')=>{const p=(await live(id)).editProposal;return patch({id,proposalDecision:decision,proposalAt:p.updatedAt.toISOString()})}
const review=async on=>db.setting.upsert({where:{key:setting},create:{key:setting,value:JSON.stringify({reviewAuthorPosts:on})},update:{value:JSON.stringify({reviewAuthorPosts:on})}})
async function main(){
 original=await db.setting.findUnique({where:{key:setting}})
 const roles=[],users=[],posts=[],patterns=[]
 try{
  const role=async(name,permissions)=>{const r=await db.role.create({data:{name:stamp+name,permissions}});roles.push(r.id);return r}
  const user=async(name,r)=>{const u=await db.user.create({data:{email:stamp+name+'@example.invalid',passwordHash:'owned fixture',role:'ADMIN',roleId:r.id}});users.push(u.id);return u}
  const author=await user('author',await role('author','dashboard.view,journal.author'))
  const manager=await user('manager',await role('manager','dashboard.view,cms.posts'))
  const other=await user('other',await role('other','dashboard.view,journal.author'))
  const cinema=await user('cinema',await role('cinema','dashboard.view,cinema.manage'))
  const make=async(name,extra={})=>{const p=await db.post.create({data:{slug:stamp+name,title:stamp+name,excerpt:'original excerpt',status:'PUBLISHED',publishedAt:new Date(Date.now()-60000),authorId:author.id,editorFormat:'blocks-v1',contentDocument:JSON.stringify(doc('original')),content:'<h2>original</h2>',...extra}});posts.push(p.id);return p}
  const post=await make('main');await review(true);viewer=author
  const first=await draft(post.id,'proposed body')
  assert.equal((await get(post.id)).body.editingMode,'proposal')
  assert.equal((await put(post.id,{document:doc('bypass'),updatedAt:post.updatedAt.toISOString()})).status,403,'normal PUT cannot bypass review')
  assert.equal((await put(post.id,first,false)).status,403,'Origin required')
  viewer=other;assert.equal((await get(post.id)).status,404);assert.equal((await put(post.id,first)).status,404)
  viewer=cinema;assert.equal((await get(post.id)).status,403);assert.equal((await put(post.id,first)).status,403)
  viewer=null;assert.equal((await get(post.id)).status,403)
  viewer=author
  assert.equal((await put(post.id,{...first,proposalAt:undefined})).status,400)
  assert.equal((await put(post.id,{...first,document:{version:1,blocks:[{...doc('x').blocks[0],props:{text:'x',level:1}}]}})).status,422,'invalid body refused')
  assert.equal((await put(post.id,first)).status,200)
  const saved=await live(post.id);assert.equal(saved.content,post.content);assert.equal(saved.contentDocument,post.contentDocument);assert.equal(saved.updatedAt.getTime(),post.updatedAt.getTime(),'live version untouched')
  assert.equal(await db.contentRevision.count({where:{entityType:'posts',entityId:post.id}}),0,'submission does not create a live revision')
  assert.equal((await result(await publicCms.GET(request('GET','/api/cms?type=post&slug='+post.slug)))).status,200)
  assert.equal((await live(post.id)).updatedAt.getTime(),post.updatedAt.getTime(),'public views must not invalidate the editable version')
  assert.equal((await live(post.id)).views,post.views+1,'public visit still counted')
  const counters=load('src/modules/journal/server/views.ts')
  await Promise.all(Array.from({length:8},()=>counters.incrementPostViews({slug:post.slug},3)))
  assert.equal((await live(post.id)).views,post.views+25,'concurrent cached batches retain every visit')
  assert.equal((await live(post.id)).updatedAt.getTime(),post.updatedAt.getTime(),'cached batches also preserve the editable version')
  const pagecache=load('src/modules/performance/server/pagecache.ts'),cache=pagecache.cacheState()
  assert.equal(cache.views.size,0,'isolated cache starts empty')
  cache.views.set('post:'+post.slug,7)
  await pagecache.flushViews()
  assert.equal(cache.views.size,0,'actual cache flush consumes its batch')
  assert.equal((await live(post.id)).views,post.views+32,'actual cache flush uses the canonical counter')
  assert.equal((await live(post.id)).updatedAt.getTime(),post.updatedAt.getTime(),'actual cache flush preserves pending body base')
  assert.match((await get(post.id)).body.document.blocks[0].props.text,/proposed/,'reopen stored body')
  assert.equal((await get(post.id,'?proposal=1')).status,403,'author cannot use manager preview')
  assert.equal((await put(post.id,first)).status,409,'second editor with old/null proposal token refused')
  assert.equal((await patch({id:post.id,title:stamp+' changed title'})).status,200)
  let changes=JSON.parse((await live(post.id)).editProposal.changes);assert.ok(changes.contentDocument);assert.equal(changes.title,stamp+' changed title','metadata keeps body')
  const bodyAgain=await draft(post.id,'body after metadata');assert.equal((await put(post.id,bodyAgain)).status,200)
  changes=JSON.parse((await live(post.id)).editProposal.changes);assert.equal(changes.title,stamp+' changed title','body keeps metadata')
  const racers=await draft(post.id,'winner');const outcomes=await Promise.all([put(post.id,racers),put(post.id,racers)]);assert.deepEqual(outcomes.map(x=>x.status).sort(),[200,409],'one proposal-token winner')
  viewer=manager
  let preview=await get(post.id,'?proposal=1');assert.equal(preview.status,200);assert.match(preview.body.previewHtml,/winner/);assert.match(preview.body.liveHtml,/original/)
  failAudit=true;assert.notEqual((await decide(post.id)).status,200);failAudit=false
  assert.equal((await live(post.id)).content,post.content);assert.ok((await live(post.id)).editProposal,'audit failure retains proposal')
  assert.equal(await db.backgroundJob.count({where:{kind:'journal.editorial-decision',payload:{contains:'"postId":'+post.id}}}),0,'rolled-back decision has no intent')
  assert.equal((await decide(post.id)).status,200)
  let applied=await live(post.id);assert.equal(applied.editProposal,null);assert.match(applied.content,/winner/);assert.equal(JSON.parse(applied.contentDocument).blocks[0].props.text,'winner');assert.equal(applied.title,stamp+' changed title')
  assert.equal(await db.backgroundJob.count({where:{kind:'journal.editorial-decision',payload:{contains:'"postId":'+post.id}}}),1,'same owner durable decision intent')
  const oldest=await db.contentRevision.findFirst({where:{entityType:'posts',entityId:post.id},orderBy:{version:'asc'}});assert.ok(oldest)
  const restored=await result(await history.POST_history(request('POST','/api/admin/history',{type:'posts',id:post.id,version:oldest.version})));assert.equal(restored.status,200,JSON.stringify(restored.body));assert.equal((await live(post.id)).contentDocument,post.contentDocument,'existing history restores canonical body')

  const stale=await make('stale');viewer=author;assert.equal((await put(stale.id,await draft(stale.id,'stale draft'))).status,200)
  await db.post.update({where:{id:stale.id},data:{title:'manager newer',updatedAt:new Date(stale.updatedAt.getTime()+10000)}})
  const staleRead=await get(stale.id);assert.equal(staleRead.body.proposalStale,true)
  const staleRow=await live(stale.id);assert.equal(load('src/modules/journal/server/review.ts').proposalView({...staleRow,updatedAt:new Date(staleRow.editProposal.baseUpdatedAt.getTime()-1000)}).stale,true,'a different, earlier clock is also a stale canonical base')
  assert.equal((await put(stale.id,await draft(stale.id,'must not rebase'))).status,409)
  assert.equal((await patch({id:stale.id,excerpt:'must not rebase body'})).status,409)
  viewer=manager;assert.equal((await decide(stale.id)).status,409,'apply cannot overwrite a changed base');assert.ok((await live(stale.id)).editProposal)
  assert.equal((await decide(stale.id,'reject')).status,200);assert.equal((await live(stale.id)).title,'manager newer')

  const protectedPost=await make('locked',{contentDocument:JSON.stringify({version:1,blocks:[{...doc('locked').blocks[0],lock:{move:true,remove:true}}]})})
  viewer=author;assert.equal((await put(protectedPost.id,{...await draft(protectedPost.id,'x'),document:{version:1,blocks:[]}})).status,403,'structural locks apply to proposals')
  editorOn=false;assert.equal((await put(protectedPost.id,await draft(protectedPost.id,'x'))).status,404);editorOn=true
  const corrupt=await make('corrupt');assert.equal((await put(corrupt.id,await draft(corrupt.id,'valid'))).status,200)
  await db.postEditProposal.update({where:{postId:corrupt.id},data:{changes:JSON.stringify({contentDocument:'{"broken"'})}})
  viewer=manager;assert.equal((await decide(corrupt.id)).status,422);assert.equal((await live(corrupt.id)).content,corrupt.content)
  assert.equal((await decide(corrupt.id,'reject')).status,200)

  const legacy=await make('legacy',{editorFormat:'legacy',contentDocument:'',contentEn:'retained translation'})
  viewer=author;assert.equal((await put(legacy.id,await draft(legacy.id,'converted proposal'))).status,200)
  assert.equal((await live(legacy.id)).editorFormat,'legacy','conversion is not published by submission')
  const opaque={id:'future-one',type:'future.widget',version:99,props:{untouched:'retained'}}
  const future=await draft(legacy.id,'canonical source');future.document.blocks.push(opaque);assert.equal((await put(legacy.id,future)).status,200)
  const rawChanges=JSON.parse((await live(legacy.id)).editProposal.changes);rawChanges.content='<script>spoofed html</script>'
  await db.postEditProposal.update({where:{postId:legacy.id},data:{changes:JSON.stringify(rawChanges)}})
  viewer=manager;editorOn=false;assert.equal((await decide(legacy.id)).status,404);assert.ok((await live(legacy.id)).editProposal)
  editorOn=true;assert.equal((await decide(legacy.id)).status,200)
  const converted=await live(legacy.id);assert.equal(converted.editorFormat,'blocks-v1');assert.equal(converted.contentEn,'retained translation');assert.doesNotMatch(converted.content,/spoofed html/);assert.deepEqual(JSON.parse(converted.contentDocument).blocks[1],opaque,'opaque unknown blocks survive')

  const linked=await make('synced'),pattern=await db.editorPattern.create({data:{entity:'posts',kind:'synced',title:stamp,contentDocument:JSON.stringify(doc('pattern'))}});patterns.push(pattern.id)
  viewer=author;const synced=await draft(linked.id,'synced');synced.document.blocks.push({id:'pattern-one',type:'content.pattern',version:1,props:{pattern:pattern.id,title:stamp}})
  assert.equal((await put(linked.id,synced)).status,200)
  await db.editorPattern.delete({where:{id:pattern.id}})
  viewer=manager;assert.equal((await decide(linked.id)).status,422,'apply rechecks deleted synced references');assert.ok((await live(linked.id)).editProposal)
  assert.equal((await decide(linked.id,'reject')).status,200)

  const off=await make('policy-off');await review(false);viewer=author
  assert.equal((await get(off.id)).body.editingMode,'live')
  assert.equal((await put(off.id,{...first,updatedAt:off.updatedAt.toISOString()})).status,409,'stale proposal intent cannot become a live save')
  assert.equal((await put(off.id,{document:doc('direct after review off'),updatedAt:off.updatedAt.toISOString()})).status,200)
  console.log('Journal block proposals passed: actual scoped HTTP, canonical body/metadata merge, live preservation, public/cached views, preview, token race, stale base, locks, plugin/policy off, rollback, history and durable intent.')
 }finally{
  failAudit=false
  await db.backgroundJob.deleteMany({where:{kind:'journal.editorial-decision',OR:posts.map(id=>({payload:{contains:'"postId":'+id}}))}})
  await db.post.deleteMany({where:{id:{in:posts},slug:{startsWith:stamp}}})
  await db.contentRevision.deleteMany({where:{entityType:'posts',entityId:{in:posts}}})
  await db.editorPattern.deleteMany({where:{id:{in:patterns}}})
  await db.auditLog.deleteMany({where:{actorUserId:{in:users}}})
  await db.user.deleteMany({where:{id:{in:users}}});await db.role.deleteMany({where:{id:{in:roles}}})
  if(original)await db.setting.upsert({where:{key:setting},create:{key:setting,value:original.value},update:{value:original.value}});else await db.setting.deleteMany({where:{key:setting}})
 }
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>db.$disconnect())
