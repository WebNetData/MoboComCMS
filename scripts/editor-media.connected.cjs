// Real existing Editor/CMS/history owners, namespaced rows only; no global plugin or form settings are changed.
const assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server')
const db=new PrismaClient(),stamp='editor-media-'+Date.now().toString(36),started=new Date();let viewer
const mocks={
 '@/platform/database/prisma':{db},'@/platform/observability/logger':{logEvent(){},requestIdFrom:()=>stamp},
 'next-auth/jwt':{getToken:async()=>viewer?{uid:viewer.id,authAt:started.toISOString()}:null},
 '@/extensions/server/modules':{isModuleEnabled:async()=>true,requireModule:async()=>{},moduleGuard:async()=>null,getModuleStates:async()=>({}),getModuleSettings:async()=>({})},
 '@/platform/http/rate-limit':{rateLimitStrict:async()=>({ok:true}),rateLimitHit:async()=>({ok:true})},
 '@/modules/seo/server/indexnow':{publicPathFor:()=>null,queueIndexNow:async()=>{}},react:{...require('react'),cache:fn=>fn},
}
const load=require('./connected-source-loader.cjs')(mocks),editor=load('src/modules/editor/server/documents.ts'),cms=load('src/modules/site/server/http/admin/cms/route.ts'),history=load('src/modules/content/server/revisions.ts'),state=load('src/modules/site/server/revision-state.ts'),media=load('src/shared/media/editorial.ts')
const row=id=>db.page.findUniqueOrThrow({where:{id}}),failure=async promise=>promise.then(()=>null,e=>e)
const call=async(method,data)=>{const r=await cms[method](new NextRequest('http://site.invalid/api/admin/cms?type=pages',{method,headers:{host:'site.invalid',origin:'http://site.invalid','content-type':'application/json'},body:JSON.stringify(data)}));return{status:r.status,body:await r.json()}}
const doc=(src='/files/owned.mp3')=>({version:1,blocks:[{id:'media_0001',type:'content.audio',version:1,props:{title:'پادکست',file:{src,caption:'توضیح'},audioKind:'podcast'}},{id:'media_0002',type:'content.video',version:1,props:{title:'ویدیو',file:{src:'/files/owned.mp4'}}},{id:'media_0003',type:'content.embed',version:1,props:{title:'نماشا',embed:{url:'https://www.namasha.com/v/kDjys59P'}}},{id:'media_0004',type:'content.form',version:1,props:{form:'owned-form'}}]})
async function main(){
 const role=await db.role.create({data:{name:stamp,permissions:'dashboard.view,cms.pages'}}),other=await db.role.create({data:{name:stamp+'-other',permissions:'dashboard.view,cms.posts'}})
 const manager=await db.user.create({data:{email:stamp+'@example.invalid',passwordHash:'owned',role:'ADMIN',roleId:role.id}}),limited=await db.user.create({data:{email:stamp+'-other@example.invalid',passwordHash:'owned',role:'ADMIN',roleId:other.id}})
 const actor={...manager,permissions:['dashboard.view','cms.pages']};viewer=manager
 const input={slug:stamp,title:'رسانه',content:'<p>'+media.mediaShortcode({kind:'audio',src:'/files/owned.mp3',audioKind:'voice',title:'ویس'})+'</p><p>[form slug="owned-form"]</p>'}
 const made=await call('POST',input);assert.equal(made.status,200,JSON.stringify(made.body));const id=made.body.id
 assert.match((await row(id)).content,/data-mc-media="audio"/);assert.match((await row(id)).content,/\[form slug=/)
 const base=await row(id)
 await editor.saveDocument({entity:'pages',id,document:doc(),expectedUpdatedAt:base.updatedAt.toISOString(),actor})
 const saved=await row(id);assert.equal(saved.editorFormat,'blocks-v1');assert.deepEqual(JSON.parse(saved.contentDocument).blocks.map(b=>b.type),['content.audio','content.video','content.embed','content.form'])
 const html=editor.pageBlocksHtml(saved);assert.match(html,/data-mc-media="audio"/);assert.match(html,/data-mc-media="video"/);assert.match(html,/https:\/\/www.namasha.com\/embed\/kDjys59P/);assert.match(html,/data-mc-form="owned-form"/);assert.doesNotMatch(html,/<iframe|<script/)
 const versions=await history.listRevisions('pages',id);const snapshot=await history.revisionSnapshot('pages',id,versions[0].version)
 assert.equal(snapshot.contentDocument,saved.contentDocument);assert.ok(snapshot.__relations)
 for(const bad of ['javascript:alert(1)','https://evil.invalid/file.html']){
  const error=await failure(editor.saveDocument({entity:'pages',id,document:doc(bad),expectedUpdatedAt:saved.updatedAt.toISOString(),actor}));assert.ok(error);assert.equal((await row(id)).contentDocument,saved.contentDocument)
 }
 const before=await row(id),faultDb=db.$extends({query:{contentRevision:{async create(){throw Error('owned revision outage')}}}})
 const faulty=require('./connected-source-loader.cjs')({...mocks,'@/platform/database/prisma':{db:faultDb}})('src/modules/editor/server/documents.ts')
 const changed=doc();changed.blocks[0].props.title='must rollback'
 assert.match((await failure(faulty.saveDocument({entity:'pages',id,document:changed,expectedUpdatedAt:before.updatedAt.toISOString(),actor})))?.message,/owned revision outage/)
 assert.equal((await row(id)).contentDocument,before.contentDocument)
 viewer=limited;assert.equal((await call('PATCH',{id,title:'forbidden'})).status,403)
 viewer=manager;await editor.saveDocument({entity:'pages',id,document:{version:1,blocks:[]},expectedUpdatedAt:(await row(id)).updatedAt.toISOString(),actor})
 await state.restorePageRevision(id,snapshot,async(tx,before,after)=>{await history.recordRevision({entityType:'pages',entityId:id,before,after,actor,source:'restore',client:tx,strict:true})})
 assert.equal((await row(id)).contentDocument,saved.contentDocument,'full media document, titles, captions and form survive restore')
 console.log('Editorial media PostgreSQL passed: actual CMS shortcode save, canonical audio/video/providers/form save/reopen/history/restore, unsafe sources refused, narrow permissions and atomic revision-failure rollback.')
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{try{const ids=(await db.page.findMany({where:{slug:{startsWith:stamp}},select:{id:true}})).map(x=>x.id);await db.contentRevision.deleteMany({where:{entityType:'pages',entityId:{in:ids}}});await db.setting.deleteMany({where:{key:{in:ids.map(id=>'page.layout.'+id)}}});await db.page.deleteMany({where:{id:{in:ids}}});await db.auditLog.deleteMany({where:{actorEmail:{startsWith:stamp}}});await db.user.deleteMany({where:{email:{startsWith:stamp}}});await db.role.deleteMany({where:{name:{startsWith:stamp}}})}finally{await db.$disconnect()}})
