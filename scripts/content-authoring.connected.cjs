// Actual PostgreSQL persistence/read models. External effects are injected explicitly.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),{PrismaClient}=require('@prisma/client')
const db=new PrismaClient(),stamp=`authoring-${Date.now()}`,cache=new Map(),ids={},transfers=[],jobs=[],blobs=[]
assert.match(new URL(process.env.DATABASE_URL).pathname,/^\/mobocom_authoring_/,'this check owns only a disposable authoring database')
function load(file){
 const base=path.resolve(file),full=fs.existsSync(base)&&fs.statSync(base).isFile()?base:['.ts','.tsx','/index.ts'].map(ext=>base+ext).find(fs.existsSync)
 if(!full)throw Error('Missing module '+file)
 if(cache.has(full))return cache.get(full).exports
 const mod={exports:{}};cache.set(full,mod)
 const code=ts.transpileModule(fs.readFileSync(full,'utf8'),{fileName:full,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText
 new Function('require','module','exports',code)(name=>{
  if(name==='@/platform/database/prisma')return{db}
  if(name==='@/extensions/server/modules')return{isModuleEnabled:async()=>true,getModuleSettings:async()=>({})}
  if(name==='@/modules/content/server/events')return{contentChanged:()=>{},MEDIA_RESOURCE_TYPE:{}}
  if(name==='@/platform/observability/logger')return{logEvent:()=>{}}
  if(name==='react')return{...require('react'),cache:fn=>fn}
  if(name.endsWith('.json'))return require(name.startsWith('@/')?path.resolve('src',name.slice(2)):name.startsWith('.')?path.resolve(path.dirname(full),name):name)
  return name.startsWith('@/')?load('src/'+name.slice(2)):name.startsWith('.')?load(path.resolve(path.dirname(full),name)):require(name)
 },mod,mod.exports);return mod.exports
}
async function main(){try{
 const media=load('src/modules/media/server/admin.ts'),cinema=load('src/modules/media/server/queries/cinema.ts'),music=load('src/modules/media/server/queries/music.ts')
 const rich='<p dir="rtl"><strong>خلاصهٔ داستان</strong></p><p>سطر دوم</p><script>bad()</script><img src=x onerror="bad()">'
 const title=(await media.saveMediaItem('cinema-titles',{title:stamp,slug:stamp,kind:'SERIES',status:'PUBLISHED',publishedAt:new Date().toISOString(),summary:rich,seasons:[{number:1,episodes:[{number:1,title:'قسمت یک',summary:rich,links:[]}]}]},null)).row;ids.title=title.id
 const stored=await db.cinemaTitle.findUniqueOrThrow({where:{id:title.id}})
 assert.match(stored.summary,/<strong>/);assert.doesNotMatch(stored.summary,/<script|onerror/)
 const view=await cinema.getTitle(stamp)
 assert.match(view.title.summaryHtml,/<strong>/);assert.doesNotMatch(view.title.summary,/<strong>/)
 assert.match(view.seasons[0].episodes[0].summaryHtml,/<strong>/);assert.doesNotMatch(view.seasons[0].episodes[0].summaryHtml,/<script|onerror/)
 await db.cinemaTitle.update({where:{id:title.id},data:{summary:rich}}) // historical HTML can predate the save sanitizer
 assert.doesNotMatch((await cinema.getTitle(stamp)).title.summaryHtml,/<script|onerror/)
 await media.saveMediaItem('cinema-titles',{summary:'سطر یک\nسطر دو'},title.id)
 assert.match((await cinema.getTitle(stamp)).title.summaryHtml,/<br\s*\/>/)
 const artist=(await media.saveMediaItem('music-artists',{name:stamp,slug:stamp},null)).row;ids.artist=artist.id
 const track=(await media.saveMediaItem('music-tracks',{title:stamp,slug:stamp,artistId:artist.id,status:'PUBLISHED',publishedAt:new Date().toISOString(),lyrics:rich},null)).row;ids.track=track.id
 assert.match((await db.musicTrack.findUniqueOrThrow({where:{id:track.id}})).lyrics,/<strong>/)
 assert.doesNotMatch((await db.musicTrack.findUniqueOrThrow({where:{id:track.id}})).lyrics,/<script|onerror/)
 const playlist=(await media.saveMediaItem('music-playlists',{title:stamp,slug:stamp,status:'PUBLISHED',description:rich,trackIds:[track.id]},null)).row;ids.playlist=playlist.id
 const list=await music.getPlaylist(stamp);assert.match(list.playlist.descriptionHtml,/<strong>/);assert.doesNotMatch(list.playlist.description,/<strong>/)
 const taxonomy=load('src/modules/taxonomy/server/taxonomy.ts')
 const parent=await taxonomy.saveTerm('cinema',{name:stamp,facet:'genres'}),drama=await taxonomy.saveTerm('cinema',{name:stamp+' Drama',parentId:parent.id})
 await media.saveMediaItem('cinema-titles',{terms:{ids:[parent.id,drama.id]},genres:'wrong',countries:'Kept',imdbId:'https://www.imdb.com/title/tt1375666/'},title.id)
 let filed=await db.cinemaTitle.findUniqueOrThrow({where:{id:title.id}});assert.equal(filed.genres,drama.name);assert.equal(filed.imdbId,'tt1375666')
 await media.saveMediaItem('cinema-titles',{terms:{ids:[]}},title.id)
 filed=await db.cinemaTitle.findUniqueOrThrow({where:{id:title.id}});assert.equal(filed.genres,'');assert.equal(filed.countries,'Kept')
 await media.saveMediaItem('cinema-titles',{genres:'Manual legacy'},title.id);assert.equal((await db.cinemaTitle.findUniqueOrThrow({where:{id:title.id}})).genres,'Manual legacy')
 await assert.rejects(()=>taxonomy.saveTerm('cinema',{name:stamp+' Invalid',facet:'password'}),/معتبر/)
 const secretKey='cinema.metadata.secret.v1',priorKey=process.env.PANEL_CREDENTIAL_KEY
 assert.equal(await db.setting.count({where:{key:secretKey}}),0)
 process.env.PANEL_CREDENTIAL_KEY='a'.repeat(64)
 try {
   const settings=load('src/modules/cinema/server/metadata.ts')
   await settings.saveMetadataConfig({tmdbToken:'owned-token',enabled:true});const cfg=await settings.metadataConfig();assert.equal(cfg.tmdbConfigured,true);assert.equal(cfg.cinemetaFallback,true);assert.ok(!JSON.stringify(cfg).includes('owned-token'));assert.ok(!(await db.setting.findUnique({where:{key:secretKey}})).value.includes('owned-token'))
   await Promise.all([settings.saveMetadataConfig({enabled:false,provider:'imdb'}),settings.saveMetadataConfig({omdbKey:'owned-key',copyImages:false}),settings.saveMetadataConfig({cinemetaFallback:false})]);const merged=await settings.metadataConfig();assert.equal(merged.enabled,false);assert.equal(merged.omdbConfigured,true);assert.equal(merged.provider,'imdb');assert.equal(merged.copyImages,false);assert.equal(merged.cinemetaFallback,false)
   await assert.rejects(()=>settings.saveMetadataConfig({provider:'arbitrary-host'}),/معتبر/)
   await settings.saveMetadataConfig({enabled:true,provider:'imdb',copyImages:false,cinemetaFallback:false})
   const priorFetch=global.fetch,metadataCalls=[]
   try {
     global.fetch=async(url)=>{metadataCalls.push(String(url));return String(url).includes('/suggestion/')?Response.json({d:[{id:'tt0944947',l:'Game of Thrones',qid:'tvSeries',y:2011}]}):new Response('challenge',{status:202,headers:{'content-type':'text/html'}})}
     const before=await db.cinemaTitle.findUniqueOrThrow({where:{id:title.id}}),result=await settings.lookupCinemaMetadata('tt0944947')
     assert.match(result.source,/جستجوی عمومی/);assert.ok(result.warnings.some(x=>x.includes('ناقص')))
     await media.saveMediaItem('cinema-titles',result.fields,title.id)
     const after=await db.cinemaTitle.findUniqueOrThrow({where:{id:title.id}})
     assert.equal(after.title,'Game of Thrones');assert.equal(after.year,2011);assert.equal(after.imdbId,'tt0944947')
     for(const key of ['summary','director','genres','countries','languages','imdbRating','poster'])assert.deepEqual(after[key],before[key],key+' must not be erased by partial metadata')
     assert.deepEqual(metadataCalls,['https://www.imdb.com/title/tt0944947/','https://v3.sg.media-imdb.com/suggestion/t/tt0944947.json'])
   }finally{global.fetch=priorFetch}
   await settings.saveMetadataConfig({cinemetaFallback:true})
   try {
     global.fetch=async(url)=>String(url).startsWith('https://v3-cinemeta.strem.io/')?Response.json({meta:{id:'tt1375666',imdb_id:'tt1375666',type:'movie',name:'Inception fixture',description:'Owned metadata synopsis',imdbRating:'8.8',cast:[stamp+' metadata actor'],director:[stamp+' metadata director']}}):new Response('unavailable',{status:202,headers:{'content-type':'text/html'}})
     await media.saveMediaItem('cinema-titles',{cast:[{name:stamp+' metadata actor',role:'Existing role',image:'/files/owned-before.webp'}]},title.id)
     const before=await db.cinemaTitle.findUniqueOrThrow({where:{id:title.id}}),result=await settings.lookupCinemaMetadata('tt1375666')
     const {applyCinemaMetadata}=load('src/modules/cinema/domain/metadata.ts')
     await media.saveMediaItem('cinema-titles',applyCinemaMetadata({cast:JSON.parse(before.cast)},result.fields,true,false),title.id)
     const after=await db.cinemaTitle.findUniqueOrThrow({where:{id:title.id},include:{credits:{include:{person:true}}}}),cast=JSON.parse(after.cast)
     assert.equal(after.summary,'Owned metadata synopsis');assert.equal(after.imdbRating,8.8);assert.equal(after.director,stamp+' metadata director')
     assert.equal(cast[0].image,'/files/owned-before.webp');assert.equal(cast[0].role,'Existing role');assert.ok(after.credits.some(c=>c.role==='CAST'&&c.person.name===stamp+' metadata actor'));assert.ok(after.credits.some(c=>c.role==='DIRECTOR'&&c.person.name===stamp+' metadata director'))
   }finally{global.fetch=priorFetch}
 }finally{await db.setting.deleteMany({where:{key:secretKey}});if(priorKey===undefined)delete process.env.PANEL_CREDENTIAL_KEY;else process.env.PANEL_CREDENTIAL_KEY=priorKey}
 await checkOrganization()
 console.log('Content authoring PostgreSQL: sanitized formatted stories/episodes/lyrics/playlists, plain card projections and historical newlines passed.')
}finally{
 await db.contentRevision.deleteMany({where:{OR:Object.entries({ 'cinema-titles':ids.title,'music-artists':ids.artist,'music-tracks':ids.track,'music-playlists':ids.playlist }).filter(([,id])=>id).map(([entityType,entityId])=>({entityType,entityId}))}}).catch(()=>{})
 await db.taxonomyAssignment.deleteMany({where:{taxonomy:'cinema',ownerId:ids.title||-1}});await db.taxonomyTerm.deleteMany({where:{name:{startsWith:stamp}}})
 await db.cinemaTitle.deleteMany({where:{slug:{startsWith:stamp}}});await db.cinemaPerson.deleteMany({where:{name:{startsWith:stamp}}});await db.musicPlaylist.deleteMany({where:{slug:{startsWith:stamp}}});await db.musicTrack.deleteMany({where:{slug:{startsWith:stamp}}});await db.musicArtist.deleteMany({where:{slug:{startsWith:stamp}}});await db.$disconnect()
}}
async function checkOrganization(){
 const http=require('node:http'),fsp=require('node:fs/promises'),crypto=require('node:crypto'),oldRoot=process.env.DOWNLOADS_ROOT,oldLoop=process.env.IMPORT_ALLOW_LOOPBACK,root='/tmp/'+stamp,users=[]
 let server,base
 const priorSettings=await db.setting.findUnique({where:{key:'media.library.v1'}})
 const image=await require('sharp')(crypto.randomBytes(17*17*3),{raw:{width:17,height:17,channels:3}}).png().toBuffer();let hits=0
 try {
  process.env.DOWNLOADS_ROOT=root;process.env.IMPORT_ALLOW_LOOPBACK='1'
  await db.setting.upsert({where:{key:'media.library.v1'},create:{key:'media.library.v1',value:'{}'},update:{value:'{}'}})
  const user=await db.user.create({data:{email:stamp+'@example.invalid',name:stamp,role:'ADMIN',passwordHash:'owned',totpEnabledAt:new Date()}});users.push(user.id)
  server=http.createServer((req,res)=>{hits++;res.setHeader('content-type',req.url.endsWith('.png')?'image/png':'application/octet-stream');res.end(req.url.endsWith('.png')?image:Buffer.from('owned bytes'))});await new Promise(r=>server.listen(0,'0.0.0.0',r));base='http://127.0.0.1:'+server.address().port
  const lib=load('src/modules/media/server/library.ts'),actor={id:user.id,authAt:new Date()},organization={section:'film',title:stamp},input={url:base+'/file.mp4',kind:'file',organization,mode:'immediate'}
  const file=await lib.requestTransfer(actor,input);transfers.push(file.id);const row=await db.mediaTransfer.findUniqueOrThrow({where:{id:file.id},include:{asset:true,folder:true}})
  assert.equal(row.destination,`download/movie/${stamp}`);assert.equal(row.folder.name,stamp);assert.ok(row.asset.key.startsWith(row.destination+'/'));assert.equal(await fsp.readFile(path.join(root,row.asset.key),'utf8'),'owned bytes');assert.ok(file.url.startsWith('/files/download/movie/'))
  assert.equal((await lib.requestTransfer(actor,input)).id,file.id)
  const pic=await lib.requestTransfer(actor,{...input,url:base+'/cover.png',kind:'image'});transfers.push(pic.id);const picture=await db.mediaTransfer.findUniqueOrThrow({where:{id:pic.id},include:{asset:true,folder:true}});assert.equal(picture.destination,`download/movie/${stamp}/images`);assert.equal(picture.asset.mime,'image/webp');assert.equal(picture.folder.name,'images');assert.ok((await require('sharp')(path.join(root,picture.asset.key)).metadata()).width>0)
  assert.ok(picture.asset.width>0 && picture.asset.height>0,'organized images retain Library dimensions')
  const legacy=await db.importMedia.findFirstOrThrow({where:{sourceUrl:base+'/cover.png'}});blobs.push(path.join(process.cwd(),'storage','covers',legacy.localUrl.split('/').pop()))
  const queued=await lib.requestTransfer(actor,{...input,url:base+'/season.mp4',organization:{section:'series',title:stamp,season:3},mode:'queued'});transfers.push(queued.id);await lib.runTransfer({id:queued.id,generation:0});assert.equal((await db.mediaTransfer.findUniqueOrThrow({where:{id:queued.id}})).destination,`download/series/${stamp}/Season3`)
  const localPeople=[]
  for(const personRole of ['actor','director']) {
   const name=stamp+' '+personRole,pending=await lib.requestTransfer(actor,{url:base+'/'+personRole+'.png',kind:'image',name,section:'cinema',mode:'queued',organization:{section:'cinema-person',title:name,personRole}});transfers.push(pending.id)
   assert.equal(pending.status,'QUEUED');assert.match(pending.url,/^\/api\/media\/transfers\//)
   const drained=await load('src/modules/operations/server/queue.ts').runQueue(5000);assert.ok(drained.ran>0,'the registered queue worker handles the queued image')
   const copied=await db.mediaTransfer.findUniqueOrThrow({where:{id:pending.id},include:{asset:true,folder:true}}),dest=`download/cinema/images/${personRole==='actor'?'actors':'director'}/${name}`
   assert.equal(copied.status,'READY');assert.equal(copied.destination,dest);assert.equal(copied.folder.name,name);assert.equal(copied.asset.mime,'image/webp');assert.ok(copied.asset.width>0);assert.ok(copied.asset.key.startsWith(dest+'/'));assert.ok((await fsp.stat(path.join(root,copied.asset.key))).size>0)
   assert.equal((await lib.publicTransfer(pending.id)).headers.get('location'),lib.assetUrl(copied.asset))
   const served=await load('src/modules/downloads/server/files.ts').serveLocalFile(new Request('http://localhost'+lib.assetUrl(copied.asset)),copied.asset.key.split('/'));assert.equal(served.status,200);assert.equal(served.headers.get('content-type'),'image/webp');assert.equal((await require('sharp')(Buffer.from(await served.arrayBuffer())).metadata()).width,17)
   const legacy=await db.importMedia.findFirstOrThrow({where:{sourceUrl:base+'/'+personRole+'.png'}});blobs.push(path.join(process.cwd(),'storage','covers',legacy.localUrl.split('/').pop()))
   localPeople.push({name,image:pending.url})
  }
  const media=load('src/modules/media/server/admin.ts'),normalize=load('src/modules/cinema/domain/people.ts').normalizePersonName
  await db.cinemaPerson.create({data:{name:localPeople[0].name,normalizedName:normalize(localPeople[0].name),image:'https://m.media-amazon.com/images/existing.jpg'}})
  await media.saveMediaItem('cinema-titles',{cast:[{...localPeople[0],role:'Hero'}],director:localPeople[1].name,directorImages:[localPeople[1]]},ids.title)
  for(const p of localPeople)assert.equal((await db.cinemaPerson.findUniqueOrThrow({where:{normalizedName:normalize(p.name)}})).image,p.image)
  await media.saveMediaItem('cinema-titles',{cast:[{name:localPeople[0].name,image:'https://m.media-amazon.com/images/other.jpg'}]},ids.title)
  assert.equal((await db.cinemaPerson.findUniqueOrThrow({where:{normalizedName:normalize(localPeople[0].name)}})).image,localPeople[0].image,'existing local person pictures stay local')
  const legacyDestination=`download/film/${stamp}/video`,oldTransfer=await db.mediaTransfer.create({data:{actorId:user.id,authAt:actor.authAt,sourceUrl:base+'/legacy.mp4',sourceHash:stamp+'-legacy',destination:legacyDestination,kind:'file',section:'cinema',status:'FAILED'}})
  transfers.push(oldTransfer.id)
  const retry=await lib.requestTransfer(actor,{url:oldTransfer.sourceUrl,destination:oldTransfer.destination,mode:'queued'},undefined,oldTransfer.id)
  const generation=(await db.mediaTransfer.findUniqueOrThrow({where:{id:retry.id}})).generation;await lib.runTransfer({id:retry.id,generation})
  const legacyReady=await db.mediaTransfer.findUniqueOrThrow({where:{id:retry.id},include:{asset:true}});assert.equal(legacyReady.destination,legacyDestination);assert.ok(lib.assetUrl(legacyReady.asset).startsWith('/files/download/film/'))
  const before=hits,services=load('src/modules/imports/server/library-media.ts').importMediaServices
  const keep=services(null,{options:{copyAssets:false}},false);assert.equal((await keep.importFile(base+'/skip.mp4',organization)).url,base+'/skip.mp4');assert.equal((await keep.importImage(base+'/skip.png',organization)).url,base+'/skip.png');assert.equal(hits,before)
  const guard=load('src/modules/downloads/server/organization.ts');await fsp.mkdir(root+'/outside',{recursive:true});await fsp.symlink(root+'/outside',root+'/download/film/escape');await assert.rejects(()=>guard.organizedDirectory(root,'download/film/escape/video'),/امن/);await assert.rejects(()=>guard.organizedDirectory(root,'download/film/../../outside'),/معتبر/)
  console.log('Connected: category projections, encrypted settings/source/copy CAS; actual movie/actor/director WebP folders, served local READY bytes, CinemaPerson image promotion/preservation, legacy film retry, dedupe/Season3/opt-out and path guards passed.')
 }finally {
  if(server)await new Promise(r=>server.close(r))
  const rows=await db.mediaTransfer.findMany({where:{actorId:{in:users}}});const assetIds=rows.map(r=>r.assetId).filter(Boolean)
  await db.mediaTransfer.deleteMany({where:{actorId:{in:users}}});await db.backgroundJob.deleteMany({where:{id:{in:rows.map(r=>r.jobId).filter(Boolean)}}});await db.mediaAsset.deleteMany({where:{id:{in:assetIds}}});if(base)await db.importMedia.deleteMany({where:{sourceUrl:{startsWith:base}}})
  await db.mediaFolder.updateMany({where:{createdById:{in:users}},data:{parentId:null}});await db.mediaFolder.deleteMany({where:{createdById:{in:users}}});await db.auditLog.deleteMany({where:{actorUserId:{in:users}}});await db.user.deleteMany({where:{id:{in:users}}})
  for(const file of blobs)await fsp.rm(file,{force:true})
  if(root.startsWith('/tmp/authoring-'))await fsp.rm(root,{force:true,recursive:true})
  if(priorSettings)await db.setting.update({where:{key:priorSettings.key},data:{value:priorSettings.value}});else await db.setting.deleteMany({where:{key:'media.library.v1'}})
  for(const [key,value]of [['DOWNLOADS_ROOT',oldRoot],['IMPORT_ALLOW_LOOPBACK',oldLoop]])if(value===undefined)delete process.env[key];else process.env[key]=value
 }
}
main().catch(e=>{console.error(e);process.exitCode=1})
