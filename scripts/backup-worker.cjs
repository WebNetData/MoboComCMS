const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const core = require('./backup-core.cjs')
const db = new PrismaClient()
const CONFIG = 'operations.backup.config', STATE = 'operations.backup.state'
const root = path.resolve(process.env.BACKUP_DIR || 'storage/backups')
const ID = /^backup-\d{13}-[a-f0-9]{12}$/
async function store(tx, key, value) { await tx.setting.upsert({ where:{key}, create:{key,value:JSON.stringify(value)}, update:{value:JSON.stringify(value)} }) }
async function manifests() {
  const result=[]
  for (const file of await fs.readdir(root)) {
    if (!file.endsWith('.json') || !ID.test(file.slice(0,-5))) continue
    try { const item=JSON.parse(await fs.readFile(path.join(root,file),'utf8')); if (item.id===file.slice(0,-5) && Number.isFinite(Date.parse(item.createdAt))) result.push(item) } catch {}
  }
  return result
}
async function sendBackup(tx, archive, meta, config) {
  const setting = await tx.setting.findUnique({ where:{key:'telegramBotToken'} })
  const token = process.env.TELEGRAM_BOT_TOKEN || setting?.value
  if (!token) throw Error('TELEGRAM_TOKEN_REQUIRED')
  // Fixed official destination; never send a database to a configurable API proxy.
  const handle=await fs.open(archive,'r'); const size=(await handle.stat()).size, partSize=45*1024*1024
  const parts=[]
  try {
    for(let offset=0,index=1; offset<size; offset+=partSize,index++) {
      const bytes=Buffer.alloc(Math.min(partSize,size-offset)); await handle.read(bytes,0,bytes.length,offset)
      const name=path.basename(archive)+(size>partSize?`.part${String(index).padStart(4,'0')}`:'')
      const form=new FormData(); form.set('chat_id',config.chatId); form.set('document',new Blob([bytes]),name)
      form.set('caption',`MoboComCMS encrypted PostgreSQL backup\n${meta.createdAt}\nPart ${index}/${Math.ceil(size/partSize)}\nPart SHA256 ${crypto.createHash('sha256').update(bytes).digest('hex')}\nFull SHA256 ${meta.sha256}`)
      const response=await fetch(`https://api.telegram.org/bot${token}/sendDocument`,{method:'POST',body:form,signal:AbortSignal.timeout(120000)})
      const data=await response.json()
      if(!response.ok||!data.ok) throw Error('TELEGRAM_UPLOAD_FAILED')
      parts.push({name,messageId:data.result.message_id})
    }
    return {sentAt:new Date().toISOString(),parts}
  } finally {await handle.close()}
}
async function main() {
  core.connection(); core.encryptionKey()
  await fs.mkdir(root,{recursive:true,mode:0o700})
  return db.$transaction(async tx=>{
    const lock=await tx.$queryRawUnsafe('SELECT pg_try_advisory_xact_lock(187401, 2209) AS locked')
    if(!lock[0]?.locked)return {skipped:'busy'}
    const row=await tx.setting.findUnique({where:{key:CONFIG}})
    const config=row?JSON.parse(row.value):{enabled:false,chatId:'',retentionDays:7,dailyRetentionDays:30,telegramEnabled:false,restoreTestEnabled:true}
    if(!config.enabled)return {skipped:'disabled'}
    const previous=await tx.setting.findUnique({where:{key:STATE}})
    const state=previous?JSON.parse(previous.value):{}
    const slot=Math.floor(Date.now()/7200000)
    // A manual run from the admin panel bypasses the slot guard for that click.
    const force=process.env.BACKUP_FORCE==='1'
    if(!force && state.slot===slot)return {skipped:'already-attempted'}
    const next={slot,startedAt:new Date().toISOString(),status:'RUNNING'}
    // Commit the attempt before side effects: a crash must not resend the same slot.
    await store(db,STATE,next)
    let plain,archive
    try {
      const id=`backup-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`
      plain=path.join(root,id+'.dump.tmp'); archive=path.join(root,id+'.dump.enc')
      await core.pg('pg_dump',['--format=custom','--no-owner','--no-acl'],{output:plain})
      await core.encryptFile(plain,archive); await fs.rm(plain,{force:true}); plain=null
      const meta={id,createdAt:new Date().toISOString(),bytes:(await fs.stat(archive)).size,sha256:await core.sha256(archive),format:'HAPPBK01-AES256GCM-pgcustom',restore:null,telegram:null}
      const existing=await manifests()
      next.backupId=id; next.sha256=meta.sha256; next.bytes=meta.bytes
      await fs.writeFile(path.join(root,id+'.json'),JSON.stringify(meta,null,2),{mode:0o600,flag:'wx'})
      if(config.restoreTestEnabled && !existing.some(m=>m.restore?.ok && m.createdAt.slice(0,10)===meta.createdAt.slice(0,10))) meta.restore=await core.restoreTest(archive)
      await fs.writeFile(path.join(root,id+'.json'),JSON.stringify(meta,null,2),{mode:0o600})
      next.backupId=id; next.sha256=meta.sha256; next.bytes=meta.bytes; next.restore=meta.restore
      if(config.telegramEnabled) {
        try {meta.telegram=await sendBackup(tx,archive,meta,config);next.telegram='SENT'}
        catch {next.telegram='FAILED_OR_UNCERTAIN';next.status='PARTIAL'}
        await fs.writeFile(path.join(root,id+'.json'),JSON.stringify(meta,null,2),{mode:0o600})
      } else next.telegram='DISABLED'
      for(const old of core.retentionVictims([...existing,meta],config.retentionDays,config.dailyRetentionDays)) {
        await fs.rm(path.join(root,old.id+'.dump.enc'),{force:true}); await fs.rm(path.join(root,old.id+'.json'),{force:true})
      }
      if(next.status!=='PARTIAL')next.status='SUCCESS'
    } catch(e) {next.status='FAILED';next.error=/^[A-Z0-9_]+$/.test(e.message)?e.message:'BACKUP_FAILED'}
    finally {if(plain)await fs.rm(plain,{force:true})}
    next.finishedAt=new Date().toISOString(); await store(db,STATE,next)
    return next
  },{timeout:3600000,maxWait:1000})
}
main().then(result=>{console.log(JSON.stringify(result));if(['FAILED','PARTIAL'].includes(result.status))process.exitCode=1}).catch((error)=>{const code=/^[A-Z0-9_]+$/.test(error?.message||'')?error.message:'BACKUP_WORKER_FAILED';console.error(code);process.exitCode=1}).finally(()=>db.$disconnect())
