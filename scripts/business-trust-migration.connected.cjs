// Execute the actual additive SQL against old populated tables in an owned schema.
const fs=require('node:fs'),assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client')
const db=new PrismaClient(),schema=`owned_business_trust_${Date.now()}`
const scoped=work=>db.$transaction(async tx=>{await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);return work(tx)})
const constraint=code=>error=>error.code==='P2010'&&error.meta?.code===code
async function main(){try{
 await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`)
 await scoped(async tx=>{
  for(const sql of ['CREATE TABLE "User" ("id" INTEGER PRIMARY KEY)','CREATE TABLE "BusinessProfile" ("id" INTEGER PRIMARY KEY, "name" TEXT NOT NULL)','CREATE TABLE "ItemReview" ("id" INTEGER PRIMARY KEY, "body" TEXT NOT NULL)','CREATE TABLE "SellerReview" ("id" INTEGER PRIMARY KEY, "body" TEXT NOT NULL)','CREATE TABLE "CommunityReport" ("id" SERIAL PRIMARY KEY, "postId" INTEGER, "commentId" INTEGER, "reporterId" INTEGER NOT NULL, "reason" TEXT NOT NULL, "note" TEXT NOT NULL DEFAULT \'\', "status" TEXT NOT NULL DEFAULT \'OPEN\', "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)'])await tx.$executeRawUnsafe(sql)
  await tx.$executeRawUnsafe('INSERT INTO "User" VALUES (11),(12)');await tx.$executeRawUnsafe('INSERT INTO "BusinessProfile" VALUES (21,\'Original business\')');await tx.$executeRawUnsafe('INSERT INTO "ItemReview" VALUES (31,\'Original item review\')');await tx.$executeRawUnsafe('INSERT INTO "SellerReview" VALUES (41,\'Original seller review\')');await tx.$executeRawUnsafe('INSERT INTO "CommunityReport" ("postId","reporterId","reason","note") VALUES (51,11,\'SPAM\',\'Original report remains\')')
  const sql=fs.readFileSync('prisma/migrations/20270103120000_business_trust/migration.sql','utf8')
  for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await tx.$executeRawUnsafe(statement)
  assert.deepEqual(await tx.$queryRawUnsafe('SELECT "name" FROM "BusinessProfile"'),[{name:'Original business'}]);assert.deepEqual(await tx.$queryRawUnsafe('SELECT "body" FROM "ItemReview"'),[{body:'Original item review'}]);assert.deepEqual(await tx.$queryRawUnsafe('SELECT "body" FROM "SellerReview"'),[{body:'Original seller review'}]);assert.deepEqual(await tx.$queryRawUnsafe('SELECT "postId","note","businessId","itemReviewId" FROM "CommunityReport"'),[{postId:51,note:'Original report remains',businessId:null,itemReviewId:null}])
 })
 const report=()=>scoped(tx=>tx.$executeRawUnsafe('INSERT INTO "CommunityReport" ("businessId","itemReviewId","reporterId","reason","businessReviewDigest") VALUES (21,31,11,\'ABUSE\',$1)','a'.repeat(64)))
 await report();await assert.rejects(report(),constraint('23505'))
 await assert.rejects(scoped(tx=>tx.$executeRawUnsafe('INSERT INTO "CommunityReport" ("businessId","itemReviewId","sellerReviewId","reporterId","reason","businessReviewDigest") VALUES (21,31,41,12,\'ABUSE\',$1)','a'.repeat(64))),constraint('23514'))
 const proof=(status='PENDING',reviewerId=null,filename='12345678-1234-1234-1234-123456789abc.png')=>scoped(tx=>tx.$executeRawUnsafe('INSERT INTO "BusinessPurchaseProof" ("businessId","reviewId","userId","reviewerId","status","reviewDigest","filename","originalName","mimeType","size","sha256") VALUES (21,31,11,$1,$2,$3,$4,\'receipt.png\',\'image/png\',100,$3)',reviewerId,status,'b'.repeat(64),filename))
 await proof();await assert.rejects(proof(),constraint('23505'));await assert.rejects(proof('BYPASSED'),constraint('23514'));await assert.rejects(proof('APPROVED',11),constraint('23514'));await assert.rejects(proof('REJECTED',12,'../../outside.png'),constraint('23514'))
 await scoped(async tx=>{await tx.$executeRawUnsafe('UPDATE "BusinessPurchaseProof" SET "status"=\'APPROVED\',"reviewerId"=12');await tx.$executeRawUnsafe('DELETE FROM "User" WHERE "id"=12');assert.equal((await tx.$queryRawUnsafe('SELECT "reviewerId" FROM "BusinessPurchaseProof"'))[0].reviewerId,null)})
 console.log('Business trust SQL passed: populated legacy business/item/seller/report preservation, distinct report targets, pending uniqueness, proof state/file/independent-review constraints and canonical reviewer FK cleanup.')
}finally{await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await db.$disconnect()}}
main().catch(error=>{console.error(error.message);process.exitCode=1})
