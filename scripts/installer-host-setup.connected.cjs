// Explicit empty disposable PostgreSQL. DNS/CA/host command boundaries are recorded doubles, never live issuance.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process')
const {PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server'),loadFactory=require('./connected-source-loader.cjs')
assert(/^\/mobocom_host_setup_test_/.test(new URL(process.env.DATABASE_URL).pathname),'owned empty host-setup test database required')
const db=new PrismaClient(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'installer-network-')),stamp='setup-'+Date.now(),originalEnv={...process.env},originalFetch=global.fetch
const token=crypto.randomBytes(32).toString('hex'),before=new Map(),captured=[]
let networkLimit=true,issueFailure=false,releaseIssue=null,holdIssue=false,issueEntered=false,certificateListing='',unknown=false
const state={configDirectory:()=>dir,installationToken:()=>token,isSetupMode:()=>false,lastErrorFile:()=>path.join(dir,'error'),runtimeEnvFile:()=>path.join(dir,'env'),markInstalled(){},installMode:async()=>process.env.INSTALL_DISABLED==='true'?'installed':unknown?'unknown':await db.user.count({where:{role:'ADMIN'}})?'installed':'needs-admin'}
const certificates=(name,domain)=>`  Certificate Name: ${name}\n    Domains: ${domain}\n    Expiry Date: 2036-01-01T12:00:00+00:00 (VALID: 3000 days)\n`
const command=async(_file,args,_timeout,_cwd,input)=>{
 const op=args[0];captured.push({op,args,input})
 if(op==='status')return{ok:true,out:JSON.stringify({nginx:1,certbot:1,cloudflare:1,ip:'127.0.0.1'})}
 if(op==='cert-list')return{ok:true,out:certificateListing}
 if(op==='cert-issue'){
  issueEntered=true
  if(holdIssue)await new Promise(resolve=>{releaseIssue=resolve})
  if(issueFailure)return{ok:false,out:'ERROR: DNS problem: NXDOMAIN'}
  certificateListing=certificates(args[1],args.slice(4).join(' '))
 }
 if(op==='cert-import')certificateListing=certificates(args[1],args[2])
 if(op==='site-url')process.env.NEXTAUTH_URL=args[1] // Explicit process-restart boundary; browser/host test is separate.
 return{ok:true,out:'OK'}
}
const load=loadFactory({
 '@/platform/database/prisma':{db},'./state':state,'@/modules/installer/server/state':state,
 '@/platform/database/migrate':{buildProvider:()=> 'postgresql'},
 '@/platform/config/env':{env:key=>process.env[key]||''},
 '@/modules/server-panel/server/system':{command},
 'node:dns/promises':{resolve4:async()=>['127.0.0.1']},
 '@/platform/observability/logger':{logEvent(){}},
 '@/platform/http/rate-limit':{clientIp:()=> '127.0.0.1',rateLimitStrict:async key=>({ok:!key.startsWith('install:network:')||networkLimit})},
 '@/extensions/generated/catalog':{extensionCatalog:[]},'@/extensions/server/state':{saveExtensionState:async()=>{}},
 '@/modules/settings/server':{setSetting:async(key,value)=>db.setting.upsert({where:{key},create:{key,value},update:{value}})},
})
const request=(method='GET',body,headers={},protocol='https:')=>new NextRequest(protocol+'//setup.example.invalid/api/install',{method,headers:{host:'setup.example.invalid',origin:protocol+'//setup.example.invalid','x-install-token':token,...headers},...(body?{body:typeof body==='string'?body:JSON.stringify(body)}:{})})
async function main(){
 assert.equal(await db.user.count({where:{role:'ADMIN'}}),0)
 for(const key of ['siteUrl','brandName','brandTagline','server-panel.domains.v1'])before.set(key,await db.setting.findUnique({where:{key}}))
 Object.assign(process.env,{NODE_ENV:'production',INSTALL_HOST_SETUP:'true',SERVER_PANEL_WEBCTL_SUDO:'0',NEXTAUTH_URL:'https://setup.example.invalid',PANEL_CREDENTIAL_KEY:crypto.randomBytes(32).toString('hex'),SERVER_PANEL_CF_INI:path.join(dir,'cloudflare.ini')})
 const http=load('src/modules/installer/server/http.ts'),setup=load('src/modules/installer/server/setup.ts')
 const site={siteName:'Owned network setup',siteUrl:'https://owned.example.invalid',adminEmail:stamp+'@example.invalid',adminPassword:'Owned-Quartz-Network-2049',modules:{}}
 assert.equal((await http.GET(request('GET',null,{'x-install-token':''}))).status,401)
 assert.equal((await http.GET(request('GET',null,{},'http:'))).status,426)
 assert.equal((await http.POST(request('POST',{op:'network'},{origin:'https://foreign.invalid'}))).status,403)
 assert.equal((await http.POST(request('POST',{op:'network'},{origin:''}))).status,403)
 unknown=true;assert.equal((await http.GET(request())).status,503);unknown=false
 process.env.INSTALL_DISABLED='true';assert.equal((await http.GET(request())).status,404);delete process.env.INSTALL_DISABLED
 await assert.rejects(setup.installSite(site),error=>error.status===409)
 const input={op:'network',domain:'owned.example.invalid',method:'http',email:'operator@example.invalid',acmeAgreement:true}
 networkLimit=false;assert.equal((await http.POST(request('POST',input))).status,429);networkLimit=true
 const oversized=JSON.stringify({op:'network',padding:'x'.repeat(262145)})
 assert.equal((await http.POST(request('POST',oversized,{'content-length':'1'}))).status,413)
 for(const body of [{...input,domain:'x.com;id'},{...input,method:'shell'},{...input,acmeAgreement:false}])assert.equal((await http.POST(request('POST',body))).status,400)
 assert(!captured.some(item=>['site-apply','cert-issue','site-url'].includes(item.op)))
 issueFailure=true;assert.equal((await http.POST(request('POST',input))).status,502)
 let saved=JSON.parse((await db.setting.findUniqueOrThrow({where:{key:'server-panel.domains.v1'}})).value)
 assert.equal(saved.sites[0].https,false);assert.equal(await db.user.count({where:{role:'ADMIN'}}),0)
 issueFailure=false;holdIssue=true;issueEntered=false
 const pending=http.POST(request('POST',input))
 while(!issueEntered)await new Promise(resolve=>setTimeout(resolve,5))
 assert.equal((await http.POST(request('POST',input))).status,409)
 holdIssue=false;releaseIssue();assert.equal((await pending).status,200)
 let status=await (await http.GET(request())).json();assert.equal(status.network.ready,true);assert.equal(status.network.siteUrl,site.siteUrl)
 const beforeDowngrade=captured.filter(item=>item.op==='site-apply').length
 issueFailure=true;assert.equal((await http.POST(request('POST',input))).status,502);issueFailure=false
 assert.equal(captured.filter(item=>item.op==='site-apply').length,beforeDowngrade,'retry must not switch HTTPS back to HTTP')
 const cfToken='owned-cloudflare-token-'+'a'.repeat(32)
 global.fetch=async url=>{assert.equal(url,'https://api.cloudflare.com/client/v4/user/tokens/verify');return Response.json({success:true,result:{status:'active'}})}
 assert.equal((await http.POST(request('POST',{...input,method:'cloudflare',cloudflareToken:cfToken}))).status,200)
 saved=JSON.parse((await db.setting.findUniqueOrThrow({where:{key:'server-panel.domains.v1'}})).value)
 assert(saved.cfToken&&!saved.cfToken.includes(cfToken));assert.equal(fs.statSync(process.env.SERVER_PANEL_CF_INI).mode&0o777,0o600)
 assert(!JSON.stringify(status).includes(cfToken))
 const cert=path.join(dir,'cert.pem'),key=path.join(dir,'key.pem')
 cp.execFileSync('openssl',['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:P-256','-nodes','-subj','/CN=owned.example.invalid','-addext','subjectAltName=DNS:owned.example.invalid','-addext','basicConstraints=critical,CA:FALSE','-days','2','-out',cert,'-keyout',key],{stdio:'ignore'})
 const pem={op:'network',domain:input.domain,method:'pem',certificate:fs.readFileSync(cert,'utf8'),privateKey:fs.readFileSync(key,'utf8')}
 const imported=await http.POST(request('POST',pem));assert.equal(imported.status,200)
 assert(!JSON.stringify(await imported.json()).includes('PRIVATE KEY'))
 assert(captured.some(item=>item.op==='cert-import'&&item.input&&!item.args.some(arg=>arg.includes('PRIVATE KEY'))))
 const badUrl={...site,siteUrl:'https://different.example.invalid'};await assert.rejects(setup.installSite(badUrl),error=>error.status===409)
 const result=await setup.installSite(site);assert.equal(result.loginUrl,site.siteUrl+'/login?next=/admin')
 assert(captured.some(item=>item.op==='setup-close'));assert.equal((await http.GET(request())).status,404);assert.equal((await http.POST(request('POST',input))).status,404)
 assert(!fs.existsSync(path.join(dir,'install.operation.lock')))
 console.log('PostgreSQL installer host setup passed: private HTTPS/origin/body/rate/installed guards, persisted SSL/email/encrypted DNS credentials, concurrent refusal, failed issuance retry/no downgrade, private PEM, canonical first owner and bootstrap close. Host/CA/restart boundaries are doubles.')
}
main().catch(error=>{console.error(error.message);process.exitCode=1}).finally(async()=>{
 try{
  const users=await db.user.findMany({where:{email:{startsWith:stamp}},select:{id:true}})
  await db.auditLog.deleteMany({where:{actorUserId:{in:users.map(user=>user.id)}}});await db.user.deleteMany({where:{id:{in:users.map(user=>user.id)}}})
  for(const[key,row]of before){if(row)await db.setting.upsert({where:{key},create:row,update:{value:row.value}});else await db.setting.deleteMany({where:{key}})}
 }finally{await db.$disconnect();fs.rmSync(dir,{recursive:true,force:true});global.fetch=originalFetch;for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];Object.assign(process.env,originalEnv)}
})
