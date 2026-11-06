const assert=require('node:assert/strict'),crypto=require('node:crypto'),{PrismaClient}=require('@prisma/client'),loadSource=require('./connected-source-loader.cjs'),db=new PrismaClient()
const stamp='owned-ai-routing-'+Date.now(),backups=new Map(),users=[];let priorKey=process.env.PANEL_CREDENTIAL_KEY
async function main(){try{
 process.env.PANEL_CREDENTIAL_KEY=crypto.randomBytes(32).toString('hex')
 for(const key of ['ai.routing.v1','ai.config.v1']){backups.set(key,await db.setting.findUnique({where:{key}}));await db.setting.deleteMany({where:{key}})}
 const actor=await db.user.create({data:{email:stamp+'@invalid.test',name:stamp,role:'ADMIN',status:'ACTIVE',passwordHash:'owned-unused'}});users.push(actor.id)
 const calls=[],load=loadSource({'@/platform/database/prisma':{db},'@/platform/cache/kv':{cached:async(k,t,fn)=>fn(),invalidate:async()=>{}},'@/modules/social/server/egress':{egressRoute:async()=> 'direct',egressFetch:async(url,init)=>{calls.push({url,init});return url.endsWith('/responses')?new Response('data: '+JSON.stringify({type:'response.output_text.delta',delta:'owned personal'})+'\n\ndata: '+JSON.stringify({type:'response.completed',response:{status:'completed'}})+'\n\n',{headers:{'content-type':'text/event-stream'}}):Response.json({choices:[{message:{content:'owned API'}}]})}}})
 const routing=load('src/modules/ai/server/routing.ts'),client=load('src/modules/ai/server/client.ts'),ctx=load('src/modules/ai/server/admin-context.ts'),personal=load('src/modules/ai/server/chatgpt/store.ts'),prompt={system:'owned',user:'routing check',maxTokens:200}
 const audit={req:{headers:new Headers()},actor:{id:actor.id,email:actor.email},action:'ai.routing.test',targetType:'setting',targetId:stamp}
 await Promise.all([routing.saveAiRoute('support',{source:'api',config:{provider:'gemini',apiKey:'owned-support-key',model:'owned-support'}},audit),routing.saveAiRoute('admin',{source:'personal'},audit)])
 let routes=await routing.readAiRoutes();assert.equal(routes.admin.source,'personal');assert.equal(routes.support.config.model,'owned-support')
 await Promise.all([routing.saveAiRoute('support',{config:{model:'owned-support-2'}},audit),routing.saveAiRoute('support',{config:{apiKey:'owned-key-2'}},audit)])
 routes=await routing.readAiRoutes();assert.equal(routes.support.config.model,'owned-support-2');assert.equal(load('src/modules/providers/server/panel-credentials.ts').decryptPanelCredential(routes.support.config.apiKey),'owned-key-2')
 const personalKey=`ai.chatgpt.personal.v1.${actor.id}`;backups.set(personalKey,null)
 await personal.changeState(actor.id,s=>{s.enabled=true;s.active='oaiapp_owned';s.model='owned-personal';s.accounts=[{clientId:'oaiapp_owned',subject:stamp,email:'owned@invalid.test',access:'owned-personal-access',refresh:'owned-refresh',expires:Date.now()+3600000,idToken:'',scopes:['resource.invoke','chatgpt.tokens.use.direct']}]})
 assert.equal((await ctx.withPersonalAi(actor.id,()=>client.generate(prompt,undefined,'support'))).model,'owned-support-2');assert.equal(calls.length,1);assert.equal(calls[0].init.headers.Authorization,'Bearer owned-key-2')
 assert.equal((await ctx.withPersonalAi(actor.id,()=>client.generate(prompt), 'journal')).provider,'chatgpt-personal')
 await routing.saveAiRoute('journal',{source:'api',config:{provider:'groq',apiKey:'owned-journal-key',model:'owned-journal'}},audit)
 assert.equal((await ctx.withPersonalAi(actor.id,()=>client.generate(prompt), 'journal')).model,'owned-journal');assert.match(calls.at(-1).url,/groq/)
 await assert.rejects(client.generate(prompt,undefined,'admin'),e=>e.status===403)
 const row=await db.setting.findUniqueOrThrow({where:{key:'ai.routing.v1'}});assert(!row.value.includes('owned-key-2'));assert(!JSON.stringify(routing.publicAiRoutes(routes)).includes('encv1:'))
 const rejecting=loadSource({'@/platform/database/prisma':{db},'@/platform/cache/kv':{cached:async(k,t,fn)=>fn(),invalidate:async()=>{}},'@/platform/audit/server':{auditAdminStrict:async()=>{throw Error('owned audit rollback')}}})('src/modules/ai/server/routing.ts')
 await assert.rejects(rejecting.saveAiRoute('support',{config:{model:'must-not-save'}},audit),/owned audit rollback/);assert.equal((await db.setting.findUniqueOrThrow({where:{key:'ai.routing.v1'}})).value,row.value)
 assert.equal(await db.auditLog.count({where:{actorUserId:actor.id,action:'ai.routing.test'}}),5)
 await db.setting.update({where:{key:'ai.routing.v1'},data:{value:'{"version":99,"routes":{}}'}});await assert.rejects(routing.saveAiRoute('support',{source:'inherit'},audit));assert.equal((await db.setting.findUniqueOrThrow({where:{key:'ai.routing.v1'}})).value,'{"version":99,"routes":{}}')
 console.log('AI routing native PostgreSQL passed: concurrent purpose/field CAS, encrypted independent keys, real Admin/public routing, personal isolation, audit rollback and corrupt retention')
 }finally{try{for(const[key,row]of backups){await db.setting.deleteMany({where:{key}});if(row)await db.setting.create({data:row})}if(users.length){await db.auditLog.deleteMany({where:{actorUserId:{in:users}}});await db.user.deleteMany({where:{id:{in:users},email:{startsWith:stamp}}})}}finally{if(priorKey===undefined)delete process.env.PANEL_CREDENTIAL_KEY;else process.env.PANEL_CREDENTIAL_KEY=priorKey;await db.$disconnect()}}
}
main().catch(e=>{console.error(e);process.exitCode=1})
