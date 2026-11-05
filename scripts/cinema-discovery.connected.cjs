// Native PostgreSQL evidence for the existing Cinema catalogue and people owners.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript-api'),{PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server')
const db=new PrismaClient(),stamp='cdiscovery'+Date.now()+process.pid,cache=new Map()
let broken=false
const guardedDb=new Proxy(db,{get(target,key){if(key==='cinemaTitle'&&broken)return new Proxy(target.cinemaTitle,{get(){return async()=>{throw Error('deliberate database outage')}}});return typeof target[key]==='function'?target[key].bind(target):target[key]}})
function load(file){
 const p=path.resolve(file),full=fs.existsSync(p)&&fs.statSync(p).isFile()?p:['.ts','/index.ts'].map(ext=>p+ext).find(fs.existsSync)
 if(!full)throw Error('Missing '+file);if(cache.has(full))return cache.get(full).exports
 if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'))
 const mod={exports:{}};cache.set(full,mod)
 const code=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
 new Function('require','module','exports',code)(name=>{
  if(name==='@/platform/database/prisma')return{db:guardedDb}
  if(name==='@/modules/media/server/queries/music')return{allOrEmpty:async work=>work()}
  if(name==='@/modules/recommendations/server/contextual')return{relatedCinema:async()=>[]}
  if(name==='@/extensions/server/modules')return{moduleGuard:async()=>null}
  if(name==='@/platform/http/rate-limit')return{clientIp:()=>stamp,rateLimitHit:()=>({ok:true})}
  return name.startsWith('@/')?load('src/'+name.slice(2)):name.startsWith('.')?load(path.resolve(path.dirname(full),name)):require(name)
 },mod,mod.exports);return mod.exports
}
async function main(){try{
 const {normalizePersonName}=load('src/modules/cinema/domain/people.ts'),people=load('src/modules/cinema/server/people.ts'),{browseCinema}=load('src/modules/media/server/queries/cinema.ts'),http=load('src/modules/cinema/server/http/people-search.ts')
 const person=async name=>db.cinemaPerson.create({data:{name:stamp+' '+name,normalizedName:normalizePersonName(stamp+' '+name)}})
 const star=await person('Star'),director=await person('Director'),hidden=await person('Hidden'),extra=await person('Uncredited')
 await db.cinemaPerson.update({where:{id:star.id},data:{name:stamp+' Curated',displayNameKey:normalizePersonName(stamp+' Curated')}})
 const past=new Date(Date.now()-10000)
 await db.cinemaTitle.createMany({data:Array.from({length:26},(_,i)=>({slug:stamp+'-'+i,title:stamp+' '+i,kind:'MOVIE',genres:'Drama',countries:'US',year:2020,dubbed:true,status:'PUBLISHED',publishedAt:past,imdbRating:7}))})
 const films=await db.cinemaTitle.findMany({where:{slug:{startsWith:stamp+'-'}},orderBy:{id:'asc'},select:{id:true}})
 const addTitle=async(key,data)=>db.cinemaTitle.create({data:{slug:stamp+'-'+key,title:stamp+' '+key,kind:'MOVIE',status:'PUBLISHED',publishedAt:past,...data}})
 const series=await addTitle('series',{kind:'SERIES',year:2023,genres:'Comedy',countries:'CA',imdbRating:9})
 const directedOnly=await addTitle('directed-only',{}),draft=await addTitle('draft',{status:'DRAFT'}),future=await addTitle('future',{publishedAt:new Date(Date.now()+86400000)})
 await db.cinemaCredit.createMany({data:[
  ...films.flatMap(t=>[{titleId:t.id,personId:star.id,role:'CAST'},{titleId:t.id,personId:director.id,role:'DIRECTOR'}]),
  {titleId:films[0].id,personId:star.id,role:'DIRECTOR'},
  ...[series,draft,future].map(t=>({titleId:t.id,personId:star.id,role:'CAST'})),
  {titleId:directedOnly.id,personId:star.id,role:'DIRECTOR'},
  {titleId:draft.id,personId:hidden.id,role:'CAST'},{titleId:future.id,personId:hidden.id,role:'CAST'},
 ]})
 const list=await browseCinema({actor:String(star.id),sort:'imdb'});assert.equal(list.total,27);assert.equal(list.titles.length,24);assert.equal(list.titles[0].id,series.id)
 assert.ok(list.titles.every(t=>![draft.id,future.id,directedOnly.id].includes(t.id)),'CAST and publication constraints are real')
 const second=await browseCinema({actor:String(star.id),sort:'imdb',page:2});assert.equal(second.total,27);assert.equal(second.titles.length,3);assert.equal(new Set([...list.titles,...second.titles].map(t=>t.id)).size,27)
 assert.equal((await browseCinema({actor:String(star.id),kind:'MOVIE',genre:'Drama',year:'2020',country:'US',dubbed:'1',q:stamp.toUpperCase()})).total,26)
 assert.equal((await browseCinema({actor:String(star.id),director:String(director.id)})).total,26)
 const directed=await browseCinema({director:String(star.id)});assert.equal(directed.total,2);assert.ok(directed.titles.some(t=>t.id===directedOnly.id))
 for(const actor of ['bad','1.5','-1','2147483648',String(hidden.id),String(extra.id)])assert.equal((await browseCinema({actor})).total,0)
 assert.equal((await browseCinema({ids:[],actor:String(star.id)})).total,0)
 const last=await browseCinema({actor:String(star.id),page:999});assert.equal(last.page,2);assert.equal(last.titles.length,3)
 const names=await people.peopleDirectory({q:stamp+' star',role:'CAST'});assert.equal(names.people[0].id,star.id);assert.equal(names.people[0].titles,27)
 assert.equal((await people.peopleDirectory({q:stamp+' curated',role:'CAST'})).people[0].id,star.id)
 assert.equal((await people.peopleDirectory({q:stamp+' director',role:'CAST'})).total,0)
 assert.equal((await people.peopleDirectory({q:stamp+' hidden',role:'CAST'})).total,0)
 assert.equal((await people.peopleDirectory({q:stamp+' curated'})).people[0].titles,28,'one title with two roles counts once')
 const profile=await people.personPage(star.id);assert.equal(profile.castCount,27);assert.equal(profile.directorCount,2)
 assert.equal(await people.publicPersonChoice(hidden.id,'CAST'),null);assert.equal(await people.publicPersonChoice(director.id,'CAST'),null);assert.equal((await people.publicPersonChoice(director.id,'DIRECTOR')).id,director.id)
 const response=await http.GET(new NextRequest('http://localhost:3000/api/cinema/people?q='+stamp+'%20curated&role=CAST'));assert.equal(response.status,200);const options=(await response.json()).options;assert.deepEqual(options.map(row=>row.id),[star.id]);assert.deepEqual(Object.keys(options[0]).sort(),['id','image','name'])
 for(let i=0;i<15;i++){const option=await person('Option '+i);await db.cinemaCredit.create({data:{titleId:films[0].id,personId:option.id,role:'CAST'}})}
 const choices=await people.publicPeopleChoices({q:stamp+' Option',role:'CAST'});assert.equal(choices.length,12);assert.deepEqual(Object.keys(choices[0]).sort(),['id','image','name'])
 const prolific=await person('Prolific')
 await db.cinemaTitle.createMany({data:Array.from({length:302},(_,i)=>({slug:stamp+'-long-'+i,title:stamp+' long '+i,kind:'MOVIE',status:'PUBLISHED',publishedAt:past}))})
 const longTitles=await db.cinemaTitle.findMany({where:{slug:{startsWith:stamp+'-long-'}},select:{id:true}})
 await db.cinemaCredit.createMany({data:longTitles.map(title=>({titleId:title.id,personId:prolific.id,role:'CAST'}))})
 const longProfile=await people.personPage(prolific.id);assert.equal(longProfile.acted.length,300);assert.equal(longProfile.castCount,302);assert.equal((await browseCinema({actor:String(prolific.id),page:13})).titles.length,14)
 broken=true;assert.equal((await browseCinema({actor:String(star.id)})).unavailable,true);broken=false
 console.log('Cinema discovery PostgreSQL: exact CAST/DIRECTOR and live credits, curated/original names, AND filters, stable24+3 paging/clamping, invalid IDs/empty lists, unique counts, true role totals, bounded public projection and explicit DB outage passed.')
}finally{
 await db.cinemaTitle.deleteMany({where:{slug:{startsWith:stamp+'-'}}});await db.cinemaPerson.deleteMany({where:{normalizedName:{startsWith:stamp}}});await db.$disconnect()
}}
main().catch(error=>{console.error(error);process.exitCode=1})
