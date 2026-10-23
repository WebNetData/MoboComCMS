const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process'),{PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server')
const db=new PrismaClient(),stamp='audio'+Date.now().toString(36),key='media.library.v1';let root,actor,old,settingsRead=false,originalRoot=process.env.DOWNLOADS_ROOT
const load=require('./connected-source-loader.cjs')({'@/platform/database/prisma':{db},'node:child_process':{spawn:(binary,args,options)=>{assert(!Object.hasOwn(options.env,'DATABASE_URL'),'decoder must not inherit database credentials');assert(!Object.hasOwn(options.env,'NEXTAUTH_SECRET'),'decoder must not inherit signing secrets');return cp.spawn(binary,args,options)}}})
const req=new NextRequest('http://localhost:3000/api/admin/media/library',{headers:{origin:'http://localhost:3000','user-agent':'owned-audio-check'}})
async function main(){
 assert.match(new URL(process.env.DATABASE_URL).pathname,/mobocom_reliability_/,'owned reliability database required')
 root=await fs.mkdtemp(path.join(os.tmpdir(),'owned-audio-'));process.env.DOWNLOADS_ROOT=root
 old=await db.setting.findUnique({where:{key}})
 settingsRead=true
 const user=await db.user.create({data:{email:stamp+'@example.invalid',role:'ADMIN',passwordHash:'fixture',totpEnabledAt:new Date()}});actor={id:user.id,authAt:new Date()}
 const policy=async enabled=>db.setting.upsert({where:{key},create:{key,value:JSON.stringify({compatibleAudio:enabled,maxFileMB:20})},update:{value:JSON.stringify({compatibleAudio:enabled,maxFileMB:20})}})
 await policy(false)
 const dir=path.join(root,'uploads/cinema/2026-10');await fs.mkdir(dir,{recursive:true});const source=path.join(dir,stamp+'.mkv')
 const made=cp.spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=black:s=160x90:r=10','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','2','-c:v','libx264','-c:a','ac3',source],{encoding:'utf8'});assert.equal(made.status,0,made.stderr)
 const before=crypto.createHash('sha256').update(await fs.readFile(source)).digest('hex')
 const lib=load('src/modules/media/server/library.ts'),audio=load('src/modules/media/server/library/compatible-audio.ts')
 const asset=await lib.registerLocalAsset('/files/uploads/cinema/2026-10/'+stamp+'.mkv',actor.id)
 await assert.rejects(audio.inspectCompatibleAudio(actor,asset.id),/غیرفعال/)
 await policy(true)
 const originalSecret=process.env.NEXTAUTH_SECRET;process.env.NEXTAUTH_SECRET ||= Buffer.alloc(32,1).toString('hex')
 try{
  const token=await require('next-auth/jwt').encode({secret:process.env.NEXTAUTH_SECRET,token:{uid:user.id,authAt:Date.now(),role:'ADMIN',email:user.email},maxAge:60})
  const stored=await db.setting.findUniqueOrThrow({where:{key}})
  const request=new NextRequest('http://localhost:3000/api/admin/media/library',{method:'POST',headers:{origin:'http://localhost:3000',cookie:'next-auth.session-token='+token,'content-type':'application/json'},body:JSON.stringify({action:'settings.save',stamp:stored.value,value:{enabled:true,organize:true,maxFileMB:20.1,timeoutSeconds:120}})})
  const answer=await load('src/modules/media/server/library/http.ts').POST(request)
  assert.equal(answer.status,200,await answer.text())
  assert.equal(JSON.parse((await db.setting.findUniqueOrThrow({where:{key}})).value).compatibleAudio,true,'legacy settings client preserves the new policy')
 }finally{if(originalSecret===undefined)delete process.env.NEXTAUTH_SECRET;else process.env.NEXTAUTH_SECRET=originalSecret}
 const inspected=await audio.inspectCompatibleAudio(actor,asset.id);assert.equal(inspected.tracks[0].codec,'ac3')
 const input={assetId:asset.id,revision:asset.revision,stream:inspected.tracks[0].index}
 await assert.rejects(audio.requestCompatibleAudio(actor,{...input,stream:99},req),/ترک/)
 await assert.rejects(audio.requestCompatibleAudio(actor,{...input,revision:99},req),/تغییر/)
 const job=await audio.requestCompatibleAudio(actor,input,req),again=await audio.requestCompatibleAudio(actor,input,req);assert.equal(job.id,again.id,'active request dedupe')
 await load('src/modules/operations/server/queue.ts').runQueue(2000)
 const completed=await db.backgroundJob.findUniqueOrThrow({where:{id:job.id}})
 assert.equal(completed.status,'DONE','actual Operations handler must complete the same lease')
 const payload=JSON.parse(completed.payload),result=JSON.parse(completed.result)
 // Simulate an interrupted completion replay using the already-adopted derivative.
 await db.backgroundJob.update({where:{id:job.id},data:{status:'RUNNING',attempts:1,lockedAt:new Date()}})
 const output=await db.mediaAsset.findUniqueOrThrow({where:{id:result.assetId}});assert.equal(output.kind,'audio');assert.equal(output.createdById,actor.id);assert.match(result.url,/\.m4a$/)
 assert.equal((await audio.runCompatibleAudio(payload,job.id,1)).assetId,result.assetId,'retry after adoption reuses the verified derivative')
 await assert.rejects(audio.runCompatibleAudio({...payload,authAt:'corrupt'},job.id,1),/اختیار/)
 await assert.rejects(audio.runCompatibleAudio(payload,job.id,2),/اختیار/)
 const probed=cp.spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_name','-of','json',path.join(root,output.key)],{encoding:'utf8'});assert.equal(JSON.parse(probed.stdout).streams[0].codec_name,'aac')
 assert.equal(crypto.createHash('sha256').update(await fs.readFile(source)).digest('hex'),before,'source retained')
 await db.user.update({where:{id:actor.id},data:{status:'DISABLED'}})
 await assert.rejects(audio.runCompatibleAudio(payload,job.id,1),/اختیار/)
 await db.user.update({where:{id:actor.id},data:{status:'ACTIVE'}})
 await policy(false);await assert.rejects(audio.runCompatibleAudio(payload,job.id,1),/غیرفعال/);await policy(true)
 await fs.appendFile(source,'changed');await assert.rejects(audio.runCompatibleAudio(payload,job.id,1),/تغییر/)
 const denied=await db.role.create({data:{name:stamp,permissions:'journal.author'}});await db.user.update({where:{id:actor.id},data:{roleId:denied.id}})
 await assert.rejects(audio.inspectCompatibleAudio(actor,asset.id),/اختصاص/)
 await db.user.update({where:{id:actor.id},data:{roleId:null}});await db.role.delete({where:{id:denied.id}})
 console.log('Compatible audio: real AC3 -> AAC, source hash retained, default-off, current authority/policy, stale source/revision/stream refusals and active dedupe passed')
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{try{
 if(actor){await db.backgroundJob.deleteMany({where:{dedupeKey:{startsWith:`media-audio:${actor.id}:`}}});await db.mediaAsset.deleteMany({where:{createdById:actor.id}});await db.contentRevision.deleteMany({where:{actorId:actor.id}});await db.auditLog.deleteMany({where:{actorUserId:actor.id}});await db.user.deleteMany({where:{id:actor.id}});await db.role.deleteMany({where:{name:stamp}})}
 if(settingsRead){if(old)await db.setting.upsert({where:{key},create:old,update:{value:old.value}});else await db.setting.deleteMany({where:{key}})}
 if(root)await fs.rm(root,{recursive:true,force:true})
 if(originalRoot===undefined)delete process.env.DOWNLOADS_ROOT;else process.env.DOWNLOADS_ROOT=originalRoot
}finally{await db.$disconnect()}})
