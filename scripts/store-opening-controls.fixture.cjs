const fs=require('node:fs'),{PrismaClient}=require('@prisma/client'),{encode}=require('next-auth/jwt')
if(process.env.MOBOCOM_ISOLATED_FIXTURE!=='1'||new URL(process.env.DATABASE_URL).pathname!=='/mobocom_opening_test_20261114')throw Error('Disposable task database only')
const db=new PrismaClient(),baseURL=process.env.NEXTAUTH_URL
if(baseURL!=='https://localhost:3120')throw Error('Task loopback only')
async function main(){
 if(await db.user.count())throw Error('Expected empty task users')
 const create=(name,role)=>db.user.create({data:{email:'opening-'+name+'@example.invalid',name:'کاربر آزمایشی',role,passwordHash:'!',smsAlerts:false,emailAlerts:false,pushAlerts:false,...(role==='ADMIN'?{totpEnabledAt:new Date()}: {})}})
 const staff=await create('staff','ADMIN'),buyer=await create('buyer','CUSTOMER'),foreign=await create('foreign','CUSTOMER')
 const product=await db.product.create({data:{slug:'opening-device',name:'دستگاه آزمایشی افتتاح',kind:'PHYSICAL',sku:'OPENING-QA',currency:'IRT',price:1000,priceMinor:1000n,costMinor:1200n,stock:10,active:true,approval:'APPROVED',description:'<p>دستگاه آزمایشی</p>',shortDescription:'شرح دقیق کالای آزمایشی',image:'/favicon.ico'}})
 const location=await db.stockLocation.findFirstOrThrow({where:{isDefault:true}});await db.locationStock.create({data:{productId:product.id,locationId:location.id,itemKey:product.id+':0',quantity:10}})
 const order=await db.order.create({data:{userId:buyer.id,productId:product.id,currency:'IRT',totalAmount:1000,totalMinor:1000n,status:'PENDING',lines:{create:{productId:product.id,line:0,name:'نام ثبت‌شدهٔ دستگاه',kind:'PHYSICAL',quantity:1,currency:'IRT',unitPriceMinor:1000n,totalMinor:1000n}}}})
 const department=await db.ticketDepartment.create({data:{slug:'OPENING_QA',nameFa:'پشتیبانی آزمایشی',nameEn:'QA'}})
 await db.page.create({data:{slug:'opening-draft',title:'PRIVATE_OPENING_DRAFT',status:'DRAFT',content:'private'}})
 const configs={storeEnabled:'true','siteUrl':baseURL,'store.merchandising.v1':JSON.stringify({ordersPaused:false,servicePromises:[{icon:'truck',title:'ارسال آزمایشی',text:'زمان مورد تأیید آزمایشی'}],badges:[],counterDiscountWarningPercent:20}),'store.delivery.v1':JSON.stringify({enabled:false,pickup:{enabled:true,address:'نشانی آزمایشی فروشگاه',instructions:'آزمایشی'}})}
 for(const[key,value]of Object.entries(configs))await db.setting.upsert({where:{key},create:{key,value},update:{value}})
 const cookies=async user=>[{name:'__Secure-next-auth.session-token',secure:true,url:baseURL,value:await encode({secret:process.env.NEXTAUTH_SECRET,token:{uid:String(user.id),sub:String(user.id),role:user.role,email:user.email,authAt:Date.now()}})}]
 fs.writeFileSync('var/opening-fixture.private.json',JSON.stringify({baseURL,productId:product.id,productPath:'/products/'+product.slug,orderId:order.id,department:department.slug,staffCookies:await cookies(staff),buyerCookies:await cookies(buyer),foreignCookies:await cookies(foreign)}),{mode:0o600})
 console.log('Synthetic opening controls fixture prepared')
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>db.$disconnect())
