// Existing Media admin on real PostgreSQL. Namespaced content/identity fixtures only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript-api'),{PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server')
const db=new PrismaClient(),stamp='artistprofile'+Date.now()+process.pid,cache=new Map(),users=[]
let viewer=null,enabled=true,limited=false,strictCalls=0
function load(file){
 const p=path.resolve(file),full=fs.existsSync(p)&&fs.statSync(p).isFile()?p:['.ts','/index.ts'].map(ext=>p+ext).find(fs.existsSync)
 if(!full)throw Error('Missing '+file)
 if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'))
 if(cache.has(full))return cache.get(full).exports
 const mod={exports:{}};cache.set(full,mod)
 const code=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
 new Function('require','module','exports',code)(name=>{
  if(name==='@/platform/database/prisma')return{db}
  if(name==='@/modules/identity/server/access')return{requirePerm:async(_req,key)=>viewer?.permissions.includes(key)?viewer:null}
  if(name==='@/extensions/server/modules')return{moduleGuard:async()=>enabled?null:Response.json({error:'off'},{status:404}),isModuleEnabled:async()=>enabled,getModuleSettings:async()=>({})}
  if(name==='@/platform/http/rate-limit')return{rateLimitStrict:async()=>{strictCalls++;return{ok:!limited}}}
  if(name==='@/platform/observability/logger')return{logEvent:()=>{},requestIdFrom:()=>stamp}
  if(name==='@/modules/content/server/events')return{contentChanged:()=>{},MEDIA_RESOURCE_TYPE:{'music-artists':'artist'}}
  if(name==='@/modules/notifications/server/inbox')return{createInboxEvent:async()=>{}}
  if(name==='react')return{...require('react'),cache:fn=>fn}
  return name.startsWith('@/')?load('src/'+name.slice(2)):name.startsWith('.')?load(path.resolve(path.dirname(full),name)):require(name)
 },mod,mod.exports);return mod.exports
}
function req(method='GET',body,query='',origin='http://localhost:3000'){
 return new NextRequest('http://localhost:3000/api/admin/media-library?type=music-artists'+query,{method,headers:{Origin:origin,Host:'localhost:3000','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
}
async function main(){try{
 for(const role of ['manager','author','other','journal']){const user=await db.user.create({data:{name:stamp,email:stamp+'-'+role+'@example.invalid',passwordHash:'owned fixture',role:'ADMIN'}});users.push({...user,permissions:[role==='manager'?'music.manage':role==='journal'?'cms.posts':'music.author']})}
 const api=load('src/modules/media/server/admin.ts'),[manager,author,other,journal]=users
 assert.equal((await api.GET(req())).status,403);viewer=journal;assert.equal((await api.POST(req('POST',{name:stamp}))).status,403)
 viewer=author;let response=await api.POST(req('POST',{name:stamp+' singer',nameEn:stamp+' latin',bio:'<p>Story <strong>kept</strong></p><script>bad()</script>',image:'/files/manual.webp'}));const created=await response.json();assert.equal(response.status,201,JSON.stringify(created));const id=created.id
 let stored=await db.musicArtist.findUniqueOrThrow({where:{id}});assert.equal(stored.createdById,author.id);assert.doesNotMatch(stored.bio,/<script/);const slug=stored.slug
 const album=await db.musicAlbum.create({data:{slug:stamp+'-album',title:stamp+' album',artistId:id,status:'PUBLISHED',createdById:author.id}})
 await db.musicTrack.createMany({data:[{slug:stamp+'-own',title:stamp+' own',artistId:id,albumId:album.id,status:'PUBLISHED',createdById:author.id},{slug:stamp+'-private',title:stamp+' other draft',artistId:id,status:'DRAFT',createdById:other.id}]})
 const detail=async()=>{const r=await api.GET(req('GET',undefined,'&id='+id));assert.equal(r.status,200);return(await r.json())[0]}
 let profile=await detail();assert.equal(profile.profileCanEdit,true);assert.equal(profile._count.tracks,2);assert.equal(profile.tracks.length,1,'author cannot read another author draft title')
 viewer=other;profile=await detail();assert.equal(profile.profileCanEdit,false);assert.equal(profile.tracks.length,1);assert.equal((await api.PATCH(req('PATCH',{id,name:'forbidden',expectedUpdatedAt:profile.updatedAt}))).status,404)
 viewer=manager;profile=await detail();assert.equal(profile.tracks.length,2);assert.equal(profile.profileCanEdit,true)
 const edit={id,expectedUpdatedAt:profile.updatedAt,name:stamp+' renamed',image:'',cover:'/files/banner.webp',bio:'<p>Curated biography</p>',featured:true}
 const races=await Promise.all([api.PATCH(req('PATCH',edit)),api.PATCH(req('PATCH',edit))]);assert.deepEqual(races.map(r=>r.status).sort(),[200,409])
 profile=await detail();assert.equal(profile.slug,slug);assert.equal(profile.nameEn,stamp+' latin');assert.equal(profile.image,'');assert.equal((await db.musicAlbum.findUniqueOrThrow({where:{id:album.id}})).artistId,id)
 const before=await db.contentRevision.count({where:{entityType:'music-artists',entityId:id}})
 await assert.rejects(api.saveMediaItem('music-artists',{name:stamp+' rollback',expectedUpdatedAt:profile.updatedAt},id,manager,{audit:async()=>{throw Error('deliberate audit failure')}}),/deliberate audit failure/)
 assert.equal((await detail()).name,profile.name);assert.equal(await db.contentRevision.count({where:{entityType:'music-artists',entityId:id}}),before)
 assert.ok(await db.auditLog.count({where:{targetType:'music-artists',targetId:String(id),action:'media.music-artists.update'}}))
 for(const filter of ['featured','missing-image']){const r=await api.GET(req('GET',undefined,'&paged=1&q='+stamp+'&profileFilter='+filter));assert.equal(r.status,200);assert.equal((await r.json()).total,1)}
 assert.equal((await(await api.GET(req('GET',undefined,'&paged=1&q='+stamp+'&profileFilter=unlinked'))).json()).total,0)
 for(const limit of ['20','50','100','500','all'])assert.equal((await(await api.GET(req('GET',undefined,'&paged=1&q='+stamp+'&limit='+limit+'&page=999'))).json()).rows.length,1)
 assert.equal((await api.GET(req('GET',undefined,'&paged=1&profileFilter=bad'))).status,422)
 assert.equal((await api.PATCH(req('PATCH',{id,expectedUpdatedAt:'bad'}))).status,422)
 assert.equal((await api.PATCH(req('PATCH',edit,'','https://foreign.invalid'))).status,403)
 assert.equal((await api.PATCH(req('PATCH',edit,'',''))).status,403)
 limited=true;assert.equal((await api.PATCH(req('PATCH',edit))).status,429);limited=false;assert.ok(strictCalls>0)
 enabled=false;assert.equal((await api.GET(req())).status,404);assert.equal((await api.POST(req('POST',{}))).status,404);enabled=true
 // Compatibility: old import-style partial saves still preserve unrelated columns, FKs and URL.
 await api.saveMediaItem('music-artists',{bio:'Legacy partial biography'},id)
 stored=await db.musicArtist.findUniqueOrThrow({where:{id}});assert.equal(stored.name,profile.name);assert.equal(stored.image,'');assert.equal(stored.slug,slug)
 assert.equal((await db.musicTrack.findUniqueOrThrow({where:{slug:stamp+'-own'}})).artistId,id)
 viewer=author;assert.equal((await api.DELETE(req('DELETE',undefined,'&id='+id))).status,403)
 let bulk=await api.BULK(req('POST',{ids:[id],action:'delete'}));assert.equal(bulk.status,200);assert.equal((await bulk.json()).changed,0);assert.ok(await db.musicArtist.findUnique({where:{id}}))
 viewer=manager;const disposable=await db.musicArtist.create({data:{slug:stamp+'-disposable',name:stamp+' disposable',createdById:manager.id}})
 bulk=await api.BULK(req('POST',{ids:[disposable.id],action:'delete'}));assert.equal(bulk.status,200);assert.equal((await bulk.json()).changed,1);assert.equal(await db.musicArtist.findUnique({where:{id:disposable.id}}),null)
 console.log('Music artist PostgreSQL: existing owner create/edit/revisions/audit, simultaneous CAS409, audit rollback, stable slug/aliases/FKs/blank picture, legacy partial update, manager/own-author/shared read/foreign draft privacy, filters/5 page sizes/module/Origin/limit denials passed.')
}finally{
 const artists=await db.musicArtist.findMany({where:{slug:{startsWith:stamp}},select:{id:true}})
 await db.contentRevision.deleteMany({where:{entityType:'music-artists',entityId:{in:artists.map(a=>a.id)}}});await db.musicArtist.deleteMany({where:{id:{in:artists.map(a=>a.id)}}});await db.auditLog.deleteMany({where:{actorUserId:{in:users.map(u=>u.id)}}});await db.user.deleteMany({where:{id:{in:users.map(u=>u.id)},email:{endsWith:'@example.invalid'}}});await db.$disconnect()
}}
main().catch(error=>{console.error(error);process.exitCode=1})
