// Canonical owners on real PostgreSQL; only JWT transport, modules and the remote model are doubled.
const assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server')
assert(/test|check/i.test(new URL(process.env.DATABASE_URL).pathname),'disposable database required')
const db=new PrismaClient(),stamp='studio-'+Date.now().toString(36),started=new Date(),ids=[],templateIds=[]
let viewer,disabled=false,fault=false,modelCalls=0,modelText=''
const wrap=target=>new Proxy(target,{get(object,key){
  if(key==='$transaction')return(work,options)=>object.$transaction(tx=>work(wrap(tx)),options)
  if(key==='auditLog')return new Proxy(object[key],{get(model,method){if(method==='create')return args=>{if(fault)throw Error('owned audit outage');return model.create(args)};return typeof model[method]==='function'?model[method].bind(model):model[method]}})
  return typeof object[key]==='function'?object[key].bind(object):object[key]
}})
class AiError extends Error{}
const load=require('./connected-source-loader.cjs')({
  '@/platform/database/prisma':{db:wrap(db)},'next-auth/jwt':{getToken:async()=>viewer?{uid:viewer.id,authAt:started.toISOString()}:null},
  '@/extensions/server/modules':{isModuleEnabled:async()=>!disabled,moduleGuard:async()=>disabled?new Response('{}',{status:404}):null,requireModule:async()=>{},getModuleSettings:async()=>({}),getModuleStates:async()=>({})},
  '@/platform/http/rate-limit':{rateLimitStrict:async()=>({ok:true})},
  '@/platform/observability/logger':{logEvent(){},requestIdFrom:()=>stamp},
  '@/modules/ai/server/admin-context':{withPersonalAi:async(_id,work,purpose)=>{assert.equal(purpose,'builder');return work()}},
  '@/modules/ai/server/client':{AiError,generate:async input=>{modelCalls++;assert.doesNotMatch(input.user,/passwordHash|DATABASE_URL/);return{text:modelText,model:'owned-studio-model'}}},
  react:{...require('react'),cache:fn=>fn},
})
const builder=load('src/modules/site/server/builder.ts'),domain=load('src/modules/site/domain/builder.ts'),themes=load('src/modules/site/server/theme-templates.ts'),surface=load('src/modules/site/server/builder-surfaces.ts')
const api=load('src/modules/site/server/http/admin/page-builder/route.ts'),themeApi=load('src/modules/site/server/http/theme/templates.ts'),aiApi=load('src/modules/site/server/http/builder/design.ts'),draftApi=load('src/modules/site/server/http/builder/draft.ts')
const request=(path,method='GET',body,origin=true)=>new NextRequest('http://site.invalid'+path,{method,headers:{host:'site.invalid',cookie:'owned-fixture=1',...(origin?{origin:'http://site.invalid'}:{}),'content-type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})})
async function call(handler,method,path,body,origin=true){const response=await handler(request(path,method,body,origin));return{status:response.status,body:await response.json()}}
function doc(text){const d=domain.emptyDoc(),s=domain.createSection(1),w=domain.createWidget('heading');w.props.text=text;s.columns[0].widgets.push(w);d.sections.push(s);return d}
async function main(){
  const owner=await db.user.create({data:{email:stamp+'@invalid.test',name:'Owned designer',role:'ADMIN',passwordHash:'unused'}});ids.push(owner.id);viewer=owner
  const role=await db.role.create({data:{name:stamp,nameFa:'pages only',permissions:'dashboard.view,cms.pages'}})
  const editor=await db.user.create({data:{email:stamp+'-editor@invalid.test',role:'ADMIN',roleId:role.id,passwordHash:'unused'}});ids.push(editor.id)
  const path='/api/admin/page-builder',pageId=stamp,d1=doc('first'),d2=doc('second'),d3=doc('newer draft')
  const initial=await call(api.GET,'GET',path+'?pageId='+pageId)
  let saved=await call(api.PUT,'PUT',path,{pageId,doc:d1,expectedRevision:initial.body.revision});assert.equal(saved.status,200)
  assert.equal(saved.body.revision,(await builder.readBuilderState(pageId)).revision)
  const stale=await call(api.PUT,'PUT',path,{pageId,doc:d2,expectedRevision:initial.body.revision});assert.equal(stale.status,409)
  const concurrent=await Promise.all([d2,doc('competing')].map(doc=>call(api.PUT,'PUT',path,{pageId,doc,expectedRevision:saved.body.revision})))
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409],'one exact-revision claim wins')
  const before=await builder.readBuilderState(pageId),count=await db.contentRevision.count({where:{entityType:builder.builderHistoryType(pageId)}})
  fault=true;await assert.rejects(()=>call(api.PUT,'PUT',path,{pageId,doc:d3,expectedRevision:before.revision}),/owned audit outage/);fault=false
  assert.equal((await builder.readBuilderState(pageId)).revision,before.revision);assert.equal(await db.contentRevision.count({where:{entityType:builder.builderHistoryType(pageId)}}),count)
  await builder.saveBuilderDraft(pageId,d3);await builder.clearBuilderDraft(pageId,d2);assert.equal((await builder.getBuilderDraft(pageId)).present,true,'a newer draft survives another save')
  await builder.clearBuilderDraft(pageId,d3);assert.equal((await builder.getBuilderDraft(pageId)).present,false)
  const post=await call(themeApi.POST,'POST','/api/admin/theme-templates',{type:'single-post',name:stamp,preset:''});assert.equal(post.status,200);templateIds.push(post.body.template.id);assert.equal(post.body.template.generation,1)
  await builder.saveBuilderDoc(post.body.template.id,d1)
  const pub=await call(themeApi.PATCH,'PATCH','/api/admin/theme-templates',{id:post.body.template.id,status:'published',expectedUpdatedAt:post.body.template.updatedAt});assert.equal(pub.status,200)
  assert.equal((await call(themeApi.PATCH,'PATCH','/api/admin/theme-templates',{id:post.body.template.id,status:'draft',expectedUpdatedAt:'stale'})).status,409)
  assert.ok(await themes.resolveEntryLayout('post',98765,{route:'post',postId:98765}))
  const raw=JSON.parse((await db.setting.findUnique({where:{key:themes.THEME_INDEX_KEY}})).value);delete raw.find(r=>r.id===post.body.template.id).generation
  await db.setting.update({where:{key:themes.THEME_INDEX_KEY},data:{value:JSON.stringify(raw)}})
  assert.equal(await themes.resolveEntryLayout('post',98765,{route:'post',postId:98765}),null,'archived layouts never reactivate')
  const movie=await call(themeApi.POST,'POST','/api/admin/theme-templates',{type:'surface',surface:'movie',name:stamp+' movie'});assert.equal(movie.status,200);templateIds.push(movie.body.template.id)
  await themes.updateThemeTemplate(movie.body.template.id,{status:'published',conditions:[{mode:'include',target:'entry:7'}]})
  assert.ok(await surface.resolveSurfaceTemplate('movie',7));assert.equal(await surface.resolveSurfaceTemplate('movie',8),null);assert.equal(await surface.resolveSurfaceTemplate('series',7),null)
  const duplicate=await themes.duplicateThemeTemplate(movie.body.template.id);templateIds.push(duplicate.id);assert.equal(duplicate.surface,'movie');assert.equal(duplicate.status,'draft')
  const sample=await db.cinemaTitle.create({data:{slug:stamp,title:'Owned public sample',status:'PUBLISHED',publishedAt:new Date()}})
  try {
    assert.deepEqual(await surface.exactSurfaceExample('movie',sample.id),{id:sample.id,slug:stamp,title:sample.title})
    assert.equal(await surface.exactSurfaceExample('series',sample.id),null)
    await db.cinemaTitle.update({where:{id:sample.id},data:{audienceGroups:'["private-group"]'}})
    assert.equal(await surface.exactSurfaceExample('movie',sample.id),null,'private audience cannot become a public sample')
    await db.cinemaTitle.update({where:{id:sample.id},data:{audienceGroups:'',status:'DRAFT'}})
    assert.equal(await surface.exactSurfaceExample('movie',sample.id),null,'unpublished media cannot become a public sample')
  } finally { await db.cinemaTitle.delete({where:{id:sample.id}}) }
  viewer=editor;assert.equal((await call(api.PUT,'PUT',path,{pageId:'post-98765',doc:d1})).status,403)
  const aiPath='/api/admin/builder/design',input={pageId:'post-98765',instruction:'طراحی ساده و خوانا با عنوان'};modelText=JSON.stringify(d1)
  assert.equal((await call(aiApi.POST,'POST',aiPath,input)).status,403);assert.equal(modelCalls,0)
  viewer=owner;assert.equal((await call(aiApi.POST,'POST',aiPath,input,false)).status,403);assert.equal(modelCalls,0)
  const settingCount=await db.setting.count();assert.equal((await call(aiApi.POST,'POST',aiPath,input)).status,200);assert.equal(await db.setting.count(),settingCount,'AI proposes without writing any design')
  d1.code.js='alert(1)';modelText=JSON.stringify(d1);assert.equal((await call(aiApi.POST,'POST',aiPath,input)).status,422)
  assert.equal((await call(aiApi.POST,'POST',aiPath,null)).status,400)
  disabled=true;assert.equal(await surface.resolveSurfaceTemplate('movie',7),null);assert.equal(await themes.resolveEntryLayout('post',98765,{route:'post'}),null)
  assert.equal((await call(draftApi.PUT,'PUT','/api/admin/builder/draft',{pageId,doc:d2})).status,404);assert.equal((await call(aiApi.POST,'POST',aiPath,input)).status,404)
  console.log('Visual studio PostgreSQL: exact-revision concurrent claims, strict audit rollback, history, conditional draft clearing, new/archived post opt-in, scoped surface conditions/duplicate, module-off preservation, exact permissions/Origin and proposal-only AI passed.')
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{try{for(const id of templateIds)await themes.deleteThemeTemplate(id);await db.setting.deleteMany({where:{key:{in:[builder.builderKey(stamp),builder.draftKey(stamp)]}}});await db.contentRevision.deleteMany({where:{OR:[{entityType:builder.builderHistoryType(stamp)},...templateIds.map(id=>({entityType:builder.builderHistoryType(id)}))]}});await db.auditLog.deleteMany({where:{actorEmail:{startsWith:stamp}}});await db.user.deleteMany({where:{id:{in:ids}}});await db.role.deleteMany({where:{name:stamp}})}finally{await db.$disconnect()}})
