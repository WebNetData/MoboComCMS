// Native PostgreSQL, crypto, Setting CAS/leases and actual OAuth/Responses owners. Only upstream responses/cache are doubled.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client'),loadSource=require('./connected-source-loader.cjs'),db=new PrismaClient()
const stamp='owned-chatgpt-'+Date.now(),keys=[],users=[],priorKey=process.env.PANEL_CREDENTIAL_KEY,pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048}),jwk={...pair.publicKey.export({format:'jwk'}),kid:stamp,alg:'RS256',use:'sig'},calls=[];let nonce='',rotation=0
const sign=body=>{const h=Buffer.from(JSON.stringify({alg:'RS256',kid:stamp})).toString('base64url'),p=Buffer.from(JSON.stringify(body)).toString('base64url');return h+'.'+p+'.'+crypto.sign('RSA-SHA256',Buffer.from(h+'.'+p),pair.privateKey).toString('base64url')}
const event=(type,extra={})=>'data: '+JSON.stringify({type,...extra})+'\n\n'
async function main(){try{
 process.env.PANEL_CREDENTIAL_KEY=crypto.randomBytes(32).toString('hex')
 for(let i=0;i<2;i++)users.push(await db.user.create({data:{email:`${stamp}-${i}@invalid.test`,name:stamp,role:'ADMIN',status:'ACTIVE',passwordHash:'owned-unused'}}))
 const load=loadSource({'@/platform/database/prisma':{db},'@/platform/cache/kv':{cached:async(k,t,fn)=>fn(),invalidate:async()=>{}},'@/modules/social/server/egress':{egressRoute:async()=> 'direct',egressFetch:async(url,init={})=>{
  calls.push({url,init})
  if(url.endsWith('openid-configuration'))return Response.json({issuer:'https://auth.openai.com',jwks_uri:'https://auth.openai.com/owned-jwks',revocation_endpoint:'https://auth.openai.com/owned-revoke'})
  if(url.endsWith('owned-jwks'))return Response.json({keys:[jwk]})
  if(url.endsWith('/oauth/token')){const form=new URLSearchParams(init.body),refresh=form.get('grant_type')==='refresh_token';if(refresh)rotation++;return Response.json({token_type:'Bearer',access_token:'owned-access-'+rotation,refresh_token:'owned-refresh-'+rotation,expires_in:3600,scope:'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',id_token:sign({iss:'https://auth.openai.com',aud:form.get('client_id'),sub:'owned-subject',email:stamp+'@invalid.test',nonce,exp:Math.floor(Date.now()/1000)+3600})})}
  if(url.endsWith('/models'))return Response.json({models:[{slug:'owned-model',display_name:'Owned account model',visibility:'list',instructions:'catalog metadata '.repeat(18000)},{slug:'hidden-model',visibility:'hidden'}]})
  if(url.endsWith('/responses'))return new Response(event('response.output_text.delta',{delta:'پاسخ مدیریت'})+event('response.completed',{response:{status:'completed'}}),{headers:{'content-type':'text/event-stream'}})
  if(url.endsWith('owned-revoke'))return new Response(null,{status:200})
  if(url.endsWith('/chat/completions'))return Response.json({choices:[{message:{content:'shared-public-provider'}}]})
  throw Error('Unexpected fixture endpoint')
 }}})
 const session=load('src/modules/ai/server/chatgpt/session.ts'),store=load('src/modules/ai/server/chatgpt/store.ts'),context=load('src/modules/ai/server/admin-context.ts'),client=load('src/modules/ai/server/client.ts')
 for(const u of users)keys.push(`ai.chatgpt.personal.v1.${u.id}`,`lease.chatgpt.refresh.${u.id}`)
 const id=users[0].id,begun=await session.beginLogin(id,'');nonce=new URL(begun.url).searchParams.get('nonce')
 await session.finishLogin(id,{state:begun.state,code:'owned-code',client_id:'oaiapp_native_'+id});await assert.rejects(session.finishLogin(id,{state:begun.state,code:'owned-code',client_id:'oaiapp_native_'+id}))
 const row=await db.setting.findUniqueOrThrow({where:{key:keys[0]}});assert(!row.value.includes('owned-access'));assert(!row.value.includes('owned-refresh'));assert.equal((await store.readState(users[1].id)).accounts.length,0)
 const inference=load('src/modules/ai/server/chatgpt/inference.ts');assert.deepEqual(await inference.modelsFor(id),[{id:'owned-model',label:'Owned account model'}]);assert.equal((await db.setting.findUniqueOrThrow({where:{key:keys[0]}})).value,row.value,'large model catalog preserves the encrypted connection and is never stored')
 // Two genuine first-row creations must merge through the existing Serializable/CAS retry owner.
 await Promise.all([store.changeState(users[1].id,s=>{s.model='owned-model'}),store.changeState(users[1].id,s=>{s.enabled=true})]);const raced=await store.readState(users[1].id);assert.equal(raced.model,'owned-model');assert.equal(raced.enabled,true)
 await store.changeState(id,s=>{s.enabled=true;s.model='owned-model';s.accounts[0].expires=0})
 const priorAuditValue=(await db.setting.findUniqueOrThrow({where:{key:keys[0]}})).value
 const rejecting=loadSource({'@/platform/database/prisma':{db},'@/platform/cache/kv':{cached:async(k,t,fn)=>fn(),invalidate:async()=>{}},'@/platform/audit/server':{auditAdminStrict:async()=>{throw Error('owned audit failure')}}})('src/modules/ai/server/chatgpt/store.ts')
 const auditInput={req:{headers:new Headers()},actor:{id,email:users[0].email},action:'ai.chatgpt.test',targetType:'user',targetId:id}
 await assert.rejects(rejecting.withConnectionAudit(auditInput,()=>rejecting.changeState(id,s=>{s.enabled=false})),/owned audit failure/);assert.equal((await db.setting.findUniqueOrThrow({where:{key:keys[0]}})).value,priorAuditValue)
 await store.withConnectionAudit(auditInput,()=>store.changeState(id,s=>{s.enabled=true}));assert.equal(await db.auditLog.count({where:{actorUserId:id,action:'ai.chatgpt.test'}}),1)
 const attempts=await Promise.allSettled([session.activeAccount(id),session.activeAccount(id)]);assert.equal(rotation,1);assert(attempts.some(a=>a.status==='fulfilled'))
 const config={provider:'gemini',model:'owned',apiKey:'owned-public-key',voice:'',botName:'',baseUrl:''},prompt={system:'personal admin',user:'test',maxTokens:200}
 assert.equal((await context.withPersonalAi(id,()=>client.generate(prompt,config))).provider,'chatgpt-personal');assert.equal((await client.generate(prompt,config)).text,'shared-public-provider');await assert.rejects(context.withPersonalAi(users[1].id,()=>client.generate(prompt,config)),/متصل/)
 assert.equal(calls.filter(c=>c.url.endsWith('/responses')).length,1)
 await session.disconnect(id);assert.equal((await store.readState(id)).accounts[0].refresh,'')
 console.log('ChatGPT native PostgreSQL passed: signed OAuth/one-use callback, encrypted per-admin isolation, concurrent first-create merge, single rotating refresh, public request isolation, no paid fallback and disconnect retention')
 }finally{try{await db.setting.deleteMany({where:{key:{in:keys}}});if(users.length)await db.auditLog.deleteMany({where:{actorUserId:{in:users.map(u=>u.id)}}});await db.user.deleteMany({where:{id:{in:users.map(u=>u.id)},email:{startsWith:stamp}}})}finally{if(priorKey===undefined)delete process.env.PANEL_CREDENTIAL_KEY;else process.env.PANEL_CREDENTIAL_KEY=priorKey;await db.$disconnect()}}
}
main().catch(e=>{console.error(e);process.exitCode=1})
