// Real canonical people/credits and optimistic writes. Only this run's rows are removed.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),{PrismaClient}=require('@prisma/client')
const db=new PrismaClient(),stamp='profilecheck'+Date.now()+process.pid,cache=new Map()
function load(file){
 const p=path.resolve(file),full=fs.existsSync(p)&&fs.statSync(p).isFile()?p:['.ts','/index.ts'].map(ext=>p+ext).find(fs.existsSync)
 if(!full)throw Error('Missing '+file)
 if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'))
 if(cache.has(full))return cache.get(full).exports
 const mod={exports:{}};cache.set(full,mod)
 const code=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
 new Function('require','module','exports',code)(name=>{
  if(name==='@/platform/database/prisma')return{db}
  if(name==='@/platform/observability/logger')return{logEvent:()=>{}}
  if(name==='react')return{...require('react'),cache:fn=>fn}
  return name.startsWith('@/')?load('src/'+name.slice(2)):name.startsWith('.')?load(path.resolve(path.dirname(full),name)):require(name)
 },mod,mod.exports);return mod.exports
}
async function main(){try{
 const admin=load('src/modules/cinema/server/person-admin.ts'),people=load('src/modules/cinema/server/people.ts'),{normalizePersonName}=load('src/modules/cinema/domain/people.ts')
 const audit=(tx,id)=>tx.auditLog.create({data:{actorUserId:0,actorEmail:stamp+'@example.invalid',action:stamp,targetType:'cinema-person',targetId:String(id)}})
 const name=stamp+' Actor',input={name,image:'/files/manual.webp',bio:'<p>Owned <strong>biography</strong></p><script>bad()</script>',imageLocked:true}
 const person=await admin.savePerson(input,audit),originalKey=person.normalizedName
 assert.match(person.bio,/<strong>biography<\/strong>/);assert.doesNotMatch(person.bio,/<script/)
 assert.equal(await people.personPage(person.id),null,'uncredited profile is private')
 await assert.rejects(admin.savePerson({...input,name:name.toUpperCase()},audit),e=>e.status===409)
 const title=await db.cinemaTitle.create({data:{slug:stamp,title:stamp,kind:'MOVIE',status:'PUBLISHED',publishedAt:new Date(Date.now()-1000),director:name,cast:JSON.stringify([{name,role:'Hero',image:'https://m.media-amazon.com/images/new.jpg'}])}})
 await db.$transaction(tx=>people.syncCredits(tx,title.id))
 assert.equal((await db.cinemaPerson.findUniqueOrThrow({where:{id:person.id}})).image,input.image,'manual image survives both cast and director sync')
 assert.equal((await people.personPage(person.id)).acted[0],title.id)
 const edit={...input,id:person.id,profileVersion:person.profileVersion,name:stamp+' نمایش تازه'}
 const races=await Promise.allSettled([admin.savePerson(edit,audit),admin.savePerson(edit,audit)])
 assert.equal(races.filter(r=>r.status==='fulfilled').length,1);assert.equal(races.find(r=>r.status==='rejected').reason.status,409)
 let current=await admin.adminPerson(person.id);assert.equal(current.normalizedName,originalKey);assert.equal(current.credits.length,2)
 const before=await db.auditLog.count({where:{action:stamp}})
 await assert.rejects(admin.savePerson({...edit,profileVersion:current.profileVersion,name:stamp+' rollback'},async()=>{throw Error('deliberate audit failure')}),/deliberate audit failure/)
 assert.equal((await admin.adminPerson(person.id)).name,current.name);assert.equal(await db.auditLog.count({where:{action:stamp}}),before)
 assert.equal((await admin.adminPeople(new URLSearchParams({q:current.name,role:'CAST'}))).total,1)
 assert.equal((await people.peopleDirectory({q:current.name})).total,1)
 assert.equal((await people.peopleDirectory({q:name})).total,1,'source key remains searchable')
 for(const size of ['20','50','100','500','all'])assert.equal((await admin.adminPeople(new URLSearchParams({q:stamp,limit:size,page:'999'}))).people.length,1)
 await assert.rejects(admin.adminPeople(new URLSearchParams({limit:'3'})),e=>e.status===422)
 await assert.rejects(admin.adminPeople(new URLSearchParams({role:'admin'})),e=>e.status===422)
 await assert.rejects(admin.savePerson({...edit,id:2147483647},audit),e=>e.status===404)
 current=await admin.savePerson({...edit,profileVersion:current.profileVersion,image:''},audit)
 await db.$transaction(tx=>people.syncCredits(tx,title.id))
 assert.equal((await admin.adminPerson(person.id)).image,'','intentionally blank manual image stays blank')
 const photos=await people.storedPersonPhotoStates([name]);assert.deepEqual(photos.get(originalKey),{image:'',locked:true})
 assert.equal((await people.creditProfiles(title.id)).get(originalKey).image,'')
 current=await admin.savePerson({...edit,profileVersion:current.profileVersion,image:'',imageLocked:false},audit)
 await db.$transaction(tx=>people.syncCredits(tx,title.id))
 const unlocked=await admin.adminPerson(person.id);assert.match(unlocked.image,/new\.jpg$/);assert.equal(unlocked.profileVersion,current.profileVersion+1)
 assert.equal(await db.cinemaPerson.count({where:{normalizedName:originalKey}}),1,'display edit cannot fork canonical identity')
 assert.equal((await db.cinemaTitle.findUniqueOrThrow({where:{id:title.id}})).director,name,'stored source names unchanged')
 await db.cinemaTitle.updateMany({where:{id:title.id,status:'PUBLISHED'},data:{status:'DRAFT'}})
 assert.equal(await people.personPage(person.id),null);assert.equal((await people.peopleDirectory({q:stamp})).total,0)
 console.log('Cinema profiles PostgreSQL: create/dedupe, sanitized rich bio, simultaneous stale-write rejection, audit rollback, immutable identity/credits, dual-name search, 5 page sizes, manual image/blank locks, unlocked sync version, canonical title portraits and draft privacy passed.')
}finally{
 await db.cinemaTitle.deleteMany({where:{slug:stamp}});await db.cinemaPerson.deleteMany({where:{normalizedName:{startsWith:stamp}}});await db.auditLog.deleteMany({where:{action:stamp}});await db.$disconnect()
}}
main().catch(error=>{console.error(error);process.exitCode=1})
