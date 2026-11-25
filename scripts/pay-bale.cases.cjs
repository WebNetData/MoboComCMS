const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./connected-source-loader.cjs')()
const {baleBinding,originalBaleMessage,uniqueBaleJson}=load('src/modules/billing/domain/pay-bale.ts'),{binding,envelope,config}=require('./pay-bale.fixture.cjs')
const {baleSourceConfiguration,configuredBaleSources,selectedBaleSource}=load('src/modules/billing/domain/pay-bale-sources.ts')
const source=(id='one',patch={})=>({id,...binding,secret:'s'.repeat(32),enabled:true,verified:true,...patch})
const registry=entries=>({...config(),MOBOCOM_PAY_BALE_SOURCES:JSON.stringify(entries)})
test('Bale sources retain legacy configuration and isolate explicitly selected registry sources',()=>{
 const legacy=config();assert.deepEqual(selectedBaleSource(legacy),{...binding,id:'legacy',secret:legacy.MOBOCOM_PAY_BALE_WEBHOOK_SECRET,enabled:true,verified:false})
 assert.equal(selectedBaleSource({...legacy,MOBOCOM_PAY_BALE_VERIFIED:'true'}).verified,true)
 assert.deepEqual(configuredBaleSources({...legacy,MOBOCOM_PAY_BALE_SOURCES:''}),configuredBaleSources(legacy))
 const first=source(),second=source('two',{alias:'other',instanceId:'b'.repeat(64),accountId:'789',bankAccountId:2,enabled:false,verified:false})
 const env=registry([first,second]);assert.deepEqual(baleSourceConfiguration(env),{sources:[first,second],invalid:false})
 assert.equal(selectedBaleSource(env),null);assert.deepEqual(selectedBaleSource(env,'one'),first)
 assert.equal(selectedBaleSource(env,'two'),null);assert.equal(selectedBaleSource(env,'missing'),null)
 assert.deepEqual(selectedBaleSource(registry([first,{...second,enabled:true}]),'two'),{...second,enabled:true})
})
test('Bale source registry rejects ambiguous, malformed and out-of-bounds configuration without legacy fallback',()=>{
 const good=source(),second=source('two',{alias:'other',instanceId:'b'.repeat(64),accountId:'789',bankAccountId:2})
 const missing={...good};delete missing.alias
 const bad=[[],[missing],[{...good,extra:true}],[{...good,id:'legacy'}],[{...good,id:'bad id'}],[{...good,enabled:'true'}],[{...good,bankAccountId:'1'}],[{...good,accountId:123}],[{...good,secret:'s'.repeat(31)}],[{...good,secret:'s'.repeat(257)}],[{...good,secret:'s'.repeat(31)+'\n'}],[good,{...second,id:'one'}],[good,{...second,instanceId:good.instanceId}],[good,{...second,alias:good.alias,accountId:good.accountId}],[good,{...second,bankAccountId:good.bankAccountId}],Array.from({length:33},(_,i)=>source(String(i)))]
 for(const entries of bad)assert.deepEqual(baleSourceConfiguration(registry(entries)),{sources:[],invalid:true})
 for(const raw of ['not json','{}','[{"id":"one","id":"two"}]',' '.repeat(65537)])assert.deepEqual(baleSourceConfiguration({...config(),MOBOCOM_PAY_BALE_SOURCES:raw}),{sources:[],invalid:true})
 assert.equal(configuredBaleSources(registry([{...good,secret:'s'.repeat(256)}])).length,1)
 assert.equal(selectedBaleSource({...config(),MOBOCOM_PAY_BALE_WEBHOOK_SECRET:'s'.repeat(257)}).secret.length,257)
})
test('Bale server binding requires explicit source, immutable account identity and dedicated credential',()=>{
 assert.deepEqual(baleBinding(config()),binding)
 for(const patch of[{MOBOCOM_PAY_BALE_ENABLED:'false'},{MOBOCOM_PAY_BALE_INSTANCE:''},{MOBOCOM_PAY_BALE_INSTANCE:'x'.repeat(64)},{MOBOCOM_PAY_BALE_BANK_PEER:'@bam_bmi'},{MOBOCOM_PAY_BALE_ACCOUNT:'0123'},{MOBOCOM_PAY_BALE_BANK_PEER:'123'},{MOBOCOM_PAY_BALE_BANK_ACCOUNT:'1.2'},{MOBOCOM_PAY_BALE_BANK_ACCOUNT:'2147483648'},{MOBOCOM_PAY_BALE_WEBHOOK_SECRET:'short'}])assert.equal(baleBinding({...config(),...patch}),null)
})
test('Bale original-message contract preserves signed string IDs and refuses inconsistent provenance',()=>{
 const e=envelope();assert.equal(originalBaleMessage(JSON.stringify(e),e.event_id,binding).messageId,'1')
 for(const patch of[{event:'message.edited'},{direction:'unknown'},{direction:'outgoing'},{sender_id:'999'},{session_id:'another'},{instance_id:'b'.repeat(64)},{device_id:'999'},{provider:'telegram'},{peer:{type:'group',id:binding.bankPeerId}},{message_id:'9223372036854775808'},{timestamp:'not-time'}])assert.throws(()=>originalBaleMessage(JSON.stringify({...e,...patch}),e.event_id,binding))
 for(const patch of[{partial:true},{is_from_me:null},{from:'999'},{supported:false},{kind:'document'},{forwarded_from:{sender_id:binding.bankPeerId}},{original_message_id:'1'},{editor_id:'456'},{is_edited:true},{quoted_body:'bank text'},{replied_to_id:'123'},{body:'changed'},{timestamp:new Date(0).toISOString()}])assert.throws(()=>originalBaleMessage(JSON.stringify({...e,payload:{...e.payload,...patch}}),e.event_id,binding))
 assert.throws(()=>originalBaleMessage(JSON.stringify(e),'f'.repeat(64),binding))
 const negative=envelope(-9223372036854775807n);assert.equal(originalBaleMessage(JSON.stringify(negative),negative.event_id,binding).messageId,'-9223372036854775807')
})
test('Bale JSON rejects duplicate decoded keys, nested ambiguity, invalid grammar and excessive depth',()=>{
 for(const raw of['{"a":1,"a":2}','{"p":{"from":1,"fr\\u006fm":2}}','{"a":[{"x":1,"x":2}]}','{"x":1,}','{"x":01}','{"x":tru}','{"x":}','{}{}','[]','{"x":'+ '['.repeat(30)+'0'+']'.repeat(30)+'}'])assert.throws(()=>uniqueBaleJson(raw),raw)
 assert.deepEqual(uniqueBaleJson('{"text":"escaped \\\" x","p":[true,null,-1.2e3,{}],"a\\u0062":2}'),{text:'escaped " x',p:[true,null,-1200,{}],ab:2})
})
test('new MoboCom provider never falls through to another provider or advertises source-only collection readiness',async()=>{
 const g=load('src/modules/billing/server/gateways.ts'),gw={provider:'MOBOCOM_PAY',apiKey:'accidental-personal-token',instructions:'',fiat:'IRR'}
 assert.equal(g.PROVIDERS.find(p=>p.key==='MOBOCOM_PAY').needsApiKey,false)
 assert.equal(g.isGatewayUsable(gw),false);assert.deepEqual(g.gatewayAcceptedCurrencies(gw),['IRR','IRT','TMN'])
 assert.equal(g.gatewayAcceptsCheckoutCurrency(gw,'USD'),false)
 assert.equal((await g.createGatewayInvoice(gw,{amount:1000,currency:'IRR'})).ok,false)
 assert.equal((await g.testGateway(gw)).ok,false)
})
