const assert=require('node:assert/strict'),fs=require('node:fs'),{PrismaClient}=require('@prisma/client')
const db=new PrismaClient(),schema='mround_migration_'+Date.now()+process.pid
const run=async(tx,file)=>{const sql=fs.readFileSync('prisma/migrations/'+file+'/migration.sql','utf8').replace(/--[^\n]*/g,'');for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await tx.$executeRawUnsafe(statement)}
async function main(){try{assert.match(schema,/^mround_migration_[0-9]+$/);await db.$transaction(async tx=>{
 await tx.$executeRawUnsafe('CREATE SCHEMA "'+schema+'"');await tx.$executeRawUnsafe('SET LOCAL search_path TO "'+schema+'"')
 await run(tx,'20261212120000_moderation_cases')
 const tables=['PostComment','ProductReview','ProductQuestion','ItemReview','ForumPost','ForumFlag','CommunityReport','CopyrightReport','Post','CinemaTitle','MusicTrack','MusicAlbum','GameTitle','SoftwareTitle']
 for(const table of tables)await tx.$executeRawUnsafe('CREATE TABLE "'+table+'" ("id" INTEGER PRIMARY KEY, "status" TEXT NOT NULL, "itemType" TEXT, "businessId" INTEGER)')
 await tx.$executeRawUnsafe(`INSERT INTO "PostComment" ("id","status") VALUES (1,'PENDING'),(2,'APPROVED')`)
 await tx.$executeRawUnsafe(`INSERT INTO "ItemReview" ("id","status","itemType") VALUES (3,'PENDING','business')`)
 await tx.$executeRawUnsafe(`INSERT INTO "ModerationCase" ("source","itemId","status","decision","decidedById","decidedAt","note") VALUES ('article-comments',1,'DECIDED','reject',7,'2026-01-02','first decision'),('article-comments',2,'DECIDED','approve',8,'2026-01-03','still decided'),('business-experiences',3,'DECIDED','approve',9,'2026-01-04','business'),('item-reviews',3,'DECIDED','reject',10,'2026-01-05','different source'),('forum-flags',99,'OPEN','',NULL,NULL,'untouched')`)
 await run(tx,'20270109120000_moderation_rounds')
 const saved=await tx.$queryRawUnsafe('SELECT * FROM "ModerationDecision" ORDER BY "id"')
 assert.equal(saved.length,4)
 await run(tx,'20270109121000_moderation_pending_rounds')
 const rows=await tx.$queryRawUnsafe('SELECT "source","itemId","status","round","note" FROM "ModerationCase" ORDER BY "id"')
 assert.deepEqual(rows.map(row=>[row.source,row.status,row.round,row.note]),[['article-comments','OPEN',2,''],['article-comments','DECIDED',1,'still decided'],['business-experiences','OPEN',2,''],['item-reviews','DECIDED',1,'different source'],['forum-flags','OPEN',1,'untouched']])
 assert.deepEqual(await tx.$queryRawUnsafe('SELECT * FROM "ModerationDecision" ORDER BY "id"'),saved,'all historical data is retained exactly')
 assert.deepEqual(await tx.$queryRawUnsafe('SELECT "status" FROM "PostComment" ORDER BY "id"'),[{status:'PENDING'},{status:'APPROVED'}],'content state is unchanged')
 await run(tx,'20270109121000_moderation_pending_rounds')
 assert.equal((await tx.$queryRawUnsafe('SELECT "round" FROM "ModerationCase" WHERE "id"=1'))[0].round,2,'reconciliation is idempotent')
 await tx.$executeRawUnsafe('DROP SCHEMA "'+schema+'" CASCADE')
 },{timeout:30_000});console.log('Actual old-shape moderation migrations: exact decision backfill, owner-confirmed pending reconciliation, source isolation and idempotence passed')
}finally{await db.$disconnect()}}
main().catch(error=>{console.error(error);process.exitCode=1})
