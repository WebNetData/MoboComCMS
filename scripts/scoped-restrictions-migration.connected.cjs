/* Execute the real migration on empty and populated isolated schemas. No public table is changed. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {PrismaClient}=require('@prisma/client');
const base=new PrismaClient(),prefix=`restriction_migration_${Date.now()}`;
const migration=fs.readFileSync('prisma/migrations/20261219120000_access_restrictions/migration.sql','utf8');
const schemas=[],files=[];
async function scenario(populated) {
 const schema=prefix+(populated?'_old':'_empty');assert.match(schema,/^restriction_migration_\d+_(?:old|empty)$/);
 await base.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);schemas.push(schema);
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
 const db=new PrismaClient({datasources:{db:{url:url.toString()}}});
 try{
  await db.$executeRawUnsafe(`CREATE TABLE "${schema}"."User" ("id" SERIAL PRIMARY KEY)`);
  await db.$executeRawUnsafe(`CREATE TABLE "${schema}"."ForumProfile" ("userId" INTEGER PRIMARY KEY REFERENCES "${schema}"."User"("id"), "silencedUntil" TIMESTAMP(3), "suspendedUntil" TIMESTAMP(3), "moderationNote" TEXT NOT NULL DEFAULT '')`);
  const old=[];
  if(populated)for(const [silence,suspend,note] of [[new Date('2099-01-01T12:30:40.123Z'),new Date('2000-01-01T00:00:00.000Z'),'قدیمی '.repeat(140)],[new Date('1960-01-01T00:00:00.000Z'),null,'پایان‌یافته']]){
   const [user]=await db.$queryRawUnsafe(`INSERT INTO "${schema}"."User" DEFAULT VALUES RETURNING "id"`);
   await db.$executeRawUnsafe(`INSERT INTO "${schema}"."ForumProfile" ("userId","silencedUntil","suspendedUntil","moderationNote") VALUES ($1,$2,$3,$4)`,user.id,silence,suspend,note);
   old.push({userId:user.id,silencedUntil:silence,suspendedUntil:suspend,moderationNote:note});
  }
  const file=path.join(require('node:os').tmpdir(),schema+'.sql');files.push(file);
  // Explicit SQL search_path protects against migration-engine defaults independently of Prisma's URL schema.
  fs.writeFileSync(file,`SET search_path TO "${schema}";\n`+migration);
  const run=cp.spawnSync(process.execPath,['node_modules/prisma/build/index.js','db','execute','--schema','prisma/schema.postgresql.prisma','--file',file],{encoding:'utf8',env:{...process.env,DATABASE_URL:url.toString()}});
  assert.equal(run.status,0,(run.stdout+run.stderr).slice(-1500));
  const rows=await db.accessRestriction.findMany();assert.equal(rows.length,populated?3:0);
  for(const row of rows){
   assert.equal(row.source,'LEGACY');assert.equal(row.issuedByUserId,null);assert.equal(row.issuanceAuditId,null);
   assert.deepEqual(JSON.parse(row.sourceMetadata),{issuerUnknown:true,startUnknown:true});
   assert(row.startsAt<row.expiresAt);assert.equal(row.reason,old.find(x=>x.userId===row.userId).moderationNote);
   assert.equal(row.sourceKey,`legacy-forum:${row.userId}:${row.effectKey}`);
  }
  const profiles=await db.$queryRawUnsafe(`SELECT * FROM "${schema}"."ForumProfile" ORDER BY "userId"`);
  for(const profile of profiles){
   const before=old.find(x=>x.userId===profile.userId);assert.equal(profile.moderationNote,before.moderationNote);
   for(const key of ['silencedUntil','suspendedUntil'])assert.equal(profile[key]?.toISOString()||null,before[key]?.toISOString()||null,'old-reader dates preserved');
   assert.equal(profile.sanctionProjection,JSON.stringify({silencedUntil:before.silencedUntil?.toISOString()||null,suspendedUntil:before.suspendedUntil?.toISOString()||null}));
  }
  if(populated){
   const begin=migration.indexOf('INSERT INTO "AccessRestriction"'),end=migration.indexOf('-- Snapshot exact old values');
   assert(begin>0&&end>begin);
   await db.$executeRawUnsafe(migration.slice(begin,end));assert.equal(await db.accessRestriction.count(),3,'backfill replay is idempotent');
   const subject=old[0].userId;
   for(const data of [{scope:'MODULE',moduleKey:null},{scope:'GLOBAL',moduleKey:'forum'},{capabilities:'[]'},{capabilities:'[1]'},{capabilities:'["invalid"]'},{capabilities:'{}'},{expiresAt:new Date('1960-01-01')},{source:'UNREVIEWED'}]){
    await assert.rejects(db.accessRestriction.create({data:{userId:subject,scope:'MODULE',moduleKey:'forum',effectKey:'forum.silence',capabilities:'["forum.participate"]',reason:'fixture',...data}}));
   }
  }
  console.log(`Restriction migration ${populated?'stored active/expired/pre-epoch/long-note':'empty'}: real SQL, preserved old dates/provenance, replay and constraints passed`);
 }finally{await db.$disconnect()}
}
(async()=>{await scenario(false);await scenario(true)})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{
 try{for(const schema of schemas){assert.match(schema,/^restriction_migration_\d+_(?:old|empty)$/);await base.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`)}for(const file of files)if(fs.existsSync(file))fs.unlinkSync(file)}finally{await base.$disconnect()}
});
