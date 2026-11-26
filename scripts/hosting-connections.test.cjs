const {test}=require('node:test'),assert=require('node:assert/strict'),source=require('./connected-source-loader.cjs')
require('./hosting-joker.cases.cjs')()
require('./hosting-proxmox.cases.cjs')()
require('./hosting-transport.cases.cjs')
const connection={driver:'CPANEL',url:'https://whm.example.test:2087',username:'reseller',secret:' padded password ',config:{authMode:'PASSWORD'}}
function setup(replies){const calls=[],load=source({'@/modules/hosting/server/drivers/http':{hostingRequest:async(...args)=>{calls.push(args);const next=replies.shift();if(next instanceof Error)throw next;return next},connectionFailure:()=> 'خطای امن اتصال'}});return {calls,Driver:load('src/modules/hosting/server/drivers/cpanel.ts').CpanelDriver}}
const reply=data=>({status:200,text:JSON.stringify({metadata:{result:1},data})}),version=()=>reply({version:'test'})
test('WHM password and token modes are explicit and reseller packages are returned safely',async()=>{
 for(const mode of ['PASSWORD','API_TOKEN']){const {calls,Driver}=setup([version(),reply({pkg:[{name:'reseller_starter'},{name:'reseller_starter'},{name:'reseller_pro'}]})]),driver=new Driver({...connection,config:{authMode:mode}}),result=await driver.testConnection();assert.equal(result.ok,true);assert.deepEqual(result.packages.map(p=>p.id),['reseller_starter','reseller_pro']);assert.deepEqual(driver.capabilities,[]);assert.equal(calls[0][1].headers.authorization,mode==='PASSWORD'?'Basic '+Buffer.from(connection.username+':'+connection.secret).toString('base64'):'whm '+connection.username+':'+connection.secret);assert.match(calls[1][0],/json-api\/listpkgs\?api.version=1$/);assert.equal(calls.some(c=>c[0].includes('password')),false)}
})
test('WHM refuses login HTML and failed metadata rather than equating HTTP200 with authentication',async()=>{
 for(const response of [{status:403,text:'private-response'},{status:200,text:'<html>login</html>'},{status:200,text:'{"metadata":{"result":0},"data":{"version":"x"}}'},{status:200,text:'{"metadata":{"result":"1"},"data":{"version":"x"}}'},reply({})]){const {Driver}=setup([response]),result=await new Driver(connection).testConnection();assert.equal(result.ok,false);assert.doesNotMatch(result.message,/private-response|padded password/)}
})
test('WHM distinguishes authenticated restricted packages from invalid auth, and never falls back modes',async()=>{
 let fixture=setup([version(),{status:403,text:'denied'}]);assert.equal((await new fixture.Driver(connection).testConnection()).ok,true);assert.equal(fixture.calls.length,2)
 fixture=setup([{status:403,text:'denied'}]);assert.equal((await new fixture.Driver(connection).testConnection()).ok,false);assert.equal(fixture.calls.length,1)
 for(const url of ['https://whm.example.test:2083','https://user:pass@whm.example.test:2087','https://whm.example.test:2087/cpsess123','https://whm.example.test:2087?token=x']){const {Driver,calls}=setup([]);assert.equal((await new Driver({...connection,url}).testConnection()).ok,false);assert.equal(calls.length,0)}
})
test('Hosting destination policy denies reserved and private addresses unless exact private host is allowed',()=>{
 const load=source(),owner=load('src/modules/hosting/server/drivers/http.ts'),old=process.env.HOSTING_PRIVATE_API_HOSTS
 try{delete process.env.HOSTING_PRIVATE_API_HOSTS;for(const ip of ['127.0.0.1','169.254.169.254','0.0.0.0','10.0.0.1','192.168.1.1','::1','fc00::1','2001:db8::1','::ffff:8.8.8.8'])assert.equal(owner.hostingAddressAllowed('pve.example.test',ip),false,ip);assert.equal(owner.hostingAddressAllowed('pve.example.test','8.8.8.8'),true);process.env.HOSTING_PRIVATE_API_HOSTS='pve.example.test';assert.equal(owner.hostingAddressAllowed('pve.example.test','10.0.0.1'),true);assert.equal(owner.hostingAddressAllowed('other.example.test','10.0.0.1'),false);assert.equal(owner.hostingAddressAllowed('pve.example.test','169.254.169.254'),false)}finally{if(old===undefined)delete process.env.HOSTING_PRIVATE_API_HOSTS;else process.env.HOSTING_PRIVATE_API_HOSTS=old}
})
test('Hetzner rejects malformed success and authenticates only against its fixed API',async()=>{
 const calls=[],load=source({'@/modules/hosting/server/drivers/http':{hostingRequest:async(...args)=>{calls.push(args);return {status:200,text:'{"error":"not a locations response"}'}},connectionFailure:()=> 'safe'}}),Driver=load('src/modules/hosting/server/drivers/hetzner-cloud.ts').HetznerCloudDriver
 assert.equal((await new Driver({...connection,url:'https://evil.invalid'}).testConnection()).ok,false);assert.equal(calls[0][0],'https://api.hetzner.cloud/v1/locations')
})
