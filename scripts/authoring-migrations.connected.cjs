const assert=require('node:assert/strict'),fs=require('node:fs'),{PrismaClient}=require('@prisma/client'),db=new PrismaClient(),schema=`owned_authoring_${Date.now()}_${process.pid}`;
async function main(){assert.match(schema,/^owned_authoring_\d+_\d+$/);try{
 await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
 await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
  await tx.$executeRawUnsafe('CREATE TABLE "User" ("id" SERIAL PRIMARY KEY)');
  await tx.$executeRawUnsafe('CREATE TABLE "UserCollection" ("id" SERIAL PRIMARY KEY, "ownerId" INTEGER NOT NULL REFERENCES "User"("id"), "staffAuthored" BOOLEAN NOT NULL DEFAULT false, "visibility" TEXT NOT NULL DEFAULT \'PRIVATE\', "title" TEXT NOT NULL)');
  await tx.$executeRawUnsafe('INSERT INTO "User" (id) VALUES (7)');
  await tx.$executeRawUnsafe('INSERT INTO "UserCollection" (id,"ownerId","staffAuthored",visibility,title) VALUES (11,7,true,\'EDITORIAL\',\'legacy content stays\')');
  for(const migration of ['20270110120000_editorial_schedule','20270110130000_editor_patterns'])for(const sql of fs.readFileSync(`prisma/migrations/${migration}/migration.sql`,'utf8').split(';').filter(s=>s.trim()))await tx.$executeRawUnsafe(sql);
  const [row]=await tx.$queryRawUnsafe('SELECT * FROM "UserCollection" WHERE id=11');
  assert.deepEqual([row.id,row.ownerId,row.staffAuthored,row.visibility,row.title,row.publishAt,row.scheduledById,row.scheduleAuthorizedAt,row.scheduleError],[11,7,true,'EDITORIAL','legacy content stays',null,null,null,'']);
  await tx.$executeRawUnsafe('INSERT INTO "EditorPattern" (entity,kind,title,"contentDocument","createdById","updatedAt") VALUES (\'posts\',\'template\',\'fixture\',\'{"version":1,"blocks":[]}\',7,CURRENT_TIMESTAMP)');
  await tx.$executeRawUnsafe('UPDATE "UserCollection" SET "scheduledById"=7 WHERE id=11');
  await tx.$executeRawUnsafe('INSERT INTO "User" (id) VALUES (8)');
  await tx.$executeRawUnsafe('UPDATE "UserCollection" SET "ownerId"=8 WHERE id=11');
  const [pattern]=await tx.$queryRawUnsafe('SELECT "createdById", "contentDocument" FROM "EditorPattern"');assert.equal(pattern.createdById,7);assert.equal(JSON.parse(pattern.contentDocument).version,1);
  await tx.$executeRawUnsafe('DELETE FROM "User" WHERE id=7');
  assert.equal((await tx.$queryRawUnsafe('SELECT "scheduledById" FROM "UserCollection" WHERE id=11'))[0].scheduledById,null);
  assert.equal((await tx.$queryRawUnsafe('SELECT "createdById" FROM "EditorPattern"'))[0].createdById,null);
 });
 console.log('Actual additive authoring SQL on populated legacy tables: IDs, owner, title and editorial state preserved; schedule defaults and canonical pattern rows passed.');
}finally{await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await db.$disconnect()}}
main().catch(e=>{console.error(e);process.exitCode=1});
