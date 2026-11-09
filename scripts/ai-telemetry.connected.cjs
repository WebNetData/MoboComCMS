const assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client'),db=new PrismaClient(),stamp='owned-metrics-'+Date.now()
assert(/test|check/.test(new URL(process.env.DATABASE_URL).pathname))
let mode='known',calls=0
const load=require('./connected-source-loader.cjs')({
 '@/platform/database/prisma':{db},'@/platform/observability/logger':{logEvent:()=>{}},
 '@/modules/providers/server/panel-credentials':{decryptPanelCredential:value=>value,encryptPanelCredential:value=>value},
 './credentials':{generateWithCredentialPool:async()=>null,credentialPoolReady:async()=>null},
 './admin-context':{personalAiPurpose:()=>undefined,personalAiActor:()=>undefined},
 '@/modules/social/server/egress':{egressRoute:async()=>'direct',egressFetch:async()=>{calls++;return new Response(JSON.stringify(mode==='failure'?{error:'private-key-should-not-be-stored'}:{choices:[{message:{content:'private-answer-should-not-be-stored'},finish_reason:'stop'}],...(mode==='known'?{usage:{prompt_tokens:12,completion_tokens:8,total_tokens:20}}:{})}),{status:mode==='failure'?402:200,headers:{'content-type':'application/json'}})}},
})
async function main(){try{
 const client=load('src/modules/ai/server/client.ts'),config={provider:'ollama',model:stamp,apiKey:'',baseUrl:'',voice:'',botName:''},prompt={system:'private-system',user:'private-user',maxTokens:200}
 const result=await client.generateApi(prompt,config,{purpose:'support'});assert.deepEqual(result.usage,{inputTokens:12,outputTokens:8,totalTokens:20});let row=await db.aiInvocation.findUniqueOrThrow({where:{id:result.observationId}});assert.equal(row.totalTokens,20);assert.equal(row.purpose,'support');assert.equal(row.attempts,1)
 mode='unknown';const unknown=await client.generateApi(prompt,config,{purpose:'production'});assert.equal((await db.aiInvocation.findUniqueOrThrow({where:{id:unknown.observationId}})).totalTokens,null)
 mode='failure';await assert.rejects(client.generateApi(prompt,config,{purpose:'support'}));row=await db.aiInvocation.findFirstOrThrow({where:{model:stamp,status:'FAILED'}});assert.equal(row.errorKind,'quota');assert.equal(row.errorStatus,402);assert.equal(calls,3,'no hidden telemetry/provider replay')
 const imageLoad=require('./connected-source-loader.cjs')({'@/platform/database/prisma':{db},'@/platform/observability/logger':{logEvent:()=>{}},'@/modules/providers/server/panel-credentials':{decryptPanelCredential:v=>v},'./credentials':{generateWithCredentialPool:async()=>null},'@/modules/social/server/egress':{egressFetch:async()=>new Response(JSON.stringify({data:[{b64_json:Buffer.from([137,80,78,71,13,10,26,10,1,2,3]).toString('base64')}]}),{headers:{'content-type':'application/json'}})}})
 assert((await imageLoad('src/modules/ai/server/image-client.ts').generateImageApi('private-image-prompt',{...config,provider:'custom',baseUrl:'https://owned.invalid/v1'},'square')).startsWith('data:image/png;base64,'));row=await db.aiInvocation.findFirstOrThrow({where:{model:stamp,kind:'image'}});assert.equal(row.purpose,'production-image');assert.equal(row.totalTokens,null)
 const state={enabled:true,model:stamp,active:'owned-client',accounts:[{clientId:'owned-client',refresh:'private-refresh'}]},account={clientId:'owned-client',refresh:'private-refresh',access:'private-access'}
 const personalLoad=require('./connected-source-loader.cjs')({'@/platform/database/prisma':{db},'@/platform/observability/logger':{logEvent:()=>{}},'../admin-context':{personalAiPurpose:()=> 'editor'},'./store':{readState:async()=>state},'./session':{activeAccount:async()=>account},'./network':{boundedText:async response=>response.text(),fixedFetch:async()=>new Response(JSON.stringify({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'private-personal-answer'}]}]}),{headers:{'content-type':'application/json'}})}})
 const personal=await personalLoad('src/modules/ai/server/chatgpt/inference.ts').personalGenerate(1,prompt);row=await db.aiInvocation.findUniqueOrThrow({where:{id:personal.observationId}});assert.equal(row.transport,'personal');assert.equal(row.purpose,'editor');assert.equal(row.totalTokens,null)
 for(const r of await db.aiInvocation.findMany({where:{model:stamp}}))assert(!/private-|Bearer|https:/.test(JSON.stringify(r)), 'no prompt/response/key/endpoint stored')
 console.log('Native PG AI transports: provider-reported text usage, unknown usage, quota failure/no replay, image and personal instrumentation, no private payload retention passed')
}finally{await db.aiInvocation.deleteMany({where:{model:stamp}});await db.$disconnect()}}
main().catch(e=>{console.error(e);process.exitCode=1})
