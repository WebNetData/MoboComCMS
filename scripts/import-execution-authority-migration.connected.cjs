// Apply the actual additive SQL to empty and populated old-shaped relations in rolled-back owned schemas.
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),{PrismaClient}=require('@prisma/client');
const prisma=new PrismaClient(),sql=fs.readFileSync('prisma/migrations/20261220120000_import_execution_authority/migration.sql','utf8')+'\n'+fs.readFileSync('prisma/migrations/20261221120000_import_execution_generation/migration.sql','utf8');
async function scenario(populated){
 const schema='qa_import_authority_'+crypto.randomBytes(8).toString('hex');assert.match(schema,/^qa_import_authority_[a-f0-9]{16}$/);
 const rollback=Error('owned migration scenario complete');
 try{await prisma.$transaction(async tx=>{
  await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}", public`);
  await tx.$executeRawUnsafe('CREATE TABLE "ImportJob" (LIKE public."ImportJob" INCLUDING ALL)');
  for(const column of ['executionActorId','executionAuthorizedAt','executionMode','executionGeneration'])await tx.$executeRawUnsafe(`ALTER TABLE "ImportJob" DROP COLUMN "${column}" CASCADE`);
  if(populated){
   await tx.$executeRawUnsafe(`INSERT INTO "ImportJob" (id,adapter,status,"createdById","createdByEmail",cursor,stats,"fileName","createdAt","updatedAt") VALUES (731,'posts','PAUSED',831,'owned@example.invalid',7,'{"processed":7}','owned-one','2020-01-01','2020-01-02'),(732,'posts','ROLLING_BACK',832,'other@example.invalid',9,'{"rolledBack":2}','owned-two','2020-01-03','2020-01-04')`);
  }
  const before=await tx.$queryRawUnsafe('SELECT row_to_json(t) AS snapshot FROM "ImportJob" t ORDER BY id');
  for(const statement of sql.replace(/^--.*$/gm,'').split(';').filter(part=>part.trim()))await tx.$executeRawUnsafe(statement);
  const after=await tx.$queryRawUnsafe('SELECT row_to_json(t) AS snapshot FROM "ImportJob" t ORDER BY id');
  assert.equal(after.length,before.length);
  after.forEach((row,index)=>{const {executionActorId,executionAuthorizedAt,executionMode,executionGeneration,...kept}=row.snapshot;assert.deepEqual(kept,before[index].snapshot,'all historical columns retained');assert.equal(executionActorId,null);assert.equal(executionAuthorizedAt,null);assert.equal(executionGeneration,0);assert.equal(executionMode,before[index].snapshot.status==='ROLLING_BACK'?'ROLLBACK':'RUN')});
  // Existing readers and ordinary old-writer updates still work without mentioning new fields.
  await tx.$executeRawUnsafe('UPDATE "ImportJob" SET "fileName" = "fileName"');
  const columns=await tx.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='ImportJob'`,schema);
  for(const name of ['executionActorId','executionAuthorizedAt','executionMode','executionGeneration'])assert(columns.some(row=>row.column_name===name));
  const constraints=await tx.$queryRawUnsafe(`SELECT conname FROM pg_constraint WHERE conrelid='"ImportJob"'::regclass`);
  assert(constraints.some(row=>row.conname==='ImportJob_execution_actor_pair'));assert(constraints.some(row=>row.conname==='ImportJob_execution_mode'));
  assert(constraints.some(row=>row.conname==='ImportJob_execution_generation'));
  throw rollback;
 },{timeout:15000})}catch(error){if(error!==rollback)throw error}
 const remaining=await prisma.$queryRaw`SELECT schema_name FROM information_schema.schemata WHERE schema_name=${schema}`;assert.equal(remaining.length,0,'owned schema rolled back completely');
}
Promise.resolve().then(()=>scenario(false)).then(()=>scenario(true)).then(()=>console.log('Import execution migration: actual SQL on empty/populated old-shaped PostgreSQL relations; every historical column/cursor/stat/date preserved, rollback mode projected, constraints present, ordinary old readers/writers compatible; owned schema fully rolled back')).catch(error=>{console.error(error);process.exitCode=1}).finally(()=>prisma.$disconnect());
