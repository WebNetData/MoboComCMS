const assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client')
assert(/test|check/i.test(new URL(process.env.DATABASE_URL).pathname),'disposable database required')
const db=new PrismaClient(),stamp='searchcorrection'+Date.now(),ids=[],off=new Set(),closed=new Set()
const load=require('./connected-source-loader.cjs')({
 '@/platform/database/prisma':{db},react:{...require('react'),cache:fn=>fn},
 '@/extensions/server/modules':{isModuleEnabled:async id=>!off.has(id),getModuleStates:async()=>Object.fromEntries([...off].map(id=>[id,false]))},
 '@/modules/site/server/maintenance':{closedSectionPlugins:async()=>closed},
 '@/modules/analytics/server/collect':{recordSearch:async()=>{}},
})
const search=load('src/modules/search/server/search.ts')
let oldIndex
async function create(title){const row=await db.cinemaTitle.create({data:{slug:stamp+'-'+ids.length,title,status:'PUBLISHED',publishedAt:new Date(Date.now()-60000)}});ids.push(row.id);await search.reindexItem({type:'title',id:row.id});return row}
async function main(){
 oldIndex=await db.setting.findUnique({where:{key:'search.indexedAt'}});await db.setting.upsert({where:{key:'search.indexedAt'},create:{key:'search.indexedAt',value:new Date().toISOString()},update:{value:new Date().toISOString()}})
 const row=await create(stamp+' Nebula')
 assert.equal((await search.searchSite({q:stamp+' Nebulla',type:'title',log:false})).total,0)
 assert.equal(await search.suggestSearchCorrection(stamp+' Nebulla','title'),stamp+' nebula')
 assert.equal(await search.suggestSearchCorrection(stamp+' Nebulla','product'),null)
 await db.cinemaTitle.update({where:{id:row.id},data:{status:'DRAFT'}});assert.equal(await search.suggestSearchCorrection(stamp+' Nebulla','title'),null)
 await db.cinemaTitle.update({where:{id:row.id},data:{status:'PUBLISHED'}})
 closed.add('cinema');assert.equal(await search.suggestSearchCorrection(stamp+' Nebulla','title'),null);closed.clear()
 off.add('cinema');assert.equal(await search.suggestSearchCorrection(stamp+' Nebulla','title'),null);off.clear()
 off.add('search');assert.equal(await search.suggestSearchCorrection(stamp+' Nebulla','title'),null);off.clear()
 await create(stamp+' Nebulla');assert.equal((await search.searchSite({q:stamp+' Nebulla',type:'title',log:false})).total,1,'exact query owner unchanged')
 console.log('Search correction native passed: one-edit recovery, type isolation, withdrawn source, maintenance/module-off and unchanged exact results')
}
main().finally(async()=>{await db.searchDocument.deleteMany({where:{itemType:'title',itemId:{in:ids}}});await db.cinemaTitle.deleteMany({where:{id:{in:ids}}});if(oldIndex)await db.setting.upsert({where:{key:oldIndex.key},create:{key:oldIndex.key,value:oldIndex.value},update:{value:oldIndex.value}});else await db.setting.deleteMany({where:{key:'search.indexedAt'}});await db.$disconnect()}).catch(e=>{console.error(e);process.exitCode=1})
