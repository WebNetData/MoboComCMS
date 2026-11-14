const fs=require('node:fs'),{PrismaClient}=require('@prisma/client'),{encode}=require('next-auth/jwt')
if(process.env.MOBOCOM_ISOLATED_FIXTURE!=='1'||new URL(process.env.DATABASE_URL).pathname!=='/mobocom_guides_test_20261114')throw Error('Explicit disposable fixture required')
const db=new PrismaClient(),baseURL=process.env.NEXTAUTH_URL
if(new URL(baseURL).hostname!=='localhost'||new URL(baseURL).port!=='3119')throw Error('Task loopback origin required')
const load=require('./connected-source-loader.cjs')({'@/platform/database/prisma':{db}}),{defaultSite}=load('src/modules/site/config/defaults.ts')
async function main(){
 if(await db.user.count())throw Error('Empty task users required')
 const staff=await db.user.create({data:{email:'guides-admin@example.invalid',name:'مدیر آزمایشی',passwordHash:'!',role:'ADMIN',totpEnabledAt:new Date()}}),pages=[]
 for(const [slug,title]of [['shipping','روش ارسال آزمایشی'],['warranty','ضمانت آزمایشی'],['returns','مرجوعی آزمایشی'],['privacy','حریم خصوصی آزمایشی'],['contact','تماس آزمایشی']]){
  const page=await db.page.create({data:{slug:'guides-'+slug,title,status:'PUBLISHED',showInNav:true,content:'<h2>اطلاعات آزمایشی</h2><p>این متن فقط برای بررسی رابط در محیط جداگانه است و شرایط واقعی فروشگاه محسوب نمی‌شود.</p>'}});pages.push({...page,key:slug})
  await db.setting.create({data:{key:'page.layout.'+page.id,value:JSON.stringify({companyPanel:slug==='contact'?'contact':'legal'})}})
 }
 await db.page.create({data:{slug:'guides-private',title:'PRIVATE_GUIDE_MUST_NOT_APPEAR',status:'DRAFT',content:'private'}})
 const product=await db.product.create({data:{slug:'guides-product',name:'کالای آزمایشی راهنمای خرید',kind:'PHYSICAL',currency:'IRT',price:100000,priceMinor:100000n,stock:3,active:true,approval:'APPROVED',description:'<p>شرح کالای آزمایشی</p>',warranty:'طبق شرایط صفحهٔ ضمانت آزمایشی'}})
 const config={...defaultSite,sections:[],navigation:[{href:'/products',label:{fa:'فروشگاه',en:'Store'}}],footer:pages.map(page=>({href:'/p/'+page.slug,label:{fa:page.title,en:page.title}})),contact:{address:'نشانی آزمایشی',phone:'02100000000',email:'contact@example.invalid',hours:'ساعات آزمایشی',telegram:'',instagram:'',x:'',latitude:null,longitude:null,zoom:16,mapEnabled:false}}
 for(const [key,value]of Object.entries({'storeEnabled':'true','site.config.v1':JSON.stringify(config),'store.merchandising.v1':JSON.stringify({badges:[],purchaseGuidePageIds:[]})}))await db.setting.upsert({where:{key},create:{key,value},update:{value}})
 const token=await encode({secret:process.env.NEXTAUTH_SECRET,token:{uid:String(staff.id),sub:String(staff.id),email:staff.email,role:staff.role,authAt:Date.now()}})
 fs.writeFileSync('var/guides-fixture.private.json',JSON.stringify({baseURL,productPath:'/products/'+product.slug,pages:pages.map(page=>({id:page.id,key:page.key,title:page.title,path:'/p/'+page.slug})),staffCookies:[{name:'__Secure-next-auth.session-token',secure:true,url:baseURL,value:token}]}),{mode:0o600})
 console.log('Synthetic public guide/contact/product fixture prepared; private session only in task var')
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>db.$disconnect())
