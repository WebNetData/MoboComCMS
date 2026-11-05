// Real PostgreSQL + bounded HTTP transfer + physical ID3 bytes. No external messages/providers.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process'),{PrismaClient}=require('@prisma/client')
const db=new PrismaClient(),stamp='owned-music-files-'+Date.now(),load=require('./connected-source-loader.cjs')({'@/platform/database/prisma':{db}})
const ids=[],assets=[],files=[],folders=[],jobs=[];let user,role,artist,server,previous
const saved=new Map(),keys=['music.portal.v1','media.library.v1','social.config.v1','downloads.config.v1']
const set=(key,value)=>db.setting.upsert({where:{key},create:{key,value:JSON.stringify(value)},update:{value:JSON.stringify(value)}})
async function main(){try{
 for(const key of keys)saved.set(key,await db.setting.findUnique({where:{key}}))
 await set('music.portal.v1',{renameTransferredFiles:true,tagTransferredFiles:true,fileTagBrand:'موبوکام',fileTagUrl:'https://Mobocom.net',future:'kept'})
 await set('media.library.v1',{enabled:true,organize:false})
 previous=process.env.IMPORT_ALLOW_LOOPBACK;process.env.IMPORT_ALLOW_LOOPBACK='1'
 role=await db.role.create({data:{name:stamp,permissions:'media.manage,music.manage,settings.manage'}})
 user=await db.user.create({data:{email:stamp+'@example.invalid',name:stamp,passwordHash:'fixture-only',role:'ADMIN',roleId:role.id,totpEnabledAt:new Date()}})
 artist=await db.musicArtist.create({data:{name:'خواننده',nameEn:'Foreign Artist',slug:stamp}})
 const {buildId3,id3v2Size}=load('src/modules/downloads/domain/filemeta.ts')
 const audio=Buffer.alloc(417*12);for(let n=0;n<12;n++)audio.set([0xff,0xfb,0x90,0x00],417*n)
 let source=Buffer.concat([buildId3({title:'SOURCE AD',comment:'source.example'}),audio])
 server=http.createServer((_req,res)=>{res.setHeader('content-type','audio/mpeg');res.end(source)});await new Promise(r=>server.listen(0,'127.0.0.1',r))
 const url='http://127.0.0.1:'+server.address().port+'/bad_source_name.mp3',actor={id:user.id,authAt:new Date()}
 const transfers=load('src/modules/media/server/library/transfers.ts'),root=load('src/modules/downloads/server/files.ts').filesRoot()
 const request=async(suffix,meta={})=>{const r=await transfers.requestTransfer(actor,{url:url+'?v='+suffix,kind:'file',section:'music',mode:'queued',organization:{section:'music',artistId:artist.id,artist:'Wrong Client Name',title:'آهنگ',titleEn:'Foreign Song',quality:'320',...meta}});ids.push(r.id);return db.mediaTransfer.findUniqueOrThrow({where:{id:r.id}})}
 const run=async(row)=>{await transfers.runTransfer({id:row.id,generation:row.generation});const done=await db.mediaTransfer.findUniqueOrThrow({where:{id:row.id},include:{asset:true}});assert.equal(done.status,'READY');assets.push(done.assetId);files.push(path.join(root,done.asset.key));return done}
 const queued=await request('queued');assert.equal(JSON.parse(queued.musicMetadata).artist,'Foreign Artist')
 // The stored snapshot survives later artist edits and a fresh worker/module instance.
 await db.musicArtist.update({where:{id:artist.id},data:{nameEn:'Later Artist'}})
 const first=await run(queued);assert.equal(path.basename(first.asset.key),'Foreign Artist - Foreign Song - 320.mp3')
 const bytes=await fs.readFile(files.at(-1));assert.deepEqual(bytes.subarray(id3v2Size(bytes)),audio,'every audio byte is unchanged')
 assert.ok(!bytes.includes(Buffer.from('SOURCE AD','utf16le')))
 assert.ok(bytes.includes(Buffer.from('Foreign Song','utf16le')));assert.ok(bytes.includes(Buffer.from('Foreign Artist','utf16le')))
 assert.ok(bytes.includes(Buffer.from('موبوکام','utf16le')));assert.ok(bytes.toString('latin1').includes('https://mobocom.net/'))
 await set('downloads.config.v1',{cleanAudio:true,tagComment:'unrelated old cleanup'})
 const local=await load('src/modules/downloads/server/files.ts').serveLocalFile(new Request('http://localhost/files/'+first.asset.key+'?dl=1'),first.asset.key.split('/'))
 assert.deepEqual(Buffer.from(await local.arrayBuffer()),bytes,'download-time cleaning never replaces already branded transfer tags')
 // Same filename, different transfers, atomic exclusive publication.
 await db.musicArtist.update({where:{id:artist.id},data:{nameEn:'Foreign Artist'}})
 const a=await request('collision-a'),b=await request('collision-b'),pair=await Promise.all([run(a),run(b)])
 assert.equal(new Set(pair.map(r=>r.asset.key)).size,2);assert.ok(pair.every(r=>/Foreign Artist - Foreign Song - 320 \([23]\)\.mp3$/.test(r.asset.key)))
 // Fresh settings at execution: queued work obeys disable; original source bytes preserved.
 const off=await request('off');await set('music.portal.v1',{renameTransferredFiles:false,tagTransferredFiles:false})
 const disabled=await run(off);assert.match(path.basename(disabled.asset.key),/bad_source_name\.mp3$/);assert.deepEqual(await fs.readFile(files.at(-1)),source)
 const admin=load('src/modules/music/server/admin.ts')
 await Promise.all([admin.saveMusicSettings({fileTagBrand:'Race Brand'}),admin.saveMusicSettings({showLyrics:false}),admin.saveMusicSettings({fileTagUrl:'https://example.com/music'})])
 const settings=await admin.getMusicSettings(true);assert.equal(settings.fileTagBrand,'Race Brand');assert.equal(settings.showLyrics,false);assert.equal(settings.fileTagUrl,'https://example.com/music')
 const socialOwner=load('src/modules/social/server/social.ts')
 await set('social.config.v1',{telegram:{future:'kept'}})
 await Promise.all([socialOwner.saveSocialSettings({telegram:{includeImage:false}}),socialOwner.saveSocialSettings({instagram:{hashtags:'#owned'}})])
 const socialSettings=JSON.parse((await db.setting.findUnique({where:{key:'social.config.v1'}})).value)
 assert.equal(socialSettings.telegram.includeImage,false);assert.equal(socialSettings.instagram.hashtags,'#owned');assert.equal(socialSettings.telegram.future,'kept')
 // Decode real fixtures before/after stream-copy tagging, when the server has ffmpeg.
 if(cp.spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status===0){
   await set('music.portal.v1',{renameTransferredFiles:true,tagTransferredFiles:true})
   for(const ext of ['mp3','m4a','flac','ogg','opus','wav']){
     const fixture=path.join(root,stamp+'.'+ext);files.push(fixture)
     const generated=cp.spawnSync('ffmpeg',['-v','error','-nostdin','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','0.2','-metadata','comment=source.example','-y',fixture],{encoding:'utf8',timeout:30000});assert.equal(generated.status,0,generated.stderr)
     const raw=await fs.readFile(fixture),policy=await load('src/modules/music/server/file-transfers.ts').prepareMusicTransfer('fixture.'+ext,{artist:'Foreign Artist',title:'Foreign Song'})
     const digest=p=>{const r=cp.spawnSync('ffmpeg',['-v','error','-nostdin','-i',p,'-map','0:a','-f','md5','-'],{encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr);return r.stdout}
     const before=digest(fixture);await policy.prepare(fixture);assert.equal(digest(fixture),before,ext+' decoded audio unchanged')
     const probed=cp.spawnSync('ffprobe',['-v','error','-show_format','-show_streams','-of','json',fixture],{encoding:'utf8',timeout:30000});assert.equal(probed.status,0,probed.stderr)
     const detail=JSON.stringify(JSON.parse(probed.stdout));assert.ok(detail.includes('موبوکام'),ext+' brand');assert.ok(detail.includes('mobocom.net'),ext+' URL');assert.ok(!detail.includes('source.example'),ext+' old advert removed')
   }
   console.log('Actual ffmpeg/ffprobe: MP3, M4A, FLAC, OGG, OPUS and WAV brand/URL tags and unchanged decoded audio passed')
 }
 // A failed tag never publishes an unbranded file as READY.
 await set('music.portal.v1',{renameTransferredFiles:true,tagTransferredFiles:true})
 const bad=await request('bad',{titleEn:'Broken'});server.removeAllListeners('request');server.on('request',(_q,s)=>s.end('not MP3'))
 await assert.rejects(()=>transfers.runTransfer({id:bad.id,generation:0}));assert.equal((await db.mediaTransfer.findUnique({where:{id:bad.id}})).status,'FAILED')
 // Scope revocation is checked before a queued transfer reaches the network.
 const revoked=await request('revoked');await db.user.update({where:{id:user.id},data:{status:'SUSPENDED'}});await assert.rejects(()=>transfers.runTransfer({id:revoked.id,generation:0}));assert.equal((await db.mediaTransfer.findUnique({where:{id:revoked.id}})).status,'PAUSED')
 console.log('Music transfers PG: canonical foreign names, durable snapshot, exact audio bytes, branded tags, concurrent collisions, disable, settings CAS, bad file and revoked actor passed')
}finally{
 if(previous===undefined)delete process.env.IMPORT_ALLOW_LOOPBACK;else process.env.IMPORT_ALLOW_LOOPBACK=previous
 if(server)await new Promise(r=>server.close(r))
 const rows=await db.mediaTransfer.findMany({where:{id:{in:ids}},select:{jobId:true,folderId:true}});jobs.push(...rows.map(r=>r.jobId).filter(Boolean));folders.push(...rows.map(r=>r.folderId).filter(Boolean))
 await db.mediaTransfer.deleteMany({where:{id:{in:ids}}});await db.backgroundJob.deleteMany({where:{id:{in:jobs}}});await db.mediaAsset.deleteMany({where:{id:{in:assets}}})
 for(const p of files)await fs.rm(p,{force:true})
 if(artist)await db.musicArtist.deleteMany({where:{id:artist.id}})
 if(user){await db.auditLog.deleteMany({where:{actorUserId:user.id}});await db.user.deleteMany({where:{id:user.id}})}
 if(role)await db.role.deleteMany({where:{id:role.id}})
 for(const [key,row]of saved)if(row)await db.setting.upsert({where:{key},create:row,update:{value:row.value}});else await db.setting.deleteMany({where:{key}})
 await db.$disconnect()
}}
main().catch(e=>{console.error(e);process.exitCode=1})
