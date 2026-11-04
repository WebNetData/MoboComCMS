// Real PostgreSQL, current-account guards, serializable settings claims and strict audit.
// Only the two settings' physical keys are namespaced; framework configuration is a declared double.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript-api')
const {PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server'),{encode}=require('next-auth/jwt')
const prisma=new PrismaClient(),stamp='permalinks-'+Date.now()+'-'+process.pid,secret='owned-permalink-routing-fixture',cache=new Map()
let auditOutage=false
const scoped=key=>['site.routes.v1','site.permalinks.v1'].includes(key)?stamp+'.'+key:key
function wrap(client){return new Proxy(client,{get(target,key){
 if(key==='$transaction')return (work,options)=>target.$transaction(tx=>work(wrap(tx)),options)
 if(key==='setting')return new Proxy(target.setting,{get(model,method){return args=>{const next=structuredClone(args);if(next.where?.key)next.where.key=scoped(next.where.key);if(next.data?.key)next.data.key=scoped(next.data.key);return model[method](next)}}})
 if(key==='auditLog')return new Proxy(target.auditLog,{get(model,method){if(method==='create'&&auditOutage)return()=>{throw Error('owned audit outage')};return typeof model[method]==='function'?model[method].bind(model):model[method]}})
 return typeof target[key]==='function'?target[key].bind(target):target[key]
}})}
const db=wrap(prisma)
function load(file){
 const base=path.resolve(file),full=fs.existsSync(base)&&fs.statSync(base).isFile()?base:['.ts','.tsx','/index.ts'].map(ext=>base+ext).find(fs.existsSync)
 if(!full)throw Error('Missing '+file);if(cache.has(full))return cache.get(full).exports
 if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'))
 const mod={exports:{}};cache.set(full,mod)
 new Function('require','module','exports',ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>{
  if(name==='@/platform/database/prisma')return{db}
  if(name==='@/platform/config/env')return{authSecret:()=>secret}
  if(name==='@/platform/observability/logger')return{logEvent:()=>{},requestIdFrom:()=>stamp}
  if(name==='@/extensions/server/modules')return{getModuleStates:async()=>({music:true,journal:true})}
  if(name.startsWith('@/'))return load('src/'+name.slice(2))
  if(name.startsWith('.'))return load(path.resolve(path.dirname(full),name))
  return require(name)
 },mod,mod.exports);return mod.exports
}
async function main(){const users=[];let role,artist,album,track,page,draft
 try{
  role=await prisma.role.create({data:{name:stamp,permissions:JSON.stringify(['music.manage'])}})
  users.push(await prisma.user.create({data:{email:stamp+'@example.invalid',passwordHash:'not-a-login-password',role:'ADMIN'}}))
  users.push(await prisma.user.create({data:{email:stamp+'-scoped@example.invalid',passwordHash:'not-a-login-password',role:'ADMIN',roleId:role.id}}))
  artist=await prisma.musicArtist.create({data:{slug:stamp+'-artist',name:'Test singer',nameEn:'Test singer'}})
  album=await prisma.musicAlbum.create({data:{slug:stamp+'-album',title:'Owned album',artistId:artist.id}})
  track=await prisma.musicTrack.create({data:{slug:stamp+'-track',title:'Owned track',artistId:artist.id,albumId:album.id}})
  page=await prisma.page.create({data:{slug:stamp+'-page',title:'Owned page',status:'PUBLISHED'}})
  draft=await prisma.page.create({data:{slug:stamp+'-draft',title:'Owned draft',status:'DRAFT'}})
  const route=load('src/modules/site/server/http/admin/routes/route.ts'),owner=load('src/modules/site/server/routes.ts')
  const cookie=async user=>await encode({secret,token:{uid:String(user.id),authAt:Date.now()},maxAge:600})
  const request=async(body,user=users[0],expected,origin='http://localhost')=>new NextRequest('http://localhost/api/admin/site/routes',{method:body?'PUT':'GET',headers:{Origin:origin,...(user?{Cookie:'next-auth.session-token='+await cookie(user)}:{}),...(expected?{'If-Match':expected}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
  assert.equal((await route.GET(await request(null,null))).status,403)
  assert.equal((await route.PUT(await request({templates:{page:'/{slug}'}},users[1]))).status,403)
  assert.equal((await route.PUT(await request({templates:{page:'/{slug}'}},users[0],null,'https://foreign.invalid'))).status,403)
  let state=await (await route.GET(await request(null))).json()
  const first=await route.PUT(await request({templates:{page:'/{slug}',track:'/music/{artist}/track/{slug}',album:'/music/{artist}/album/{slug}'}},users[0],state.revision));assert.equal(first.status,200);state=await first.json()
  assert.deepEqual(await owner.resolvePublicRoute('/p/'+page.slug),{kind:'redirect',path:'/'+page.slug})
  assert.deepEqual(await owner.resolvePublicRoute('/'+page.slug),{kind:'rewrite',path:'/p/'+page.slug})
  assert.equal(await owner.resolvePublicRoute('/'+draft.slug),null)
  const canonical='/music/'+artist.slug+'/track/'+track.slug
  assert.deepEqual(await owner.resolvePublicRoute('/music/track/'+track.slug),{kind:'redirect',path:canonical})
  assert.deepEqual(await owner.resolvePublicRoute(canonical),{kind:'rewrite',path:'/music/track/'+track.slug})
  assert.deepEqual(await owner.resolvePublicRoute('/music/wrong-artist/track/'+track.slug),{kind:'redirect',path:canonical})
  assert.equal(await owner.resolvePublicRoute('/login'),null)
  assert.equal(await owner.resolvePublicRoute('/games/calendar'),null)
  for(const base of ['songs','audio']){const response=await route.PUT(await request({aliases:{'/music':base}},users[0],state.revision));assert.equal(response.status,200);state=await response.json()}
  assert.deepEqual(await owner.resolvePublicRoute('/songs/'+artist.slug+'/track/'+track.slug),{kind:'redirect',path:'/audio/'+artist.slug+'/track/'+track.slug})
  assert.deepEqual(await owner.resolvePublicRoute('/songs/browse'),{kind:'redirect',path:'/audio/browse'})
  const oldRevision=state.revision
  const race=await Promise.all([route.PUT(await request({templates:{post:'/journal/{slug}'}},users[0],oldRevision)),route.PUT(await request({templates:{post:'/articles/{slug}'}},users[0],oldRevision))])
  assert.deepEqual(race.map(r=>r.status).sort(),[200,409])
  const beforeAudit=await owner.loadRoutingState(true)
  auditOutage=true;await assert.rejects(route.PUT(await request({templates:{page:'/docs/{slug}'}},users[0],beforeAudit.revision)),/audit outage/);auditOutage=false
  assert.equal((await owner.loadRoutingState(true)).revision,beforeAudit.revision)
  const [a,b]=await Promise.all([owner.saveRouting({aliasPatch:{'/games':'play'}}),owner.saveRouting({templates:{software:'/apps/{slug}'}})])
  const merged=await owner.loadRoutingState(true);assert.equal(merged.aliases['/games'],'/play');assert.equal(merged.permalinks.templates.software,'/apps/{slug}')
  assert.ok(await prisma.auditLog.count({where:{actorUserId:users[0].id,action:'site.routes.update'}})>0)
  assert.equal((await prisma.musicTrack.findUnique({where:{id:track.id}})).artistId,artist.id)
  console.log('Permalink PostgreSQL: root pages/drafts, artist routes and wrong-artist canonicalization, old aliases, static routes, permissions/Origin, stale race, disjoint concurrent saves, strict audit rollback and unchanged content passed.')
 }finally{
  auditOutage=false
  await prisma.auditLog.deleteMany({where:{actorUserId:{in:users.map(u=>u.id)}}})
  await prisma.setting.deleteMany({where:{key:{startsWith:stamp+'.'}}})
  if(track)await prisma.musicTrack.delete({where:{id:track.id}});if(album)await prisma.musicAlbum.delete({where:{id:album.id}});if(artist)await prisma.musicArtist.delete({where:{id:artist.id}})
  await prisma.page.deleteMany({where:{id:{in:[page?.id,draft?.id].filter(Boolean)}}})
  await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});if(role)await prisma.role.delete({where:{id:role.id}})
  await prisma.$disconnect()
 }
}
main().catch(error=>{console.error(error);process.exitCode=1})
