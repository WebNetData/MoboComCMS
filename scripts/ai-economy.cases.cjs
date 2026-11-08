const {test}=require('node:test'),assert=require('node:assert/strict'),source=require('./connected-source-loader.cjs');
const config=(provider,extra={})=>({provider,model:provider==='ollama'?'qwen2.5:7b':'auto',baseUrl:'',apiKey:provider==='ollama'?'':'own-key',voice:'',botName:'',...extra});
test('economy policy is opt-in, bounded and denies unapproved paid providers or unattested gateways',()=>{
 const {economyPolicy,DEFAULT_ECONOMY,localModelId}=source()('src/modules/ai/domain/economy.ts');
 assert.equal(economyPolicy({}).enabled,false);
 for(const patch of[{providers:['anthropic']},{providers:['ollama','ollama']},{providers:[]},{providers:['omniroute']},{maxAttempts:4},{revision:-1},{apiKey:'secret'}])assert.throws(()=>economyPolicy({...DEFAULT_ECONOMY,...patch}));
 assert.equal(economyPolicy({...DEFAULT_ECONOMY,providers:['omniroute'],gatewayFreeOnly:true}).gatewayFreeOnly,true);
 assert.equal(localModelId('qwen3:8b'),true);assert.equal(localModelId('deepseek:cloud'),false);
 const ai=source()('src/modules/ai/domain/ai.ts'),old=config('omniroute',{baseUrl:'https://one.example/v1',apiKey:'encrypted'});
 assert.equal(ai.normalizeAiConfig({...old,baseUrl:'https://two.example/v1',apiKey:''},old).apiKey,'','new destination cannot inherit an old key');
 assert.equal(ai.normalizeAiConfig({...old,baseUrl:'https://user:secret@one.example/v1'},old).baseUrl,'');
});
function scenario(extra={}){
 let revision=1,enabled=true;const observations=[];
 const policy=()=>({version:1,revision,enabled,providers:['openrouter','ollama'],gatewayFreeOnly:false,maxAttempts:2});
 const mocks={
 './economy/store':{readEconomyPolicy:async()=>policy(),economySources:async()=>new Map([['openrouter',config('openrouter',{model:'paid-should-never-run'})],['ollama',config('ollama')]]),economyBindingFor:p=>String(p.revision),economyBinding:async()=>String(revision),economyHealth:async()=>({}),economySourceId:c=>c.provider,recordEconomyResult:async(c,_t,reason)=>observations.push([c.provider,reason])},
 './economy/catalog':{localModels:async()=>['qwen2.5:7b']},'./credentials':{credentialPoolReady:async()=>null},'@/modules/providers/server/panel-credentials':{decryptPanelCredential:v=>v},...extra
 };
 const load=source(mocks),{AiError}=load('src/modules/ai/server/error.ts');return{run:load('src/modules/ai/server/economy.ts').generateEconomy,AiError,observations,change:()=>revision++,disable:()=>enabled=false};
}
test('explicit economy selection uses free-only router, then approved local source after a definite quota rejection',async()=>{
 const s=scenario(),seen=[];
 const out=await s.run({system:'',user:'one',maxTokens:10},config('economy'),{},async(_p,c)=>{seen.push([c.provider,c.model]);if(c.provider==='openrouter')throw new s.AiError('quota',429,'quota');return{text:'answer',model:c.model,provider:c.provider}});
 assert.deepEqual(seen,[['openrouter','openrouter/free'],['ollama','qwen2.5:7b']]);assert.equal(out.provider,'ollama');assert.deepEqual(s.observations,[['openrouter','quota'],['ollama','']]);
});
test('economy never replays ambiguous, malformed, cancelled, refused or server-error generations',async()=>{
 for(const detail of[[502,'unavailable',false],[502,'unavailable',true],[422,undefined,true],[504,'unavailable',false]]){
  const s=scenario();let calls=0;
  await assert.rejects(s.run({user:'',system:'',maxTokens:10},config('economy'),{},async()=>{calls++;throw new s.AiError('stop',...detail)}));assert.equal(calls,1);
 }
 const s=scenario();s.disable();let calls=0;await assert.rejects(s.run({user:'',system:'',maxTokens:10},config('economy'),{},async()=>{calls++}));assert.equal(calls,0);
 const changed=scenario();await assert.rejects(changed.run({user:'',system:'',maxTokens:10},config('economy'),{},async()=>{changed.change();return{text:'late',model:'m',provider:'openrouter'}}),/سیاست یا مقصد/);
});
test('local catalog excludes remote aliases and metadata, bounds responses and caches only public model names',async()=>{
 let calls=0;const load=source({'@/modules/social/server/egress':{egressFetch:async(_url,options)=>{calls++;assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer own');return Response.json({models:[{name:'qwen3:8b'},{name:'cloud:latest'},{name:'alias',remote_host:'https://cloud.example'},{name:'other',remote_model:'remote'}]})}},'../credentials':{credentialForMetadata:async()=> 'own'}});
 const {localModels}=load('src/modules/ai/server/economy/catalog.ts'),c=config('ollama',{baseUrl:'http://localhost:11434/v1'});
 assert.deepEqual(await localModels(c),['qwen3:8b']);assert.deepEqual(await localModels(c),['qwen3:8b']);assert.equal(calls,1);
 await assert.rejects(localModels({...c,baseUrl:'https://u:p@one.example/v1'}));
});
