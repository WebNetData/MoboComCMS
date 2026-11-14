const assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client')
assert(/test|check/i.test(new URL(process.env.DATABASE_URL).pathname),'disposable PostgreSQL required')
const db=new PrismaClient(),stamp='reorder-'+Date.now(),ids={users:[],products:[],orders:[]}
const load=require('./connected-source-loader.cjs')({'@/platform/database/prisma':{db},react:{...require('react'),cache:fn=>fn},'@/extensions/server/modules':{isModuleEnabled:async()=>true},'@/modules/account/server/item-audience':{userOpensAudience:async()=>true},'@/modules/membership/server/membership':{isMember:async()=>false,opensMembersOnly:async()=>false},'@/modules/membership/server/rules':{ruleRefusal:async()=>null},'@/modules/account/server/user-groups':{groupDeal:async()=>({percent:0,prices:new Map()})}})
const reorder=load('src/modules/store/server/reorder.ts'),cart=load('src/modules/store/server/cart.ts')
async function main(){
 for(const name of ['buyer','foreign']){const row=await db.user.create({data:{email:stamp+name+'@example.invalid',passwordHash:'!',role:'CUSTOMER'}});ids.users.push(row.id)}
 const [buyer,foreign]=ids.users
 const product=async(suffix,extra={})=>{const row=await db.product.create({data:{slug:stamp+suffix,name:'کالای '+suffix,kind:'PHYSICAL',currency:'IRT',stock:3,price:250,priceMinor:250n,active:true,approval:'APPROVED',...extra}});ids.products.push(row.id);return row}
 const item=await product('base'),existing=await product('existing'),config=await product('config',{isService:true}),inactive=await product('inactive',{variants:{create:{name:'قدیمی',sku:stamp+'old',active:false,stock:3}}})
 const variant=await db.productVariant.findFirstOrThrow({where:{productId:inactive.id}})
 const order=await db.order.create({data:{userId:buyer,productId:item.id,status:'PAID',currency:'IRT',totalMinor:400n,totalAmount:400,lines:{create:[{line:0,productId:item.id,name:item.name,kind:'PHYSICAL',quantity:2,currency:'IRT',unitPriceMinor:100n,totalMinor:200n},{line:1,productId:config.id,name:config.name,kind:'VIRTUAL',quantity:1,currency:'IRT',unitPriceMinor:100n,totalMinor:100n,inputs:'old-encrypted-answers'},{line:2,productId:inactive.id,variantId:variant.id,name:inactive.name,variantName:'قدیمی',kind:'PHYSICAL',quantity:1,currency:'IRT',unitPriceMinor:100n,totalMinor:100n}]}}});ids.orders.push(order.id)
 const owner={userId:buyer,token:null};await cart.addToCart(owner,{productId:existing.id,quantity:1})
 const preview=await reorder.previewReorder(buyer,order.id)
 assert.equal(preview.lines[0].eligible,true);assert.equal(preview.lines[0].currentUnitPrice,250);assert.equal(preview.lines[0].priceChanged,true)
 assert.equal(preview.lines[1].eligible,false);assert.equal(preview.lines[2].eligible,false)
 await assert.rejects(reorder.previewReorder(foreign,order.id),error=>error.status===404)
 const result=await reorder.addReorderToCart(owner,order.id,preview.lines.map(line=>line.sourceLineId));assert.equal(result.added.length,1);assert.equal(result.skipped.length,2)
 const persisted=await db.cartLine.findMany({where:{cart:{userId:buyer}},orderBy:{productId:'asc'}})
 assert.equal(persisted.find(line=>line.productId===existing.id).quantity,1,'existing cart retained');assert.equal(persisted.find(line=>line.productId===item.id).quantity,2);assert.equal(persisted.find(line=>line.productId===item.id).inputs,'')
 await db.product.update({where:{id:item.id},data:{stock:0}});assert.equal((await reorder.previewReorder(buyer,order.id)).lines[0].eligible,false)
 await assert.rejects(reorder.addReorderToCart(owner,order.id,[999999]),error=>error.status===409)
 assert.equal(await db.payment.count({where:{orderId:order.id}}),0,'reorder creates no payment')
 console.log('Reorder PostgreSQL passed: owned orders, actual current price/stock, changed price, inactive variant and fresh-input refusal, canonical cart persistence with prior rows retained and no old answers/payment')
}
main().finally(async()=>{await db.cart.deleteMany({where:{userId:{in:ids.users}}});await db.orderLine.deleteMany({where:{orderId:{in:ids.orders}}});await db.order.deleteMany({where:{id:{in:ids.orders}}});await db.product.deleteMany({where:{id:{in:ids.products}}});await db.user.deleteMany({where:{id:{in:ids.users}}});await db.$disconnect()}).catch(error=>{console.error(error);process.exitCode=1})
