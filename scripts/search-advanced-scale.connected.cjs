const assert=require('node:assert/strict'),{performance}=require('node:perf_hooks'),{PrismaClient}=require('@prisma/client')
const prisma=new PrismaClient(),stamp='sadvanced'+Date.now()+process.pid,COUNT=1105,metrics=[],fresh=new Date().toISOString()
let batches=0,dimensionRows=0,dimensionCalls=0,actor,artist
const db=new Proxy(prisma,{get(target,key){
 if(key==='setting')return{findUnique:async()=>({key:'search.indexedAt',value:fresh}),upsert:async()=>{}}
 if(key==='searchDocument')return new Proxy(target[key],{get(model,method){if(method==='findMany')return async args=>{assert.ok(args.take<=500);const result=await model.findMany(args);batches++;return result};return typeof model[method]==='function'?model[method].bind(model):model[method]}})
 if(key==='$queryRaw')return async(...args)=>{const result=await target.$queryRaw(...args);const sql=args[0]?.strings?.join(' ')||'';if(sql.includes('ItemReviewScore')){dimensionCalls++;assert.ok(result.length<=500);dimensionRows+=result.length}return result}
 return typeof target[key]==='function'?target[key].bind(target):target[key]
}})
const load=require('./connected-source-loader.cjs')({'@/platform/database/prisma':{db},'@/platform/observability/logger':{logEvent:()=>{}},'@/modules/analytics/server/collect':{recordSearch:async()=>{}},'@/extensions/server/modules':{isModuleEnabled:async()=>true,getModuleStates:async()=>({}),getModuleSettings:async()=>({})},react:{...require('react'),cache:fn=>fn}})
// An ISO epoch prevents a fixture from triggering the unrelated whole-site index rebuild.
const search=load('src/modules/search/server/search.ts')
async function main(){try{
 actor=await prisma.user.create({data:{email:stamp+'@example.invalid',passwordHash:'unused'}});artist=await prisma.musicArtist.create({data:{slug:stamp,name:stamp}})
 const start=Date.now()-COUNT*1000-10000
 await prisma.musicTrack.createMany({data:Array.from({length:COUNT},(_,n)=>({slug:stamp+'-'+n,title:stamp+' '+n,artistId:artist.id,status:'PUBLISHED',audioUrl:'/owned.mp3',publishedAt:new Date(start+n*1000)}))})
 const tracks=await prisma.musicTrack.findMany({where:{artistId:artist.id},orderBy:{id:'asc'}}),refs=tracks.map((row,n)=>({row,n,rating:n%5+1,score:n%4+2,approved:n%3!==0}))
 await prisma.searchDocument.createMany({data:tracks.map(row=>({itemType:'track',itemId:row.id,title:row.title,text:row.title.toLowerCase(),url:'/music/track/'+row.slug,publishedAt:row.publishedAt}))})
 await prisma.itemStat.createMany({data:refs.map(({row,rating})=>({itemType:'track',itemId:row.id,ratingSum:rating,ratingCount:1}))})
 await prisma.itemReview.createMany({data:refs.map(({row,rating,approved})=>({itemType:'track',itemId:row.id,userId:actor.id,rating,body:'owned scale score',status:approved?'APPROVED':'PENDING'}))})
 const reviews=await prisma.itemReview.findMany({where:{userId:actor.id},orderBy:{id:'asc'}})
 await prisma.itemReviewScore.createMany({data:reviews.map((review,n)=>({reviewId:review.id,key:'lyrics',score:refs[n].score}))})
 for(const facets of [{sort:'newest'},{sort:'rating'},{sort:'rating',dimension:'lyrics',dimensionMin:4}]){
  batches=0;dimensionRows=0;dimensionCalls=0;const started=performance.now(),heap=process.memoryUsage().heapUsed
  const result=await search.searchSite({q:stamp,type:'track',facets,log:false})
  const expected=refs.filter(row=>!facets.dimension||(row.approved&&row.score>=4)).sort((a,b)=>(facets.sort==='rating'?b.rating-a.rating:0)||b.n-a.n)
  assert.equal(result.total,expected.length);assert.deepEqual(result.hits.map(hit=>hit.id),expected.slice(0,20).map(row=>row.row.id))
  assert.equal(batches,3,'a late leader is found beyond two complete 500-row batches')
  const elapsedMs=Math.round(performance.now()-started),heapDeltaBytes=process.memoryUsage().heapUsed-heap
  metrics.push({facets,sourceCandidates:COUNT,batches,dimensionCalls,dimensionRows,returned:result.hits.length,eligible:result.total,elapsedMs,heapDeltaBytes})
  const next=await search.searchSite({q:stamp,type:'track',facets,log:false,cursor:result.nextCursor})
  assert.deepEqual(next.hits.map(hit=>hit.id),expected.slice(20,40).map(row=>row.row.id))
 }
 console.log('Advanced search bounded PostgreSQL sample (not a production load/SLA claim): '+JSON.stringify(metrics))
}finally{
 const ids=artist?(await prisma.musicTrack.findMany({where:{artistId:artist.id},select:{id:true}})).map(row=>row.id):[]
 await prisma.searchDocument.deleteMany({where:{itemType:'track',itemId:{in:ids}}});await prisma.itemStat.deleteMany({where:{itemType:'track',itemId:{in:ids}}});await prisma.itemReview.deleteMany({where:{itemType:'track',itemId:{in:ids}}});await prisma.musicTrack.deleteMany({where:{id:{in:ids}}});if(artist)await prisma.musicArtist.delete({where:{id:artist.id}});if(actor)await prisma.user.delete({where:{id:actor.id}});await prisma.$disconnect()
}}
main().catch(error=>{console.error(error);process.exitCode=1})
