const assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server')
const db=new PrismaClient(),stamp='policy'+Date.now().toString(36),keys=['livechat.v1','site.maintenance.v1'];let actor,originals=[],settingsRead=false
const load=require('./connected-source-loader.cjs')({'@/platform/database/prisma':{db}})
const req=new NextRequest('http://localhost:3000/api/admin/chat',{headers:{origin:'http://localhost:3000'}})
async function main(){
 assert.match(new URL(process.env.DATABASE_URL).pathname,/mobocom_reliability_/,'owned reliability database required')
 originals=await db.setting.findMany({where:{key:{in:keys}}});settingsRead=true;await db.setting.deleteMany({where:{key:{in:keys}}})
 actor=await db.user.create({data:{email:stamp+'@example.invalid',passwordHash:'fixture',role:'ADMIN'}})
 const context={req,actor},settings=load('src/modules/settings/server/section-history.ts')
 const chat=load('src/modules/livechat/server/livechat.ts'),maintenance=load('src/modules/site/server/maintenance.ts')
 const before=await chat.getChatSettings()
 await chat.saveChatSettings({places:['store'],welcome:'owned welcome'},context)
 let changed=await chat.getChatSettings();assert.deepEqual(changed.places,['store'])
 await assert.rejects(chat.saveChatSettings({welcome:'stale'},{...context,expected:settings.sectionSettingsRevision(before)}),e=>e.status===409)
 assert.equal((await chat.getChatSettings()).welcome,'owned welcome')
 await db.setting.update({where:{key:keys[0]},data:{value:JSON.stringify({...changed,futurePrivate:'retained'})}})
 await chat.saveChatSettings({askContact:false},context)
 assert.equal(JSON.parse((await db.setting.findUnique({where:{key:keys[0]}})).value).futurePrivate,'retained')
 const commits=[];await chat.restoreChatSettings(1,{places:'["journal"]'},async(tx,before,after)=>{commits.push([before,after]);await tx.contentRevision.create({data:{entityType:'settings-livechat',entityId:1,version:999,source:'restore',snapshot:JSON.stringify(after),changed:'places',actorId:actor.id}})})
 assert.deepEqual((await chat.getChatSettings()).places,['journal']);assert.equal(commits.length,1)
 await Promise.all([maintenance.saveSectionMaintenance('magazine',{title:'owned magazine'},context),maintenance.saveSectionMaintenance('music',{message:'owned music'},context)])
 const state=await maintenance.loadMaintenance(true);assert.equal(state.magazine.title,'owned magazine');assert.equal(state.music.message,'owned music')
 await maintenance.saveSectionMaintenance('magazine',{enabled:true},context)
 assert.equal((await maintenance.loadMaintenance(true)).magazine.title,'owned magazine','nested partial keeps title')
 const audit=load('src/platform/audit/server.ts'),original=audit.auditAdminStrict
 audit.auditAdminStrict=async()=>{throw Error('owned audit failure')}
 try {await assert.rejects(chat.saveChatSettings({welcome:'must rollback'},context),/audit failure/);assert.equal((await chat.getChatSettings()).welcome,'owned welcome')}finally{audit.auditAdminStrict=original}
 const raw=await db.setting.findUnique({where:{key:keys[0]}});await db.setting.update({where:{key:keys[0]},data:{value:'{"broken"'}})
 await assert.rejects(chat.saveChatSettings({welcome:'no overwrite'},context));assert.equal((await db.setting.findUnique({where:{key:keys[0]}})).value,'{"broken"')
 await db.setting.update({where:{key:keys[0]},data:{value:raw.value}})
 assert.ok(await db.contentRevision.count({where:{entityType:'settings-maintenance',actorId:actor.id}})>0)
 console.log('Admin policy history: chat/maintenance save, stale refusal, nested/concurrent preservation, restore commit, strict audit rollback and corrupt-state refusal passed')
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{try{
 if(actor){await db.contentRevision.deleteMany({where:{actorId:actor.id}});await db.auditLog.deleteMany({where:{actorUserId:actor.id}});await db.user.deleteMany({where:{id:actor.id}})}
 if(settingsRead){await db.setting.deleteMany({where:{key:{in:keys}}});if(originals.length)await db.setting.createMany({data:originals})}
}finally{await db.$disconnect()}})
