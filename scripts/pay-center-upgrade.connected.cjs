// Empty disposable PostgreSQL only: deploy216, preserve historical settlement facts, deploy217.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process'),crypto=require('node:crypto'),{PrismaClient}=require('@prisma/client')
assert.match(new URL(process.env.DATABASE_URL||'postgresql://invalid/invalid').pathname,/^\/mobocom_pay_test_[a-z0-9_]+$/)
const db=new PrismaClient(),target='20270403120000_pay_webhooks_settlement_center',dir=path.resolve('var/pay-center-upgrade-'+process.pid)
const deploy=schema=>{const r=cp.spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy','--schema',schema],{encoding:'utf8',timeout:120000});assert.equal(r.status,0,(r.stdout||'')+(r.stderr||''))}
;(async()=>{try{
 assert.equal((await db.$queryRawUnsafe("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'"))[0].n,0,'Empty DB required')
 assert.equal(fs.existsSync(dir),false);fs.mkdirSync(dir+'/migrations',{recursive:true});fs.copyFileSync('prisma/schema.postgresql.prisma',dir+'/schema.prisma')
 for(const name of fs.readdirSync('prisma/migrations'))if(name!==target)fs.cpSync('prisma/migrations/'+name,dir+'/migrations/'+name,{recursive:true})
 deploy(dir+'/schema.prisma')
 const user=await db.user.create({data:{email:'pay-center-upgrade@example.invalid',passwordHash:'!',role:'CUSTOMER'}}),admin=await db.user.create({data:{email:'pay-center-upgrade-admin@example.invalid',passwordHash:'!',role:'ADMIN'}})
 await db.$executeRawUnsafe(`INSERT INTO "WalletAccount" ("userId",currency,"balanceMinor","withdrawableMinor") VALUES ($1,'USDT',235,235),($1,'IRR',4000000,4000000)`,user.id)
 await db.$executeRawUnsafe(`INSERT INTO "PayMerchant" (id,"userId",name,website,status,"updatedAt") VALUES ('upgrade-merchant',$1,'Synthetic historical','https://upgrade.invalid','ACTIVE',NOW())`,user.id)
 await db.$executeRawUnsafe(`INSERT INTO "PayTerminal" (id,"merchantId",name,"returnUrl") VALUES ('upgrade-terminal','upgrade-merchant','Historical','https://upgrade.invalid/return')`)
 for(const state of ['REQUESTED','APPROVED','PAID']){
  const id='upgrade-'+state,reserve=(await db.$queryRawUnsafe(`INSERT INTO "WalletTx" ("userId",amount,"amountMinor","balanceAfter","balanceAfterMinor",currency,type,status,"withdrawableDeltaMinor","withdrawableAfterMinor") VALUES ($1,-1000000,-1000000,4000000,4000000,'IRR','PAY_RESERVE','DONE',-1000000,4000000) RETURNING id`,user.id))[0].id
  await db.$executeRawUnsafe(`INSERT INTO "PaySettlementQuote" (id,"merchantId","railId",asset,network,decimals,"amountMinor","feeMinor","payoutAtoms","rialPerUnit","expiresAt") VALUES ($1,'upgrade-merchant','IRR_BANK','IRR','BANK',0,1000000,1000,999000,'1',NOW()+INTERVAL '5 minutes')`,id)
  await db.$executeRawUnsafe(`INSERT INTO "PaySettlement" (id,"merchantId","quoteId","idempotencyKey",fingerprint,"amountMinor","feeMinor","payoutAtoms",asset,network,decimals,destination,"reserveWalletTxId","updatedAt") VALUES ($1,'upgrade-merchant',$1,$1,$1,1000000,1000,999000,'IRR','BANK',0,'IR062960000000100324200001',$2,NOW())`,id,reserve)
  if(state!=='REQUESTED')await db.$executeRawUnsafe(`UPDATE "PaySettlement" SET status='APPROVED',"approvedById"=$2 WHERE id=$1 AND status='REQUESTED'`,id,admin.id)
  if(state==='PAID')await db.$executeRawUnsafe(`UPDATE "PaySettlement" SET status='PAID',"completedById"=$2,reference='historical-reference' WHERE id=$1 AND status='APPROVED'`,id,admin.id)
 }
 const tables=['User','WalletAccount','WalletTx','PayMerchant','PayTerminal','PaySettlementQuote','PaySettlement'],columns={}
 for(const t of tables)columns[t]=(await db.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,t)).map(r=>r.column_name)
 const snapshot=async()=>{const result={};for(const t of tables)result[t]=await db.$queryRawUnsafe(`SELECT ${columns[t].map(c=>'"'+c+'"').join(',')} FROM "${t}" ORDER BY id`);return JSON.stringify(result,(_,v)=>typeof v==='bigint'?String(v):v)}
 const before=await snapshot();deploy('prisma/schema.postgresql.prisma');assert.equal(await snapshot(),before)
 const rows=await db.paySettlement.findMany({orderBy:{id:'asc'}});assert.equal(rows.length,3);for(const s of rows){assert.equal(s.requiresSecondApproval,false);assert.equal(s.version,0);assert.equal(s.secondApprovedById,null);assert.equal(s.scheduledFor,null)}
 const role=(await db.$queryRawUnsafe('SELECT rolsuper FROM pg_roles WHERE rolname=current_user'))[0];assert.equal(role.rolsuper,false)
 assert.equal((await db.$queryRawUnsafe('SELECT count(*)::int n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'))[0].n,217)
 // An existing approved request remains completable under the new version guard.
 const updated=await db.paySettlement.updateMany({where:{id:'upgrade-APPROVED',status:'APPROVED',version:0},data:{status:'PAID',completedById:admin.id,reference:'historical-completion',version:{increment:1}}});assert.equal(updated.count,1)
 console.log('Populated216→217 PASS: historical requested/approved/paid settlements, quotes, reservations, IRR/USDT balances byte-equivalent; old approval remains completable; NOSUPERUSER. Digest '+crypto.createHash('sha256').update(before).digest('hex'))
}finally{await db.$disconnect();assert.equal(path.dirname(dir),path.resolve('var'));if(fs.existsSync(dir))fs.rmSync(dir,{recursive:true})}})().catch(e=>{console.error(e.stack);process.exitCode=1})
