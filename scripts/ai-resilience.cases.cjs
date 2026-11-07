const{test}=require('node:test'),assert=require('node:assert/strict'),loadSource=require('./connected-source-loader.cjs')
test('personal response accepts complete JSON, fragmented SSE and final snapshots but refuses partial/HTML/error output',async()=>{
 const load=loadSource(),{responseText}=load('src/modules/ai/server/chatgpt/response.ts'),body={status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'سلام موبوکام'}]}]},event=(type,rest={})=>'data: '+JSON.stringify({type,...rest})+'\r\n\r\n';
 assert.equal(await responseText(Response.json(body)),'سلام موبوکام')
 assert.equal(await responseText(new Response(event('response.completed',{response:body}).trimEnd(),{headers:{'Content-Type':'Text/Event-Stream; charset=utf-8'}})),'سلام موبوکام')
 const bytes=Buffer.from(event('response.output_text.delta',{delta:'سلام موبوکام'})+event('response.completed',{response:body}));let offset=0,cancelled=false;
 assert.equal(await responseText(new Response(new ReadableStream({pull(c){if(offset>=bytes.length)c.close();else c.enqueue(bytes.subarray(offset,++offset))},cancel(){cancelled=true}}),{headers:{'Content-Type':'application/octet-stream'}})),'سلام موبوکام');assert(cancelled)
 for(const value of [{...body,status:'incomplete'},{...body,error:{message:'private-provider-text'}},{...body,output:[]},{choices:[{message:{content:'not Responses'}}]}])await assert.rejects(responseText(Response.json(value)))
 for(const raw of [event('response.output_text.delta',{delta:'partial'}),event('response.failed'),event('response.completed',{response:{...body,status:'failed'}}),event('response.output_text.delta',{delta:'different'})+event('response.completed',{response:body})])await assert.rejects(responseText(new Response(raw,{headers:{'Content-Type':'text/event-stream'}})))
 let htmlCancelled=false;await assert.rejects(responseText(new Response(new ReadableStream({start(c){c.enqueue(Buffer.from('<html>private</html>'))},cancel(){htmlCancelled=true}}),{headers:{'Content-Type':'text/html'}})),e=>!e.message.includes('private'));assert(htmlCancelled)
 let largeCancelled=false;await assert.rejects(responseText(new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array(65536))},cancel(){largeCancelled=true}}),{headers:{'Content-Type':'application/json'}})));assert(largeCancelled)
})
test('every engineering request pins the full canonical inventory and mandatory rules within its fixed budget',()=>{
 const load=loadSource(),knowledge=load('src/modules/ai/server/engineering/knowledge.ts'),domain=load('src/modules/ai/domain/engineering.ts'),bundle=knowledge.currentEngineeringKnowledge();
 for(const contextChars of [8000,24000,48000]){const k=knowledge.engineeringKnowledge('طراحی صفحه و محصول موبوکام', {...domain.defaultEngineeringPolicy(),contextChars},[]);assert(k.context.includes('cms.posts is'));assert(k.context.includes('Never')||k.context.includes('never'));assert(k.context.includes('ARCHITECTURE.md'));assert(bundle.entries.every(e=>k.pins.some(p=>p.path===e.path&&p.sha256===e.sha256)));assert(JSON.stringify(k.context).length<contextChars*.65)}
 const policy={...domain.defaultEngineeringPolicy(),skills:[{id:'owned',title:'Owned skill',tags:[],body:'Preserve the existing domain owner.',enabled:true}]};assert(knowledge.engineeringKnowledge('catalog',policy,['owned']).pins.some(p=>p.path==='custom:owned'));assert.throws(()=>knowledge.engineeringKnowledge('catalog',policy,['unknown']))
})
test('both model completion and trusted host refuse to validate undocumented source changes',()=>{
 const domain=loadSource()('src/modules/ai/domain/engineering.ts'),host=require('./engineering/protocol.cjs');
 for(const guard of [domain.requireEngineeringArchitecture,host.requireArchitecture]){assert.throws(()=>guard(['src/modules/store/server/new.ts']));assert.doesNotThrow(()=>guard(['src/modules/store/server/new.ts','docs/agent/ARCHITECTURE.md']))}
})
