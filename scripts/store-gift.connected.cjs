// Native gift snapshot ownership/privacy: no provider, seeded rows or .env required.
const assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client');
assert(/store_experiences_|test|check/i.test(new URL(process.env.DATABASE_URL).pathname),'disposable task database required');
const db=new PrismaClient(),stamp='gift-'+Date.now().toString(36),users=[],products=[],orders=[];
const load=require('./connected-source-loader.cjs')({'@/platform/database/prisma':{db}});
const {validateGiftOrder,readGiftOrder}=load('src/modules/store/domain/gift-order.ts');
const {giftReceipt}=load('src/modules/store/server/gift-receipt.ts');
;(async()=>{
  const options={enabled:true,wrapEnabled:true,physical:true};
  const gift=validateGiftOrder({enabled:true,recipient:'گیرندهٔ آزمایشی',message:'پیام هدیه',wrap:true},options);
  for(const option of [{...options,enabled:false},{...options,physical:false},{...options,wrapEnabled:false}])
    assert.throws(()=>validateGiftOrder({enabled:true,recipient:'گیرنده',wrap:true},option));
  assert.throws(()=>validateGiftOrder({enabled:true,recipient:' ',message:''},options));
  assert.throws(()=>validateGiftOrder({enabled:true,recipient:'گیرنده',message:'x'.repeat(501)},options));
  assert.equal(readGiftOrder(undefined),null);
  const buyer=await db.user.create({data:{email:stamp+'@example.invalid',passwordHash:'fixture-only'}});users.push(buyer.id);
  const foreign=await db.user.create({data:{email:stamp+'-other@example.invalid',passwordHash:'fixture-only'}});users.push(foreign.id);
  const product=await db.product.create({data:{name:'کالای هدیه',slug:stamp,price:987654,priceMinor:987654n,currency:'IRT',kind:'PHYSICAL',active:true}});products.push(product.id);
  const order=await db.order.create({data:{userId:buyer.id,productId:product.id,status:'PAID',totalAmount:987654,totalMinor:987654n,currency:'IRT',meta:JSON.stringify({gift,privateAnswer:'DO_NOT_DISCLOSE'}),lines:{create:[{line:0,productId:product.id,name:'کالای هدیه',variantName:'مدل آزمایش',kind:'PHYSICAL',quantity:1,unitPriceMinor:987654n,listPriceMinor:987654n,totalMinor:987654n,currency:'IRT'},{line:1,productId:product.id,name:'SECRET_DIGITAL_CODE',kind:'VIRTUAL',quantity:1,unitPriceMinor:0n,totalMinor:0n,currency:'IRT'}]},invoice:{create:{userId:buyer.id,number:stamp,status:'PAID',totalMinor:987654n,subtotalMinor:987654n,total:987654,subtotal:987654,currency:'IRT',paidAt:new Date()}}}});orders.push(order.id);
  const receipt=await giftReceipt(buyer.id,order.id);
  assert.deepEqual(receipt.gift,gift);assert.equal(receipt.lines.length,1);
  assert.deepEqual(Object.keys(receipt.lines[0]).sort(),['name','quantity','variantName']);
  const serialized=JSON.stringify(receipt);
  for(const secret of ['987654','DO_NOT_DISCLOSE','SECRET_DIGITAL_CODE','totalMinor','unitPrice'])assert(!serialized.includes(secret));
  assert.equal(await giftReceipt(foreign.id,order.id),null);
  const claim=await db.order.updateMany({where:{id:order.id,status:'PAID'},data:{status:'REFUNDED'}});assert.equal(claim.count,1);
  assert.equal(await giftReceipt(buyer.id,order.id),null);
  console.log('PASS gift validation, persisted private physical-only receipt, foreign ownership and closed-order refusal');
})().finally(async()=>{
  await db.invoice.deleteMany({where:{orderId:{in:orders}}});await db.orderLine.deleteMany({where:{orderId:{in:orders}}});await db.order.deleteMany({where:{id:{in:orders}}});await db.product.deleteMany({where:{id:{in:products}}});await db.user.deleteMany({where:{id:{in:users}}});await db.$disconnect();
}).catch(error=>{console.error(error);process.exitCode=1});
