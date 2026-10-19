// Logical owner keys are mapped to this test's namespace on actual PostgreSQL. No site settings/history are replaced.
const assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server')
const prisma=new PrismaClient(),stamp='sethistory'+Date.now()+process.pid+':',jobs=[]
let actor,fault='',allowed=true
const rewrite=(value,kind,field='')=>Array.isArray(value)?value.map(item=>rewrite(item,kind,field)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,rewrite(item,kind,key==='key'||key==='entityType'?key:field)])):typeof value==='string'&&(kind==='setting'&&field==='key'||kind==='contentRevision'&&field==='entityType')?stamp+value:value
function wrap(client){return new Proxy(client,{get(target,key){
 if(key==='$transaction')return(work,options)=>target.$transaction(tx=>work(wrap(tx)),options)
 if(['setting','contentRevision','auditLog','backgroundJob'].includes(key))return new Proxy(target[key],{get(model,method){if(typeof model[method]!=='function')return model[method];return async args=>{
  if(fault===key&&['create','upsert'].includes(method))throw Error('injected '+key)
  let result=await model[method](['setting','contentRevision'].includes(key)?rewrite(args,key):args)
  const clean=row=>row&&typeof row==='object'?{...row,...(key==='setting'&&typeof row.key==='string'?{key:row.key.slice(stamp.length)}:{}),...(key==='contentRevision'&&typeof row.entityType==='string'?{entityType:row.entityType.slice(stamp.length)}:{})}:row
  if(key==='backgroundJob'&&method==='create')jobs.push(result.id)
  return Array.isArray(result)?result.map(clean):clean(result)
 }}})
 return typeof target[key]==='function'?target[key].bind(target):target[key]
}})}
const db=wrap(prisma),load=require('./connected-source-loader.cjs')({
 '@/platform/database/prisma':{db},'@/platform/cache/kv':{cached:async(_key,_ttl,work)=>work(),invalidate:async()=>{}},
 '@/platform/observability/logger':{logEvent:()=>{},requestIdFrom:()=>stamp},react:{...require('react'),cache:fn=>fn},
 '@/modules/identity/server/access':{requirePerm:async()=>allowed?actor:null},'@/modules/identity/server/admin-guard':{adminGuard:async()=>allowed?{admin:actor}:{response:new Response('',{status:403})}},
 '@/extensions/server/modules':{isModuleEnabled:async()=>true,getModuleStates:async()=>({}),getModuleSettings:async()=>({})},
})
const general=load('src/modules/settings/server/general.ts'),forum=load('src/modules/forum/server/settings.ts'),history=load('src/modules/content/server/http/history.ts'),api=load('src/modules/settings/server/http/admin/settings/route.ts'),revisions=load('src/modules/content/server/revisions.ts')
const req=(path,body,headers={})=>new NextRequest('http://localhost:3000'+path,{method:body?'POST':'GET',headers:{host:'localhost:3000',origin:'http://localhost:3000','content-type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})})
async function main(){try{
 actor=await prisma.user.create({data:{email:stamp.replace(':','')+'@example.invalid',passwordHash:'unused'}})
 const context={req:req('/api/admin/settings'),actor}
 await db.setting.create({data:{key:'unrelated.privateConfig',value:'private-marker-never-in-history'}})
 await general.saveGeneralSettings({supportEmail:'first@example.invalid',seoDescription:'original',unrelated:'ignored'},context)
 const response=await api.GET(req('/api/admin/settings')),first=await response.json()
 assert.equal((await api.PATCH(req('/api/admin/settings',{personalRecommendationsEnabled:'invalid'}))).status,400,'legacy invalid-setting response remains400')
 assert.deepEqual(Object.keys(first).sort(),['seoDescription','supportEmail'])
 await general.saveGeneralSettings({supportEmail:'second@example.invalid'},context,response.headers.get('etag'))
 await assert.rejects(general.saveGeneralSettings({seoDescription:'stale'},context,response.headers.get('etag')),e=>e.status===409)
 assert.equal((await general.generalSettingsState()).seoDescription,'original')
 for(const key of ['auditLog','contentRevision']){
  fault=key;await assert.rejects(general.saveGeneralSettings({supportEmail:'must-roll-back'},context),new RegExp('injected '+key));fault=''
  assert.equal((await general.generalSettingsState()).supportEmail,'second@example.invalid')
 }
 assert.equal((await history.POST_history(req('/api/admin/history',{type:'settings-general',id:1,version:2}))).status,200)
 assert.equal((await general.generalSettingsState()).supportEmail,'first@example.invalid')
 assert.equal((await db.setting.findUnique({where:{key:'unrelated.privateConfig'}})).value,'private-marker-never-in-history')
 assert.ok((await revisions.listRevisions('settings-general',1)).every(row=>!row.changed.includes('unrelated')))
 await db.setting.create({data:{key:forum.FORUM_SETTINGS_KEY,value:JSON.stringify({messagesEnabled:false,futureSecret:{value:'hidden-marker'},trust:{1:{daysVisited:4,futureThreshold:99}},watchedWords:{censor:['kept'],futureList:['unrelated']},levels:[{id:'fixture',name:'original level',icon:'',color:'#6366f1',minPosts:0,minLikes:0,minReputation:0,futureMetadata:'private-level-marker'}]})}})
 const before=JSON.parse((await db.setting.findUnique({where:{key:forum.FORUM_SETTINGS_KEY}})).value)
 await forum.saveForumSettings({clubsMaxOwned:7,trust:{1:{postCount:2}},levels:[{...before.levels[0],name:'changed level'}]},context)
 let stored=JSON.parse((await db.setting.findUnique({where:{key:forum.FORUM_SETTINGS_KEY}})).value)
 assert.deepEqual([stored.messagesEnabled,stored.trust[1].daysVisited,stored.trust[1].postCount,stored.trust[1].futureThreshold,stored.watchedWords,stored.futureSecret],[false,4,2,99,before.watchedWords,before.futureSecret])
 const snapshots=await db.contentRevision.findMany({where:{entityType:'settings-forum'}})
 assert.equal(stored.levels[0].futureMetadata,'private-level-marker')
 assert.ok(snapshots.every(row=>!row.snapshot.includes('hidden-marker')&&!row.snapshot.includes('futureThreshold')&&!row.snapshot.includes('futureList')&&!row.snapshot.includes('private-level-marker')),'only normalized known owner fields are versioned')
 for(const key of ['auditLog','contentRevision','backgroundJob']){
  const oldValue=(await db.setting.findUnique({where:{key:forum.FORUM_SETTINGS_KEY}})).value
  const oldJobs=await prisma.backgroundJob.count({where:{id:{in:jobs}}})
  fault=key;await assert.rejects(forum.saveForumSettings({reactionWeights:{heart:3}},context),new RegExp('injected '+key));fault=''
  assert.equal((await db.setting.findUnique({where:{key:forum.FORUM_SETTINGS_KEY}})).value,oldValue)
  assert.equal(await prisma.backgroundJob.count({where:{id:{in:jobs}}}),oldJobs,'no recount job escapes a rollback')
 }
 await forum.saveForumSettings({reactionWeights:{heart:3}},context)
 assert.equal(await prisma.backgroundJob.count({where:{id:{in:jobs}}}),1)
 assert.equal((await history.POST_history(req('/api/admin/history',{type:'settings-forum',id:1,version:1}))).status,200)
 stored=JSON.parse((await db.setting.findUnique({where:{key:forum.FORUM_SETTINGS_KEY}})).value)
 assert.deepEqual(stored.futureSecret,before.futureSecret);assert.equal(stored.trust[1].futureThreshold,99)
  assert.deepEqual([stored.levels[0].name,stored.levels[0].futureMetadata],['original level','private-level-marker'])
 assert.equal(await prisma.backgroundJob.count({where:{id:{in:jobs}}}),2,'restore queues recount from stored events too')
 const current=(await db.setting.findUnique({where:{key:forum.FORUM_SETTINGS_KEY}})).value
 await db.setting.update({where:{key:forum.FORUM_SETTINGS_KEY},data:{value:'broken json'}})
 await assert.rejects(forum.saveForumSettings({messagesEnabled:true},context),/invalid stored/)
 assert.equal((await db.setting.findUnique({where:{key:forum.FORUM_SETTINGS_KEY}})).value,'broken json')
 await db.setting.update({where:{key:forum.FORUM_SETTINGS_KEY},data:{value:current}})
 allowed=false;assert.equal((await api.GET(req('/api/admin/settings'))).status,403);assert.equal((await history.POST_history(req('/api/admin/history',{type:'settings-forum',id:1,version:1}))).status,403)
 console.log('Settings history: sparse validated writes, stale versions, atomic audit/revision/recount faults, normalized secret-free versions, restore and unknown-field preservation passed')
}finally{
 fault='';await prisma.setting.deleteMany({where:{key:{startsWith:stamp}}});await prisma.contentRevision.deleteMany({where:{entityType:{startsWith:stamp}}});await prisma.backgroundJob.deleteMany({where:{id:{in:jobs}}})
 if(actor){await prisma.auditLog.deleteMany({where:{actorUserId:actor.id}});await prisma.user.delete({where:{id:actor.id}})}await prisma.$disconnect()
}}
main().catch(error=>{console.error(error);process.exitCode=1})
