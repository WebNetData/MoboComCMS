// Owned PostgreSQL fixtures, actual canonical Identity owner; no outgoing provider calls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript'),{PrismaClient}=require('@prisma/client');
const db=new PrismaClient(),cache=new Map(),ids=[],stamp='telegram-merge-'+Date.now();
let failProfile=false;
const ownerDb=new Proxy(db,{get(object,key){if(key==='$transaction')return work=>object.$transaction(tx=>work(new Proxy(tx,{get(client,model){if(model==='userProfile')return new Proxy(client[model],{get(delegate,method){if(method==='updateMany'&&failProfile)return()=>{throw Error('owned profile storage failure')};return typeof delegate[method]==='function'?delegate[method].bind(delegate):delegate[method]}});return typeof client[model]==='function'?client[model].bind(client):client[model]}})));return typeof object[key]==='function'?object[key].bind(object):object[key]}});
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const mod={exports:{}};cache.set(file,mod);new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>{if(name==='@/platform/database/prisma')return{db:ownerDb};if(name.startsWith('@/')){const p='src/'+name.slice(2);return load(fs.existsSync(p+'.ts')?p+'.ts':p+'/index.ts')}return require(name)},mod,mod.exports);return mod.exports}
async function account(placeholder=false){const tg=String(9000000000000+Date.now()%1000000000000+ids.length);const user=await db.user.create({data:{email:placeholder?`tg${tg}.0123456789abcdef@telegram.local`:`${stamp}-${ids.length}@example.invalid`,passwordHash:'owned-fixture',telegramId:placeholder?tg:null}});ids.push(user.id);return user}
async function main(){
 assert.match(process.env.DATABASE_URL||'',/^postgres/);
 const identity=load('src/modules/identity/telegram-account.ts'),target=await account(),source=await account(true),other=await account();
 const tg={id:Number(source.telegramId),first_name:'Owned fixture'};
 await db.walletAccount.create({data:{userId:source.id,currency:'USD',balanceMinor:321n}});
 const profile=await db.userProfile.create({data:{userId:source.id,username:stamp,bio:'kept biography',headline:'owned',privacy:'{"messages":"none"}',links:'[{"url":"https://example.invalid"}]',createdAt:new Date('2020-01-02'),updatedAt:new Date('2021-02-03')}});
 async function refuse(label){
  const before=await db.user.findMany({where:{id:{in:[source.id,target.id]}},orderBy:{id:'asc'}}),wallets=await db.walletAccount.findMany({where:{userId:{in:[source.id,target.id]}},orderBy:{id:'asc'}});
  const result=await identity.attachTelegramToUser(target.id,tg);assert.equal(result.ok,false,label);assert.equal(result.code,'UNSAFE_SOURCE',label);
  assert.deepEqual(await db.user.findMany({where:{id:{in:[source.id,target.id]}},orderBy:{id:'asc'}}),before,label+' identity unchanged');
  assert.deepEqual(await db.walletAccount.findMany({where:{userId:{in:[source.id,target.id]}},orderBy:{id:'asc'}}),wallets,label+' money unchanged');
  assert.deepEqual(await db.userProfile.findUnique({where:{username:stamp}}),profile,label+' public profile unchanged');
 }
 await db.userProfile.create({data:{userId:target.id,username:stamp+'-target'}});await refuse('two profile collision');await db.userProfile.delete({where:{userId:target.id}});
 for(const [model,field,otherField]of [['userFollow','followerId','followingId'],['userFollow','followingId','followerId'],['userBlock','blockerId','blockedId'],['userBlock','blockedId','blockerId']]){
  const row=await db[model].create({data:{[field]:source.id,[otherField]:other.id}});await refuse(model+'.'+field);assert.deepEqual(await db[model].findUnique({where:{id:row.id}}),row);await db[model].delete({where:{id:row.id}});
 }
 const playlist=await db.userMusicPlaylist.create({data:{userId:source.id,title:stamp}});await refuse('personal playlist preserved');assert.deepEqual(await db.userMusicPlaylist.findUnique({where:{id:playlist.id}}),playlist);await db.userMusicPlaylist.delete({where:{id:playlist.id}});
 const referral=await db.referralCode.create({data:{ownerId:source.id,code:stamp}});await refuse('scalar referral owner');await db.referralCode.delete({where:{id:referral.id}});
 await db.loyaltyAccount.create({data:{userId:source.id,balance:20,lifetime:30}});await refuse('scalar loyalty');assert.equal((await db.loyaltyAccount.findUnique({where:{userId:source.id}})).balance,20);await db.loyaltyAccount.delete({where:{userId:source.id}});
 for(const [field,value,original]of [['emailAlerts',false,true],['playbackPrefs','{"audio":"fa"}','{}'],['profileData','{"city":"owned"}','{}'],['recommendationOptIn',true,false]]){await db.user.update({where:{id:source.id},data:{[field]:value}});await refuse(field+' policy');await db.user.update({where:{id:source.id},data:{[field]:original}})}
 const beforeFailure=await db.user.findMany({where:{id:{in:[source.id,target.id]}},orderBy:{id:'asc'}}),walletBeforeFailure=await db.walletAccount.findMany({where:{userId:{in:[source.id,target.id]}},orderBy:{id:'asc'}});
 failProfile=true;try{await assert.rejects(identity.attachTelegramToUser(target.id,tg),/owned profile storage failure/)}finally{failProfile=false}
 assert.deepEqual(await db.user.findMany({where:{id:{in:[source.id,target.id]}},orderBy:{id:'asc'}}),beforeFailure);assert.deepEqual(await db.walletAccount.findMany({where:{userId:{in:[source.id,target.id]}},orderBy:{id:'asc'}}),walletBeforeFailure);assert.deepEqual(await db.userProfile.findUnique({where:{username:stamp}}),profile);
 const result=await identity.attachTelegramToUser(target.id,tg);assert.deepEqual(result,{ok:true,userId:target.id,merged:true});
 assert.equal(await db.user.findUnique({where:{id:source.id}}),null);
 assert.deepEqual(await db.userProfile.findUnique({where:{username:stamp}}),{...profile,userId:target.id});assert.equal((await db.walletAccount.findUnique({where:{userId_currency:{userId:target.id,currency:'USD'}}})).balanceMinor,321n);
 const claimant=await account(true);await db.userProfile.create({data:{userId:claimant.id,username:stamp+'-claim'}});const claimed=await identity.claimTelegramAccount({tg:{id:Number(claimant.telegramId)},email:stamp+'-claimed@example.invalid',passwordHash:'owned-new-hash'});assert.equal(claimed.ok,true);assert.equal(claimed.userId,claimant.id);assert.equal((await db.userProfile.findUnique({where:{username:stamp+'-claim'}})).userId,claimant.id);
 console.log('Telegram merge safety: actual PG/Identity; exact profile/username/dates retained, collision/social graph/playlist/scalar ownership/preferences refuse before effects, injected profile-write failure rolls back actual wallet/identity SQL, wallet retained, same-ID claim preserved');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{try{
 await db.userFollow.deleteMany({where:{OR:[{followerId:{in:ids}},{followingId:{in:ids}}]}});await db.userBlock.deleteMany({where:{OR:[{blockerId:{in:ids}},{blockedId:{in:ids}}]}});await db.referralCode.deleteMany({where:{ownerId:{in:ids}}});await db.loyaltyAccount.deleteMany({where:{userId:{in:ids}}});await db.userMusicPlaylist.deleteMany({where:{userId:{in:ids}}});await db.userProfile.deleteMany({where:{userId:{in:ids}}});await db.walletAccount.deleteMany({where:{userId:{in:ids}}});await db.user.deleteMany({where:{id:{in:ids}}});
 }finally{await db.$disconnect()}});
