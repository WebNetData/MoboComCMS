// Synthetic acceptance fixture, never an owner database or real provider account.
const fs=require('node:fs'),{PrismaClient}=require('@prisma/client'),{encode}=require('next-auth/jwt')
if(process.env.MOBOCOM_ISOLATED_FIXTURE!=='1'||new URL(process.env.DATABASE_URL).pathname!=='/mobocom_platform_test_20261114')throw Error('Explicit isolated fixture database required')
const db=new PrismaClient(),baseURL=process.env.NEXTAUTH_URL
if(new URL(baseURL).hostname!=='localhost'||new URL(baseURL).port!=='3117')throw Error('Task loopback origin required')
async function main(){
 if(await db.user.count())throw Error('Fixture requires empty task users')
 const role=await db.role.create({data:{name:'platform-fixture-handler',permissions:'users.manage,forms.handle,tickets.handle,cms.posts'}})
 const admin=await db.user.create({data:{email:'platform-admin@example.invalid',name:'مدیر آزمایشی',passwordHash:'!',role:'ADMIN',totpEnabledAt:new Date()}})
 const handler=await db.user.create({data:{email:'platform-handler@example.invalid',name:'کارمند آزمایشی',passwordHash:'!',role:'ADMIN',roleId:role.id,totpEnabledAt:new Date()}})
 const buyer=await db.user.create({data:{email:'platform-buyer@example.invalid',name:'مشتری آزمایشی',passwordHash:'!',role:'CUSTOMER'}})
 const form=await db.siteForm.create({data:{slug:'platform-repair-qa',title:'پذیرش تعمیر آزمایشی',settings:JSON.stringify({service:true,handlers:[handler.id]})}})
 await db.formSubmission.create({data:{formId:form.id,userId:buyer.id,data:'[{"value":"DO-NOT-EXPOSE-ANSWER"}]',stage:'OPEN',secrets:'DO-NOT-EXPOSE-LOCK',pickupCode:'DO-NOT-EXPOSE-PROOF',assigneeId:handler.id}})
 const department=await db.ticketDepartment.create({data:{slug:'PLATFORM_QA',nameFa:'پشتیبانی آزمایشی',nameEn:'QA',roleIds:JSON.stringify([role.id])}})
 await db.ticket.create({data:{userId:buyer.id,subject:'پیگیری آزمایشی مشتری',department:department.slug,assignedToId:handler.id,status:'OPEN'}})
 const game=await db.gameTitle.create({data:{slug:'platform-discovery-qa',title:'PlatformNebula',status:'PUBLISHED',publishedAt:new Date(Date.now()-86400000),summary:'شرح بازی آزمایشی'}})
 const product=await db.product.create({data:{slug:'platform-product-qa',name:'کالای آزمایشی پلتفرم',kind:'PHYSICAL',price:100000,priceMinor:100000n,stock:10,active:true,approval:'APPROVED'}})
 const post=await db.post.create({data:{slug:'platform-guide-qa',title:'راهنمای آزمایشی بازی و کالا',content:'<p>راهنمای آزمایشی.</p>',excerpt:'آشنایی با بازی و کالای مرتبط',status:'PUBLISHED',publishedAt:new Date(Date.now()-60000),itemLinks:{create:[{itemType:'game',itemId:game.id},{itemType:'product',itemId:product.id}]}}})
 await db.post.create({data:{slug:'platform-editorial-qa',title:'مطلب زمان‌بندی‌شده آزمایشی',content:'<p>متن کوتاه.</p>',status:'PUBLISHED',publishedAt:new Date(Date.now()+86400000)}})
 await db.post.create({data:{slug:'platform-review-qa',title:'مطلب منتظر تأیید آزمایشی',content:'<p>متن.</p>',status:'PENDING'}})
 for(const [key,value]of Object.entries({storeEnabled:'true','search.indexedAt':new Date().toISOString()}))await db.setting.upsert({where:{key},create:{key,value},update:{value}})
 await db.searchDocument.create({data:{itemType:'game',itemId:game.id,title:game.title,text:game.title.toLowerCase(),url:'/games/'+game.slug,publishedAt:game.publishedAt}})
 await db.backgroundJob.create({data:{kind:'notification.deliver',status:'FAILED',lastError:'Controlled fixture failure'}})
 const cookies=async user=>[{name:'__Secure-next-auth.session-token',secure:true,url:baseURL,value:await encode({secret:process.env.NEXTAUTH_SECRET,token:{uid:String(user.id),sub:String(user.id),email:user.email,role:user.role,authAt:Date.now()}})}]
 fs.writeFileSync('var/platform-fixture.private.json',JSON.stringify({baseURL,buyerId:buyer.id,gameId:game.id,productId:product.id,postId:post.id,gamePath:'/games/'+game.slug,productPath:'/products/'+product.slug,staffCookies:await cookies(admin),handlerCookies:await cookies(handler),buyerCookies:await cookies(buyer)}),{mode:0o600})
 console.log('Synthetic platform browser fixture ready; private sessions retained only in task var')
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect())
