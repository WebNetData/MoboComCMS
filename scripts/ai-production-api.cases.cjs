const {test}=require('node:test'),assert=require('node:assert/strict'),source=require('./connected-source-loader.cjs');
const config={categoryIds:[],length:'medium',tone:'دقیق',keywords:'',instruction:'',cover:false,inline:0,imageStyle:'editorial',ratio:'landscape',productKind:'PHYSICAL',currency:'IRT',specifications:'{}'};
const target={source:'api',provider:'deepseek',model:'deepseek-flash'};
test('production requires explicit API consent and bounded known targets while published Chat batches remain unchanged',()=>{
  const p=source()('src/modules/ai/domain/production.ts'),seed={topic:'موضوع واقعی',facts:'منبع واقعی',price:'',stock:0},input=generation=>({kind:'post',config:{...config,...(generation?{generation}:{})},seeds:[seed]});
  assert.equal(p.parseProduction(input()).config.generation,undefined);
  const generation={text:target,image:{source:'chat-web'},confirmed:true};
  assert.equal(p.parseProduction(input(generation)).config.generation.text.provider,'deepseek');
  for(const patch of[{confirmed:false},{text:{...target,provider:'unknown'}},{text:{...target,model:'x?redirect=evil'}},{text:{...target,model:'x'.repeat(121)}},{text:{...target,apiKey:'never-store-secrets'}}])assert.throws(()=>p.parseProduction(input({...generation,...patch})));
  assert.equal(p.parseProduction(input({...generation,text:{...target,binding:'forged'}})).config.generation.text.binding,undefined,'client cannot choose a destination binding');
});
test('production choices expose configured APIs only and pin destination without personal routing or secret output',async()=>{
  let endpoint='http://model.example/v1',removed=false;
  const base={provider:'gemini',model:'gemini-test',baseUrl:'',apiKey:'secret-default',voice:'',botName:''};
  const load=source({'../economy':{economyReady:async()=>false},'../client':{getAiConfig:async()=>base},'../routing':{readAiRoutes:async()=>({}),resolveAiRoute:(_r,p)=>p==='production-image'?{source:'api',config:{...base,provider:'custom',baseUrl:endpoint,model:'image-test'}}:{source:'personal'}},'../credentials':{credentialPoolReady:async c=>['deepseek','qwen'].includes(c.provider)?true:null},'../credentials/store':{readCredentialPools:async()=>({pools:removed?[]:[{provider:'deepseek',enabled:true,baseUrl:'',keys:[{enabled:true,secret:'pool-secret'}]},{provider:'qwen',enabled:true,baseUrl:'',keys:[{enabled:true,secret:'pool-secret'}]},{provider:'custom',enabled:true,baseUrl:endpoint,keys:[{enabled:true,secret:'pool-secret'}]}]})},'@/modules/providers/server/panel-credentials':{decryptPanelCredential:k=>k}});
  const p=load('src/modules/ai/server/production/providers.ts');const choices=await p.productionProviders(true);assert.deepEqual(choices.text.map(x=>x.provider),['gemini','deepseek','qwen','custom']);assert.equal(choices.image[0].provider,'custom');assert(!JSON.stringify(choices).includes('secret'));
  const selected={...config,generation:{text:{...target,provider:'custom',model:'qwen-local'},image:{source:'chat-web'},confirmed:true}};
  const sealed=await p.prepareProductionConfig(selected,true);assert.match(sealed.generation.text.binding,/^[a-f0-9]{64}$/);assert.equal((await p.productionProvider(sealed,'text',true,true)).model,'qwen-local');
  endpoint='http://different.example/v1';await assert.rejects(p.productionProvider(sealed,'text',true,true),e=>e.status===409);removed=true;await assert.rejects(p.productionProvider(sealed,'text',true,true),e=>e.status===409);
  assert.deepEqual((await p.productionProviders(false)).text.map(c=>c.provider),['gemini']);await assert.rejects(p.prepareProductionConfig({...config,generation:{text:{source:'api',provider:'gemini',model:'unapproved-model'},image:{source:'chat-web'},confirmed:true}},false),e=>e.status===403);assert.equal(p.targetOf(config,'text').source,'chat-web');assert.throws(()=>p.requireProductionTransport(sealed,'text','chat-web'),e=>e.status===409);
});
test('explicit standard generation bypasses personal routing and uses official Qwen/DeepSeek JSON protocol without replay',async()=>{
  const calls=[];let finish='stop';
  const load=source({'@/platform/database/prisma':{db:{}},'./routing':{readAiRoutes:async()=>{throw Error('must not resolve personal routing')}},'@/modules/ai/server/admin-context':{personalAiActor:()=>99,personalAiPurpose:()=> 'admin'},'./credentials':{generateWithCredentialPool:async()=>null},'@/modules/providers/server/panel-credentials':{decryptPanelCredential:k=>k},'@/modules/social/server/egress':{egressRoute:async()=> 'direct',egressFetch:async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({choices:[{message:{content:'{"complete":true}'},finish_reason:finish}]}),{headers:{'content-type':'application/json'}})}}});
  const {generateApi}=load('src/modules/ai/server/client.ts'),prompt={system:'JSON',user:'JSON only',maxTokens:6000,json:true};
  for(const provider of['deepseek','qwen']){const result=await generateApi(prompt,{provider,model:provider==='qwen'?'qwen3.7-plus':'deepseek-flash',apiKey:'owned-test',baseUrl:'',voice:'',botName:''});assert.equal(result.provider,provider);const body=JSON.parse(calls.at(-1).init.body);assert.equal(body.response_format.type,'json_object');assert.equal(calls.at(-1).init.headers.Authorization,'Bearer owned-test');if(provider==='deepseek'){assert.equal(calls.at(-1).url,'https://api.deepseek.com/chat/completions');assert.equal(body.thinking.type,'disabled')}else assert.equal(body.enable_thinking,false)}
  finish='length';await assert.rejects(generateApi(prompt,{provider:'deepseek',model:'deepseek-flash',apiKey:'owned-test',baseUrl:'',voice:'',botName:''}),e=>e.retryCredential===false);assert.equal(calls.length,3,'truncated generation never replayed');
});
test('standard image transport accepts one bounded inline bitmap and never follows provider URLs or switches image providers',async()=>{
  let response={data:[{b64_json:Buffer.from([137,80,78,71,13,10,26,10,0]).toString('base64')}]},calls=0;
  const load=source({'./credentials':{generateWithCredentialPool:async()=>null},'@/modules/providers/server/panel-credentials':{decryptPanelCredential:k=>k},'@/modules/social/server/egress':{egressFetch:async()=>{calls++;return new Response(JSON.stringify(response),{headers:{'content-type':'application/json'}})}}});
  const {generateImageApi}=load('src/modules/ai/server/image-client.ts'),settings={provider:'custom',model:'image-test',apiKey:'',baseUrl:'http://images.example/v1',voice:'',botName:''};
  assert.match(await generateImageApi('one image',settings,'square'),/^data:image\/png;base64,/);
  for(const value of[{data:[{url:'http://127.0.0.1/private'}]},{data:[{b64_json:'AAAA'},{b64_json:'AAAA'}]},{data:[{b64_json:'AAAA'}]},{data:[{b64_json:'A'.repeat(2800001)}]}]){response=value;await assert.rejects(generateImageApi('one image',settings,'landscape'),e=>e.retryCredential===false)}
  assert.equal(calls,5);await assert.rejects(generateImageApi('one image',{...settings,provider:'deepseek'},'square'),e=>e.status===409);assert.equal(calls,5);
});
test('GPT image protocol omits unsupported legacy response_format while compatible services request base64 explicitly',async()=>{
  const calls=[],load=source({'./credentials':{generateWithCredentialPool:async()=>null},'@/modules/providers/server/panel-credentials':{decryptPanelCredential:()=>''},'@/modules/social/server/egress':{egressFetch:async(_url,init)=>{calls.push(JSON.parse(init.body));return new Response(JSON.stringify({data:[{b64_json:Buffer.from([137,80,78,71,13,10,26,10,0]).toString('base64')}]}))}}});
  const api=load('src/modules/ai/server/image-client.ts'),config={provider:'custom',model:'gpt-image-2',baseUrl:'https://api.openai.com/v1',apiKey:'',voice:'',botName:''};
  await api.generateImageApi('one image',config,'landscape');assert.equal(calls[0].response_format,undefined);assert.equal(calls[0].output_format,'webp');assert.equal(calls[0].quality,'medium');assert.equal(calls[0].size,'1536x1024');
  await api.generateImageApi('one image',{...config,model:'compatible-image'},'square');assert.equal(calls[1].response_format,'b64_json');assert.equal(calls[1].output_format,undefined);assert.equal(calls.length,2);
});
