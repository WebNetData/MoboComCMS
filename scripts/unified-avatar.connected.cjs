// Real Identity/Forum owners and PostgreSQL. External notifications/modules are isolated, never identity writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript-api'),{PrismaClient}=require('@prisma/client'),{File}=require('node:buffer')
const db=new PrismaClient(),stamp='avatar'+Date.now()+process.pid,cache=new Map(),files=[]
function load(file){
 const base=path.resolve(file),full=fs.existsSync(base)&&fs.statSync(base).isFile()?base:['.ts','.tsx','/index.ts'].map(ext=>base+ext).find(fs.existsSync)
 if(!full)throw Error('Missing '+file);if(cache.has(full))return cache.get(full).exports
 if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'))
 const mod={exports:{}};cache.set(full,mod)
 const code=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText
 new Function('require','module','exports',code)(name=>{
  if(name==='@/platform/database/prisma')return{db}
  if(name==='@/platform/config/env')return{authSecret:()=> 'owned-avatar-native-fixture'}
  if(name==='@/platform/observability/logger')return{logEvent:()=>{}}
  if(name==='@/modules/notifications/server/inbox')return{createInboxEvent:async()=>{}}
  if(name==='@/modules/notifications/server/telegram')return{}
  if(name==='@/modules/identity/telegram-account')return{}
  if(name==='@/extensions/server/modules')return{isModuleEnabled:async()=>false,getModuleSettings:async()=>({}),getModuleStates:async()=>({})}
  return name.startsWith('@/')?load('src/'+name.slice(2)):name.startsWith('.')?load(path.resolve(path.dirname(full),name)):require(name)
 },mod,mod.exports);return mod.exports
}
const viewer=userId=>({userId,member:false,moderator:false,staff:false,trustLevel:0,groupIds:[],silenced:false,suspended:false})
async function main(){try{
 const identity=load('src/modules/identity/server/profile.ts'),people=load('src/modules/forum/server/people.ts'),forum=load('src/modules/forum/server/forum.ts'),{authOptions}=load('src/modules/identity/auth.ts')
 const user=await db.user.create({data:{email:stamp+'@example.invalid',passwordHash:'test-only',name:'Owned Avatar',telegramPhoto:'https://example.invalid/telegram.png'}})
 const legacy=await db.user.create({data:{email:stamp+'-legacy@example.invalid',passwordHash:'test-only',name:'Owned Legacy'}})
 const legacyUrl='/api/forum/media/11111111-1111-4111-8111-111111111111.png'
 await db.forumProfile.create({data:{userId:user.id,username:(stamp+'u').slice(-20),avatar:legacyUrl}})
 await db.forumProfile.create({data:{userId:legacy.id,username:(stamp+'l').slice(-20),avatar:legacyUrl}})
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=','base64'),file=new File([bytes],'avatar.png',{type:'image/png'})
 const first=await identity.saveProfileMedia(user.id,file);files.push(['profile',first.url.split('/').at(-1)])
 const second=await people.saveProfileImage(user.id,file);files.push(['forum',second.url.split('/').at(-1)])
 assert.deepEqual((await identity.readProfileMedia(files[0][1])).bytes,bytes);assert.deepEqual((await people.readProfileImage(files[1][1])).bytes,bytes)
 assert.equal((await identity.myProfile(user.id)).avatar,legacyUrl,'upload alone is not a profile save')
 assert.equal((await identity.myProfile(legacy.id)).avatar,legacyUrl,'legacy forum media imports without moving URLs')
 assert.equal((await people.shellIdentity(legacy.id)).avatar,legacyUrl)
 const assertPicture=async(url,stored=url)=>{
  assert.equal((await identity.myProfile(user.id)).avatar,stored)
  assert.equal((await identity.profileCards([user.id])).get(user.id).avatar,stored)
  assert.equal((await people.profileForEdit(user.id)).profile.avatar,stored)
  assert.equal((await people.shellIdentity(user.id)).avatar,url)
  assert.equal((await forum.authorsFor([user.id])).get(user.id).avatar,url)
  const token=await authOptions.callbacks.jwt({token:{uid:String(user.id),authAt:Date.now()},session:{user:{image:'forged'}}})
  const session=await authOptions.callbacks.session({session:{user:{}},token})
  assert.equal(session.user.image,url||null,'session refresh reads the database, never client image')
 }
 await identity.updateUserProfile(user.id,{avatar:first.url})
 assert.equal((await db.forumProfile.findUnique({where:{userId:user.id}})).avatar,first.url);await assertPicture(first.url)
 await db.forumProfile.update({where:{userId:user.id},data:{avatar:legacyUrl}})
 await assertPicture(first.url)
 await people.updateProfile(viewer(user.id),{avatar:second.url})
 assert.equal((await db.forumProfile.findUnique({where:{userId:user.id}})).avatar,second.url);await assertPicture(second.url)
 for(const bad of [{title:'not-earned'},{primaryGroupId:2147483646}]){
  await assert.rejects(people.updateProfile(viewer(user.id),{avatar:first.url,...bad}),error=>error.status===403)
  await assertPicture(second.url)
 }
 await assert.rejects(people.updateProfile(viewer(null),{avatar:first.url}),error=>error.status===401)
 await assert.rejects(identity.updateUserProfile(user.id,{avatar:'https://example.invalid/arbitrary.jpg'}),error=>error.status===400)
 await assertPicture(second.url)
 await identity.updateUserProfile(user.id,{avatar:''})
 assert.equal((await db.forumProfile.findUnique({where:{userId:user.id}})).avatar,'')
 await db.forumProfile.update({where:{userId:user.id},data:{avatar:legacyUrl}})
 await assertPicture('https://example.invalid/telegram.png','')
 await db.user.update({where:{id:user.id},data:{telegramPhoto:''}})
 await assertPicture('','')
 console.log('Unified avatar PostgreSQL: real uploads/readback, unsaved isolation, both writers/mirrors, stale forum precedence, explicit removal/fallback, legacy URLs, session server authority, anonymous/invalid/forbidden saves and Core identity with Community off passed.')
}finally{
 for(const [folder,name]of files){assert.match(name,/^[0-9a-f-]{36}\.png$/);await fs.promises.unlink(path.join(process.cwd(),'storage',folder,name)).catch(error=>{if(error.code!=='ENOENT')throw error})}
 await db.user.deleteMany({where:{email:{startsWith:stamp}}});await db.$disconnect()
}}
main().catch(error=>{console.error(error);process.exitCode=1})
