// Native, read-only owner acceptance against an explicitly disposable PostgreSQL database.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path')
const {PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server')
assert(/test|check/i.test(new URL(process.env.DATABASE_URL).pathname),'disposable database required')
const db=new PrismaClient(),stamp='health-'+Date.now(),keys=['operations.backup.config','operations.backup.state']
let viewer=null,dir,oldRows=[],users=[],roleId,jobs=[]
const oldEnv={BACKUP_DIR:process.env.BACKUP_DIR,BACKUP_ENCRYPTION_KEY:process.env.BACKUP_ENCRYPTION_KEY,BACKUP_SCHEDULER:process.env.BACKUP_SCHEDULER}
const load=require('./connected-source-loader.cjs')({
 '@/platform/database/prisma':{db},react:{...require('react'),cache:fn=>fn},
 'next-auth/jwt':{getToken:async()=>viewer?{uid:viewer.id,authAt:new Date().toISOString()}:null},
})
const {backupHealth}=load('src/modules/notifications/server/backup-status.ts')
const {healthActions}=load('src/modules/operations/domain/health.ts')
const api=load('src/modules/operations/server/http/monitoring.ts')
const request=()=>new NextRequest('http://localhost/api/admin/performance')
async function put(key,value){await db.setting.upsert({where:{key},create:{key,value:JSON.stringify(value)},update:{value:JSON.stringify(value)}})}
async function main(){
 oldRows=await db.setting.findMany({where:{key:{in:keys}}})
 dir=await fs.mkdtemp(path.join(os.tmpdir(),'mobocom-health-'))
 process.env.BACKUP_DIR=dir;process.env.BACKUP_ENCRYPTION_KEY='33'.repeat(32);process.env.BACKUP_SCHEDULER='true'
 const role=await db.role.create({data:{name:stamp,permissions:'cms.posts'}});roleId=role.id
 const admin=await db.user.create({data:{email:stamp+'-admin@example.invalid',passwordHash:'!',role:'ADMIN',status:'ACTIVE'}});users.push(admin.id)
 const editor=await db.user.create({data:{email:stamp+'-editor@example.invalid',passwordHash:'!',role:'ADMIN',roleId,status:'ACTIVE'}});users.push(editor.id)
 assert.equal((await api.GET_admin(request())).status,403)
 viewer=editor;assert.equal((await api.GET_admin(request())).status,403,'journal permission is not system health authority')
 await put(keys[0],{enabled:false});assert.equal((await backupHealth()).status,'disabled')
 await put(keys[0],{enabled:true,chatId:'not-for-health-response'})
 assert.equal((await backupHealth()).status,'stale','absence of a recent archive is not healthy')
 const id='backup-'+Date.now()+'-aabbccddeeff',file=path.join(dir,id+'.json')
 const meta={id,createdAt:new Date().toISOString(),restore:{ok:true},privateMetadata:'not-for-health-response'}
 await fs.writeFile(file,JSON.stringify(meta))
 assert.equal((await backupHealth()).status,'unavailable','a manifest alone is not an archive')
 await fs.writeFile(path.join(dir,id+'.dump.enc'),'synthetic archive presence only')
 let health=await backupHealth();assert.equal(health.status,'available');assert.equal(health.restoreTest,'passed')
 await put(keys[1],{status:'FAILED',error:'not-for-health-response'});assert.equal((await backupHealth()).status,'failed')
 await put(keys[1],{status:'RUNNING',startedAt:new Date(Date.now()-31*60000).toISOString()});assert.equal((await backupHealth()).status,'stale')
 await put(keys[1],{status:'SUCCESS'});meta.createdAt=new Date(Date.now()-25*3600000).toISOString();await fs.writeFile(file,JSON.stringify(meta));assert.equal((await backupHealth()).status,'stale')
 await db.setting.update({where:{key:keys[0]},data:{value:'broken-json'}});assert.equal((await backupHealth()).status,'unavailable')
 await put(keys[0],{enabled:true});meta.createdAt=new Date().toISOString();await fs.writeFile(file,JSON.stringify(meta))
 const failed=await db.backgroundJob.create({data:{kind:'notification.deliver',status:'FAILED',dedupeKey:stamp+'-failed'}});jobs.push(failed.id)
 const stalled=await db.backgroundJob.create({data:{kind:'search.reindex',status:'RUNNING',lockedAt:new Date(Date.now()-11*60000),dedupeKey:stamp+'-stalled'}});jobs.push(stalled.id)
 viewer=admin;const response=await api.GET_admin(request());assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/)
 const body=await response.json();assert(body.health.some(x=>x.id==='jobs'));assert(body.health.some(x=>x.id==='stalled'))
 assert.equal(body.backup.status,'available');assert(!JSON.stringify(body.backup).includes('not-for-health-response'))
 const before=await db.backgroundJob.findMany({where:{id:{in:jobs}},select:{id:true,status:true,attempts:true}})
 await api.GET_admin(request());assert.deepEqual(await db.backgroundJob.findMany({where:{id:{in:jobs}},select:{id:true,status:true,attempts:true}}),before,'monitoring cannot retry work')
 assert(healthActions({database:false,cacheDegraded:true,failedJobs:0,stalledJobs:0,backup:body.backup}).some(x=>x.id==='database'))
 console.log('Operations health native acceptance passed: canonical permissions, backup failure/staleness/privacy, real queue signals and read-only/no-store')
}
main().finally(async()=>{
 await db.backgroundJob.deleteMany({where:{id:{in:jobs}}})
 await db.user.deleteMany({where:{id:{in:users}}});if(roleId)await db.role.delete({where:{id:roleId}})
 await db.setting.deleteMany({where:{key:{in:keys}}});for(const row of oldRows)await db.setting.create({data:{key:row.key,value:row.value}})
 for(const [key,value]of Object.entries(oldEnv))if(value===undefined)delete process.env[key];else process.env[key]=value
 if(dir&&path.dirname(dir)===os.tmpdir()&&path.basename(dir).startsWith('mobocom-health-'))await fs.rm(dir,{recursive:true,force:true})
 await db.$disconnect()
}).catch(error=>{console.error(error);process.exitCode=1})
