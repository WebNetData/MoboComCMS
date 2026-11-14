// Synthetic staff/product fixture; refuses owner databases and non-loopback previews.
const fs=require('node:fs'),{PrismaClient}=require('@prisma/client'),{encode}=require('next-auth/jwt')
if(process.env.MOBOCOM_ISOLATED_FIXTURE!=='1'||new URL(process.env.DATABASE_URL).pathname!=='/mobocom_launch_test_20261114')throw Error('Explicit disposable fixture database required')
const db=new PrismaClient(),baseURL=process.env.NEXTAUTH_URL
if(new URL(baseURL).hostname!=='localhost'||new URL(baseURL).port!=='3118')throw Error('Task loopback origin required')
async function main(){
 if(await db.user.count())throw Error('Fixture requires empty task users')
 const {staff,product}=await db.$transaction(async tx=>{
  const staff=await tx.user.create({data:{email:'launch-admin@example.invalid',name:'مدیر آزمایشی',passwordHash:'!',role:'ADMIN',totpEnabledAt:new Date()}})
  const product=await tx.product.create({data:{slug:'launch-variants-qa',name:'کالای تنوع‌دار آزمایشی',kind:'PHYSICAL',currency:'IRT',price:200000,priceMinor:200000n,stock:3,active:true,approval:'APPROVED',variants:{create:[{name:'الف',sku:'launch-qa-a',price:100000,priceMinor:100000n,stock:5},{name:'ب',sku:'launch-qa-b',price:300000,priceMinor:300000n,stock:5}]}}})
  await tx.setting.upsert({where:{key:'storeEnabled'},create:{key:'storeEnabled',value:'true'},update:{value:'true'}})
  return {staff,product}
 })
 const token=await encode({secret:process.env.NEXTAUTH_SECRET,token:{uid:String(staff.id),sub:String(staff.id),email:staff.email,role:staff.role,authAt:Date.now()}})
 fs.mkdirSync('var',{recursive:true})
 fs.writeFileSync('var/launch-fixture.private.json',JSON.stringify({baseURL,productId:product.id,staffCookies:[{name:'__Secure-next-auth.session-token',secure:true,url:baseURL,value:token}]}),{mode:0o600})
 console.log('Synthetic launch fixture prepared; private session retained only in task var')
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>db.$disconnect())
