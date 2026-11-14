// Synthetic browser data on this explicitly disposable, local task database only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PrismaClient}=require('@prisma/client'),{encode}=require('next-auth/jwt');
assert.equal(new URL(process.env.DATABASE_URL).pathname,'/mobocom_store_experiences_20261114');
assert.equal(process.env.NEXTAUTH_URL,'http://localhost:3117');
const db=new PrismaClient(),prefix='store-experience-qa',target=path.resolve('var/fixture.private.json');
;(async()=>{
  assert.equal(await db.user.count(),0,'browser seed requires empty task users');
  const user=async(name,admin=false)=>db.user.create({data:{email:`${prefix}-${name}@example.invalid`,name:admin?'مدیر آزمایشی':'خریدار آزمایشی',phone:admin?'':'09120000001',passwordHash:'fixture-only',role:admin?'ADMIN':'CUSTOMER',...(admin?{totpEnabledAt:new Date()}:{}),smsAlerts:false,emailAlerts:false,pushAlerts:false}});
  const buyer=await user('buyer'),foreign=await user('foreign'),staff=await user('staff',true);
  const product=await db.product.create({data:{name:'SSD آزمایشی کارکرده',slug:prefix,sku:prefix,kind:'PHYSICAL',price:150000,priceMinor:150000n,costMinor:100000n,currency:'IRT',stock:5,active:true,approval:'APPROVED',condition:'USED',conditionGrade:'A',conditionNotes:'خط ظاهری جزئی در بدنهٔ همین دستگاه',healthReport:'سلامت آزمایشی ۹۸٪',warranty:'هفت روز مهلت تست',image:'/favicon.ico',gallery:JSON.stringify(['/favicon.ico']),deviceCompatibility:{create:{deviceModel:'Laptop QA 2026',normalizedModel:'laptop qa 2026',status:'CONDITIONAL',note:'نیازمند شکاف M.2 NVMe',source:'دفترچهٔ آزمایشی'}}}});
  const location=await db.stockLocation.findFirst({where:{isDefault:true}})||await db.stockLocation.create({data:{name:'انبار آزمایشی',isDefault:true,sellsOnline:true}});
  await db.locationStock.create({data:{locationId:location.id,productId:product.id,itemKey:`${product.id}:0`,quantity:5}});
  await db.walletAccount.create({data:{userId:buyer.id,currency:'IRT',balanceMinor:1000000n}});
  for(const[key,value]of Object.entries({storeEnabled:'true','store.merchandising.v1':JSON.stringify({giftOrdersEnabled:true,giftWrapEnabled:true,showProductBundles:true,showProductRelationships:true}),'store.delivery.v1':JSON.stringify({enabled:false,pickup:{enabled:true,address:'فروشگاه آزمایشی',instructions:'فقط پیش‌نمایش محلی'}})}))await db.setting.upsert({where:{key},create:{key,value},update:{value}});
  const cookies=async(row)=>[{name:'next-auth.session-token',url:process.env.NEXTAUTH_URL,value:await encode({secret:process.env.NEXTAUTH_SECRET,token:{uid:String(row.id),sub:String(row.id),role:row.role,email:row.email,authAt:Date.now()}})}];
  fs.writeFileSync(target,JSON.stringify({schemaVersion:1,baseURL:process.env.NEXTAUTH_URL,productId:product.id,slug:product.slug,locationId:location.id,buyerId:buyer.id,buyerCookies:await cookies(buyer),staffCookies:await cookies(staff),foreignCookies:await cookies(foreign)}),{mode:0o600});
  console.log('Seeded synthetic Store buyer/catalogue/staff; private sessions retained in task fixture');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>db.$disconnect());
