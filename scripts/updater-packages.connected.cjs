// Explicit owned PostgreSQL test: real audit rows, guard/token policy, filesystem and signature verifier.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process')
const {PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server'),loadFactory=require('./connected-source-loader.cjs')
assert(/test|check|editor_media/.test(new URL(process.env.DATABASE_URL).pathname),'owned PostgreSQL required')
const db=new PrismaClient(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'updater-packages-')),original={...process.env},stamp='package-'+Date.now()
let viewer=null,limited=false,setupBlocked=false,helperCalls=[],user
const load=loadFactory({
 '@/platform/database/prisma':{db},
 '@/platform/database/migrate':{buildProvider:()=> 'postgresql'},
 '@/modules/identity/server/access':{requirePerm:async(_req,permission)=>viewer?.permissions.includes(permission)?viewer:null},
 '@/platform/config/env':{env:key=>process.env[key]||'',authSecret:()=> 'owned-package-auth-secret-'.repeat(3)},
 '@/platform/http/rate-limit':{clientIp:()=> '127.0.0.1',rateLimitHit:()=>({ok:true}),rateLimitStrict:async()=>({ok:!limited})},
 '@/modules/installer/server/gate':{installGate:async()=>setupBlocked?new Response('installer closed',{status:404}):null},
 'node:child_process':{...cp,execFile:(file,args,options,callback)=>{if(file!=='sudo')return cp.execFile(file,args,options,callback);helperCalls.push(args);setTimeout(()=>callback(null,'started',''),15)}},
})
function request(method='POST',body,headers={}){return new NextRequest('https://site.invalid/api/admin/server/updates/package',{method,headers:{host:'site.invalid',origin:'https://site.invalid',...headers},...(body===undefined?{}:{body,duplex:'half'})})}
async function main(){
 Object.assign(process.env,{SERVER_PANEL_ENABLED:'true',UPDATE_STATE_DIR:path.join(dir,'state'),UPDATE_HELPER:'/tmp/mobocom-package-tools/helper',UPDATE_PACKAGE_TOOL:'/tmp/mobocom-package-tools/release-package.cjs',UPDATE_PUBLIC_KEY_FILE:'/tmp/mobocom-package-tools/release-public.pem',NEXTAUTH_URL:'https://site.invalid'})
 user=await db.user.create({data:{email:stamp+'@example.invalid',name:stamp,passwordHash:stamp+'-hash',role:'ADMIN',status:'ACTIVE'}})
 viewer={...user,permissions:['server.manage','settings.manage']}
 const gate=load('src/modules/server-panel/server/gate.ts'),token=gate.unlockToken(user.id,user.passwordHash,'127.0.0.1',5),cookie='mc_srv='+token.value
 const http=load('src/modules/updater/server/package-http.ts'),updates=load('src/modules/updater/server/http.ts'),packages=load('src/modules/updater/server/packages.ts'),service=load('src/modules/updater/server/service.ts')
 const req=(bytes,extra={})=>request('POST',bytes,{cookie,'content-type':'application/octet-stream',...extra})
 setupBlocked=true;assert.equal((await http.POST(req('x'))).status,404);setupBlocked=false
 assert.equal((await http.POST(req('x',{origin:''}))).status,403,'cookie alone never writes outside Proxy')
 assert.equal((await http.POST(req('x',{origin:'https://foreign.invalid'}))).status,403)
 const full=viewer;viewer=null;assert.equal((await http.POST(req('x'))).status,403);viewer={...full,permissions:['cms.posts']};assert.equal((await http.POST(req('x'))).status,403);viewer=full
 assert.equal((await http.POST(request('POST','x',{'content-type':'application/octet-stream'}))).status,401)
 limited=true;assert.equal((await http.POST(req('x'))).status,429);limited=false
 assert.equal((await http.POST(req('not a release'))).status,400)
 assert.equal((await http.POST(req('x',{'content-length':String(513*1024*1024)}))).status,413)
 // Reuse a bounded chunk: prove the streaming cap itself, not merely Content-Length.
 let remaining=512*1024*1024+1;const chunk=new Uint8Array(2*1024*1024)
 const stream=new ReadableStream({pull(controller){if(!remaining){controller.close();return}const size=Math.min(remaining,chunk.length);controller.enqueue(chunk.subarray(0,size));remaining-=size}})
 assert.equal((await http.POST(req(stream,{'content-length':'1'}))).status,413)
 assert.equal(fs.readdirSync(path.join(dir,'state/packages')).filter(name=>name.startsWith('.incoming-')).length,0,'overflow cleans its private partial file')
 const admitted=await http.POST(req(fs.readFileSync('/tmp/mobocom-package-tools/valid.mbrelease')));assert.equal(admitted.status,200,await admitted.clone().text())
 const item=await admitted.json();assert.match(item.id,/^[a-f0-9]{64}$/);assert.equal(item.version,require('../package.json').version)
 assert.equal(fs.statSync(path.join(dir,'state/packages',item.id+'.mbrelease')).mode&0o077,0)
 assert.equal((await (await http.GET(request('GET',undefined,{cookie}))).json()).length,1)
 assert.ok(await db.auditLog.count({where:{actorUserId:user.id,action:'updates.package-upload'}}))
 const fetchBefore=global.fetch;global.fetch=()=>{throw Error('Package mode must never fetch GitHub')}
 try{const status=await service.status(false);assert.equal(status.environment.method,'package');assert.equal(status.releases.length,0)}finally{global.fetch=fetchBefore}
 await assert.rejects(packages.startPackage(item.id,false),error=>error.status===400)
 const settled=await Promise.allSettled([packages.startPackage(item.id,true),packages.startPackage(item.id,true)])
 assert.equal(settled.filter(r=>r.status==='fulfilled').length,1);assert.equal(helperCalls.length,1);assert.deepEqual(helperCalls[0],['-n','/tmp/mobocom-package-tools/helper','package',item.id])
 assert.equal(service.runProgress().status,'running');await assert.rejects(packages.deletePackage(item.id),error=>error.status===409)
 fs.writeFileSync(path.join(dir,'state/state.json'),JSON.stringify({status:'done'}))
 const jsonReq=request('POST',JSON.stringify({op:'package',id:item.id,backupConfirmed:true}),{cookie,'content-type':'application/json'})
 assert.equal((await updates.POST(jsonReq)).status,200)
 assert.ok(await db.auditLog.count({where:{actorUserId:user.id,action:'updates.package-apply'}}))
 fs.writeFileSync(path.join(dir,'state/state.json'),JSON.stringify({status:'done'}))
 assert.equal((await updates.POST(request('POST',JSON.stringify({op:'x',padding:'x'.repeat(9000)}),{cookie}))).status,413)
 await packages.deletePackage(item.id);assert.equal((await packages.listPackages()).length,0)
 console.log('Package PostgreSQL admission passed: real Ed25519 verifier, private stream, canonical origin, installed/unlock/scoped permission/rate guards, audit persistence, single launch, no GitHub fetch, deletion/body bounds.')
}
main().catch(error=>{console.error(error.message);process.exitCode=1}).finally(async()=>{
 try{if(user){await db.auditLog.deleteMany({where:{actorUserId:user.id}});await db.user.delete({where:{id:user.id}})}}finally{await db.$disconnect();fs.rmSync(dir,{recursive:true,force:true});for(const key of Object.keys(process.env))if(!(key in original))delete process.env[key];Object.assign(process.env,original)}
})
