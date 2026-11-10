const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),loadSource=require('./connected-source-loader.cjs')
function fixture(){
 const rows=new Map(),calls=[];let personal=true,auditFails=false,actor={id:41,email:'owned-routing@invalid.test'},off=null
 const load=loadSource({
  '@/platform/database/prisma':{db:{setting:{findUnique:async({where})=>rows.has(where.key)?{value:rows.get(where.key)}:null}}},
  '@/modules/settings/server':{updateJsonSetting:async(key,fn)=>{const v=JSON.parse(rows.get(key)||'{}'),r=await fn(v,{});rows.set(key,JSON.stringify(v));return r}},
  '@/platform/audit/server':{auditAdminStrict:async()=>{if(auditFails)throw Error('owned audit failure')}},
  '@/modules/social/server/egress':{egressRoute:async()=> 'direct',egressFetch:async(url,init)=>{calls.push({url,body:JSON.parse(init.body),headers:init.headers});return Response.json({choices:[{message:{content:'owned API answer'}}]})}},
  './chatgpt':{personalGenerate:async(id)=>{calls.push({personal:id});return personal?{text:'owned personal',model:'owned-personal',provider:'chatgpt-personal'}:null},ChatGptError:class extends Error{}},
  '@/modules/identity/server/access':{requirePerm:async()=>actor},'@/extensions/server/modules':{moduleGuard:async()=>off},'@/platform/http/rate-limit':{rateLimitStrict:async()=>({ok:true})},
 })
 return{rows,calls,load,routing:load('src/modules/ai/server/routing.ts'),client:load('src/modules/ai/server/client.ts'),ctx:load('src/modules/ai/server/admin-context.ts'),setPersonal:x=>personal=x,setAuditFailure:x=>auditFails=x,setActor:x=>actor=x,setOff:x=>off=x}
}
const prompt={system:'owned',user:'routing input',maxTokens:200},config={provider:'gemini',apiKey:'owned-global-key',model:'owned-global',baseUrl:'',voice:'',botName:''}
test('AI purpose API overrides personal Admin; public support/prompts never use that personal account',async()=>{
 const f=fixture();await f.routing.saveAiRoute('support',{source:'api',config:{provider:'gemini',apiKey:'owned-support-key',model:'owned-support'}})
 assert.equal((await f.ctx.withPersonalAi(41,()=>f.client.generate(prompt,config,'support'))).model,'owned-support');assert.equal(f.calls.at(-1).headers.Authorization,'Bearer owned-support-key')
 assert.equal((await f.ctx.withPersonalAi(41,()=>f.client.generate(prompt,config))).model,'owned-global','Admin inheriting the site default does not take the personal grant')
 await f.routing.saveAiRoute('admin',{source:'personal'})
 assert.equal((await f.ctx.withPersonalAi(41,()=>f.client.generate(prompt,config))).provider,'chatgpt-personal')
 await f.routing.saveAiRoute('journal',{source:'api',config:{provider:'groq',apiKey:'owned-journal-key',model:'owned-journal'}})
 assert.equal((await f.ctx.withPersonalAi(41,()=>f.client.generate(prompt,config),'journal')).model,'owned-journal');assert.match(f.calls.at(-1).url,/api.groq.com/)
 assert.equal((await f.ctx.withPersonalAi(41,()=>f.client.generate(prompt,config,'prompts'))).model,'owned-global')
 assert.equal(await f.client.publicAiReady('prompts'),false)
 await f.routing.saveAiRoute('prompts',{source:'api',config:{provider:'gemini',apiKey:'owned-prompts-key',model:'owned-prompts'}})
 assert.equal(await f.client.publicAiReady('prompts'),true,'studio availability uses its configured API even without a global key')
 assert.equal((await f.ctx.withPersonalAi(41,()=>f.client.generate(prompt,config,'prompts'))).model,'owned-prompts')
 await assert.rejects(f.routing.saveAiRoute('support',{source:'personal'}));await assert.rejects(f.routing.saveAiRoute('prompts',{source:'personal'}))
})
test('AI routing inherits Admin children but never falls back from explicit personal or API failures',async()=>{
 const f=fixture();await f.routing.saveAiRoute('admin',{source:'api',config:{provider:'gemini',model:'owned-admin',apiKey:'owned-key'}})
 assert.equal((await f.ctx.withPersonalAi(41,()=>f.client.generate(prompt,config),'seo')).model,'owned-admin')
 await f.routing.saveAiRoute('admin',{source:'personal'});f.setPersonal(false)
 const count=f.calls.length;await assert.rejects(f.ctx.withPersonalAi(41,()=>f.client.generate(prompt,config),'seo'),e=>e.status===409);assert.equal(f.calls.length,count+1)
 await assert.rejects(f.client.generate(prompt,config,'admin'),e=>e.status===403)
 await f.routing.saveAiRoute('store',{source:'api',config:{provider:'gemini',apiKey:'',model:'owned'}})
 const before=f.calls.length;await assert.rejects(f.ctx.withPersonalAi(41,()=>f.client.generate(prompt,config),'store'),/کلید/);assert.equal(f.calls.length,before)
})
test('AI routing encrypts long keys, merges field patches and clears keys on destination change',async()=>{
 const f=fixture(),old=process.env.PANEL_CREDENTIAL_KEY;process.env.PANEL_CREDENTIAL_KEY=crypto.randomBytes(32).toString('hex')
 try{await f.routing.saveAiRoute('support',{source:'api',config:{provider:'gemini',apiKey:'x'.repeat(400),model:'first'}})
 assert(![...f.rows.values()].join().includes('x'.repeat(40)));let raw=await f.routing.readAiRoutes();assert(raw.support.config.apiKey.length>400)
 await f.routing.saveAiRoute('support',{config:{model:'second'}});assert.equal((await f.routing.readAiRoutes()).support.config.apiKey,raw.support.config.apiKey)
 const projected=JSON.stringify(f.routing.publicAiRoutes(await f.routing.readAiRoutes()));assert(!projected.includes('x'.repeat(40)));assert(!projected.includes('encv1:'))
 await f.routing.saveAiRoute('support',{config:{provider:'groq'}});assert.equal((await f.routing.readAiRoutes()).support.config.apiKey,'')
 await f.routing.saveAiRoute('support',{config:{apiKey:'new-key'}});await f.routing.saveAiRoute('support',{config:{clearKey:true}});assert.equal((await f.routing.readAiRoutes()).support.config.apiKey,'')
 }finally{if(old===undefined)delete process.env.PANEL_CREDENTIAL_KEY;else process.env.PANEL_CREDENTIAL_KEY=old}
})
test('AI routing preserves corrupt settings and rolls back an audited save failure',async()=>{
 const f=fixture();f.rows.set('ai.routing.v1','{"version":2,"routes":{}}');await assert.rejects(f.routing.readAiRoutes(),e=>e.status===503);await assert.rejects(f.routing.saveAiRoute('admin',{source:'inherit'}));assert.equal(f.rows.get('ai.routing.v1'),'{"version":2,"routes":{}}')
 f.rows.delete('ai.routing.v1');f.setAuditFailure(true);await assert.rejects(f.routing.saveAiRoute('admin',{source:'personal'},{action:'owned'}),/owned audit failure/);assert.equal(f.rows.size,0)
})
test('AI routing HTTP denies guests/module-off and validates bounded typed configuration',async()=>{
 const f=fixture(),http=f.load('src/modules/ai/server/http/routing.ts'),req=body=>new Request('https://owned.test/api/admin/ai/routing',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
 f.setActor(null);assert.equal((await http.GET(req({}))).status,403);assert.equal((await http.PUT(req({purpose:'support',source:'personal'}))).status,403)
 f.setActor({id:41});f.setOff(new Response(null,{status:404}));assert.equal((await http.GET(req({}))).status,404);f.setOff(null)
 for(const body of [{purpose:'support',source:['api']},{purpose:'support',source:'personal'},{purpose:'support',source:'api',config:{provider:'arbitrary'}},{purpose:'bad'},{purpose:'support',config:{model:'a'.repeat(121)}}])assert.equal((await http.PUT(req(body))).status,400)
 assert.equal((await http.PUT(req({purpose:'support',source:'api',config:{provider:'gemini',apiKey:'owned-key',model:'owned'}}))).status,200)
 const response=await http.GET(req({}));assert.match(response.headers.get('cache-control'),/no-store/);assert(!(await response.text()).includes('owned-key'))
})
test('AI section/action purposes match existing editors without public-purpose input selection',()=>{
 const f=fixture(),d=f.load('src/modules/ai/domain/routing.ts')
 for(const [section,purpose]of [['music-tracks','music'],['cinema-titles','cinema'],['products','store'],['games','games'],['posts','journal']])assert.equal(d.purposeForAdminAction('content.autofill',section),purpose)
 assert.equal(d.purposeForAdminAction('forum.suggest'),'forum');assert.equal(d.purposeForAdminAction('post.draft','support'),'journal')
})
