const assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server')
assert(/test|check/i.test(new URL(process.env.DATABASE_URL).pathname),'disposable database required')
const db=new PrismaClient(),stamp='guides-'+Date.now(),pages=[],users=[],roles=[]
let viewer=null
let failPageRead=false
db.$use(async(params,next)=>{if(failPageRead&&params.model==='Page'&&params.action==='findMany')throw Error('injected page read failure');return next(params)})
let beforeSetting=null,revisionIds=[],initialized=false
const load=require('./connected-source-loader.cjs')({'@/platform/database/prisma':{db},react:{...require('react'),cache:fn=>fn},'next-auth/jwt':{getToken:async()=>viewer?{uid:String(viewer.id),authAt:Date.now()}:null}})
const api=load('src/modules/store/server/http/routes.ts'),site=load('src/modules/site/server/public-pages.ts')
const req=(method,body,revision)=>new NextRequest('http://localhost/api/admin/store/settings',{method,headers:{Origin:'http://localhost','Content-Type':'application/json',...(revision?{'If-Match':revision}:{})},...(method==='GET'?{}:{body:JSON.stringify(body)})})
async function main(){
 beforeSetting=await db.setting.findUnique({where:{key:'store.merchandising.v1'}})
 revisionIds=(await db.contentRevision.findMany({where:{entityType:'settings-storefront'},select:{id:true}})).map(row=>row.id);initialized=true
 const role=await db.role.create({data:{name:stamp,permissions:'cms.products'}});roles.push(role.id)
 viewer=await db.user.create({data:{email:stamp+'@example.invalid',passwordHash:'!',role:'ADMIN',roleId:role.id}});users.push(viewer.id)
 for(const [slug,title,status]of [['shipping','ارسال آزمایشی','PUBLISHED'],['returns','مرجوعی آزمایشی','PUBLISHED'],['private','PRIVATE GUIDE MUST NOT LEAK','DRAFT']]){
  const page=await db.page.create({data:{slug:stamp+'-'+slug,title,status,content:'<p>Fixture only</p>'}});pages.push(page.id)
 }
 const initial=await api.GET_storeSettings(req('GET'));assert.equal(initial.status,200)
 const before=await initial.json();assert(before.purchaseGuidePages.some(page=>page.id===pages[0]));assert(!JSON.stringify(before.purchaseGuidePages).includes('PRIVATE GUIDE'))
 const settings={...before.settings,purchaseGuidePageIds:[pages[0],pages[0],pages[2],pages[1],-1,'bad']}
 const saved=await api.POST_storeSettings(req('POST',settings,before.settingsRevision)),current=await saved.json();assert.equal(saved.status,200,JSON.stringify(current))
 assert.deepEqual(current.settings.purchaseGuidePageIds,[pages[0],pages[2],pages[1]])
 assert.deepEqual((await site.publishedPageLinks(current.settings.purchaseGuidePageIds)).map(page=>page.id),[pages[0],pages[1]])
 failPageRead=true;assert.deepEqual(await site.publishedPageLinks(current.settings.purchaseGuidePageIds),[]);await assert.rejects(site.publishedPageOptions(),/injected page read/);failPageRead=false
 const stale=await api.POST_storeSettings(req('POST',{...settings,purchaseGuidePageIds:[]},before.settingsRevision));assert.equal(stale.status,409)
 assert.deepEqual((await (await api.GET_storeSettings(req('GET'))).json()).settings.purchaseGuidePageIds,current.settings.purchaseGuidePageIds)
 await db.page.update({where:{id:pages[0]},data:{slug:stamp+'-renamed'}})
 assert.equal((await site.publishedPageLinks(current.settings.purchaseGuidePageIds))[0].href,'/p/'+stamp+'-renamed')
 await db.page.update({where:{id:pages[0]},data:{status:'DRAFT'}})
 assert.deepEqual((await site.publishedPageLinks(current.settings.purchaseGuidePageIds)).map(page=>page.id),[pages[1]])
 await db.page.delete({where:{id:pages[1]}});assert.deepEqual(await site.publishedPageLinks(current.settings.purchaseGuidePageIds),[])
 viewer=null;assert.equal((await api.GET_storeSettings(req('GET'))).status,403);assert.equal((await api.POST_storeSettings(req('POST',settings))).status,403)
 console.log('Purchase guides PostgreSQL passed: real Store-only permission, no private Page titles, revision/persistence/stale refusal, ordered public projection, renamed/unpublished/deleted Pages')
}
main().finally(async()=>{if(initialized){if(beforeSetting)await db.setting.upsert({where:{key:beforeSetting.key},create:beforeSetting,update:{value:beforeSetting.value}});else await db.setting.deleteMany({where:{key:'store.merchandising.v1'}});await db.contentRevision.deleteMany({where:{entityType:'settings-storefront',id:{notIn:revisionIds}}})}await db.page.deleteMany({where:{id:{in:pages}}});await db.auditLog.deleteMany({where:{actorUserId:{in:users}}});await db.user.deleteMany({where:{id:{in:users}}});await db.role.deleteMany({where:{id:{in:roles}}});await db.$disconnect()}).catch(error=>{console.error(error);process.exitCode=1})
