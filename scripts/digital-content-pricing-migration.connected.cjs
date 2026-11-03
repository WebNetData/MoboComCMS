// Exercise the additive SQL against populated legacy shapes in an isolated namespace.
const {PrismaClient}=require('@prisma/client'),fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict')
const db=new PrismaClient(),schema='owned_digital_migration_'+crypto.randomBytes(7).toString('hex');let created=false
;(async()=>{try{
 if(!/^owned_digital_migration_[a-f0-9]{14}$/.test(schema))throw Error('Invalid isolated schema')
 await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true
 await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`)
  await tx.$executeRawUnsafe(`CREATE TABLE "Product" ("id" INTEGER PRIMARY KEY, "kind" TEXT NOT NULL, "digitalMode" TEXT NOT NULL, "active" BOOLEAN NOT NULL, "priceMinor" BIGINT NOT NULL)`)
  await tx.$executeRawUnsafe(`CREATE TABLE "PaidItem" ("id" INTEGER PRIMARY KEY, "priceMinor" BIGINT NOT NULL, "vipAccess" TEXT NOT NULL, "sales" INTEGER NOT NULL, "revenueMinor" BIGINT NOT NULL)`)
  await tx.$executeRawUnsafe(`CREATE TABLE "ProductGroupPrice" ("id" SERIAL PRIMARY KEY, "productId" INTEGER NOT NULL, "variantId" INTEGER NOT NULL, "groupId" INTEGER NOT NULL, "priceMinor" BIGINT NOT NULL, CONSTRAINT "ProductGroupPrice_positive" CHECK ("priceMinor" > 0))`)
  await tx.$executeRawUnsafe(`INSERT INTO "Product" VALUES (11,'VIRTUAL','CODES',true,250000),(22,'PHYSICAL','MANUAL',true,85000)`)
  await tx.$executeRawUnsafe(`INSERT INTO "PaidItem" VALUES (7,85000,'FREE',12,1020000)`)
  await tx.$executeRawUnsafe(`INSERT INTO "ProductGroupPrice" ("productId","variantId","groupId","priceMinor") VALUES (11,0,9,175000)`)
  const before={products:await tx.$queryRawUnsafe(`SELECT * FROM "Product" ORDER BY "id"`),paid:await tx.$queryRawUnsafe(`SELECT * FROM "PaidItem"`),groups:await tx.$queryRawUnsafe(`SELECT * FROM "ProductGroupPrice"`)}
  for(const sql of fs.readFileSync('prisma/migrations/20270212120000_digital_content_pricing/migration.sql','utf8').split(';').map(s=>s.trim()).filter(Boolean))await tx.$executeRawUnsafe(sql)
  assert.deepEqual(await tx.$queryRawUnsafe(`SELECT "id","kind","digitalMode","active","priceMinor" FROM "Product" ORDER BY "id"`),before.products)
  assert.deepEqual(await tx.$queryRawUnsafe(`SELECT "id","priceMinor","vipAccess","sales","revenueMinor" FROM "PaidItem"`),before.paid)
  assert.deepEqual(await tx.$queryRawUnsafe(`SELECT "id","productId","variantId","groupId","priceMinor" FROM "ProductGroupPrice"`),before.groups)
  assert.deepEqual((await tx.$queryRawUnsafe(`SELECT "vipPricing" FROM "Product" ORDER BY "id"`)).map(row=>row.vipPricing),['',''])
  assert.equal((await tx.$queryRawUnsafe(`SELECT "pricingRules" FROM "PaidItem"`))[0].pricingRules,'[]')
  assert.equal((await tx.$queryRawUnsafe(`SELECT "mode" FROM "ProductGroupPrice"`))[0].mode,'PRICE')
  await tx.$executeRawUnsafe(`INSERT INTO "ProductGroupPrice" ("productId","variantId","groupId","priceMinor","mode") VALUES (11,0,10,0,'FREE'),(11,0,11,1250,'PERCENT')`)
 },{timeout:15000})
 console.log('PASS populated legacy migration: exact prices, VIP defaults, modes, sales and revenue preserved; new FREE and percentage rows accepted')
}finally{if(created)await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await db.$disconnect()}})().catch(error=>{console.error(error);process.exitCode=1})
