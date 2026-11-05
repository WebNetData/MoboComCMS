// Real PostgreSQL and production SMS settings/crypto; delivery is recorded locally, never sent.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript-api'),{PrismaClient}=require('@prisma/client')
const db=new PrismaClient(),key='sms.config.v1',modules=new Map(),sent=[],stamp='owned-sms-settings-'+Date.now(),priorKey=process.env.PANEL_CREDENTIAL_KEY
const mocks={
 '@/platform/database/prisma':{db},'@/platform/config/env':{authSecret:()=>stamp},'@/platform/observability/logger':{logEvent:()=>{}},'@/modules/settings/server':{getSettings:async()=>({})},'@/platform/http/rate-limit':{},'@/modules/identity/server/otp-challenge':{},
 '@/modules/sms/server/ippanel':{sendText:async(apiKey,from,phones,text)=>{sent.push({apiKey,from,phones,text});return{ok:true,id:stamp}},credit:async()=>({ok:true,credit:4500})},
}
function load(relative){if(modules.has(relative))return modules.get(relative).exports;const mod={exports:{}};modules.set(relative,mod);const source=ts.transpileModule(fs.readFileSync(path.resolve(relative),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new Function('require','module','exports',source)(name=>Object.hasOwn(mocks,name)?mocks[name]:name.startsWith('@/')?load('src/'+name.slice(2)+'.ts'):require(name),mod,mod.exports);return mod.exports}
async function main(){let before,read=false,last
 try{
  before=await db.setting.findUnique({where:{key}});read=true;process.env.PANEL_CREDENTIAL_KEY=crypto.randomBytes(32).toString('hex')
  const owner=load('src/modules/sms/server/sms.ts'),apiKey='owned-synthetic-sms-key-'.padEnd(250,'x')
  const saved=await owner.saveSmsConfig({enabled:true,apiKey,fromNumber:'۳۰۰۰۵۰۵'});last=(await db.setting.findUniqueOrThrow({where:{key}})).value
  assert.match(saved.apiKey,/^encv1:/);assert(saved.apiKey.length>300);assert(!last.includes(apiKey))
  const config=await owner.getSmsConfig(),visible=owner.publicSmsConfig(config);assert.equal(config.apiKey,saved.apiKey);assert.equal(visible.ready,true);assert.equal(visible.fromNumber,'+983000505');assert.equal(visible.apiKey,'••••xxxx');assert.equal(await owner.smsCredit(),4500)
  await owner.saveSmsConfig({...visible,apiKey:''});last=(await db.setting.findUniqueOrThrow({where:{key}})).value;assert.equal((await owner.getSmsConfig()).apiKey,saved.apiKey)
  assert.deepEqual(await owner.broadcast({to:'phone',phone:'09121234567',text:stamp}),{sent:1,total:1});assert.equal(sent[0].apiKey,apiKey);assert.equal(sent[0].from,'+983000505')
  for(const fromNumber of ['wrong','12','']){await assert.rejects(owner.saveSmsConfig({...visible,fromNumber}),/شمارهٔ خط/);assert.equal((await db.setting.findUniqueOrThrow({where:{key}})).value,last)}
  await db.setting.update({where:{key},data:{value:'{invalid-sms-json'}});last='{invalid-sms-json';await assert.rejects(owner.getSmsConfig(),/تنظیمات پیامک/);await assert.rejects(owner.saveSmsConfig({...visible,enabled:false}),/تنظیمات پیامک/);assert.equal((await db.setting.findUniqueOrThrow({where:{key}})).value,last)
  console.log('SMS settings PostgreSQL passed: encrypted250-character key, save/read/masked resave, canonical sender, local delivery, invalid-save preservation and corrupt-read refusal')
 }finally{
  try{await db.smsLog.deleteMany({where:{providerId:stamp,body:stamp}});if(read&&last!==undefined){const restored=before?await db.setting.updateMany({where:{key,value:last},data:{value:before.value}}):await db.setting.deleteMany({where:{key,value:last}});assert.equal(restored.count,1,'Concurrent settings are preserved for operator review')}}finally{if(priorKey===undefined)delete process.env.PANEL_CREDENTIAL_KEY;else process.env.PANEL_CREDENTIAL_KEY=priorKey;await db.$disconnect()}
 }
}
main().catch(error=>{console.error(error);process.exitCode=1})
