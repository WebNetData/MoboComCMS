const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./connected-source-loader.cjs')()
const {baleBinding,originalBaleMessage,uniqueBaleJson}=load('src/modules/billing/domain/pay-bale.ts'),{binding,envelope,config}=require('./pay-bale.fixture.cjs')
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
