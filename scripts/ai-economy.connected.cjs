const assert=require('node:assert/strict'),crypto=require('node:crypto'),{PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server'),source=require('./connected-source-loader.cjs');
assert(/check|test/.test(new URL(process.env.DATABASE_URL).pathname));
const db=new PrismaClient(),stamp='owned-economy-'+Date.now(),users=[],previous=new Map();
const keys=['ai.config.v1','ai.routing.v1','ai.credentials.v1','ai.economy.v1','ai.economy.health.v1'];
const req=(id,method='GET',body)=>new NextRequest('http://localhost:3000/api/admin/ai/economy',{method,headers:{'x-owned-actor':String(id),Origin:'http://localhost:3000','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
(async()=>{try{
 for(const key of keys){const row=await db.setting.findUnique({where:{key}});previous.set(key,row?.value??null);await db.setting.deleteMany({where:{key}})}
 for(const role of ['ADMIN','CUSTOMER']){const u=await db.user.create({data:{email:`${stamp}-${role}@invalid.test`,name:stamp,passwordHash:'unused',role,status:'ACTIVE'}});users.push(u.id)}
 let calls=0;
 const load=source({'@/platform/database/prisma':{db},'next-auth/jwt':{getToken:async({req})=>({uid:req.headers.get('x-owned-actor'),authAt:Date.now()})},'@/extensions/server/modules':{moduleGuard:async()=>null},'@/platform/http/rate-limit':{rateLimitStrict:async()=>({ok:true})},'@/platform/cache/kv':{cached:async(_k,_t,fn)=>fn(),invalidate:async()=>{}},'@/modules/social/server/egress':{egressRoute:async()=> 'direct',egressFetch:async(url)=>{calls++;assert(url==='https://openrouter.ai/api/v1/chat/completions');return Response.json({choices:[{message:{content:'پاسخ مجاز'},finish_reason:'stop'}]})}}});
 const http=load('src/modules/ai/server/http/economy.ts'),store=load('src/modules/ai/server/economy/store.ts'),api=load('src/modules/ai/server/client.ts'),production=load('src/modules/ai/server/production/providers.ts');
 assert.equal((await http.GET(req(users[1]))).status,403);assert.equal((await http.PUT(req(users[1],'PUT',{}))).status,403);
 const initial=await(await http.GET(req(users[0]))).json();assert.equal(initial.policy.enabled,false);
 const policy={...initial.policy,enabled:true,providers:['openrouter'],maxAttempts:1};
 assert.equal((await http.PUT(req(users[0],'PUT',policy))).status,200);
 assert.equal((await http.PUT(req(users[0],'PUT',policy))).status,409,'stale policy cannot overwrite current state');
 const encrypted=load('src/modules/providers/server/panel-credentials.ts').encryptPanelCredential('owned-only-test-secret');
 const base={provider:'openrouter',model:'paid-unapproved',baseUrl:'',apiKey:encrypted,voice:'',botName:''};
 assert.notEqual(store.economySourceId(base),store.economySourceId({...base,apiKey:encrypted+'changed'}),'replaced credentials reset stale source cooldowns');
 assert.notEqual(store.economySourceId({...base,credentialVersion:'1'}),store.economySourceId({...base,credentialVersion:'2'}),'pool revision is included in source binding');
 await db.setting.create({data:{key:'ai.config.v1',value:JSON.stringify(base)}});
 assert(!JSON.stringify(await(await http.GET(req(users[0]))).json()).includes('owned-only-test-secret'));
 const config={generation:{text:{source:'api',provider:'economy',model:'auto'},image:{source:'chat-web'},confirmed:true},cover:false,inline:0};
 const bound=await production.prepareProductionConfig(config,true);assert.match(bound.generation.text.binding,/^[a-f0-9]{64}$/);
 const result=await api.generateApi({system:'',user:'one',maxTokens:10},{...base,provider:'economy',apiKey:''});assert.equal(result.provider,'openrouter');assert.equal(result.model,'openrouter/free');assert.equal(calls,1);
 const policy2=await store.readEconomyPolicy();await store.saveEconomyPolicy({...policy2,enabled:false},{req:req(users[0]),actor:{id:users[0],email:`${stamp}-ADMIN@invalid.test`},action:'ai.economy.update',targetType:'setting',targetId:'ai.economy.v1'});
 await assert.rejects(production.productionProvider(bound,'text',true,true),e=>e.status===409);
 const observational=await store.economyHealth();assert.equal(Object.keys(observational).length,1);
 console.log('Economy PostgreSQL: permission, revision CAS, secret projection, free-only transport, observations and production revocation passed; one controlled inference, no real API');
}finally{
 await db.auditLog.deleteMany({where:{actorUserId:{in:users}}});
 await db.user.deleteMany({where:{id:{in:users},email:{startsWith:stamp}}});
 for(const[key,value]of previous)if(value===null)await db.setting.deleteMany({where:{key}});else await db.setting.upsert({where:{key},create:{key,value},update:{value}});
 await db.$disconnect();
}})().catch(e=>{console.error(e.stack);process.exitCode=1});
