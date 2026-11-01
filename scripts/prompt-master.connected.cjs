// Real PostgreSQL, signed sessions and canonical current AuthZ/extension state. Only provider, limiter and search notification boundaries are doubled.
const assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server'),{encode}=require('next-auth/jwt')
const sourceLoader=require('./connected-source-loader.cjs'),prisma=new PrismaClient(),stamp='prompt-native-'+Date.now(),users=[],roles=[],templateIds=[],runIds=[]
const stateKey='extension.prompt-master.state.v1',aiKey='extension.ai-assistant.state.v1',savedSettings=new Map(),limits=new Map();let providerCalls=0,providerFail=false,auditFail=false,providerAfter=null
const wrap=target=>new Proxy(target,{get(model,key){
 if(key==='auditLog')return new Proxy(model.auditLog,{get(table,method){if(method==='create')return args=>{if(auditFail)throw Error('injected audit storage failure');return table.create(args)};return typeof table[method]==='function'?table[method].bind(table):table[method]}})
 if(key==='$transaction')return (fn,opts)=>prisma.$transaction(tx=>fn(wrap(tx)),opts)
 return typeof model[key]==='function'?model[key].bind(model):model[key]
}})
const db=wrap(prisma),mocks={
 '@/platform/database/prisma':{db},
 react:{cache:fn=>fn},
 '@/platform/observability/logger':{logEvent:()=>{},requestIdFrom:()=>stamp},
 '@/modules/search/server/search':{reindexItem:async()=>{}},
 '@/platform/http/rate-limit':{clientIp:h=>h.get('x-forwarded-for')||'fixture',rateLimitStrict:async(key,limit)=>{const count=(limits.get(key)||0)+1;limits.set(key,count);return {ok:count<=limit}}},
 '@/modules/ai/server/generation':{getAiConfig:async()=>({provider:'custom',apiKey:'',model:'owned-fixture',baseUrl:'http://fixture.invalid'}),generate:async()=>{providerCalls++;if(providerAfter)await providerAfter();if(providerFail)throw Error('secret-provider-error-must-not-leak');return {text:'A refined owned fixture prompt with clear factual boundaries.',model:'owned-fixture'}}},
}
const load=sourceLoader(mocks),service=load('src/modules/prompts/server/prompts.ts'),http=load('src/modules/prompts/server/http.ts'),registry=load('src/modules/content/server/registry.ts'),modules=load('src/extensions/server/modules.ts')
async function request(user,path='/api/prompts/generate',body,origin='http://localhost:3230'){
 const headers={host:'localhost:3230',origin,'x-forwarded-for':stamp,'content-type':'application/json'}
 if(user)headers.cookie='next-auth.session-token='+await encode({secret:process.env.NEXTAUTH_SECRET,token:{uid:user.id,authAt:Date.now()}})
 return new NextRequest('http://localhost:3230'+path,{method:body===undefined?'GET':'POST',headers,...(body===undefined?{}:{body:JSON.stringify(body)})})
}
const input=(extra={})=>({kind:'TEXT',idea:'Write a clear owned fixture prompt with actual context',engine:'structured',...extra})
async function settings(value){await prisma.setting.upsert({where:{key:stateKey},create:{key:stateKey,value:JSON.stringify({enabled:true,settings:value})},update:{value:JSON.stringify({enabled:true,settings:value})}})}
async function refuses(work,status){await assert.rejects(work,e=>e.status===status)}
async function main(){
 for(const key of [stateKey,aiKey])savedSettings.set(key,await prisma.setting.findUnique({where:{key}}))
 for(const [name,permissions]of [['manager','dashboard.view,prompts.manage'],['magazine','dashboard.view,cms.posts']])roles.push(await prisma.role.create({data:{name:stamp+'-'+name,nameFa:name,nameEn:name,permissions}}))
 for(let i=0;i<5;i++)users.push(await prisma.user.create({data:{email:`${stamp}-${i}@example.invalid`,passwordHash:'fixture-only',role:i<2?'ADMIN':'CUSTOMER',roleId:i<2?roles[i].id:null,status:'ACTIVE'}}))
 const [manager,magazine,member,other,revoked]=users,memberReq=await request(member),managerReq=await request(manager),otherReq=await request(other)
 await settings({'minute-limit':60,'history-limit':5,'pin-limit':1,'ai-enabled':false});await prisma.setting.upsert({where:{key:aiKey},create:{key:aiKey,value:'{"enabled":true,"settings":{}}'},update:{value:'{"enabled":true,"settings":{}}'}})
 const template=await service.saveTemplate(managerReq,{title:'Owned prompt fixture',slug:stamp,summary:'Only published prompts become public.',kind:'TEXT',category:'WRITING',content:'Create this exact requested output: {{idea}}',example:'A fixture teaching task',defaults:'{}',status:'DRAFT'});templateIds.push(template.id)
 assert.equal((await service.templateDirectory({q:stamp},true)).templates[0].id,template.id,'Admin finds a template by its stable URL slug')
 const direct=await http.GET_admin(await request(manager,'/api/admin/prompts?id='+template.id));assert.equal(direct.status,200);assert.equal((await direct.json()).template.id,template.id)
 assert.equal((await http.GET_admin(await request(magazine,'/api/admin/prompts?id='+template.id))).status,403)
 const media=load('src/modules/media/server/library.ts'),mediaUser=await media.currentLibraryUser({id:manager.id,authAt:new Date()});assert.equal(mediaUser.manageLibrary,false);assert.equal(mediaUser.configureLibrary,false)
 await assert.rejects(()=>media.currentLibraryUser({id:member.id,authAt:new Date()}),e=>e.status===403)
 await refuses(async()=>service.saveTemplate(await request(magazine),{...template,title:'Forbidden',version:template.version}),403)
 assert.equal(await service.templateBySlug(template.slug),null)
 assert(!(await service.templateDirectory({q:stamp})).templates.length)
 await refuses(()=>service.generatePrompt(memberReq,input({templateSlug:template.slug})),404)
 await refuses(()=>service.saveTemplate(managerReq,{...template,version:999,status:'PUBLISHED'}),409)
 auditFail=true;await assert.rejects(()=>service.saveTemplate(managerReq,{...template,status:'PUBLISHED'}));auditFail=false
 assert.equal((await prisma.promptTemplate.findUnique({where:{id:template.id}})).status,'DRAFT','failed strict audit rolls publication back')
 const published=await service.saveTemplate(managerReq,{...template,status:'PUBLISHED'});assert.equal(published.version,2)
 const sample=await service.saveTemplate(managerReq,{...published,kind:'WEB',showcase:JSON.stringify({webLayout:'landing',result:'<script>inert stored code</script>',credit:'Owned native sample'})})
 assert.equal(sample.kind,'WEB');assert.equal(JSON.parse(sample.showcase).webLayout,'landing')
 const {showcase:omitted,...oldClient}=sample,kept=await service.saveTemplate(managerReq,{...oldClient,title:'Existing caller keeps sample'});assert.equal(kept.showcase,sample.showcase)
 await refuses(()=>service.saveTemplate(managerReq,{...kept,showcase:'{"cover":"javascript:alert(1)"}'}),422)
 assert((await service.templateDirectory({q:stamp,samples:'true'})).templates.some(row=>row.id===template.id))
 const withSample=await registry.itemCards([{type:'prompt',id:template.id}]);assert.equal(withSample.size,1)
 const reverted=await service.saveTemplate(managerReq,{...kept,kind:'TEXT',title:published.title,showcase:'{}'})
 published.version=reverted.version
 assert((await service.templateBySlug(template.slug)).id===template.id)
 const cards=await registry.itemCards([{type:'prompt',id:template.id}]);assert(cards.size===1&&cards.get('prompt:'+template.id).url.endsWith('/'+stamp))
 await refuses(()=>service.saveTemplate(managerReq,{...published,slug:stamp+'-changed'}),409)
 assert((await prisma.auditLog.count({where:{action:'prompts.template.save',targetId:String(template.id)}}))>=2)
 const guestBefore=await prisma.promptGeneration.count(),guest=await service.generatePrompt(await request(null),input());assert.equal(guest.item,null);assert.equal(await prisma.promptGeneration.count(),guestBefore);assert.equal(providerCalls,0)
 await refuses(()=>service.generatePrompt(memberReq,input({engine:'ai',consent:true})),409);assert.equal(providerCalls,0)
 const generated=await service.generatePrompt(memberReq,input({templateSlug:template.slug}));runIds.push(generated.item.id)
 assert.equal(generated.item.userId,member.id);assert.equal(generated.engine,'STRUCTURED')
 const getOther=await http.GET_history(await request(other,'/api/prompts/history?id='+generated.item.id));assert.equal(getOther.status,404)
 for(const action of ['edit','pin','delete'])await refuses(()=>service.changeHistory(otherReq,{id:generated.item.id,version:generated.item.version,action,output:'Attempted overwrite',pinned:true}),404)
 const pinned=await service.changeHistory(memberReq,{id:generated.item.id,version:1,action:'pin',pinned:true});assert.equal(pinned.item.pinned,true)
 for(let n=0;n<7;n++){const row=await service.generatePrompt(memberReq,input({idea:'Owned history fixture '+stamp+' '+n}));runIds.push(row.item.id)}
 assert.equal(await prisma.promptGeneration.count({where:{userId:member.id,pinned:false}}),5);assert.equal(await prisma.promptGeneration.count({where:{userId:member.id,pinned:true}}),1)
 const last=await prisma.promptGeneration.findFirst({where:{userId:member.id,pinned:false},orderBy:{id:'desc'}})
 await refuses(()=>service.changeHistory(memberReq,{id:last.id,version:last.version,action:'pin',pinned:true}),409)
 const edited=await service.changeHistory(memberReq,{id:last.id,version:last.version,action:'edit',output:'<script>literal text only, never executable</script>'});assert.equal(edited.item.engine,'EDITED')
 await refuses(()=>service.changeHistory(memberReq,{id:last.id,version:last.version,action:'delete'}),409)
 await settings({'minute-limit':60,'history-limit':5,'ai-enabled':true,'ai-daily-limit':1})
 await refuses(async()=>service.generatePrompt(await request(null),input({engine:'ai',consent:true})),401)
 await refuses(()=>service.generatePrompt(otherReq,input({engine:'ai'})),422);assert.equal(providerCalls,0)
 providerFail=true;const failed=await http.POST_generate(await request(member,'/api/prompts/generate',input({engine:'ai',consent:true})));assert.equal(failed.status,502);assert(!JSON.stringify(await failed.json()).includes('secret-provider'));providerFail=false
 await refuses(()=>service.generatePrompt(memberReq,input({engine:'ai',consent:true})),429);assert.equal(providerCalls,1)
 const enhanced=await service.generatePrompt(otherReq,input({engine:'ai',consent:true}));runIds.push(enhanced.item.id);assert.equal(enhanced.engine,'AI');assert.equal(enhanced.model,'owned-fixture')
 providerAfter=async()=>prisma.user.update({where:{id:revoked.id},data:{status:'BANNED'}})
 await refuses(async()=>service.generatePrompt(await request(revoked),input({engine:'ai',consent:true,saveHistory:false})),401);providerAfter=null
 await settings({'allow-guests':false});await refuses(async()=>service.generatePrompt(await request(null),input()),401)
 const foreign=await http.POST_generate(await request(member,'/api/prompts/generate',input(),'https://foreign.invalid'));assert.equal(foreign.status,403)
 const missing=await request(member,'/api/prompts/generate',input());missing.headers.delete('origin');assert.equal((await http.POST_generate(missing)).status,403)
 const huge=await http.POST_generate(await request(member,'/api/prompts/generate',{...input(),idea:'x'.repeat(140000)}));assert.equal(huge.status,413)
 const adminDenied=await http.GET_admin(await request(magazine,'/api/admin/prompts'));assert.equal(adminDenied.status,403)
 await prisma.setting.update({where:{key:stateKey},data:{value:'{"enabled":false,"settings":{}}'}})
 await refuses(()=>service.saveTemplate(managerReq,{...published,title:'disabled'}),404)
 const off=await modules.whenModuleOn('prompt-master',http.GET_history)(memberReq);assert.equal(off.status,404)
 await settings({})
 const unpublished=await service.saveTemplate(managerReq,{...published,status:'DRAFT'});assert.equal(await service.templateBySlug(template.slug),null);assert.equal((await registry.itemCards([{type:'prompt',id:template.id}])).size,0)
 await service.deleteTemplate(managerReq,{id:unpublished.id,version:unpublished.version});assert(await prisma.promptGeneration.findUnique({where:{id:generated.item.id}}),'historical saved output survives template deletion')
 console.log('Prompt Master PostgreSQL: canonical signed identity/permissions, publication/CAS/audit rollback, private history ownership/retention, explicit AI consent/quota/failure, bounded origin/body and module-off passed')
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{
 for(const [key,row]of savedSettings)if(row)await prisma.setting.upsert({where:{key},create:row,update:{value:row.value}});else await prisma.setting.deleteMany({where:{key}})
 await prisma.auditLog.deleteMany({where:{actorUserId:{in:users.map(u=>u.id)}}});await prisma.promptGeneration.deleteMany({where:{userId:{in:users.map(u=>u.id)}}});await prisma.promptTemplate.deleteMany({where:{id:{in:templateIds}}});await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});await prisma.role.deleteMany({where:{id:{in:roles.map(r=>r.id)}}});await prisma.$disconnect()
})
