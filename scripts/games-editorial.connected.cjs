// Real GamesHome reads; own rows only, with a fixture scope added to GameTitle queries.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript-api'),{PrismaClient}=require('@prisma/client')
const db=new PrismaClient(),stamp='games-editorial-'+Date.now()+'-'+process.pid,key='games.portal.v1',cache=new Map()
let journalReads=0,journalEnabled=true,configured
const scopedDb=new Proxy(db,{get(target,name){
 if(name==='gameTitle')return new Proxy(target.gameTitle,{get(delegate,method){return method==='findMany'?args=>delegate.findMany({...args,where:{AND:[args?.where||{},{slug:{startsWith:stamp}}]}}):Reflect.get(delegate,method)}})
 if(name==='post')return new Proxy(target.post,{get(delegate,method){return method==='findMany'?args=>{journalReads++;return delegate.findMany({...args,where:{AND:[args?.where||{},{slug:{startsWith:stamp}}]}})}:Reflect.get(delegate,method)}})
 return Reflect.get(target,name)
}})
function load(file){
 const p=path.resolve(file),full=fs.existsSync(p)&&fs.statSync(p).isFile()?p:['.ts','/index.ts'].map(ext=>p+ext).find(fs.existsSync)
 if(!full)throw Error('Missing '+file)
 if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'))
 if(cache.has(full))return cache.get(full).exports
 const mod={exports:{}};cache.set(full,mod)
 const code=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
 new Function('require','module','exports',code)(name=>{
  if(name==='@/platform/database/prisma')return{db:scopedDb}
  if(name==='@/extensions/server/modules')return{isModuleEnabled:async key=>key!=='journal'||journalEnabled,getModuleSettings:async()=>({})}
  if(name==='@/platform/observability/logger')return{logEvent:()=>{}}
  if(name==='react')return{...require('react'),cache:fn=>fn}
  return name.startsWith('@/')?load('src/'+name.slice(2)):name.startsWith('.')?load(path.resolve(path.dirname(full),name)):require(name)
 },mod,mod.exports);return mod.exports
}
async function main(){const previous=await db.setting.findUnique({where:{key}});try{
 const now=Date.now(),games=Array.from({length:4},(_,i)=>({slug:stamp+'-game-'+i,title:'بازی آزمون '+i,status:'PUBLISHED',publishedAt:new Date(now-(i+1)*1000),views:[20,200,40,0][i],cover:i===3?'':'/owned-game.webp',summary:'خلاصهٔ بازی',genres:'Action',platforms:'PC'}))
 await db.gameTitle.createMany({data:[...games,{...games[0],slug:stamp+'-draft',status:'DRAFT'},{...games[0],slug:stamp+'-future',publishedAt:new Date(now+86400000)}]})
 await db.post.createMany({data:[{slug:stamp+'-journal',title:'مطلب مجله',content:'Owned',cover:'/owned-journal.webp',status:'PUBLISHED'},{slug:stamp+'-journal-game',title:'بازی و اخبار مجله',content:'Owned',cover:'/owned-journal.webp',status:'PUBLISHED'}]})
 const portal=load('src/modules/games/server/portal.ts')
 async function configure(enabled){await portal.saveGamesSettings({rails:[{key:'news',enabled}],newsKeywords:['legacy-owned-keyword'],libraryEnabled:false});configured=(await db.setting.findUniqueOrThrow({where:{key}})).value}
 await configure(true)
 let home=await portal.gamesHome()
 assert.deepEqual(home.news.map(g=>g.slug),games.map(g=>g.slug),'the editorial block must contain actual Games posts in publication order')
 assert.deepEqual(home.base.popular.map(g=>g.slug),[games[1],games[2],games[0],games[3]].map(g=>g.slug),'the popular tab uses all published Games sorted by views')
 assert.ok(home.news.every(g=>g.genres[0]==='Action'&&g.summary==='خلاصهٔ بازی'))
 assert.equal(home.news.at(-1).cover,'','a game without artwork stays available with the UI placeholder')
 assert.equal(journalReads,0,'GamesHome must not query Journal posts')
 journalEnabled=false;assert.equal((await portal.gamesHome()).news.length,4,'disabling Journal cannot hide actual Games posts')
 await configure(false);home=await portal.gamesHome();assert.equal(home.news.length,0);assert.equal(home.base.latest.length,4);assert.deepEqual(home.settings.newsKeywords,['legacy-owned-keyword'],'stored legacy settings stay compatible')
 await configure(true)
 await db.gameTitle.updateMany({where:{slug:{in:games.slice(1).map(g=>g.slug)},status:'PUBLISHED'},data:{status:'DRAFT'}})
 assert.deepEqual((await portal.gamesHome()).news.map(g=>g.slug),[games[0].slug],'one real game must not trigger a magazine fallback')
 await db.gameTitle.updateMany({where:{slug:games[0].slug,status:'PUBLISHED'},data:{status:'DRAFT'}})
 assert.deepEqual((await portal.gamesHome()).news,[],'no Games means no Journal substitution')
 assert.equal(journalReads,0);assert.equal(await db.post.count({where:{slug:{startsWith:stamp}}}),2,'Journal content was not changed')
 console.log('Games editorial PostgreSQL: canonical Games only, newest/popular order, draft/future exclusion, coverless/single/empty states, Journal-off independence and Admin rail/legacy settings passed.')
}finally{
 await db.gameTitle.deleteMany({where:{slug:{startsWith:stamp}}});await db.post.deleteMany({where:{slug:{startsWith:stamp}}})
 if(configured){const restored=previous?await db.setting.updateMany({where:{key,value:configured},data:{value:previous.value}}):await db.setting.deleteMany({where:{key,value:configured}});assert.equal(restored.count,1,'preserve concurrently changed settings for owner review')}
 await db.$disconnect()
}}
main().catch(e=>{console.error(e);process.exitCode=1})
