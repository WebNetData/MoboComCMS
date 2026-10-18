const assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client'),db=new PrismaClient(),stamp='pmerge'+Date.now()+process.pid
const state={enabled:true,follow:true},load=require('./connected-source-loader.cjs')({
 '@/platform/database/prisma':{db},'@/platform/observability/logger':{logEvent:()=>{}},
 '@/extensions/server/modules':{isModuleEnabled:async()=>state.enabled,getModuleStates:async()=>state.enabled?{}:{cinema:false,music:false},getModuleSettings:async()=>({})},
 '@/modules/cinema/server/admin':{getCinemaSettings:async()=>({personFollowEnabled:state.follow})},
 '@/modules/content/server/events':{contentChanged:()=>{},MEDIA_RESOURCE_TYPE:{}},
 react:{...require('react'),cache:fn=>fn},
})
async function main(){try{
 const {normalizePersonName}=load('src/modules/cinema/domain/people.ts'),cinema=load('src/modules/cinema/server/person-merge.ts'),music=load('src/modules/music/server/artist-merge.ts'),people=load('src/modules/cinema/server/people.ts'),registry=load('src/modules/content/server/registry.ts')
 const user=await db.user.create({data:{email:stamp+'@example.invalid',passwordHash:'unused'}}),audit=tx=>tx.auditLog.create({data:{actorUserId:user.id,actorEmail:user.email,action:stamp,targetType:'profile',targetId:'owned'}})
 const person=name=>db.cinemaPerson.create({data:{name:stamp+' '+name,normalizedName:normalizePersonName(stamp+' '+name)}})
 const source=await person('Source'),target=await person('Target'),other=await person('Other')
 await db.cinemaPerson.update({where:{id:source.id},data:{image:'/files/owned.webp',bio:'owned source bio'}})
 await db.cinemaPerson.update({where:{id:target.id},data:{image:'',imageLocked:true}})
 const title=await db.cinemaTitle.create({data:{slug:stamp,title:stamp,kind:'MOVIE',status:'PUBLISHED',publishedAt:new Date(Date.now()-10000),cast:JSON.stringify([{name:source.name},{name:target.name}]),director:source.name}})
 await db.$transaction(tx=>people.syncCredits(tx,title.id))
 const oldFollow=new Date(Date.now()-20000)
 await db.itemFavorite.createMany({data:[{userId:user.id,itemType:'person',itemId:source.id,notify:true,createdAt:oldFollow},{userId:user.id,itemType:'person',itemId:target.id,notify:false}]})
 let preview=await cinema.cinemaMergePreview(source.id,target.id)
 const input={sourceId:source.id,targetId:target.id,sourceVersion:preview.sourceVersion,targetVersion:preview.targetVersion}
 await assert.rejects(cinema.mergeCinemaPeople(input,async()=>{throw Error('owned audit failure')}),/owned audit failure/)
 assert.equal((await db.cinemaPerson.findUnique({where:{id:source.id}})).mergedIntoId,null,'audit failure rolls back the merge and claims')
 await cinema.mergeCinemaPeople(input,audit)
 const settled=await db.cinemaPerson.findUnique({where:{id:target.id}}),follow=await db.itemFavorite.findUnique({where:{userId_itemType_itemId:{userId:user.id,itemType:'person',itemId:target.id}}})
 assert.equal(settled.image,'','a deliberately cleared locked target portrait wins');assert.equal(settled.bio,'owned source bio')
 assert.equal(follow.notify,true);assert.equal(follow.createdAt.getTime(),oldFollow.getTime());assert.equal(await db.itemFavorite.count({where:{itemType:'person',itemId:source.id}}),0)
 assert.equal(await db.cinemaCredit.count({where:{titleId:title.id,personId:target.id}}),2,'duplicate CAST deduplicated, DIRECTOR role retained')
 await db.$transaction(tx=>people.syncCredits(tx,title.id));assert.equal(await db.cinemaCredit.count({where:{titleId:title.id,personId:source.id}}),0,'future imported source matching stays canonical')
 assert.equal((await people.personPage(source.id)).id,target.id)
 assert.equal((await registry.itemCard({type:'person',id:source.id})).url,'/cinema/people/'+target.id,'old collection references resolve to the retained target')
 const {browseCinema}=load('src/modules/media/server/queries/cinema.ts');assert.ok((await browseCinema({actor:String(source.id)})).titles.some(row=>row.id===title.id),'old actor filter URLs remain usable')
 await assert.rejects(cinema.mergeCinemaPeople(input,audit),e=>e.status===409)
 await assert.rejects(cinema.cinemaMergePreview(target.id,target.id),e=>e.status===422)
 await assert.rejects(db.cinemaPerson.delete({where:{id:target.id}}),'a canonical target with retained aliases cannot be deleted accidentally')
 const actor=name=>db.musicArtist.create({data:{slug:stamp+'-'+name,name:stamp+' '+name,createdById:user.id}}),singer=await actor('singer-source'),main=await actor('singer-target')
 const album=await db.musicAlbum.create({data:{slug:stamp,title:stamp,artistId:singer.id,createdById:user.id}}),track=await db.musicTrack.create({data:{slug:stamp,title:stamp,artistId:singer.id,albumId:album.id,createdById:user.id}})
 await db.itemFavorite.create({data:{userId:user.id,itemType:'artist',itemId:singer.id}})
 preview=await music.artistMergePreview(singer.id,main.id)
 const musicInput={sourceId:singer.id,targetId:main.id,sourceVersion:preview.sourceVersion,targetVersion:preview.targetVersion}
 await assert.rejects(music.mergeMusicArtists(musicInput,async()=>{throw Error('owned audit failure')}),/owned audit failure/)
 await music.mergeMusicArtists(musicInput,audit)
 const moved=await db.musicTrack.findUnique({where:{id:track.id}})
 assert.deepEqual([moved.artistId,moved.albumId,moved.createdById],[main.id,album.id,user.id]);assert.equal((await db.musicAlbum.findUnique({where:{id:album.id}})).artistId,main.id)
 assert.equal((await load('src/modules/media/server/queries/music.ts').getArtist(singer.slug)).artist.slug,main.slug)
 assert.equal((await registry.itemCard({type:'artist',id:singer.id})).url,'/music/artist/'+main.slug)
 assert.equal(await db.itemFavorite.count({where:{userId:user.id,itemType:'artist',itemId:main.id}}),1)
 // Actual canonical notification writer, bounded queue pages, dedupe and current disabled-state checks.
 const subscribers=Array.from({length:101},(_,index)=>({email:`${stamp}-${index}@example.invalid`,passwordHash:'unused'}));await db.user.createMany({data:subscribers})
 const members=await db.user.findMany({where:{email:{startsWith:stamp+'-'}},select:{id:true}})
 await db.itemFavorite.createMany({data:members.map(member=>({userId:member.id,itemType:'person',itemId:other.id,createdAt:oldFollow}))})
 await db.cinemaCredit.create({data:{titleId:title.id,personId:other.id,role:'CAST'}})
 const notifications=load('src/modules/cinema/server/people-notifications.ts'),payload={titleId:title.id,personId:other.id,dueAt:new Date().toISOString(),cursor:0}
 const first=await notifications.deliverPeoplePublication(payload),second=await notifications.deliverPeoplePublication({...payload,cursor:first.cursor})
 assert.deepEqual([first.done,first.sent,second.done,second.sent],[false,100,true,1]);await notifications.deliverPeoplePublication(payload)
 assert.equal(await db.userNotification.count({where:{userId:{in:members.map(member=>member.id)},dedupeKey:{startsWith:`cinema:person:${other.id}:title:${title.id}:`}}}),101,'retry cannot duplicate notices')
 state.enabled=false;assert.equal((await notifications.deliverPeoplePublication(payload)).sent,0);state.enabled=true;state.follow=false;assert.equal((await notifications.deliverPeoplePublication(payload)).sent,0)
 console.log('PostgreSQL profile merges: canonical IDs/URLs/credits/import matching/favorites/earliest subscription, music FK/creator retention, strict audit rollback, stale/self/deletion refusal and bounded/deduplicated/disabled people notifications passed')
 }finally{
  const users=await db.user.findMany({where:{email:{startsWith:stamp}},select:{id:true}}),userIds=users.map(row=>row.id),persons=await db.cinemaPerson.findMany({where:{name:{startsWith:stamp}},select:{id:true}}),personIds=persons.map(row=>row.id),artists=await db.musicArtist.findMany({where:{slug:{startsWith:stamp}},select:{id:true}}),artistIds=artists.map(row=>row.id),titles=await db.cinemaTitle.findMany({where:{slug:stamp},select:{id:true}}),titleIds=titles.map(row=>row.id)
  await db.userNotification.deleteMany({where:{userId:{in:userIds}}});await db.itemFavorite.deleteMany({where:{userId:{in:userIds}}});await db.itemStat.deleteMany({where:{OR:[{itemType:'person',itemId:{in:personIds}},{itemType:'artist',itemId:{in:artistIds}}]}})
  await db.backgroundJob.deleteMany({where:{kind:'cinema.person-publication',OR:personIds.map(id=>({dedupeKey:{startsWith:`cinema-person:${id}:`}}))}})
  await db.cinemaTitle.deleteMany({where:{id:{in:titleIds}}});await db.cinemaPerson.updateMany({where:{id:{in:personIds}},data:{mergedIntoId:null}});await db.cinemaPerson.deleteMany({where:{id:{in:personIds}}})
  await db.musicTrack.deleteMany({where:{slug:stamp}});await db.musicAlbum.deleteMany({where:{slug:stamp}});await db.musicArtist.updateMany({where:{id:{in:artistIds}},data:{mergedIntoId:null}});await db.musicArtist.deleteMany({where:{id:{in:artistIds}}})
  await db.auditLog.deleteMany({where:{actorUserId:{in:userIds}}});await db.user.deleteMany({where:{id:{in:userIds}}});await db.$disconnect()
 }}
main().catch(error=>{console.error(error);process.exitCode=1})
