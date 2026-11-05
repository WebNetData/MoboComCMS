// Real PostgreSQL owners, no .env, provider messages or production data. Session/module boundaries only are doubled.
const assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client')
const db=new PrismaClient(),stamp='owned-content-pdf-'+Date.now(),saved=new Map(),made=[],users=[]
let viewer={userId:null,member:false,opens:false},off=new Set()
const load=require('./connected-source-loader.cjs')({
 '@/platform/database/prisma':{db},'server-only':{},react:{cache:fn=>fn},
 '@/modules/membership/server/membership':{getViewer:async()=>viewer},
 '@/extensions/server/modules':{isModuleEnabled:async id=>!off.has(id),getModuleStates:async()=>({})},
 '@/modules/forum/server/forum':{getForumViewer:async()=>({...load('src/modules/forum/domain/community.ts').GUEST,userId:viewer.userId,member:viewer.member}),getTopic:(...args)=>load('src/modules/forum/server/forum.ts').getTopic(...args)},
 '@/modules/site/server/seo':{siteBase:async()=>'https://mobocom.net'},
})
const set=(key,value)=>db.setting.upsert({where:{key},create:{key,value:JSON.stringify(value)},update:{value:JSON.stringify(value)}})
const create=async(model,data)=>{const r=await db[model].create({data});made.push([model,r.id]);return r}
async function main(){try{
 for(const key of ['content.pdf.v1','site.maintenance.v1','site.section-access.v1','storeEnabled','forum.settings.v1'])saved.set(key,await db.setting.findUnique({where:{key}}))
 await set('site.maintenance.v1',{});await set('site.section-access.v1',{});await set('storeEnabled',true)
 const settings=load('src/modules/content/server/pdf/settings.ts'),common=load('src/modules/content/server/pdf/source-common.ts'),source=load('src/modules/content/server/pdf/source.ts').contentPdfSource
 await set('content.pdf.v1',{future:'preserved',assignments:{movie:{design:'cinema',future:'nested'}}})
 await Promise.all([settings.savePdfSettings({assignments:{movie:{design:'minimal'}}}),settings.savePdfSettings({assignments:{series:{design:'serial'}}}),settings.savePdfSettings({watermarkText:'OWNED WATERMARK'})])
 const state=await settings.getPdfSettings();assert.equal(state.assignments.movie.design,'minimal');assert.equal(state.assignments.series.design,'serial');assert.equal(state.watermarkText,'OWNED WATERMARK')
 const raw=JSON.parse((await db.setting.findUnique({where:{key:'content.pdf.v1'}})).value);assert.equal(raw.future,'preserved');assert.equal(raw.assignments.movie.future,'nested')
 await assert.rejects(()=>settings.savePdfSettings({watermarkKind:'image',watermarkImage:'https://evil.invalid/private.png'}),e=>e.status===422)
 const user=await create('user',{email:stamp+'@example.invalid',passwordHash:'fixture'});users.push(user.id)
 const post=await create('post',{slug:stamp,title:'مقالهٔ کامل',content:'<h2>متن کامل</h2><p>FULL-PUBLIC-BODY</p>',publishedAt:new Date(Date.now()-60000)})
 assert.match((await source({type:'post',id:post.id})).html,/FULL-PUBLIC-BODY/)
 await db.post.update({where:{id:post.id},data:{status:'DRAFT'}});await assert.rejects(()=>source({type:'post',id:post.id}),e=>e.status===404)
 await db.post.update({where:{id:post.id},data:{status:'PUBLISHED',publishedAt:new Date(Date.now()+3600000)}});await assert.rejects(()=>source({type:'post',id:post.id}),e=>e.status===404)
 await db.post.update({where:{id:post.id},data:{publishedAt:new Date(Date.now()-60000),audienceGroups:'group:999999'}});await assert.rejects(()=>source({type:'post',id:post.id}),e=>e.status===404)
 await db.post.update({where:{id:post.id},data:{audienceGroups:'',access:'MEMBERS'}});await assert.rejects(()=>source({type:'post',id:post.id}),e=>e.status===403)
 viewer={userId:user.id,member:true,opens:true};assert.match((await source({type:'post',id:post.id})).html,/FULL-PUBLIC-BODY/)
 viewer={userId:null,member:false,opens:false}
 await db.post.update({where:{id:post.id},data:{access:'PUBLIC'}})
 const rule=await create('membershipRule',{ownerType:'post',ownerId:post.id,minRank:1});await assert.rejects(()=>source({type:'post',id:post.id}),e=>e.status===403);await db.membershipRule.delete({where:{id:rule.id}})
 const prompt=await create('promptTemplate',{slug:stamp,title:'الگوی پولی',content:'PAID-SECRET owned template {{idea}}',status:'PUBLISHED',publishedAt:new Date(Date.now()-60000)})
 await create('paidItem',{ownerType:'prompt',ownerId:prompt.id,priceMinor:120000n})
 await assert.rejects(()=>source({type:'prompt',id:prompt.id}),e=>e.status===403)
 viewer={userId:user.id,member:false,opens:false};await assert.rejects(()=>source({type:'prompt',id:prompt.id}),e=>e.status===403)
 const purchase=await create('contentPurchase',{userId:user.id,ownerType:'prompt',ownerId:prompt.id,source:'ADMIN'});assert.match((await source({type:'prompt',id:prompt.id})).html,/PAID-SECRET/)
 await db.contentPurchase.update({where:{id:purchase.id},data:{revokedAt:new Date()}});await assert.rejects(()=>source({type:'prompt',id:prompt.id}),e=>e.status===403)
 await db.user.update({where:{id:user.id},data:{status:'SUSPENDED'}});await assert.rejects(()=>common.pdfViewer(),e=>e.status===403);viewer={userId:null,member:false,opens:false}
 const film=await create('cinemaTitle',{slug:stamp+'-film',title:'فیلم',kind:'MOVIE'}),series=await create('cinemaTitle',{slug:stamp+'-series',title:'سریال',kind:'SERIES',seasons:{create:{number:1,name:'فصل اول',episodes:{create:{number:1,title:'آغاز'}}}}})
 assert.equal((await source({type:'title',id:film.id})).kind,'movie');const doc=await source({type:'title',id:series.id});assert.equal(doc.kind,'series');assert.match(doc.html,/آغاز/)
 const product=await create('product',{slug:stamp,name:'محصول',description:'PUBLIC-PRODUCT',approval:'PENDING'});await assert.rejects(()=>source({type:'product',id:product.id}),e=>e.status===404)
 await db.product.update({where:{id:product.id},data:{approval:'APPROVED'}});assert.match((await source({type:'product',id:product.id})).html,/PUBLIC-PRODUCT/)
 const artist=await create('musicArtist',{slug:stamp,name:'هنرمند'}),album=await create('musicAlbum',{slug:stamp,title:'آلبوم',artistId:artist.id,audienceGroups:'group:999999'}),track=await create('musicTrack',{slug:stamp,title:'تک‌آهنگ',artistId:artist.id,albumId:album.id,lyrics:'PUBLIC-LYRICS',audioUrl:'https://secret.invalid/audio.mp3'})
 await assert.rejects(()=>source({type:'track',id:track.id}),e=>e.status===404)
 await db.musicAlbum.update({where:{id:album.id},data:{audienceGroups:''}});assert.ok(!JSON.stringify(await source({type:'track',id:track.id})).includes('secret.invalid'))
 const playlist=await create('musicPlaylist',{slug:stamp,title:'فهرست',trackIds:JSON.stringify([track.id])});assert.match((await source({type:'playlist',id:playlist.id})).html,/تک‌آهنگ/)
 await db.user.update({where:{id:user.id},data:{status:'ACTIVE'}})
 const category=await create('forumCategory',{slug:stamp,title:'انجمن آزمایشی'}),topic=await create('forumThread',{categoryId:category.id,userId:user.id,title:'گفتگوی PDF'}),first=await create('forumPost',{threadId:topic.id,userId:user.id,postNumber:1,content:'PUBLIC-FORUM-PDF'}),reply=await create('forumPost',{threadId:topic.id,userId:user.id,postNumber:2,content:'VISIBLE-REPLY'})
 assert.match((await source({type:'thread',id:topic.id})).html,/PUBLIC-FORUM-PDF/);assert.match((await source({type:'forum-post',id:reply.id})).html,/VISIBLE-REPLY/)
 assert.equal((await db.forumThread.findUnique({where:{id:topic.id}})).views,0,'PDF export never increments page views')
 await db.forumPost.update({where:{id:reply.id},data:{status:'HIDDEN'}});await assert.rejects(()=>source({type:'forum-post',id:reply.id}),e=>e.status===404)
 await db.forumCategory.update({where:{id:category.id},data:{access:'MEMBERS'}});await assert.rejects(()=>source({type:'thread',id:topic.id}),e=>e.status===404)
 off.add('music');await assert.rejects(()=>source({type:'track',id:track.id}),e=>e.status===404);off.clear()
 await set('site.maintenance.v1',{site:{enabled:true}});await assert.rejects(()=>common.pdfViewer(),e=>e.status===403)
 await set('site.maintenance.v1',{});await common.pdfViewer()
 const {sectionSettingsRevision}=load('src/modules/settings/server/section-history.ts'),req=new Request('http://localhost/api/admin/content-pdf',{headers:{origin:'http://localhost'}}),actor={id:user.id,email:user.email}
 await db.user.update({where:{id:user.id},data:{status:'ACTIVE'}})
 const before=await settings.getPdfSettings();await settings.savePdfSettings({footer:'Audited change'},{req,actor,expected:sectionSettingsRevision(before)})
 await assert.rejects(()=>settings.savePdfSettings({footer:'Stale change'},{req,actor,expected:sectionSettingsRevision(before)}),e=>e.status===409)
 assert.ok(await db.contentRevision.count({where:{entityType:'settings-content-pdf',actorId:user.id}}));assert.ok(await db.auditLog.count({where:{actorUserId:user.id,action:'content-pdf.settings.update'}}))
 console.log('PASS content PDF PostgreSQL: full body, draft/schedule/audience/VIP/tier/paid purchase/revocation/suspended account, movie/series, product approval, album restriction, playlist, forum opening/reply/hidden/category guard/no views, no audio secrets, module-off/global maintenance, nested concurrent settings, future metadata, stale revision and audit')
}finally{
 await db.contentRevision.deleteMany({where:{entityType:'settings-content-pdf',actorId:{in:users}}});await db.auditLog.deleteMany({where:{actorUserId:{in:users}}})
 for(const [model,id]of made.reverse())await db[model].deleteMany({where:{id}})
 for(const [key,row]of saved)if(row)await db.setting.upsert({where:{key},create:row,update:{value:row.value}});else await db.setting.deleteMany({where:{key}})
 await db.$disconnect()
}}
main().catch(e=>{console.error(e);process.exitCode=1})
