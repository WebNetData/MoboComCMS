const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),loadSource=require('./connected-source-loader.cjs')
function fixture(extra={}){
 const rows=new Map(),requests=[],leases=new Set(),pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048}),jwks={...pair.publicKey.export({format:'jwk'}),kid:'owned-jwk',use:'sig',alg:'RS256'}
 let tokenOptions={},nonce='',clientId='oaiapp_owned',identity='owned-subject',refreshes=0
 const claims=(changes={})=>({iss:'https://auth.openai.com',aud:clientId,sub:identity,nonce,exp:Math.floor(Date.now()/1000)+3600,...changes})
 const sign=(body=claims())=>{const a=Buffer.from(JSON.stringify({alg:'RS256',kid:'owned-jwk'})).toString('base64url'),b=Buffer.from(JSON.stringify(body)).toString('base64url');return a+'.'+b+'.'+crypto.sign('RSA-SHA256',Buffer.from(a+'.'+b),pair.privateKey).toString('base64url')}
 const event=(type,rest={})=>'data: '+JSON.stringify({type,...rest})+'\n\n'
 const upstream=async(url,init={})=>{
  requests.push({url,init})
  if(url.endsWith('openid-configuration'))return Response.json({issuer:'https://auth.openai.com',jwks_uri:'https://auth.openai.com/owned-jwks',revocation_endpoint:'https://auth.openai.com/owned-revoke'})
  if(url.endsWith('owned-jwks'))return Response.json({keys:[jwks]})
  if(url.endsWith('/oauth/token')){if(String(init.body).includes('refresh_token'))refreshes++;return Response.json({access_token:'owned-access-secret',refresh_token:'owned-refresh-secret-'+refreshes,id_token:sign(),token_type:'Bearer',expires_in:3600,scope:'openid email profile offline_access resource.invoke chatgpt.tokens.use.direct',...tokenOptions})}
  if(url.endsWith('/models'))return Response.json({models:[{slug:'owned-model',display_name:'Owned model',visibility:'list'},{slug:'hidden-model',visibility:'hidden'}]})
  if(url.endsWith('/responses'))return new Response(event('response.output_text.delta',{delta:'پاسخ مدیریت'})+event('response.completed',{response:{status:'completed'}}),{headers:{'Content-Type':'text/event-stream'}})
  if(url.endsWith('/chat/completions'))return Response.json({choices:[{message:{content:'shared-provider'}}]})
  if(url.endsWith('owned-revoke'))return new Response(null,{status:200})
  throw Error('Unexpected owned URL '+url)
 }
 const mocks={
  '@/platform/database/prisma':{db:{setting:{findUnique:async({where})=>rows.has(where.key)?{key:where.key,value:rows.get(where.key)}:null}}},
  '@/modules/settings/server':{updateJsonSetting:async(key,work)=>{const value=JSON.parse(rows.get(key)||'{}'),result=await work(value,{});rows.set(key,JSON.stringify(value));return result},acquireLease:async(key)=>{if(leases.has(key))return false;leases.add(key);return true}},
  '@/modules/social/server/egress':{egressFetch:extra.fetch||upstream,egressRoute:async()=> 'direct'},
  '@/platform/audit/server':{auditAdminStrict:async()=>{}},
  ...extra.mocks,
 }
 const load=loadSource(mocks),session=load('src/modules/ai/server/chatgpt/session.ts'),store=load('src/modules/ai/server/chatgpt/store.ts'),inference=load('src/modules/ai/server/chatgpt/inference.ts')
 async function connect(id=11){const begun=await session.beginLogin(id,'');nonce=new URL(begun.url).searchParams.get('nonce');await session.finishLogin(id,{state:begun.state,code:'owned-code',client_id:clientId});return begun}
 return{load,session,store,inference,connect,rows,requests,sign,claims,event,upstream,setTokens:value=>{tokenOptions=value},setIdentity:(s,c)=>{identity=s;clientId=c},get refreshes(){return refreshes}}
}

test('personal ChatGPT OAuth validates state, PKCE, signed identity, scopes and one-use completion without leaking stored secrets',async()=>{
 const f=fixture(),begun=await f.connect(),url=new URL(begun.url),state=await f.store.readState(11)
 assert.equal(url.origin,'https://auth.openai.com');assert.equal(url.searchParams.get('client_id'),'dynamic_agent_client');assert.equal(url.searchParams.get('redirect_uri'),'http://127.0.0.1:1455/auth/callback');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('agent_name_hint'),'MoboComCMS')
 assert.equal(state.enabled,false);assert.equal(state.accounts[0].subject,'owned-subject');assert.equal(state.accounts[0].access,'owned-access-secret');assert(![...f.rows.values()].join().includes('owned-access-secret'))
 assert(!JSON.stringify(f.store.publicState(state)).includes('owned-refresh-secret'));await assert.rejects(f.session.finishLogin(11,{state:begun.state,code:'owned-code',client_id:'oaiapp_owned'}),e=>e.status===409)
 const next=await f.session.beginLogin(11,'oaiapp_owned');assert.equal(new URL(next.url).searchParams.get('ext_agent_host_id'),state.hostId);assert.equal(new URL(next.url).searchParams.has('agent_name_hint'),false)
 await assert.rejects(f.session.finishLogin(11,{state:'wrong',code:'owned-code'}),e=>e.status===409);assert.equal((await f.store.readState(11)).pending.state,next.state)
})
test('ChatGPT rejects forged identities, wrong nonce/audience and missing plan scope before replacing any connection',async()=>{
 for(const fault of ['nonce','audience','signature','scope']){
  const f=fixture(),begin=await f.session.beginLogin(11,''),nonce=new URL(begin.url).searchParams.get('nonce'),claims={iss:'https://auth.openai.com',aud:'oaiapp_owned',sub:'owned-subject',nonce,exp:Math.floor(Date.now()/1000)+3600}
  if(fault==='nonce')claims.nonce='wrong';if(fault==='audience')claims.aud='foreign-app'
  let signed=f.sign(claims);if(fault==='signature')signed=signed.slice(0,-8)+'AAAAAAAA'
  f.setTokens({id_token:signed,...(fault==='scope'?{scope:'openid profile'}:{})})
  await assert.rejects(f.session.finishLogin(11,{state:begin.state,code:'owned-code',client_id:'oaiapp_owned'}));assert.equal((await f.store.readState(11)).accounts.length,0)
 }
})
test('ChatGPT refresh is serialized and personal credentials cannot reach public or another admin generation',async()=>{
 const f=fixture();await f.connect();await f.store.changeState(11,s=>{s.enabled=true;s.model='owned-model';s.accounts[0].expires=0})
 const both=await Promise.allSettled([f.session.activeAccount(11),f.session.activeAccount(11)]);assert.equal(f.refreshes,1);assert(both.some(x=>x.status==='fulfilled'))
 const client=f.load('src/modules/ai/server/client.ts'),context=f.load('src/modules/ai/server/admin-context.ts'),prompt={system:'only admin',user:'owned input',maxTokens:200},config={provider:'gemini',apiKey:'owned-public-key',model:'owned-shared',baseUrl:'',voice:'',botName:''}
 assert.equal((await client.generate(prompt,config)).text,'shared-provider')
 assert.equal((await context.withPersonalAi(11,()=>client.generate(prompt,config))).provider,'chatgpt-personal')
 assert.equal((await context.withPersonalAi(12,()=>client.generate(prompt,config))).text,'shared-provider')
 const personal=f.requests.filter(r=>r.url.endsWith('/responses'));assert.equal(personal.length,1);assert.equal(personal[0].init.headers.Authorization,'Bearer owned-access-secret');assert.deepEqual(JSON.parse(personal[0].init.body),{model:'owned-model',instructions:'only admin',input:[{role:'user',content:'owned input'}],store:false,stream:true})
 await f.store.changeState(11,s=>{s.model=''});const before=f.requests.length;await assert.rejects(context.withPersonalAi(11,()=>client.generate(prompt,config)),/مدل/);assert.equal(f.requests.length,before,'no paid or public fallback')
})
test('ChatGPT SSE requires completed status and rejects quota, malformed, incomplete and truncated output',async()=>{
 const f=fixture(),make=s=>new Response(s,{headers:{'content-type':'text/event-stream'}})
 const valid=f.event('response.output_text.delta',{delta:'سلام'})+f.event('response.completed',{response:{status:'completed'}})
 const bytes=Buffer.from(valid.replaceAll('\n','\r\n'));let index=0
 const chunks=new ReadableStream({pull(c){if(index===bytes.length)c.close();else c.enqueue(bytes.subarray(index,index+=1))}})
 assert.equal(await f.inference.responseText(new Response(chunks,{headers:{'content-type':'text/event-stream'}})),'سلام')
 for(const text of [f.event('response.output_text.delta',{delta:'partial'}),f.event('response.failed',{response:{error:{code:'subscription_sharing_usage_limit_exceeded'}}}),f.event('response.incomplete'),f.event('response.completed',{response:{status:'failed'}}),'data: {bad}\n\n'])await assert.rejects(f.inference.responseText(make(text)))
})
test('ChatGPT disconnect clears tokens and retains client/host identity for reauthorization',async()=>{
 const f=fixture();await f.connect();const old=await f.store.readState(11);assert.equal(await f.session.disconnect(11),true);const next=await f.store.readState(11);assert.equal(next.hostId,old.hostId);assert.equal(next.accounts[0].clientId,old.accounts[0].clientId);assert.equal(next.accounts[0].refresh,'');assert.equal(next.accounts[0].access,'');assert.equal(next.accounts[0].idToken,'');assert.equal(next.enabled,false)
 const begun=await f.session.beginLogin(11,next.accounts[0].clientId);assert.equal(new URL(begun.url).searchParams.get('client_id'),'oaiapp_owned')
})
test('ChatGPT never invokes inference after the personal selection changes during refresh',async()=>{
 let f;f=fixture({fetch:async(url,init)=>{if(url.endsWith('/oauth/token')&&String(init.body).includes('refresh_token'))await f.store.changeState(11,s=>{s.enabled=false});return f.upstream(url,init)}})
 await f.connect();await f.store.changeState(11,s=>{s.enabled=true;s.model='owned-model';s.accounts[0].expires=0})
 await assert.rejects(f.inference.personalGenerate(11,{system:'admin',user:'owned input',maxTokens:200}),e=>e.status===409)
 assert(!f.requests.some(r=>r.url.endsWith('/responses')))
})
test('ChatGPT refuses saving a catalog model when its account disconnects during catalog validation',async()=>{
 let f;f=fixture({mocks:{'@/modules/identity/server/access':{requirePerm:async()=>({id:11})},'@/extensions/server/modules':{moduleGuard:async()=>null},'@/platform/http/rate-limit':{rateLimitStrict:async()=>({ok:true})},'@/platform/audit/server':{auditAdminStrict:async()=>{},auditAdmin:async()=>{}}},fetch:async(url,init)=>{if(url.endsWith('/models'))await f.store.changeState(11,s=>{s.accounts[0].refresh='';s.enabled=false});return f.upstream(url,init)}})
 await f.connect();const route=f.load('src/modules/ai/server/http/chatgpt.ts'),response=await route.POST(new Request('https://owned.test/api/admin/ai/chatgpt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save',model:'owned-model',enabled:true})}))
 assert.equal(response.status,409);assert.equal((await f.store.readState(11)).enabled,false)
})
