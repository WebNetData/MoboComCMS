// Canonical pictures through real Journal, Businesses, Identity, Tickets and Invoice reads on owned PostgreSQL.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript-api'),{PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server'),{encode}=require('next-auth/jwt')
const db=new PrismaClient(),stamp='avatarsurface'+Date.now()+process.pid,secret='owned-avatar-surfaces-native',cache=new Map(),users=[],businessIds=[]
let seller,ticket,invoice,post,recurring
const mocks={
 '@/platform/database/prisma':{db},'@/platform/config/env':{authSecret:()=>secret},'@/platform/observability/logger':{logEvent:()=>{}},
 '@/extensions/server/modules':{isModuleEnabled:async()=>true,getModuleSettings:async()=>({}),getModuleStates:async()=>({}),requireModule:async()=>{}},
 '@/modules/notifications/server/inbox':{createInboxEvent:async()=>{throw Error('Read must not notify')}},
 '@/modules/notifications/server/telegram':{},'@/modules/identity/telegram-account':{},
 '@/modules/mail/server/mailer':{sendMail:async()=>{throw Error('Read must not email')}},
 '@/components/AppLink':'a','@/components/SiteHeader':'SiteHeader','@/components/journal/LionaHome':{__esModule:true,default:'LionaHome',LionaGrid:'LionaGrid'},
 '@/i18n/server':{getServerLocale:async()=>'fa',getServerTheme:async()=>'dark'},'@/i18n/config':{dict:()=>({blog:'مجله',allCategories:'همه',noPosts:'مطلبی نیست'})},
 '@/components/content/builder/BuilderRenderer':'BuilderRenderer','@/components/content/builder/ThemeChrome':{ThemeHeader:'ThemeHeader',ThemeFooter:'ThemeFooter'},
 '@/modules/site/server/builder-preview':{resolveBuilderDoc:async()=>null,isPreview:()=>false,editableFor:()=>false},
 '@/modules/site/server/theme-templates':{resolvePlacedPage:async()=>null},'@/components/site/SectionBarSlot':'SectionBarSlot','@/components/search/LiveSearchInput':'LiveSearchInput',
 '@/modules/journal/server/admin':{getJournalSettings:async()=>load('src/modules/journal/domain/journal.ts').DEFAULT_JOURNAL_SETTINGS},
}
function load(file){
 const base=path.resolve(file),full=fs.existsSync(base)&&fs.statSync(base).isFile()?base:['.ts','.tsx','/index.ts'].map(ext=>base+ext).find(fs.existsSync)
 if(!full)throw Error('Missing '+file);if(full.endsWith('.css'))return {};if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));if(cache.has(full))return cache.get(full).exports
 const mod={exports:{}};cache.set(full,mod)
 const compiled=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText
 new Function('require','module','exports',compiled)(name=>Object.hasOwn(mocks,name)?mocks[name]:name.startsWith('@/')?load('src/'+name.slice(2)):name.startsWith('.')?load(path.resolve(path.dirname(full),name)):require(name),mod,mod.exports);return mod.exports
}
function find(tree,type){if(!tree||typeof tree!=='object')return null;if(tree.type===type)return tree;if(Array.isArray(tree))return tree.map(item=>find(item,type)).find(Boolean)||null;return find(tree.props?.children,type)}
async function main(){try{
 for(const kind of ['member','other','staff'])users.push(await db.user.create({data:{email:stamp+'-'+kind+'@example.invalid',name:stamp+' '+kind,passwordHash:'owned fixture',role:kind==='staff'?'ADMIN':'CUSTOMER',totpEnabledAt:kind==='staff'?new Date():null}}))
 const[member,other,staff]=users
 const handle='av'+Date.now()+process.pid.toString().slice(-3),first='/api/profile/media/11111111-1111-4111-8111-111111111111.png',second='/api/forum/media/22222222-2222-4222-8222-222222222222.png'
 await db.userProfile.create({data:{userId:member.id,username:handle,avatar:first}});await db.forumProfile.create({data:{userId:member.id,username:handle,avatar:second}})
 post=await db.post.create({data:{slug:stamp,title:stamp,content:'محتوای آزمون',status:'PUBLISHED',authorId:member.id,publishedAt:new Date(Date.now()-1000)}})
 const external=await db.businessProfile.create({data:{slug:stamp,name:stamp,kind:'EXTERNAL',domain:stamp+'.invalid',website:'https://'+stamp+'.invalid',status:'PUBLISHED'}});businessIds.push(external.id)
 await db.itemReview.create({data:{itemType:'business',itemId:external.id,userId:member.id,rating:5,body:'Owned external review',status:'APPROVED'}})
 seller=await db.seller.create({data:{userId:other.id,slug:stamp,shopName:stamp,status:'ACTIVE'}})
 const shop=await db.businessProfile.create({data:{slug:stamp+'-seller',name:stamp,kind:'SELLER',sellerId:seller.id,status:'PUBLISHED'}});businessIds.push(shop.id)
 await db.sellerReview.create({data:{sellerId:seller.id,userId:member.id,orderId:member.id,rating:4,body:'Owned seller review',status:'APPROVED'}})
 ticket=await db.ticket.create({data:{userId:member.id,subject:stamp,messages:{create:[{userId:member.id,body:'Owned member message'},{userId:staff.id,fromAdmin:true,internal:true,body:'Owned private note'}]}}})
 invoice=await db.invoice.create({data:{number:stamp,userId:member.id,total:17,totalMinor:1700n,subtotal:17,subtotalMinor:1700n,currency:'USD',status:'UNPAID'}})
 recurring=await db.recurringInvoice.create({data:{userId:member.id,title:stamp,amountMinor:1700n,currency:'USD',interval:'MONTHLY',nextAt:new Date(Date.now()+86400000),active:false}})
 const tokens=await Promise.all(users.map(user=>encode({secret,token:{uid:user.id,authAt:Date.now()},maxAge:3600})))
 const req=(url,who=2)=>new NextRequest('http://localhost'+url,{headers:{Origin:'http://localhost',...(who===null?{}:{cookie:'next-auth.session-token='+tokens[who]})}})
 const business=load('src/modules/businesses/server/queries.ts'),journal=load('src/modules/site/server/pages/blog/page.tsx').default,tickets=load('src/modules/support/server/http/tickets/[id]/route.ts'),detail=load('src/modules/identity/server/http/admin/users/[id]/route.ts'),picker=load('src/modules/identity/server/http/admin/users/route.ts'),invoices=load('src/modules/billing/server/http/admin/invoices/route.ts'),identity=load('src/modules/identity/server/profile.ts')
 async function expected(avatar){
  for(const slug of [external.slug,shop.slug]){const page=await business.businessPage(slug,null);assert.equal(page.reviews[0].author.avatar,avatar);assert.equal(page.reviews[0].author.name,member.name)}
  const archive=find(await journal({searchParams:Promise.resolve({q:stamp,page:'1'})}),'LionaGrid');assert.equal(archive.props.stories.find(row=>row.id===post.id).authorAvatar,avatar)
  const home=find(await journal({searchParams:Promise.resolve({})}),'LionaHome');assert.equal(home.props.data.hero.authorAvatar,avatar)
  let response=await detail.GET(req('/api/admin/users/'+member.id),{params:Promise.resolve({id:String(member.id)})});assert.equal(response.status,200);assert.equal((await response.json()).user.avatar,avatar)
  for(const slim of ['', '&slim=1']){response=await picker.GET(req('/api/admin/users?q='+stamp+slim));assert.equal(response.status,200);const user=(await response.json()).users.find(row=>row.id===member.id);assert.equal(user.avatar,avatar);assert.equal(Object.hasOwn(user,'userProfile'),false);assert.equal(Object.hasOwn(user,'telegramPhoto'),false)}
  response=await invoices.GET(req('/api/admin/invoices?q='+stamp+'&currency=USD'));assert.equal(response.status,200);const value=(await response.json()).invoices.find(row=>row.id===invoice.id);assert.equal(value.user.avatar,avatar);assert.deepEqual([value.total,value.amountDue,value.status],[17,17,'UNPAID'])
  response=await load('src/modules/billing/server/http/admin/invoice-automation.ts').GET(req('/api/admin/invoice-automation'));assert.equal(response.status,200);const recurringRow=(await response.json()).recurring.find(row=>row.id===recurring.id);assert.equal(recurringRow.user.avatar,avatar);assert.equal(Object.hasOwn(recurringRow.user,'userProfile'),false)
  for(const who of [0,2]){response=await tickets.GET(req('/api/tickets/'+ticket.id,who),{params:Promise.resolve({id:String(ticket.id)})});assert.equal(response.status,200);const value=await response.json();assert.equal(value.userAvatar,avatar);assert.equal(value.messages.length,who===0?1:2)}
 }
 await expected(first)
 await identity.updateUserProfile(member.id,{avatar:second});await expected(second)
 await identity.updateUserProfile(member.id,{avatar:''});await expected('')
 await db.user.update({where:{id:member.id},data:{telegramPhoto:'https://example.invalid/telegram.png'}});await expected('https://example.invalid/telegram.png')
 assert.equal((await tickets.GET(req('/api/tickets/'+ticket.id,1),{params:Promise.resolve({id:String(ticket.id)})})).status,403)
 assert.equal((await tickets.GET(req('/api/tickets/'+ticket.id,null),{params:Promise.resolve({id:String(ticket.id)})})).status,401)
 assert.equal((await detail.GET(req('/api/admin/users/'+member.id,0),{params:Promise.resolve({id:String(member.id)})})).status,403)
 assert.deepEqual((await db.invoice.findUniqueOrThrow({where:{id:invoice.id}})),invoice,'avatar reads do not alter financial state/history')
 assert.deepEqual((await db.recurringInvoice.findUniqueOrThrow({where:{id:recurring.id}})),recurring,'avatar reads do not alter recurring schedules')
 console.log('Avatar surfaces PostgreSQL: external/seller reviews, Journal home/archive, guarded user/picker/invoice/ticket DTOs, live canonical change/removal/fallback, private-note filtering, signed own/staff/foreign/guest access and unchanged money rows passed.')
}finally{
 if(seller)await db.sellerReview.deleteMany({where:{sellerId:seller.id}});await db.businessProfile.deleteMany({where:{id:{in:businessIds},slug:{startsWith:stamp}}});if(seller)await db.seller.deleteMany({where:{id:seller.id,slug:stamp}})
 if(invoice)await db.invoice.deleteMany({where:{id:invoice.id,number:stamp}});if(ticket){await db.ticketMessage.deleteMany({where:{ticketId:ticket.id}});await db.ticket.deleteMany({where:{id:ticket.id,subject:stamp}})}if(post)await db.post.deleteMany({where:{id:post.id,slug:stamp}})
 if(recurring)await db.recurringInvoice.deleteMany({where:{id:recurring.id,title:stamp,userId:users[0]?.id}})
 await db.itemReview.deleteMany({where:{userId:{in:users.map(u=>u.id)}}});await db.user.deleteMany({where:{id:{in:users.map(u=>u.id)},email:{startsWith:stamp}}});await db.$disconnect()
}}
main().catch(error=>{console.error(error.stack);process.exitCode=1})
