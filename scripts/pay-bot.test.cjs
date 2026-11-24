const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./connected-source-loader.cjs')()
const {parseBotPayment,botCallbackUrl,botAcknowledged}=load('src/modules/billing/domain/pay-bot.ts')
const {publicBotAddress}=load('src/modules/billing/server/pay/bot/transport.ts')
require('./pay-bank-notice.cases.cjs')
require('./pay-bale.cases.cjs')
require('./pay-bale-collection.cases.cjs')
const input={api_key:'synthetic',amount:10000,order_id:'order-1',user_id:123456789,type:'purchase'}
test('bot request preserves exact Toman and bounds hostile claims without retaining personal context',()=>{
 const parsed=parseBotPayment({...input,first_name:'علی',username:'example',payment_count:3,register:1735689600,membership_days:-1,balance:25000})
 assert.deepEqual(parsed,{orderId:'order-1',amountRial:'100000',userId:'123456789',type:'purchase'})
 for(const amount of[0,-1,1.1,'10000',Number.MAX_SAFE_INTEGER,NaN,Infinity])assert.throws(()=>parseBotPayment({...input,amount}))
 for(const patch of[{user_id:0},{user_id:1.1},{type:'paid'},{order_id:'../x'},{order_id:'x'.repeat(101)},{username:'@name'},{payment_count:-1},{membership_days:-2},{balance:-1},{amountRial:'1'}])assert.throws(()=>parseBotPayment({...input,...patch}))
})
test('bot destination is exact HTTPS API without userinfo, query credentials, fragments or alternate ports',()=>{
 assert.equal(botCallbackUrl('https://merchant.example/api/payment'),'https://merchant.example/api/payment')
 for(const url of['http://merchant.example/api/payment','https://user:password@merchant.example/api/payment','https://merchant.example:8443/api/payment','https://merchant.example/api/payment?token=x','https://merchant.example/api/payment#x','https://merchant.example/api/else'])assert.throws(()=>botCallbackUrl(url))
})
test('acknowledgement never guesses provider success or follows a redirect',()=>{
 assert(botAcknowledged('JSON_OK',200,'{"ok":true}'))
 assert(botAcknowledged('JSON_SUCCESS',200,'{"status":"success"}'))
 assert(botAcknowledged('HTTP_2XX',204,''))
 assert.equal(botAcknowledged('HTTP_2XX',200,'{"ok":false}'),false)
 for(const[policy,status,body]of[['UNCONFIGURED',200,'{"ok":true}'],['JSON_OK',200,'{"ok":"true"}'],['JSON_OK',200,'{"unknown":true}'],['JSON_OK',302,'{"ok":true}'],['JSON_OK',500,'{"ok":true}'],['JSON_OK',200,'<html>ok</html>'],['JSON_OK',200,'{"ok":true,"success":false}']])assert.equal(botAcknowledged(policy,status,body),false)
})
test('bot egress denies loopback, LAN, cloud metadata, documentation and IPv4-mapped IPv6',()=>{
 for(const address of['127.0.0.1','10.1.2.3','0.0.0.0','169.254.169.254','172.16.1.1','192.168.1.1','100.64.1.1','198.18.1.1','192.0.2.1','203.0.113.5','224.0.0.1','::1','::','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1','invalid'])assert.equal(publicBotAddress(address),false,address)
 for(const address of['8.8.8.8','1.1.1.1','2606:4700:4700::1111'])assert.equal(publicBotAddress(address),true,address)
})

test('outbound verification pins DNS, sends the distinct token/body, refuses private answers and never follows redirects',async()=>{
 const {EventEmitter}=require('node:events')
 let lookups=0,requests=0,sent='',headers
 const network={answers:[{address:'8.8.8.8',family:4}],status:200,body:'{"ok":true}'}
 const source=require('./connected-source-loader.cjs')({
  'node:dns/promises':{lookup:async()=>{lookups++;return network.answers}},
  'node:https':{request:(url,options,onResponse)=>{
   requests++;assert.equal(url.hostname,'merchant.example');assert.equal(options.servername,'merchant.example');assert.equal(options.agent,false);headers=options.headers
   options.lookup(url.hostname,{},(error,address,family)=>{assert.equal(error,null);assert.equal(address,'8.8.8.8');assert.equal(family,4)})
   options.lookup(url.hostname,{all:true},(error,addresses)=>{assert.equal(error,null);assert.deepEqual(addresses,[{address:'8.8.8.8',family:4}])})
   const req=new EventEmitter();req.end=body=>{sent=body;setImmediate(()=>{const response=new EventEmitter();response.statusCode=network.status;response.destroy=()=>{};onResponse(response);response.emit('data',Buffer.from(network.body));response.emit('end')})};return req
  }},
 })
 const {sendBotVerification}=source('src/modules/billing/server/pay/bot/transport.ts')
 const response=await sendBotVerification('https://merchant.example/api/payment','separate-token','order-123')
 assert.equal(response.status,200);assert.equal(lookups,1);assert.equal(requests,1);assert.equal(headers.Token,'separate-token');assert.deepEqual(JSON.parse(sent),{order_id:'order-123',actions:'custom_payment_verify'})
 network.status=302;await sendBotVerification('https://merchant.example/api/payment','separate-token','order-123');assert.equal(requests,2,'redirect response must not cause a second request')
 network.answers.push({address:'127.0.0.1',family:4});await assert.rejects(sendBotVerification('https://merchant.example/api/payment','separate-token','order-123'),/BLOCKED/);assert.equal(requests,2)
 network.answers=[{address:'8.8.8.8',family:4}];network.body='x'.repeat(17000)
 await assert.rejects(sendBotVerification('https://merchant.example/api/payment','separate-token','order-123'),/TOO_LARGE/)
})
