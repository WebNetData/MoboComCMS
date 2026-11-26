const assert=require('node:assert/strict')
module.exports=async function({h,prisma,ids,prefix}){
 const input={driver:'CPANEL',name:prefix+' whm',url:'https://whm.example.invalid:2087',username:'reseller',secret:' synthetic password ',authMode:'PASSWORD'},saved=await h.saveHostingProvider(input);ids.providers.push(saved.id)
 let captured;h.registry.registerHostingDriver('CPANEL',connection=>({id:'CPANEL',capabilities:[],testConnection:async()=>{captured=connection;return {ok:true,message:'synthetic WHM'}}}))
 await h.testHostingProvider(saved.id);assert.equal(captured.secret,input.secret);assert.equal(captured.config.authMode,'PASSWORD')
 const row=(await h.adminHostingCatalog()).providers.find(p=>p.id===saved.id);assert.equal(row.authMode,'PASSWORD');assert.equal(row.built,true);assert.deepEqual(row.capabilities,[]);assert.doesNotMatch(JSON.stringify(row),/synthetic password/)
 for(const change of [{url:'https://other.example.invalid:2087'},{username:'another'},{authMode:'API_TOKEN'},{driver:'DIRECTADMIN',url:'https://other.example.invalid:2222',authMode:'API_TOKEN'}])await assert.rejects(h.saveHostingProvider({...input,...change,id:saved.id,secret:''}),/دوباره وارد کنید/)
 assert.equal((await prisma.hostingProvider.findUniqueOrThrow({where:{id:saved.id}})).lastCheckOk,true,'refused secret redirect does not change original provider')
 await h.saveHostingProvider({...input,id:saved.id,name:prefix+' renamed',secret:''});assert.equal((await prisma.hostingProvider.findUniqueOrThrow({where:{id:saved.id}})).lastCheckOk,true,'label changes preserve matching check')
 let release,entered;const started=new Promise(r=>entered=r),held=new Promise(r=>release=r)
 h.registry.registerHostingDriver('CPANEL',connection=>({id:'CPANEL',capabilities:[],testConnection:async()=>{entered();await held;return {ok:true,message:'stale old connection'}}}))
 const pending=h.testHostingProvider(saved.id);await started;await h.saveHostingProvider({...input,id:saved.id,secret:'replacement-only'});release();await assert.rejects(pending,/هنگام بررسی تغییر کرد/);assert.equal((await prisma.hostingProvider.findUniqueOrThrow({where:{id:saved.id}})).lastCheckOk,null)
 const original=prisma.hostingProvider.findUnique.bind(prisma.hostingProvider);let waiters=0,unblock;const barrier=new Promise(r=>unblock=r)
 prisma.hostingProvider.findUnique=async args=>{const result=await original(args);if(args.where.id===saved.id&&args.include?._count&&++waiters<=2){if(waiters===2)unblock();await barrier}return result}
 try{const outcomes=await Promise.allSettled(['one','two'].map(name=>h.saveHostingProvider({...input,id:saved.id,url:`https://${name}.example.invalid:2087`,secret:name+'-only'})));assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1,'captured config edits cannot overwrite one another')}finally{prisma.hostingProvider.findUnique=original}
 const final=await prisma.hostingProvider.findUniqueOrThrow({where:{id:saved.id}});assert.equal(final.lastCheckOk,null)
 await assert.rejects(h.saveHostingProvider({driver:'IRNIC',name:'not an API',url:'www.nic.ir',username:'ab123-irnic',secret:'not-used'}),/API نمایندگی/)
 const joker=await h.saveHostingProvider({driver:'JOKER',name:prefix+' joker',url:'https://ignored.invalid',secret:'synthetic-joker'});ids.providers.push(joker.id)
 await h.saveHostingProvider({id:joker.id,driver:'JOKER',name:prefix+' joker',authMode:'PASSWORD',username:'owner@example.invalid',secret:'new-synthetic-password'})
 await assert.rejects(h.saveHostingProvider({id:joker.id,driver:'JOKER',name:'invalid inherited mode',username:'',secret:'new-synthetic-password'}),/نام کاربری/)
 assert.equal((await prisma.hostingProvider.findUniqueOrThrow({where:{id:joker.id}})).url,'https://dmapi.joker.com','public registrar destination is code-fixed')
 const suffix='guard'+Date.now().toString(36),tld=await prisma.domainTld.create({data:{suffix,registrarId:joker.id,registerMinor:100n,renewMinor:100n}})
 try{await assert.rejects(h.deleteHostingProvider(joker.id),/پسوند مرتبط/);await assert.rejects(h.saveHostingProvider({id:joker.id,driver:'HETZNER_CLOUD',name:'not a registrar',secret:'replacement'}),/پسوند مرتبط/)}finally{await prisma.domainTld.delete({where:{id:tld.id}})}
 await assert.rejects(h.saveHostingProvider({id:saved.id,driver:'IRNIC',name:'not a verified contract',url:'www.nic.ir',username:'ab123-irnic',secret:'not-used'}),/API نمایندگی/)
 await h.saveHostingProvider({id:saved.id,driver:'PROXMOX',name:prefix+' new explicit destination',url:'https://pve.example.invalid:8006',username:'u@pam!site',secret:'new-synthetic-token'})
 assert.equal(JSON.parse((await prisma.hostingProvider.findUniqueOrThrow({where:{id:saved.id}})).config).authMode,'API_TOKEN','password mode never crosses into another driver implicitly')
}
