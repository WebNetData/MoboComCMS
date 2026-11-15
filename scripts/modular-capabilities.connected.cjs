// Real PostgreSQL/state/Forms/package owners. Outgoing transports are recording doubles.
const assert=require('node:assert/strict'),crypto=require('node:crypto')
const {PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server'),{encode}=require('next-auth/jwt')
const sourceLoader=require('./connected-source-loader.cjs')
assert(/test|check/i.test(new URL(process.env.DATABASE_URL).pathname),'disposable database required')
if(process.getuid)assert.notEqual(process.getuid(),0)
const db=new PrismaClient(),stamp='modular-'+crypto.randomUUID(),pid='module-'+crypto.randomBytes(6).toString('hex')
const keys=['extension.forms.state.v1','extension.automation.state.v1','extension.instore.state.v1','extension.ai-assistant.state.v1','extension.vpn.state.v1','extension.reseller.state.v1','extension.remnawave-control.state.v1','vpnEnabled','site.config.v1','packages.index.v1','package.'+pid+'.v1']
let before=[],user,form,entry,rule,order,transport=0,owned=false
const mock={
 '@/platform/database/prisma':{db},react:{...require('react'),cache:fn=>fn},
 '@/extensions/generated/server-registry':{serverPlugins:{}},
 '@/platform/observability/logger':{logEvent(){},requestIdFrom:()=>stamp},
 '@/modules/mail/server/mailer':{sendMail:async()=>{transport++;return{ok:true}}},
 '@/modules/sms/server/ippanel':{sendText:async()=>{transport++;return{ok:true,id:'fixture',error:''}},sendPattern:async()=>{transport++;return{ok:true,id:'fixture',error:''}}},
}
const load=sourceLoader(mock),state=load('src/extensions/server/state.ts'),modules=load('src/extensions/server/modules.ts')
const service=load('src/modules/forms/server/service.ts'),paid=load('src/modules/forms/server/paid.ts'),counter=load('src/modules/forms/server/counter.ts')
const tracking=load('src/modules/forms/server/tracking.ts'),engine=load('src/modules/automation/server/engine.ts'),packages=load('src/modules/packages/server/store.ts')
const req=(path,method='GET',body,token)=>new NextRequest('http://localhost:3000'+path,{method,headers:{origin:'http://localhost:3000',...(token?{cookie:'next-auth.session-token='+token}:{}),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
const put=(key,value)=>db.setting.upsert({where:{key},create:{key,value:JSON.stringify(value)},update:{value:JSON.stringify(value)}})
const config=(id,enabled)=>state.saveExtensionState(id,{enabled})
async function main(){try{
 before=await db.setting.findMany({where:{key:{in:keys}}});owned=true
 user=await db.user.create({data:{email:stamp+'@example.invalid',passwordHash:'fixture-only',name:stamp,role:'ADMIN',totpEnabledAt:new Date(),smsAlerts:false,emailAlerts:false,pushAlerts:false}})
 const token=await encode({secret:process.env.NEXTAUTH_SECRET,token:{uid:String(user.id),authAt:Date.now()}})
 const domain=load('src/modules/forms/domain/forms.ts'),template=domain.TEMPLATES.find(t=>t.id==='mobile-repair').build()
 await config('forms',true);await config('automation',true);await config('instore',true)
 form=await service.saveForm({...template,slug:'m-'+crypto.randomBytes(7).toString('hex'),title:stamp,published:true})
 entry=await db.formSubmission.create({data:{formId:form.id,userId:user.id,stage:'OPEN',data:'[]',receiptToken:crypto.randomBytes(18).toString('base64url'),pickupCode:'782391',receivedAt:new Date()}})
 rule=await db.automationRule.create({data:{name:stamp,enabled:true,trigger:'form.submitted',actions:JSON.stringify([{type:'email_staff',params:{to:'fixture@example.invalid',subject:'fixture',text:'fixture'}}]),conditions:'[]'}})
 await engine.emitAutomation('form.submitted','modular:'+entry.id,user.id,{submission_id:entry.id,form_id:form.id})
 const event=await db.automationEvent.findFirstOrThrow({where:{subjectKey:'modular:'+entry.id}})
 const snapshot=await db.formSubmission.findUniqueOrThrow({where:{id:entry.id}})
 await config('forms',false)
 assert.equal(await service.publicFormBySlug(form.slug),null)
 assert.deepEqual(await service.listForms(),[]);assert.deepEqual(await service.publishedOrderForms(),[])
 assert.deepEqual(await paid.myRequests(user.id),[])
 await assert.rejects(service.saveForm({...form,title:'must not save'}),e=>e.status===404)
 await assert.rejects(paid.workOnSubmission(entry.id,{id:user.id},{stage:'IN_PROGRESS'},true),e=>e.status===404)
 await assert.rejects(paid.formCheckoutQuote(entry.id,user.id),e=>e.status===404)
 assert.equal(await counter.receiptByToken(entry.receiptToken),null)
 assert.equal(await tracking.requestRepairCode({number:entry.id,phone:'+989121234567',ip:stamp}).then(r=>r.message.includes('اگر')),true)
 const routes=[
 ['src/modules/site/server/http/admin/forms/route.ts','GET','/api/admin/forms'],
 ['src/modules/site/server/http/admin/forms/submissions/route.ts','PATCH','/api/admin/forms/submissions'],
 ['src/modules/site/server/http/admin/forms/submissions/route.ts','POST','/api/admin/forms/submissions'],
 ['src/modules/site/server/http/admin/forms/files/route.ts','GET','/api/admin/forms/files'],
 ['src/modules/forms/server/http/repair-work.ts','PATCH','/api/admin/forms/repair'],
 ['src/modules/forms/server/http/requests.ts','GET','/api/me/requests'],
 ['src/modules/forms/server/http/tracking.ts','POST','/api/repair-tracking'],
 ['src/modules/site/server/http/forms/[slug]/route.ts','GET','/api/forms/'+form.slug],
 ['src/modules/site/server/http/forms/[slug]/route.ts','POST','/api/forms/'+form.slug],
 ['src/modules/site/server/http/forms/[slug]/quote/route.ts','POST','/api/forms/'+form.slug+'/quote'],
 ['src/modules/site/server/http/forms/[slug]/slots/route.ts','GET','/api/forms/'+form.slug+'/slots'],
 ['src/modules/site/server/http/forms/[slug]/upload/route.ts','POST','/api/forms/'+form.slug+'/upload'],
 ]
 for(const[file,method,path]of routes)assert.equal((await load(file)[method](req(path,method),{params:Promise.resolve({slug:form.slug})})).status,404,file)
 await engine.emitAutomation('form.submitted','must-not-admit',user.id,{})
 await engine.processAutomation();assert.equal(transport,0);assert.equal((await db.automationEvent.findUniqueOrThrow({where:{id:event.id}})).processedAt,null,'disabled owner pending event retained')
 assert.equal(await db.automationEvent.count({where:{subjectKey:'must-not-admit'}}),0)
 assert.deepEqual(await db.formSubmission.findUniqueOrThrow({where:{id:entry.id}}),snapshot,'off preserves repair data')
 assert.equal((await load('src/modules/forms/server/stage-sms.ts').deliverFormStageSms({}, {id:1,attempts:1})).skipped,'module-disabled')
 const activeRegistry=await load('src/modules/editor/server/blocks/registry.ts').activeEditorRegistry()
 assert.equal(activeRegistry.get('content.form'),undefined,'form block withdrawn; stored documents retained')
 // An already paid obligation still reconciles without publishing optional communications.
 await db.formSubmission.update({where:{id:entry.id},data:{payStatus:'UNPAID',amountMinor:100n,currency:'IRT'}})
 order=await db.order.create({data:{userId:user.id,status:'PAID',totalAmount:100,totalMinor:100n,currency:'IRT',meta:JSON.stringify({kind:'form',submissionId:entry.id,formId:form.id,formTitle:form.title})}})
 await paid.fulfillFormOrder(order.id);assert.equal((await db.formSubmission.findUniqueOrThrow({where:{id:entry.id}})).payStatus,'PAID');assert.equal(transport,0)
 await config('forms',true);await config('instore',false)
 assert.equal((await service.publicFormBySlug(form.slug)).form.id,form.id)
 assert.equal((await load('src/modules/site/server/http/admin/forms/submissions/route.ts').POST(req('/api/admin/forms/submissions','POST',{formId:form.id},token))).status,404,'counter still needs instore')
 await assert.rejects(counter.staffSubmit(form.id,{values:{}},{id:user.id}),e=>e.status===404,'direct intake also needs instore')
 // Deactivation during awaited validation/DNS/recipient loops must stop subsequent effects.
 const advanced=load('src/modules/forms/server/advanced.ts')
 const delayedSave=sourceLoader({...mock,'@/modules/forms/server/advanced':{...advanced,assertHandlersCanWork:async()=>{await config('forms',false)}}})('src/modules/forms/server/service.ts')
 await assert.rejects(delayedSave.saveForm({...form,title:'must not save after validation'}),e=>e.status===404)
 assert.equal((await db.siteForm.findUniqueOrThrow({where:{id:form.id}})).title,form.title)
 await config('forms',true)
 let mailEffects=0
 const delayedMail=sourceLoader({...mock,'@/modules/mail/server/mailer':{sendMail:async()=>{mailEffects++;await config('forms',false);return{ok:true}}}})('src/modules/forms/server/advanced.ts')
 await delayedMail.sendFormNotifications({...form,settings:{...form.settings,notifications:[{name:'fixture',to:'first@example.invalid,second@example.invalid',subject:'fixture',body:'fixture',when:[],logic:'all'}]}},{formTitle:form.title,entryId:entry.id,answers:[]},{})
 assert.equal(mailEffects,1,'later recipients stopped after disable')
 await config('forms',true)
 let webEffects=0;const priorFetch=global.fetch
 const delayedHook=sourceLoader({...mock,'node:dns/promises':{lookup:async()=>{await config('forms',false);return[{address:'93.184.216.34',family:4}]}}})('src/modules/forms/server/advanced.ts')
 try{global.fetch=async()=>{webEffects++;return new Response('ok')};await delayedHook.sendFormWebhooks({...form,settings:{...form.settings,webhooks:[{url:'https://fixture.example.invalid/hook',secret:'',events:['submitted']}]}},'submitted',{})}finally{global.fetch=priorFetch}
 assert.equal(webEffects,0,'disable during DNS prevents request')
 await config('automation',false)
 const eventsBefore=await db.automationEvent.count();await engine.emitAutomation('user.registered','must-not-admit',user.id,{})
 assert.deepEqual(await engine.processAutomation(),{events:0,runs:0});assert.equal(await db.automationEvent.count(),eventsBefore)
 for(const method of ['GET','POST'])assert.equal((await load('src/modules/automation/server/http/admin.ts')[method](req('/api/admin/automation',method))).status,404)
 assert.equal((await load('src/modules/automation/server/engagement-policy.ts').engagementDeliveryPolicy({userId:user.id,kind:'CRM_OFFER',marketingSource:'none',expiresAt:new Date(Date.now()+60000)},new Date())).allowed,false)
 assert.equal(transport,0)
 // Built-in settings use canonical authority and strict audit in the same transaction.
 const api=load('src/app/api/admin/extensions/route.ts')
 assert.equal((await api.PATCH(req('/api/admin/extensions','PATCH',{id:'forms',enabled:false},token))).status,200)
 assert.equal(await modules.isModuleEnabled('forms'),false)
 assert.equal(await db.auditLog.count({where:{targetType:'extension',targetId:'forms',actorUserId:user.id}}),1)
 const fault=sourceLoader({...mock,'@/platform/audit/server':{auditAdminStrict:async()=>{throw Error('owned strict audit fault')}}})
 assert.equal((await fault('src/app/api/admin/extensions/route.ts').PATCH(req('/api/admin/extensions','PATCH',{id:'forms',enabled:true},token))).status,400)
 assert.equal(await modules.isModuleEnabled('forms'),false,'audit failure rolls back activation')
 const delayed=req('/api/admin/extensions','PATCH',{id:'forms',enabled:true},token),body=delayed.body
 Object.defineProperty(delayed,'body',{get:()=>({getReader(){const r=body.getReader();let first=true;return{read:async()=>{if(first){first=false;await db.user.update({where:{id:user.id},data:{status:'SUSPENDED'}})}return r.read()},cancel:x=>r.cancel(x)}}})})
 assert.notEqual((await api.PATCH(delayed)).status,200);assert.equal(await modules.isModuleEnabled('forms'),false,'revoked authority cannot activate')
 await db.user.update({where:{id:user.id},data:{status:'ACTIVE'}})
 // Uploaded package retains canonical bytes/settings/history but contributes nothing after uninstall.
 const manifest={id:pid,name:stamp,kind:'plugin',runtime:'declarative',version:'1.0.0',settings:[{key:'title',label:'Title',type:'text',default:'original'}],pages:[{slug:'hello',title:{fa:'نمونه',en:'Sample'},file:'hello.html',nav:true}],styles:['style.css']}
 const entries=new Map([['manifest.json',Buffer.from(JSON.stringify(manifest))],['hello.html',Buffer.from('<p>{{title}}</p>')],['style.css',Buffer.from('p{color:red}')]])
 await packages.installEntries(entries,user.email);await packages.savePackageSettings(pid,{title:'retained'});await packages.writePackageFile(pid,'hello.html','<p>edited</p>',user.email);await packages.setPackageEnabled(pid,true)
 const published=await db.setting.findUniqueOrThrow({where:{key:'package.'+pid+'.v1'}})
 await assert.rejects(packages.deletePackage(pid),/غیرفعال/);assert.deepEqual(await db.setting.findUniqueOrThrow({where:{key:'package.'+pid+'.v1'}}),published)
 await packages.setPackageEnabled(pid,false);const retained=await packages.loadPackage(pid)
 await packages.deletePackage(pid);assert.equal(await packages.loadPackage(pid),null)
 const archive=JSON.parse((await db.setting.findUniqueOrThrow({where:{key:'package.'+pid+'.v1'}})).value)
 assert(archive.uninstalledAt);for(const field of ['files','settings','revisions'])assert.deepEqual(archive[field],retained[field],field+' retained')
 const indexBefore=await packages.packageRevision();await packages.deletePackage(pid);assert.equal(await packages.packageRevision(),indexBefore,'repeat uninstall idempotent')
 const runtime=load('src/modules/packages/server/runtime.ts');assert.equal(await runtime.getPackagePage(pid,'hello','fa'),null);assert.equal((await runtime.getPackageRuntime('fa')).nav.some(x=>x.href.includes(pid)),false)
 assert.equal((await load('src/modules/packages/server/http/public-files.ts').GET(req('/api/public/packages/'+pid+'/files/style.css'),{params:Promise.resolve({id:pid,path:['style.css']})})).status,404)
 await assert.rejects(packages.writePackageFile(pid,'hello.html','no',user.email),/not installed/);await assert.rejects(packages.setPackageEnabled(pid,true),/not installed/)
 const reinstall=await packages.installEntries(entries,user.email);assert.equal(reinstall.pkg.enabled,false);assert.equal(reinstall.pkg.settings.title,'retained');assert(reinstall.pkg.revisions.length>=retained.revisions.length)
 await packages.setPackageEnabled(pid,true);assert(await runtime.getPackagePage(pid,'hello','fa'),'explicit reactivation restores contribution')
 // Effective-state display preserves a desired activation blocked by dependencies.
 await put('extension.reseller.state.v1',{enabled:true,settings:{}});await put('extension.vpn.state.v1',{enabled:false,settings:{}});await put('vpnEnabled',false)
 const row=(await state.listExtensionAdminState()).find(x=>x.manifest.id==='reseller');assert.equal(row.state.requestedEnabled,true);assert.equal(row.state.enabled,false);assert(row.state.blockedBy.includes('vpn'))
 console.log('Modular capabilities: actual off-state routes/owners/effects, Core paid reconciliation, current authority/audit rollback, retained package uninstall/reinstall and dependency reasons passed; provider doubles='+transport)
}finally{
 if(owned){await db.auditLog.deleteMany({where:{actorUserId:user?.id}})
 if(rule)await db.automationRun.deleteMany({where:{ruleId:rule.id}})
 if(rule)await db.automationRule.deleteMany({where:{id:rule.id}})
 if(user)await db.automationEvent.deleteMany({where:{userId:user.id}})
 if(entry)await db.formSubmission.deleteMany({where:{id:entry.id}})
 if(order)await db.order.deleteMany({where:{id:order.id}})
 if(form)await db.siteForm.deleteMany({where:{id:form.id}})
 if(user)await db.user.deleteMany({where:{id:user.id,email:user.email}})
 for(const key of keys){const prior=before.find(r=>r.key===key);if(prior)await db.setting.upsert({where:{key},create:{key,value:prior.value},update:{value:prior.value}});else await db.setting.deleteMany({where:{key}})}
 }await db.$disconnect()
}}
main().catch(e=>{console.error(e);process.exitCode=1})
