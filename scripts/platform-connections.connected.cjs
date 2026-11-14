const assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server')
assert(/test|check/i.test(new URL(process.env.DATABASE_URL).pathname),'disposable database required')
const db=new PrismaClient(),stamp='connections-'+Date.now(),users=[],roles=[],forms=[]
let viewer=null
const load=require('./connected-source-loader.cjs')({
 '@/platform/database/prisma':{db},react:{...require('react'),cache:fn=>fn},
 'next-auth/jwt':{getToken:async()=>viewer?{uid:viewer.id,authAt:new Date().toISOString()}:null},
})
const access=load('src/modules/identity/server/access.ts'),owner=load('src/modules/forms/server/customer-history.ts')
const api=load('src/modules/livechat/server/http/livechat.ts')
async function user(label,permissions){let roleId=null;if(permissions!==null){const role=await db.role.create({data:{name:stamp+label,permissions}});roles.push(role.id);roleId=role.id}const u=await db.user.create({data:{email:stamp+label+'@example.invalid',passwordHash:'!',role:label==='buyer'?'CUSTOMER':'ADMIN',roleId}});users.push(u.id);return u}
async function main(){
 const buyer=await user('buyer',null),handler=await user('handler','users.manage,forms.handle'),colleague=await user('colleague','forms.handle'),crmOnly=await user('crm','users.manage'),manager=await user('manager','users.manage,cms.pages')
 const req=new NextRequest('http://localhost/api/admin/crm?id='+buyer.id)
 const form=await db.siteForm.create({data:{slug:stamp,title:'تعمیر آزمایشی',settings:JSON.stringify({service:true,handlers:[handler.id]})}});forms.push(form.id)
 const create=(patch={})=>db.formSubmission.create({data:{formId:form.id,userId:buyer.id,data:'[{"value":"private-answer"}]',secrets:'private-encrypted-lock',pickupCode:'private-pickup',receiptToken:'private-receipt',stage:'OPEN',...patch}})
 const own=await create({assigneeId:handler.id}),unassigned=await create(),held=await create({assigneeId:colleague.id})
 await create({userId:null});await create({status:'SPAM'})
 const other=await db.siteForm.create({data:{slug:stamp+'-foreign',title:'foreign',settings:JSON.stringify({service:true,handlers:[colleague.id]})}});forms.push(other.id)
 await db.formSubmission.create({data:{formId:other.id,userId:buyer.id,data:'[]',stage:'OPEN'}})
 viewer=handler;const actor=await access.requirePerm(req,'forms.handle')
 const seen=await owner.customerServiceHistory(buyer.id,actor)
 assert.equal(seen.status,'available');assert.deepEqual(new Set(seen.rows.map(x=>x.id)),new Set([own.id,unassigned.id]))
 assert(!JSON.stringify(seen).includes('private-'),'no answers, secrets or handover proofs in CRM')
 const response=await api.GET_crm(req);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/)
 const profile=await response.json();assert.equal(profile.services.rows.length,2);assert(profile.timeline.some(x=>x.kind==='service'))
 viewer=crmOnly;assert.equal((await (await api.GET_crm(req)).json()).services.status,'restricted')
 viewer=manager;const managed=await owner.customerServiceHistory(buyer.id,await access.requirePerm(req,'cms.pages'));assert(managed.rows.some(x=>x.id===held.id))
 await db.siteForm.update({where:{id:form.id},data:{settings:'broken'}})
 viewer=handler;assert.equal((await owner.customerServiceHistory(buyer.id,actor)).rows.length,0,'damaged permissions never expand scope')
 viewer=buyer;assert.equal((await api.GET_crm(req)).status,403);viewer=null;assert.equal((await api.GET_crm(req)).status,403)
 console.log('Connections native acceptance passed: canonical CRM user, Forms scope/held work, privacy and real member/guest denials')
}
main().finally(async()=>{await db.siteForm.deleteMany({where:{id:{in:forms}}});await db.user.deleteMany({where:{id:{in:users}}});await db.role.deleteMany({where:{id:{in:roles}}});await db.$disconnect()}).catch(e=>{console.error(e);process.exitCode=1})
