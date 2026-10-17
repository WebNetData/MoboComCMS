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
   await settings.saveMetadataConfig({tmdbToken:'owned-token',enabled:true});const cfg=await settings.metadataConfig();assert.equal(cfg.tmdbConfigured,true);assert.ok(!JSON.stringify(cfg).includes('owned-token'));assert.ok(!(await db.setting.findUnique({where:{key:secretKey}})).value.includes('owned-token'))
   await Promise.all([settings.saveMetadataConfig({enabled:false}),settings.saveMetadataConfig({omdbKey:'owned-key'})]);const merged=await settings.metadataConfig();assert.equal(merged.enabled,false);assert.equal(merged.omdbConfigured,true)
 }finally{await db.setting.deleteMany({where:{key:secretKey}});if(priorKey===undefined)delete process.env.PANEL_CREDENTIAL_KEY;else process.env.PANEL_CREDENTIAL_KEY=priorKey}
 await checkOrganization()
 console.log('Content authoring PostgreSQL: sanitized formatted stories/episodes/lyrics/playlists, plain card projections and historical newlines passed.')
}finally{
 await db.contentRevision.deleteMany({where:{OR:Object.entries({ 'cinema-titles':ids.title,'music-artists':ids.artist,'music-tracks':ids.track,'music-playlists':ids.playlist }).filter(([,id])=>id).map(([entityType,entityId])=>({entityType,entityId}))}}).catch(()=>{})
 await db.taxonomyAssignment.deleteMany({where:{taxonomy:'cinema',ownerId:ids.title||-1}});await db.taxonomyTerm.deleteMany({where:{name:{startsWith:stamp}}})
 await db.cinemaTitle.deleteMany({where:{slug:{startsWith:stamp}}});await db.musicPlaylist.deleteMany({where:{slug:{startsWith:stamp}}});await db.musicTrack.deleteMany({where:{slug:{startsWith:stamp}}});await db.musicArtist.deleteMany({where:{slug:{startsWith:stamp}}});await db.$disconnect()
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
  assert.equal(row.destination,`download/film/${stamp}/video`);assert.equal(row.folder.name,'video');assert.ok(row.asset.key.startsWith(row.destination+'/'));assert.equal(await fsp.readFile(path.join(root,row.asset.key),'utf8'),'owned bytes');assert.ok(file.url.startsWith('/files/download/film/'))
  assert.equal((await lib.requestTransfer(actor,input)).id,file.id)
  const pic=await lib.requestTransfer(actor,{...input,url:base+'/cover.png',kind:'image'});transfers.push(pic.id);const picture=await db.mediaTransfer.findUniqueOrThrow({where:{id:pic.id},include:{asset:true,folder:true}});assert.equal(picture.destination,`download/film/${stamp}/images`);assert.equal(picture.asset.mime,'image/webp');assert.equal(picture.folder.name,'images');assert.ok((await require('sharp')(path.join(root,picture.asset.key)).metadata()).width>0)
  assert.ok(picture.asset.width>0 && picture.asset.height>0,'organized images retain Library dimensions')
  const legacy=await db.importMedia.findFirstOrThrow({where:{sourceUrl:base+'/cover.png'}});blobs.push(path.join(process.cwd(),'storage','covers',legacy.localUrl.split('/').pop()))
  const queued=await lib.requestTransfer(actor,{...input,url:base+'/season.mp4',organization:{section:'series',title:stamp,season:3},mode:'queued'});transfers.push(queued.id);await lib.runTransfer({id:queued.id,generation:0});assert.equal((await db.mediaTransfer.findUniqueOrThrow({where:{id:queued.id}})).destination,`download/series/${stamp}/Season3`)
  const before=hits,services=load('src/modules/imports/server/library-media.ts').importMediaServices
  const keep=services(null,{options:{copyAssets:false}},false);assert.equal((await keep.importFile(base+'/skip.mp4',organization)).url,base+'/skip.mp4');assert.equal((await keep.importImage(base+'/skip.png',organization)).url,base+'/skip.png');assert.equal(hits,before)
  const guard=load('src/modules/downloads/server/organization.ts');await fsp.mkdir(root+'/outside',{recursive:true});await fsp.symlink(root+'/outside',root+'/download/film/escape');await assert.rejects(()=>guard.organizedDirectory(root,'download/film/escape/video'),/امن/);await assert.rejects(()=>guard.organizedDirectory(root,'download/film/../../outside'),/معتبر/)
  console.log('Connected: category projections/clear/legacy preservation; encrypted settings + concurrent merge; actual file/image copies, shared folder tree, dedupe, queued Season3, explicit zero-fetch opt-out and symlink/traversal denial passed.')
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
