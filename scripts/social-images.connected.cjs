// PostgreSQL queue + real public image resolution/JPEG and multipart serialization; providers are doubled.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),sharp=require('sharp'),{PrismaClient}=require('@prisma/client')
const db=new PrismaClient(),stamp='owned-social-images-'+Date.now(),posts=[],paths=[],social=[],requests=[]
let rejectPhoto=false,missingImage=false,enabled=true
const settings={telegram:{enabled:true,channel:'@owned_test',includeImage:true},instagram:{enabled:true,accountId:'123456789',accessToken:'fixture-token'},push:{enabled:false}}
const mocks={
 '@/platform/database/prisma':{db},
 '@/extensions/server/modules':{isModuleEnabled:async()=>enabled,getModuleStates:async()=>({})},
 '@/modules/site/server/maintenance':{closedSectionPlugins:async()=>new Set()},
 '@/modules/site/server/seo':{siteBase:async()=> 'https://example.invalid'},
 '@/modules/settings/server':{readJsonSetting:async()=>settings},
 '@/modules/providers/server/panel-credentials':{decryptPanelCredential:v=>v,encryptPanelCredential:v=>v},
 '@/modules/social/server/egress':{socialFetch:async(url,init={})=>{
   requests.push({url,init})
   if(url.includes('/sendPhoto'))return Response.json(rejectPhoto?{ok:false,description:'fixture photo refused'}:{ok:true,result:{message_id:42}})
   if(url.includes('/sendMessage'))return Response.json({ok:true,result:{message_id:43}})
   if(url.includes('fields=status_code'))return Response.json({status_code:'FINISHED'})
   if(url.endsWith('/media_publish'))return Response.json({id:'published-1'})
   if(url.endsWith('/media'))return Response.json({id:'container-1'})
   throw Error('Unexpected provider request')
 }},
}
const load=require('./connected-source-loader.cjs')(mocks)
// Keep the actual multipart Bot API client, with its credentials boundary replaced.
const telegram=load('src/modules/notifications/server/telegram.ts')
mocks['@/modules/notifications/server/telegram']={...telegram,telegramConfig:async()=>({token:'owned-fixture',apiBase:'https://api.telegram.org'})}
const service=load('src/modules/social/server/social.ts')
async function main(){try{
 const root=load('src/modules/downloads/server/files.ts').filesRoot(),key='uploads/general/'+new Date().toISOString().slice(0,7)+'/'+stamp+'.webp',file=path.join(root,key)
 await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,await sharp({create:{width:320,height:200,channels:3,background:'#b31c37'}}).webp().toBuffer());paths.push(file)
 const post=await db.post.create({data:{slug:stamp,title:'مقالهٔ آزمایشی تصویر',content:'متن',cover:'/files/'+key,status:'PUBLISHED',publishedAt:new Date(Date.now()-10000)}});posts.push(post.id)
 const card=await load('src/modules/content/server/registry.ts').itemCard({type:'post',id:post.id});assert.equal(card.image,post.cover)
 const jpeg=await load('src/modules/social/server/images.ts').socialImage(card.image,'https://example.invalid');const meta=await sharp(jpeg).metadata();assert.equal(meta.format,'jpeg');assert.equal(meta.width,1080);assert.equal(meta.height,1350)
 const {publicImageBytes}=load('src/modules/media/server/library/public-image.ts')
 assert.deepEqual(Buffer.from(await publicImageBytes('https://example.invalid'+post.cover,'https://example.invalid')),await fs.readFile(file),'same-site image needs no loopback HTTP')
 await assert.rejects(()=>publicImageBytes('/files/../private/secrets.env','https://example.invalid'))
 await assert.rejects(()=>publicImageBytes('http://169.254.169.254/latest/meta-data','https://example.invalid'))
 const queue=async(channel)=>{const row=await db.socialPost.create({data:{channel,itemType:'post',itemId:post.id,nextAttemptAt:new Date(Date.now()-1000)}});social.push(row.id);return row}
 const tg=await queue('TELEGRAM');await service.processSocialQueue();assert.equal((await db.socialPost.findUnique({where:{id:tg.id}})).status,'SENT')
 const photo=requests.find(r=>r.url.includes('/sendPhoto'));assert.ok(photo)
 assert.match(photo.init.headers['content-type'],/^multipart\/form-data; boundary=/)
 const form=await new Response(photo.init.body,{headers:photo.init.headers}).formData();assert.equal(form.get('chat_id'),'@owned_test');assert.equal(form.get('photo').type,'image/jpeg');assert.equal(form.get('photo').name,'post-'+post.id+'.jpg');assert.equal((await sharp(Buffer.from(await form.get('photo').arrayBuffer())).metadata()).format,'jpeg');assert.match(form.get('caption'),/مقاله/)
 assert.ok(!requests.some(r=>r.url.includes('/sendMessage')),'no silent text fallback')
 const ig=await queue('INSTAGRAM');await service.processSocialQueue();assert.equal((await db.socialPost.findUnique({where:{id:ig.id}})).status,'SENT')
 const igCall=requests.find(r=>r.url.endsWith('/media'));assert.equal(igCall.init.body.get('image_url'),'https://example.invalid/api/social/image/post-'+post.id+'.jpg')
 const routes=load('src/modules/social/server/http/routes.ts'),{NextRequest}=require('next/server')
 const response=await routes.GET_image(new NextRequest('https://example.invalid/api/social/image/post-'+post.id+'.jpg'),{params:Promise.resolve({file:'post-'+post.id+'.jpg'})});assert.equal(response.status,200);assert.equal((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).format,'jpeg')
 rejectPhoto=true;await db.socialPost.update({where:{id:tg.id},data:{status:'PENDING',nextAttemptAt:new Date(Date.now()-1000)}});await service.processSocialQueue();const retry=await db.socialPost.findUnique({where:{id:tg.id}});assert.equal(retry.status,'PENDING');assert.ok(retry.error.includes('تصویر'));assert.ok(retry.nextAttemptAt>new Date());assert.ok(!requests.some(r=>r.url.includes('/sendMessage')))
 rejectPhoto=false;settings.telegram.includeImage=false;await db.socialPost.update({where:{id:tg.id},data:{status:'PENDING',nextAttemptAt:new Date(Date.now()-1000)}});await service.processSocialQueue();assert.ok(requests.some(r=>r.url.includes('/sendMessage')))
 await db.post.update({where:{id:post.id},data:{status:'DRAFT'}});const hidden=await routes.GET_image(new NextRequest('https://example.invalid/x'),{params:Promise.resolve({file:'post-'+post.id+'.jpg'})});assert.equal(hidden.status,404)
 enabled=false;assert.equal((await routes.GET_image(new NextRequest('https://example.invalid/x'),{params:Promise.resolve({file:'post-'+post.id+'.jpg'})})).status,404)
 console.log('Social images PG: actual featured cover, bounded local/SSRF guard, real JPEG+multipart Bot API, Instagram image endpoint, photo failure retry, explicit text-only setting, draft and module-off passed')
}finally{
 await db.socialPost.deleteMany({where:{id:{in:social}}});await db.post.deleteMany({where:{id:{in:posts}}});for(const p of paths)await fs.rm(p,{force:true});await db.$disconnect()
}}
main().catch(e=>{console.error(e);process.exitCode=1})
