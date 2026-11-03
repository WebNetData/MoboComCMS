const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')
const { NextRequest } = require('next/server')

test('Cinema filters retain exact people IDs and compose safe URLs across sorting and paging',()=>{
  const {cinemaPersonId,cinemaBrowsePage,cinemaBrowseHref}=load('src/modules/cinema/domain/discovery.ts')
  assert.equal(cinemaPersonId('42'),42);assert.equal(cinemaPersonId(''),null)
  for(const value of ['bad','-1','1.5','999999999999',{},['42']])assert.equal(cinemaPersonId(value),-1)
  assert.equal(cinemaBrowsePage(2.8),2);assert.equal(cinemaBrowsePage(Infinity),1);assert.equal(cinemaBrowsePage(999),500)
  const filters={actor:'42',director:'7',kind:'MOVIE',genre:'درام',q:'Test',page:'2',dubbed:'1'}
  let url=new URL(cinemaBrowseHref(filters,{sort:'imdb'}),'https://example.invalid');assert.equal(url.searchParams.has('page'),false);assert.equal(url.searchParams.get('actor'),'42');assert.equal(url.searchParams.get('genre'),'درام')
  url=new URL(cinemaBrowseHref(filters,{page:'3'}),'https://example.invalid');assert.equal(url.searchParams.get('page'),'3');assert.equal(url.searchParams.get('director'),'7')
  url=new URL(cinemaBrowseHref(filters,{actor:undefined}),'https://example.invalid');assert.equal(url.searchParams.has('actor'),false);assert.equal(url.searchParams.get('director'),'7')
})

test('Cinema public people suggestions enforce module, bounded role/name input and unavailable feedback',async()=>{
  let enabled=true,limited=false,calls=0,fail=false
  const {GET}=load('src/modules/cinema/server/http/people-search.ts',{
    '@/extensions/server/modules':{moduleGuard:async()=>enabled?null:Response.json({error:'off'},{status:404})},
    '@/platform/http/rate-limit':{clientIp:()=> 'fixture',rateLimitHit:()=>({ok:!limited})},
    '@/modules/cinema/server/people':{publicPeopleChoices:async input=>{calls++;assert.ok(input.q.length<=60);assert.equal(input.role,'CAST');if(fail)throw Error('private failure');return Array.from({length:20},(_,i)=>({id:i+1,name:'Name '+i,image:'',bio:'private',credits:[]}))}},
  })
  const request=query=>new NextRequest('http://localhost:3000/api/cinema/people?'+query)
  assert.deepEqual(await(await GET(request('q=a'))).json(),{options:[]});assert.equal(calls,0)
  const result=await(await GET(request('q='+ 'x'.repeat(100)))).json();assert.equal(result.options.length,12);assert.deepEqual(Object.keys(result.options[0]).sort(),['id','image','name'])
  assert.equal((await GET(request('q=test&role=INVALID'))).status,422)
  fail=true;const failure=await GET(request('q=test'));assert.equal(failure.status,503);assert.doesNotMatch(await failure.text(),/private failure/)
  limited=true;assert.equal((await GET(request('q=test'))).status,429);limited=false
  enabled=false;assert.equal((await GET(request('q=test'))).status,404)
})

test('music artist profile patches preserve omitted fields and bound images, text and stale-form tokens',()=>{
  const {artistProfilePatch,artistExpectedUpdate,artistProfileFilter}=load('src/modules/music/domain/artist-profile.ts')
  assert.deepEqual(artistProfilePatch({name:'  Singer   Name ',nameEn:'Alias',bio:'<p><b>Bio</b></p><script>bad()</script>',image:''},true),{name:'Singer Name',nameEn:'Alias',bio:'<p><b>Bio</b></p>',image:''})
  assert.deepEqual(artistProfilePatch({bio:'Only biography'},false),{bio:'Only biography'});assert.equal(artistExpectedUpdate({}),null)
  const stamp='2026-10-17T12:00:00.000Z';assert.equal(artistExpectedUpdate({expectedUpdatedAt:stamp}).toISOString(),stamp)
  for(const input of [{},{name:''},{name:'a'.repeat(161)},{name:'<b>Singer</b>'},{name:'Singer',bio:'x'.repeat(20001)},{name:'Singer',image:'/api/admin/private'},{name:'Singer',cover:'https://user:pass@example.invalid/a.jpg'}])assert.throws(()=>artistProfilePatch(input,true),e=>e.status===422)
  assert.throws(()=>artistExpectedUpdate({expectedUpdatedAt:'not-a-date'}),e=>e.status===422);assert.throws(()=>artistProfileFilter('bad'),e=>e.status===422)
})

test('Cinema profile input bounds rich text and accepts only public image addresses',()=>{
  const {personProfileInput}=load('src/modules/cinema/domain/person-profile.ts')
  const input={name:'  Test   Actor  ',bio:'<p>Hello <b>actor</b></p><img src="/files/a.webp" onerror="bad()"><script>bad()</script>',image:'/files/person.webp',imageLocked:true}
  const result=personProfileInput(input);assert.equal(result.name,'Test Actor');assert.equal(result.displayNameKey,'test actor');assert.doesNotMatch(result.bio,/onerror|script/)
  for(const image of ['javascript:alert(1)','https://user:pass@example.invalid/p.jpg','/api/admin/private','/files/../secret','/files/%2E%2E/secret','//example.invalid/p.jpg'])assert.throws(()=>personProfileInput({...input,image}),e=>e.status===422)
  for(const extra of [{name:'a'},{bio:'x'.repeat(30001)},{imageLocked:'true'},{image:null}])assert.throws(()=>personProfileInput({...input,...extra}),e=>e.status===422)
  assert.equal(personProfileInput({...input,image:''}).image,'')
})

test('Cinema manual photo locks override provider photos, including an intentionally blank picture',async()=>{
  const previous=global.fetch;let calls=0
  global.fetch=async()=>{calls++;throw Error('unexpected network')}
  try{
    const {enrichPeoplePhotos}=load('src/modules/cinema/server/metadata/people-photos.ts',{'@/modules/cinema/server/people':{storedPersonPhotoStates:async()=>new Map([['test actor',{image:'',locked:true}],['test director',{image:'/files/manual.webp',locked:true}]])}})
    const result=await enrichPeoplePhotos({fields:{imdbId:'tt1375666',cast:[{name:'Test Actor',image:'https://m.media-amazon.com/images/provider.jpg'}],director:'Test Director',directorImages:[{name:'Test Director',image:'https://m.media-amazon.com/images/provider.jpg'}]},source:'fixture',warnings:[]})
    assert.equal(result.fields.cast[0].image,'');assert.equal(result.fields.directorImages[0].image,'/files/manual.webp');assert.equal(calls,0)
  }finally{global.fetch=previous}
})

test('Cinema people HTTP checks Origin, module, owning permission, strict limit and invalid input',async()=>{
  let permitted=false,enabled=true,limited=false,writes=0
  const route=load('src/modules/cinema/server/http/people.ts',{
    '@/modules/identity/server/access':{requirePerm:async(_req,permission)=>permitted&&permission==='cinema.manage'?{id:1,email:'fixture@example.invalid'}:null},
    '@/extensions/server/modules':{moduleGuard:async()=>enabled?null:Response.json({error:'off'},{status:404})},
    '@/platform/http/rate-limit':{rateLimitStrict:async()=>({ok:!limited})},
    '@/platform/audit/server':{auditAdminStrict:async()=>{}},
    '@/modules/cinema/server/person-admin':{adminPeople:async()=>({people:[]}),savePerson:async()=>{writes++;return{id:1}}},
  })
  const request=(origin='http://localhost:3000',body={name:'Test Actor'})=>new NextRequest('http://localhost:3000/api/admin/cinema/people',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)})
  assert.equal((await route.GET(new NextRequest('http://localhost:3000/api/admin/cinema/people'))).status,403)
  assert.equal((await route.POST(request())).status,403);permitted=true
  assert.equal((await route.POST(request('https://foreign.invalid'))).status,403)
  assert.equal((await route.POST(request(''))).status,403)
  enabled=false;assert.equal((await route.POST(request())).status,404);enabled=true
  limited=true;assert.equal((await route.POST(request())).status,429);limited=false
  assert.equal((await route.PATCH(request())).status,422)
  assert.equal((await route.POST(request('http://localhost:3000',{id:1}))).status,422)
  assert.equal(writes,0);assert.equal((await route.POST(request())).status,200);assert.equal(writes,1)
})

test('import image failures reject invalid media while retaining transient sources and explicit opt-out', async () => {
  class MediaError extends Error { constructor(retry){super('fixture media failure');this.retry=retry} }
  const { LibraryError }=load('src/modules/media/domain/library.ts')
  const { importImages }=load('src/modules/imports/server/adapters/common.ts',{'@/platform/database/prisma':{db:{}},'@/modules/imports/server/media':{MediaError},'@/modules/media/domain/library':{LibraryError}})
  for(const [error,kept]of [[new MediaError(false),false],[new MediaError(true),true],[new LibraryError('invalid',422,'invalid-media'),false],[new LibraryError('unavailable',422,'unavailable'),true]]){
    const messages=[],counters={},url='https://images.example.test/picture.jpg'
    const ctx={settings:{options:{copyAssets:true}},importImage:async()=>{throw error}}
    assert.deepEqual(await importImages(ctx,[url],messages,counters,'cover'),kept?[url]:[])
    assert.equal(counters.imagesFailed,1);assert.equal(messages[0].level,'warning')
    ctx.settings.options.copyAssets=false;assert.deepEqual(await importImages(ctx,[url],[],{},'cover'),[url])
  }
})

const imdbHtml = (node, next={}) => `<script type="application/ld+json">${JSON.stringify(node)}</script><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({props:{pageProps:next}})}</script>`
const imdbTitle = () => ({'@type':'Movie',url:'https://www.imdb.com/title/tt1375666/',name:'Inception',description:'A dream &amp; a memory.',datePublished:'2010-07-16',duration:'PT2H28M',genre:['Action','Sci-Fi'],aggregateRating:{ratingValue:8.8},contentRating:'PG-13',image:'https://m.media-amazon.com/images/cover.jpg',actor:[{'@type':'Person',name:'Leonardo DiCaprio',url:'https://www.imdb.com/name/nm0000138/'}],director:[{'@type':'Person',name:'Christopher Nolan',url:'https://www.imdb.com/name/nm0634240/'}]})
const cinemetaTitle = () => ({meta:{id:'tt1375666',imdb_id:'tt1375666',type:'movie',name:'Inception',description:'A fixture synopsis.',imdbRating:'8.8',cast:['Leonardo DiCaprio','Joseph Gordon-Levitt'],director:['Christopher Nolan'],releaseInfo:'2010',runtime:'148 min',genres:['Action','Sci-Fi'],poster:'https://images.metahub.space/poster/small/tt1375666/img'}})
const personBinding=(name,id,role='CAST',entity='Q38111')=>({titleId:{value:'tt1375666'},work:{value:'http://www.wikidata.org/entity/Q25188'},person:{value:'http://www.wikidata.org/entity/'+entity},personLabel:{value:name},imdb:{value:id},role:{value:role}})

test('photo identities require the exact title/role and reject ambiguous people and unsafe person images',()=>{
  const {parsePhotoIdentities,photoIdentityKey}=load('src/modules/cinema/domain/people-photos.ts'),{parseImdbPersonSearch}=load('src/modules/cinema/domain/imdb-search.ts')
  const good=personBinding('Leonardo DiCaprio','nm0000138'),director=personBinding('Christopher Nolan','nm0634240','DIRECTOR','Q25191')
  let rows=[good,director,{...good,titleId:{value:'tt9999999'},personLabel:{value:'Wrong'}}]
  let ids=parsePhotoIdentities({results:{bindings:rows}},'tt1375666');assert.equal(ids.get(photoIdentityKey('CAST','Leonardo DiCaprio')),'nm0000138');assert.equal(ids.get(photoIdentityKey('DIRECTOR','Christopher Nolan')),'nm0634240')
  rows.push(personBinding('Leonardo DiCaprio','nm9999999','CAST','Q99999'));ids=parsePhotoIdentities({results:{bindings:rows}},'tt1375666');assert.equal(ids.has(photoIdentityKey('CAST','Leonardo DiCaprio')),false)
  assert.equal(parsePhotoIdentities({results:{bindings:[good,{...director,work:{value:'http://www.wikidata.org/entity/Q99999'}}]}},'tt1375666').size,0)
  assert.equal(parsePhotoIdentities({results:{bindings:Array(201).fill(good)}},'tt1375666').size,0)
  const image='https://m.media-amazon.com/images/M/leo@@._V1_.jpg'
  assert.equal(parseImdbPersonSearch({d:[{id:'nm9999999',i:{imageUrl:'https://m.media-amazon.com/images/wrong.jpg'}},{id:'nm0000138',i:{imageUrl:image}}]},'nm0000138'),image)
  for(const url of ['https://127.0.0.1/a','https://m.media-amazon.com.evil.test/images/a.jpg','http://m.media-amazon.com/images/a.jpg'])assert.equal(parseImdbPersonSearch({d:[{id:'nm0000138',i:{imageUrl:url}}]},'nm0000138'),'')
})

test('photo enrichment uses title-linked exact person IDs and keeps stored/entered images and textual results',async()=>{
  const previous=global.fetch,calls=[];let stored=new Map(),unavailable=false
  global.fetch=async(url,options)=>{calls.push([String(url),options]);if(String(url).startsWith('https://query.wikidata.org/sparql'))return unavailable?new Response('',{status:429}):Response.json({results:{bindings:[personBinding('Leonardo DiCaprio','nm0000138'),personBinding('Christopher Nolan','nm0634240','DIRECTOR','Q25191')]}});const id=String(url).match(/\/(nm\d+)\.json$/)?.[1];return Response.json({d:[{id,i:{imageUrl:`https://m.media-amazon.com/images/${id}@@.jpg`}}]})}
  try{
    const {enrichPeoplePhotos}=load('src/modules/cinema/server/metadata/people-photos.ts',{'@/modules/cinema/server/people':{storedPersonPhotoStates:async()=>new Map([...stored].map(([key,image])=>[key,{image,locked:false}]))}})
    const make=()=>({fields:{imdbId:'tt1375666',summary:'Kept story',cast:[{name:'Leonardo DiCaprio',role:'Cobb'},{name:'Already entered',image:'/files/keep.webp'}],director:'Christopher Nolan'},source:'Cinemeta',warnings:[]})
    let result=await enrichPeoplePhotos(make());assert.match(result.fields.cast[0].image,/nm0000138@@/);assert.match(result.fields.directorImages[0].image,/nm0634240@@/);assert.equal(result.fields.cast[1].image,'/files/keep.webp');assert.equal(result.fields.summary,'Kept story')
    assert.equal(calls.length,3);assert.ok(calls.every(([,o])=>o.redirect==='error'&&!o.headers.Cookie&&!o.headers.Authorization));assert.ok(calls[0][0].includes('tt1375666'))
    stored=new Map([['leonardo dicaprio','/files/owned-leo.webp'],['christopher nolan','/files/owned-nolan.webp']]);calls.length=0;result=await enrichPeoplePhotos(make());assert.equal(result.fields.cast[0].image,'/files/owned-leo.webp');assert.equal(calls.length,0)
    stored=new Map();unavailable=true;calls.length=0;result=await enrichPeoplePhotos(make());assert.equal(result.fields.summary,'Kept story');assert.equal(result.fields.cast[0].image,undefined);assert.equal(calls.length,1);assert.ok(result.warnings.length>0)
  }finally{global.fetch=previous}
})

test('photo enrichment stops further person requests after an IMDb rate limit',async()=>{
  const previous=global.fetch,calls=[]
  global.fetch=async(url)=>{calls.push(String(url));return String(url).includes('query.wikidata.org')?Response.json({results:{bindings:Array.from({length:5},(_,i)=>personBinding('Person '+i,'nm100000'+i,'CAST','Q100'+i))}}):new Response('',{status:429})}
  try{
    const {enrichPeoplePhotos}=load('src/modules/cinema/server/metadata/people-photos.ts',{'@/modules/cinema/server/people':{storedPersonPhotoStates:async()=>new Map()}})
    const result=await enrichPeoplePhotos({fields:{imdbId:'tt1375666',summary:'Keep',cast:Array.from({length:5},(_,i)=>({name:'Person '+i}))},source:'Cinemeta',warnings:[]})
    assert.equal(result.fields.summary,'Keep');assert.ok(calls.length>=2&&calls.length<=5,'at most the four already-started requests, no retry or fifth request');assert.ok(result.fields.cast.every(p=>!p.image));assert.ok(result.warnings.some(w=>w.includes('5')))
  }finally{global.fetch=previous}
})

test('photo-only autofill updates blank pictures in existing cast without replacing entered names/roles/photos',()=>{
  const {applyCinemaMetadata}=load('src/modules/cinema/domain/metadata.ts')
  const current={title:'Keep title',cast:[{name:'Leonardo DiCaprio',role:'Cobb',image:''},{name:'Existing actor',image:'/files/keep.webp'}]}
  const incoming={title:'Inception',cast:[{name:'Leonardo DiCaprio',image:'https://m.media-amazon.com/images/leo.jpg'},{name:'Existing actor',image:'https://m.media-amazon.com/images/new.jpg'},{name:'Other actor',image:'https://m.media-amazon.com/images/other.jpg'}]}
  const result=applyCinemaMetadata(current,incoming,false,false)
  assert.equal(result.title,current.title);assert.equal(result.cast.length,2);assert.equal(result.cast[0].image,incoming.cast[0].image);assert.equal(result.cast[0].role,'Cobb');assert.equal(result.cast[1].image,'/files/keep.webp');assert.equal(current.cast[0].image,'')
})

test('canonical director credits accept actual IMDb photo URLs containing @',async()=>{
  const {syncCredits}=load('src/modules/cinema/server/people.ts',{'@/platform/database/prisma':{db:{}}});let created
  const tx={cinemaTitle:{findUnique:async()=>({director:'Christopher Nolan',cast:'[]'})},cinemaPerson:{upsert:async input=>{created=input.create;return{id:1,...input.create}},updateMany:async()=>({count:1})},cinemaCredit:{upsert:async()=>({id:1}),deleteMany:async()=>({count:0})}}
  const image='https://m.media-amazon.com/images/M/nolan@@._V1_.jpg';await syncCredits(tx,1,[{name:'Christopher Nolan',image}]);assert.equal(created.image,image)
})

test('Cinemeta exact-ID details supply real fields without inventing missing metadata', () => {
  const {parseCinemeta,cinemetaImage}=load('src/modules/cinema/domain/cinemeta.ts')
  const {fields,warnings}=parseCinemeta(cinemetaTitle(),'tt1375666')
  assert.equal(fields.summary,'A fixture synopsis.');assert.equal(fields.imdbRating,8.8);assert.equal(fields.director,'Christopher Nolan');assert.equal(fields.cast[0].name,'Leonardo DiCaprio');assert.equal(fields.runtime,148)
  assert.equal(Object.hasOwn(fields,'originalTitle'),false);assert.ok(warnings.some(x=>x.includes('عکس')))
  const missing=parseCinemeta({meta:{...cinemetaTitle().meta,type:'series',director:null,description:null,cast:[],imdbRating:'N/A'}},'tt1375666')
  for(const key of ['summary','cast','director','imdbRating'])assert.equal(Object.hasOwn(missing.fields,key),false,key)
  for(const meta of [{...cinemetaTitle().meta,id:'tt9999999'},{...cinemetaTitle().meta,imdb_id:'tt9999999'},{...cinemetaTitle().meta,type:'channel'},null])assert.throws(()=>parseCinemeta({meta},'tt1375666'),/معتبر|مطابقت/)
  for(const url of ['https://images.metahub.space.evil.test/poster/small/tt1375666/img','https://images.metahub.space/poster/small/tt9999999/img','http://images.metahub.space/poster/small/tt1375666/img','https://127.0.0.1/a'])assert.equal(cinemetaImage(url,'tt1375666'),'')
})

test('name-only metadata credits keep an existing photo and role even on explicit replacement', () => {
  const {applyCinemaMetadata}=load('src/modules/cinema/domain/metadata.ts')
  const current={title:'نام ویرایش‌شده',summary:'داستان قبلی',kind:'SERIES',cast:[{name:'Leonardo DiCaprio',role:'Cobb',image:'/files/owned.webp'}]}
  const incoming={imdbId:'tt1375666',kind:'MOVIE',title:'Inception',cast:[{name:'Leonardo DiCaprio'},{name:'Joseph Gordon-Levitt'}]}
  assert.equal(applyCinemaMetadata(current,incoming,false,false).title,current.title)
  const result=applyCinemaMetadata(current,incoming,true,false)
  assert.equal(result.title,'Inception');assert.equal(result.summary,current.summary);assert.equal(result.kind,'MOVIE');assert.deepEqual(result.cast[0],current.cast[0]);assert.equal(result.cast[1].name,'Joseph Gordon-Levitt')
  assert.equal(current.title,'نام ویرایش‌شده');assert.equal(incoming.cast[0].image,undefined)
})

test('enabled keyless details fallback fetches only the public Cinemeta title, honors opt-out and retains safe failures', async () => {
  const previous=global.fetch,calls=[];let enabled=true,fallback=true,body=cinemetaTitle(),status=200,mode=''
  global.fetch=async(url,options)=>{calls.push([String(url),options]);if(String(url).startsWith('https://v3-cinemeta.strem.io/')){if(mode==='oversize')return new Response('x'.repeat(2*1024*1024+1),{headers:{'content-type':'application/json'}});if(mode==='html')return new Response('<html>unavailable</html>',{headers:{'content-type':'text/html'}});if(mode==='redirect')return Response.redirect('https://127.0.0.1/private');if(mode==='series'&&String(url).includes('/movie/'))return new Response('',{status:404});return Response.json(mode==='series'?{meta:{...cinemetaTitle().meta,type:'series'}}:body,{status})}if(String(url).includes('/suggestion/'))return Response.json({d:[{id:'tt1375666',l:'Inception',qid:'movie',y:2010}]});return new Response('unavailable',{status:202,headers:{'content-type':'text/html'}})}
  try{
    const provider=load('src/modules/cinema/server/metadata/provider.ts',{'./config':{metadataCredentials:async()=>({enabled,provider:'imdb',cinemetaFallback:fallback,copyImages:false})}})
    const result=await provider.lookupCinemaMetadata('tt1375666')
    assert.equal(result.fields.summary,'A fixture synopsis.');assert.equal(result.fields.imdbRating,8.8);assert.equal(result.fields.cast.length,2);assert.match(result.source,/Cinemeta/)
    assert.deepEqual(calls.map(([url])=>url),['https://www.imdb.com/title/tt1375666/','https://v3-cinemeta.strem.io/meta/movie/tt1375666.json'])
    assert.ok(calls.every(([,o])=>o.redirect==='error'&&!o.headers.Cookie&&!o.headers.Authorization))
    calls.length=0;fallback=false;assert.equal((await provider.lookupCinemaMetadata('tt1375666')).fields.summary,undefined);assert.equal(calls.some(([url])=>url.includes('cinemeta')),false)
    fallback=true;body={meta:{...cinemetaTitle().meta,id:'tt9999999'}};assert.equal((await provider.lookupCinemaMetadata('tt1375666')).fields.summary,undefined)
    status=429;calls.length=0;assert.equal((await provider.lookupCinemaMetadata('tt1375666')).fields.imdbRating,undefined);assert.equal(calls.filter(([url])=>url.includes('cinemeta')).length,1)
    status=200;body=cinemetaTitle()
    for(mode of ['oversize','html','redirect']){calls.length=0;assert.equal((await provider.lookupCinemaMetadata('tt1375666')).fields.summary,undefined);assert.ok(calls.every(([url])=>!url.includes('127.0.0.1')))}
    mode='series';calls.length=0;assert.equal((await provider.lookupCinemaMetadata('tt1375666')).fields.kind,'SERIES');assert.deepEqual(calls.filter(([url])=>url.includes('cinemeta')).map(([url])=>url),['https://v3-cinemeta.strem.io/meta/movie/tt1375666.json','https://v3-cinemeta.strem.io/meta/series/tt1375666.json'])
    const count=calls.length;enabled=false;await assert.rejects(()=>provider.lookupCinemaMetadata('tt1375666'),/غیرفعال/);assert.equal(calls.length,count)
  }finally{global.fetch=previous}
})

test('IMDb public search selects the exact ID and returns only supplied movie/series facts', () => {
  const {parseImdbSearch}=load('src/modules/cinema/domain/imdb-search.ts')
  const exact={id:'tt1375666',l:'Inception',qid:'movie',y:2010,i:{imageUrl:'https://m.media-amazon.com/images/poster.jpg'},s:'Unstructured names, not verified credits'}
  const fields=parseImdbSearch({d:[{...exact,id:'tt9999999',l:'Wrong title'},exact]},'tt1375666')
  assert.deepEqual(fields,{imdbId:'tt1375666',title:'Inception',kind:'MOVIE',year:2010,poster:exact.i.imageUrl})
  for(const key of ['summary','imdbRating','cast','director','directorImages','originalTitle','genres'])assert.equal(Object.hasOwn(fields,key),false,key+' must preserve existing data')
  assert.equal(parseImdbSearch({d:[{...exact,qid:'tvSeries'}]},'tt1375666').kind,'SERIES')
  const absent=parseImdbSearch({d:[{...exact,y:0,i:{imageUrl:'https://127.0.0.1/image.jpg'}}]},'tt1375666')
  assert.equal(Object.hasOwn(absent,'poster'),false);assert.equal(Object.hasOwn(absent,'year'),false)
  for(const payload of [null,{}, {d:[{...exact,id:'tt9999999'}]}, {d:[{...exact,qid:'tvEpisode'}]}, {d:[{...exact,l:''}]}])assert.throws(()=>parseImdbSearch(payload,'tt1375666'),/پیدا نشد/)
})

test('IMDb server can use anonymous public search when the full page is unavailable', async () => {
  const previous=global.fetch,calls=[];let enabled=true
  global.fetch=async(url,options)=>{calls.push([String(url),options]);return String(url).includes('/suggestion/')?Response.json({d:[{id:'tt1375666',l:'Inception',qid:'movie',y:2010,i:{imageUrl:'https://m.media-amazon.com/images/poster.jpg'}}]}):new Response('challenge',{status:202,headers:{'content-type':'text/html'}})}
  try {
    const provider=load('src/modules/cinema/server/metadata/provider.ts',{'./config':{metadataCredentials:async()=>({enabled,provider:'imdb',copyImages:false,cinemetaFallback:false})}})
    const result=await provider.lookupCinemaMetadata('https://www.imdb.com/title/tt1375666/')
    assert.equal(result.fields.title,'Inception');assert.equal(result.fields.year,2010)
    assert.match(result.source,/جستجوی عمومی/);assert.ok(result.warnings.some(x=>x.includes('ناقص')))
    assert.deepEqual(calls.map(([url])=>url),['https://www.imdb.com/title/tt1375666/','https://v3.sg.media-imdb.com/suggestion/t/tt1375666.json'])
    assert.ok(calls.every(([,o])=>o.redirect==='error'&&o.cache==='no-store'&&!o.headers.Cookie&&!o.headers.Authorization))
    assert.equal(Object.hasOwn(result.fields,'cast'),false)
    const fail=async response=>{global.fetch=async url=>String(url).includes('/suggestion/')?response():new Response('challenge',{status:202,headers:{'content-type':'text/html'}});await assert.rejects(()=>provider.lookupCinemaMetadata('tt1375666'),/محدود/)}
    await fail(()=>Response.json({d:[{id:'tt9999999',l:'Wrong',qid:'movie'}]}))
    await fail(()=>new Response(JSON.stringify({d:[]}),{headers:{'content-type':'text/html'}}))
    await fail(()=>new Response('x'.repeat(256*1024+1),{headers:{'content-type':'application/json'}}))
    await fail(()=>Response.json({d:[]},{status:429}))
    let limitedCalls=0;global.fetch=async()=>{limitedCalls++;return new Response('rate limited',{status:429})}
    await assert.rejects(()=>provider.lookupCinemaMetadata('tt1375666'),/تعداد درخواست/);assert.equal(limitedCalls,1,'a provider rate limit never triggers another request')
    const before=calls.length;await assert.rejects(()=>provider.lookupCinemaMetadata('https://127.0.0.1/secret'),/معتبر/);assert.equal(calls.length,before)
    enabled=false;await assert.rejects(()=>provider.lookupCinemaMetadata('tt1375666'),/غیرفعال/);assert.equal(limitedCalls,1,'disabled source never reaches either public interface')
  }finally{global.fetch=previous}
})

test('IMDb page parser reads title, actual rating and hydrated cast without executing markup', () => {
  const {parseImdbTitle,parseImdbPerson,imdbPhoto}=load('src/modules/cinema/domain/imdb-page.ts')
  const next={aboveTheFoldData:{id:'tt1375666',originalTitleText:{text:'Inception'},countriesOfOrigin:{countries:[{text:'United States'}]},spokenLanguages:{spokenLanguages:[{text:'English'}]}},mainColumnData:{cast:{edges:[{node:{name:{id:'nm0000138',nameText:{text:'Leonardo DiCaprio'},primaryImage:{url:'https://m.media-amazon.com/images/leo.jpg'}},characters:[{name:'Cobb'}]}}]}}}
  const result=parseImdbTitle(imdbHtml(imdbTitle(),next),'tt1375666')
  assert.deepEqual([result.fields.title,result.fields.year,result.fields.runtime,result.fields.imdbRating,result.fields.countries,result.fields.languages],['Inception',2010,148,8.8,'United States','English'])
  assert.equal(result.fields.summary,'A dream & a memory.');assert.equal(result.cast.length,1);assert.equal(result.cast[0].role,'Cobb');assert.match(result.cast[0].image,/leo.jpg$/)
  assert.equal(parseImdbPerson(imdbHtml({'@type':'Person',url:'https://www.imdb.com/name/nm0000138/',image:'https://m.media-amazon.com/images/leo.jpg'}),'nm0000138'),'https://m.media-amazon.com/images/leo.jpg')
  assert.equal(parseImdbPerson(imdbHtml({'@type':'Person',url:'https://www.imdb.com/name/nm0634240/',image:'https://m.media-amazon.com/images/wrong.jpg'}),'nm0000138'),'')
  for(const url of ['http://m.media-amazon.com/images/x.jpg','https://m.media-amazon.com.evil.test/images/x.jpg','https://user@ m.media-amazon.com/images/x.jpg','https://127.0.0.1/a.jpg'])assert.equal(imdbPhoto(url),'')
  assert.throws(()=>parseImdbTitle('<html>challenge</html>','tt1375666'),/پیدا نشد/)
  assert.throws(()=>parseImdbTitle(imdbHtml({...imdbTitle(),url:'https://www.imdb.com/title/tt9999999/'}),'tt1375666'),/پیدا نشد/)
  assert.throws(()=>parseImdbTitle(imdbHtml({...imdbTitle(),url:'https://evil.test/title/tt1375666/'}),'tt1375666'),/پیدا نشد/)
})

test('IMDb direct server lookup needs no key and fetches only canonical title/name pages', async () => {
  const previous=global.fetch,calls=[]
  global.fetch=async(url,options)=>{calls.push([String(url),options]);const id=String(url).match(/\/name\/(nm\d+)/)?.[1];return new Response(imdbHtml(id?{'@type':'Person',url:`https://www.imdb.com/name/${id}/`,image:`https://m.media-amazon.com/images/${id}.jpg`}:imdbTitle()),{headers:{'content-type':'text/html'}})}
  try {
    const provider=load('src/modules/cinema/server/metadata/provider.ts',{'./config':{metadataCredentials:async()=>({enabled:true,provider:'imdb',copyImages:false})}})
    const result=await provider.lookupCinemaMetadata('tt1375666')
    assert.equal(result.fields.imdbRating,8.8);assert.match(result.fields.cast[0].image,/nm0000138.jpg$/);assert.match(result.fields.directorImages[0].image,/nm0634240.jpg$/)
    assert.deepEqual(calls.map(([url])=>url).sort(),['https://www.imdb.com/title/tt1375666/','https://www.imdb.com/name/nm0000138/','https://www.imdb.com/name/nm0634240/'].sort())
    assert.ok(calls.every(([,o])=>o.redirect==='error' && o.cache==='no-store' && !o.headers.Authorization && !o.headers.Cookie))
    global.fetch=async url=>new Response(String(url).includes('/title/')?imdbHtml(imdbTitle()):'challenge',{status:String(url).includes('/title/')?200:202,headers:{'content-type':'text/html'}})
    const partial=await provider.lookupCinemaMetadata('tt1375666');assert.equal(partial.fields.imdbRating,8.8);assert.equal(partial.fields.cast[0].image,'');assert.ok(partial.warnings.some(x=>x.includes('2')))
    global.fetch=async()=>{throw new TypeError('fetch failed')};await assert.rejects(()=>provider.lookupCinemaMetadata('tt1375666'),/اتصال سرور به IMDb/)
    global.fetch=async()=>new Response('challenge',{status:202,headers:{'content-type':'text/html'}})
    await assert.rejects(()=>provider.lookupCinemaMetadata('tt1375666'),/محدود/)
    global.fetch=async()=>new Response('x'.repeat(6*1024*1024+1),{headers:{'content-type':'text/html'}})
    await assert.rejects(()=>provider.lookupCinemaMetadata('tt1375666'),/بزرگ/)
  }finally{global.fetch=previous}
})

test('metadata images reuse the shared queued transfer and preserve external URLs on failure', async () => {
  const calls=[],lib={currentLibraryUser:async()=>({}),requestTransfer:async(actor,input)=>{calls.push(input);if(input.name==='Unavailable')throw Error('fixture failure');return {url:'/api/media/transfers/11111111-1111-1111-1111-111111111111'}}}
  const {localizeMetadataImages}=load('src/modules/cinema/server/metadata/images.ts',{'@/modules/media/server/library':lib})
  const result=await localizeMetadataImages({fields:{originalTitle:'Inception',kind:'MOVIE',poster:'https://m.media-amazon.com/images/poster.jpg',cast:[{name:'Leonardo',image:'https://m.media-amazon.com/images/leo.jpg'},{name:'Unavailable',image:'https://m.media-amazon.com/images/no.jpg'}],directorImages:[{name:'Nolan',image:'https://m.media-amazon.com/images/nolan.jpg'}]},source:'IMDb',warnings:[]},{id:7,authAt:null})
  assert.deepEqual(calls.map(x=>[x.mode,x.organization.section,x.organization.title,x.organization.personRole]),[['queued','film','Inception',undefined],['queued','cinema-person','Leonardo','actor'],['queued','cinema-person','Unavailable','actor'],['queued','cinema-person','Nolan','director']])
  assert.match(result.fields.cast[0].image,/^\/api\/media\/transfers\//);assert.equal(result.fields.cast[1].image,'https://m.media-amazon.com/images/no.jpg');assert.ok(result.warnings.some(x=>x.includes('1')))
  calls.length=0
  await localizeMetadataImages({fields:{imdbId:'tt1375666',title:'Inception',kind:'MOVIE',poster:'https://images.metahub.space/poster/small/tt1375666/img',backdrop:'https://images.metahub.space/background/medium/tt9999999/img'},source:'Cinemeta',warnings:[]},{id:7,authAt:null})
  assert.equal(calls.length,1,'only the matching provider image is queued');assert.equal(calls[0].organization.title,'Inception')
})

test('selected terms project leaves and inherited semantic fields without duplicate typing', () => {
  const { projectTerms, termProjectionChange }=load('src/modules/taxonomy/domain/projection.ts')
  const terms=[{id:1,parentId:null,name:'فیلم',slug:'movies'}, {id:2,parentId:1,name:'درام'}, {id:3,parentId:null,name:'کشور',facet:'countries'}, {id:4,parentId:3,name:'ایران'}, {id:5,parentId:null,name:'ویژه',facet:'none'}]
  assert.deepEqual(projectTerms('cinema',terms,{ids:[1,2,4,5]}),{genres:'درام',countries:'ایران'})
  assert.deepEqual(termProjectionChange('cinema',terms,{ids:[2,4]},{ids:[4]}),{genres:'',countries:'ایران'})
  assert.deepEqual(projectTerms('cinema',terms,{ids:[999]}),{})
  assert.deepEqual(projectTerms('software',[{id:1,parentId:null,name:'Windows'},{id:2,parentId:1,name:'Security'}],{ids:[2]}),{category:'Security',platforms:'Windows'})
})

test('IMDb accepts official title URLs/IDs and never arbitrary network targets', () => {
  const {imdbIdentifier}=load('src/modules/cinema/domain/metadata.ts')
  for(const value of ['tt1375666','https://www.imdb.com/title/tt1375666/?ref_=x','https://m.imdb.com/title/tt1375666'])assert.equal(imdbIdentifier(value),'tt1375666')
  for(const value of ['https://imdb.com.evil.test/title/tt1375666','https://u:p@imdb.com/title/tt1375666','https://imdb.com:444/title/tt1375666','http://127.0.0.1/tt1375666','file:///tt1375666'])assert.equal(imdbIdentifier(value),'')
})

test('Cinema enrichment uses fixed official providers and never labels TMDb votes as IMDb ratings', async () => {
  const previous=global.fetch,calls=[]
  global.fetch=async(url,options)=>{calls.push([String(url),options]);const u=new URL(url);if(u.pathname.includes('/find/'))return Response.json({movie_results:[{id:27205}]});if(u.hostname==='www.omdbapi.com')return Response.json({Response:'True',imdbRating:'8.8',Rated:'PG-13'});return Response.json({title:'تلقین',original_title:'Inception',overview:'خلاصه',release_date:'2010-07-16',runtime:148,vote_average:9.9,genres:[{name:'علمی تخیلی'}],credits:{cast:[{name:'Leonardo',character:'Cobb',profile_path:'/photo.jpg'}],crew:[{name:'Christopher Nolan',job:'Director',profile_path:'/nolan.jpg'}]}})}
  try {
    let omdbKey=''
    const provider=load('src/modules/cinema/server/metadata/provider.ts',{'./config':{metadataCredentials:async()=>({enabled:true,tmdbToken:'owned-fixture-token',omdbKey})}})
    const first=await provider.lookupCinemaMetadata('https://www.imdb.com/title/tt1375666/')
    assert.equal(first.fields.year,2010);assert.equal(first.fields.imdbRating,undefined);assert.equal(first.fields.cast[0].image,'https://image.tmdb.org/t/p/w185/photo.jpg');assert.equal(first.fields.directorImages[0].name,'Christopher Nolan')
    omdbKey='owned-fixture-key';assert.equal((await provider.lookupCinemaMetadata('tt1375666')).fields.imdbRating,8.8)
    assert.ok(calls.every(([url,opts])=>new URL(url).protocol==='https:'&&opts.redirect==='error'&&opts.cache==='no-store'))
    await assert.rejects(()=>provider.lookupCinemaMetadata('http://127.0.0.1/private'),/معتبر/)
  } finally {global.fetch=previous}
})

test('organized destinations preserve requested layouts and reject path escapes', () => {
  const {organizationPath:p,validOrganizationPath:valid}=load('src/modules/downloads/domain/organization.ts')
  assert.equal(p({section:'cinema-person',title:'Leonardo DiCaprio',personRole:'actor'},'image'),'download/cinema/images/actors/Leonardo DiCaprio')
  assert.equal(p({section:'cinema-person',title:'Christopher Nolan',personRole:'director'},'image'),'download/cinema/images/director/Christopher Nolan')
  for(const path of ['download/film/Inception/images','download/film/Inception/video','download/movie/Inception','download/cinema/images/actors/Leonardo DiCaprio','download/cinema/images/director/Christopher Nolan'])assert.equal(valid(path),true,path)
  for(const path of ['download/movie/x/video','download/cinema/images/actors','download/cinema/images/crew/x','download/cinema/images/actors/CON','donwload/cinema/images/actors/x'])assert.equal(valid(path),false,path)
  assert.equal(p({section:'cinema-person',title:'Nolan',personRole:'director'},'file'),'')
  const cases=[['film',{title:'Inception'},'image','download/movie/Inception/images'],['film',{title:'Inception'},'file','download/movie/Inception'],['series',{title:'Dark',season:2},'file','download/series/Dark/Season2'],['series',{title:'Dark'},'image','download/series/Dark/images'],['music',{artist:'Haamim',artistImage:true},'image','download/music/Haamim/image'],['music',{artist:'Haamim',album:'AlbumX'},'image','download/music/Haamim/AlbumX/image'],['music',{artist:'Haamim',album:'AlbumX'},'file','download/music/Haamim/AlbumX'],['music',{artist:'Haamim'},'file','download/music/Haamim'],['software',{category:'Tools',title:'App'},'file','download/Sofware/Tools/App'],['software',{category:'Tools',title:'App'},'image','download/Sofware/Tools/App/images'],['games',{category:'Action',title:'Game'},'file','download/Game/Action/Game'],['games',{category:'Action',title:'Game',video:true},'file','download/Game/Action/Game/videos'],['products',{category:'Book',title:'Product'},'image','download/Products/Book/Product/images'],['products',{category:'Book',title:'Product'},'file','download/Products/Book/Product/videos']]
  for(const [section,context,kind,path]of cases){assert.equal(p({section,...context},kind),path);assert.equal(valid(path),true)}
  for(const v of ['download/film/../../private','/download/film/x/images','download/film/%2e%2e/images','download/film/x/other','download/Game/x/y/../../.env','download/film/CON/images'])assert.equal(valid(v),false,v)
  assert.equal(p({section:'film',title:'../../Inception'},'image'),'download/movie/Inception/images')
  assert.equal(p({section:'film',title:'Inception',enabled:false},'file'),'')
})

test('shared private images use exclusive private writes and compensate only newly written files', async () => {
  const written = [], removed = []
  let failAt = 2
  const images = load('src/shared/files/private-images.ts', { 'node:fs/promises': {
    mkdir: async () => {},
    writeFile: async (file, bytes, options) => { assert.equal(options.flag, 'wx'); assert.equal(options.mode, 0o600); assert.ok(!file.includes(`${path.sep}public${path.sep}`)); written.push(file); if (written.length === failAt) throw Error('owned write failure') },
    unlink: async file => removed.push(file),
    readFile: async () => { throw Error('must not read traversal') },
  } })
  const first = { filename: '11111111-1111-1111-1111-111111111111.png', originalName: 'receipt.png', mimeType: 'image/png', size: 1, bytes: Buffer.from('x') }
  const second = { ...first, filename: '22222222-2222-2222-2222-222222222222.png' }
  await assert.rejects(images.savePrivateImages('business-proofs', [first, second]), /owned write failure/)
  assert.deepEqual(removed, [written[0]], 'partial failure removes only the successfully created first image')
  written.length = 0; removed.length = 0; failAt = 1
  await assert.rejects(images.savePrivateImages('tickets', [first]), /owned write failure/)
  assert.deepEqual(removed, [], 'a failed exclusive write must never remove a file that already existed')
  await assert.rejects(images.readPrivateImage('business-proofs', '../../receipt.png'), error => error.status === 404)
})

test('backup settings and execution require settings permission', async () => {
  const route = load('src/modules/notifications/server/http/admin/backups/route.ts', {
    '@/modules/identity/server/access': { requirePerm: async () => null },
    '@/platform/database/prisma': { db: {} },
    '@/modules/notifications/server/backup-scheduler': { runBackupWorker: () => { throw Error('must not start') } },
  })
  for (const method of ['GET','PATCH','POST']) assert.equal((await route[method](new NextRequest('http://localhost/api/admin/backups'))).status,403)
})

// The middleware under test is that of an installed site, whatever database (or none) this run has.
const INSTALLED = {
  '@/modules/installer/server/gate': { installGate: async () => null },
  '@/modules/site/server/maintenance': { loadMaintenance: async () => ({}), maintenanceBases: () => ({}) },
}

test('origin guard accepts the actual host despite Next localhost normalization and rejects foreign origins', async () => {
  const { proxy: middleware } = load('src/proxy.ts', { ...INSTALLED, '@/modules/site/server/routes': { loadRouteAliases: async () => ({}) } })
  const request = origin => new NextRequest('http://localhost:3002/api/subscriptions/1', { method: 'POST', headers: { host: '127.0.0.1:3002', origin, 'x-request-id': 'origin-test-123' } })
  assert.equal((await middleware(request('http://127.0.0.1:3002'))).status, 200)
  assert.equal((await middleware(request('https://attacker.invalid'))).status, 403)
  assert.equal((await middleware(request('http://127.0.0.1:9999'))).status, 403)
})

test('middleware publishes sections under their aliases and redirects old addresses', async () => {
  const { proxy: middleware } = load('src/proxy.ts', { ...INSTALLED, '@/modules/site/server/routes': { loadRouteAliases: async () => ({ '/games': '/game' }) } })
  const get = (url) => middleware(new NextRequest(url, { headers: { 'x-request-id': 'alias-test-123' } }))
  const old = await get('http://localhost:3002/games/x?y=1')
  assert.equal(old.status, 308)
  const location = new URL(old.headers.get('location'))
  assert.equal(location.pathname + location.search, '/game/x?y=1')
  const aliased = await get('http://localhost:3002/game/x')
  assert.match(aliased.headers.get('x-middleware-rewrite') || '', /\/games\/x$/)
  assert.ok(aliased.headers.get('content-security-policy'))
  assert.equal((await get('http://localhost:3002/api/games/library')).status, 200)
})

test('incident validation rejects invalid scopes, statuses and oversized messages', () => {
  const { validateIncident } = load('src/modules/support/domain/incidents.ts')
  const good = { panelId: null, titleFa: 'اختلال', titleEn: 'Outage', messageFa: 'در حال بررسی', messageEn: 'Investigating', status: 'INVESTIGATING' }
  assert.deepEqual(validateIncident(good), good)
  for (const change of [{ panelId: 0 }, { panelId: '1' }, { status: 'BAD' }, { titleFa: '' }, { messageEn: 'x'.repeat(3001) }]) assert.throws(() => validateIncident({ ...good, ...change }))
})

test('incident feed requires ownership and includes only global and matching service scopes', async () => {
  let user = null, owned = false, query
  const route = load('src/modules/support/server/http/incidents/route.ts', {
    '@/modules/identity/server/access': { requireUser: async () => user },
    '@/platform/database/prisma': { db: {
      subscription: { findFirst: async ({ where }) => { assert.equal(where.userId, 7); assert.equal(where.id, 9); return owned ? { panelId: 3 } : null } },
      serviceIncident: { findMany: async args => { query = args; return [] } },
    } },
  })
  const request = () => new NextRequest('http://localhost/api/incidents?subscriptionId=9')
  assert.equal((await route.GET(request())).status, 401)
  user = { id: 7 }
  assert.equal((await route.GET(request())).status, 404)
  assert.equal(query, undefined)
  owned = true
  const response = await route.GET(request())
  assert.equal(response.status, 200)
  assert.deepEqual(query.where.AND[0].OR, [{ panelId: null }, { panelId: 3 }])
  assert.equal(query.where.AND[1].OR[0].status.not, 'RESOLVED')
  assert.equal(query.select.panelId, undefined)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
})

test('subscription reports reject another customer subscription before creating a ticket', async () => {
  let owned = false, saved
  const route = load('src/modules/support/server/http/tickets/route.ts', {
    '@/modules/identity/server/access': { requireUser: async () => ({ id: 7, role: 'USER' }) },
    '@/modules/notifications/server/telegram-locale': { getUserLocale: async () => 'en' },
    '@/modules/subscriptions/server/happ-protocol': { safeHappLink: async token => { assert.equal(token, 'owned-token'); return 'happ://crypt5/owned-link' } },
    '@/extensions/server/runtime': { emitExtensionEvent: async () => {} },
    '@/platform/database/prisma': { db: {
      ticketDepartment: { findUnique: async () => ({ active: true, requiresSubscription: true, requiresProduct: false, fields: '[]' }) },
      subscription: { findFirst: async ({ where }) => { assert.equal(where.id, 9); assert.equal(where.userId, 7); assert.equal(where.status, 'ACTIVE'); assert.ok(where.expiresAt.gt instanceof Date); return owned ? { id: 9, username: 'customer-service', subToken: 'owned-token' } : null } },
      ticket: { create: async ({ data }) => { saved = data; return { id: 1, priority: data.priority } } },
    } },
  })
  const request = overrides => new NextRequest('http://localhost/api/tickets', { method: 'POST', body: JSON.stringify({ subject: 'Connection issue', message: 'Cannot connect', subscriptionId: 9, device: 'android', issueType: 'connection', ...overrides }) })
  assert.equal((await route.POST(request({}))).status, 404)
  assert.equal(saved, undefined)
  owned = true
  assert.equal((await route.POST(request({ device: 'bad' }))).status, 400)
  assert.equal((await route.POST(request({}))).status, 200)
  assert.equal(saved.subscriptionId, 9)
  assert.equal(saved.subscriptionUsername, 'customer-service')
  assert.equal(saved.subscriptionLink, 'happ://crypt5/owned-link')
  assert.equal(saved.department, 'SUBSCRIPTION')
  assert.equal(saved.device, 'android')
  assert.equal(saved.messages.create.fromAdmin, false)
})

test('ticket departments require an active owned service only for product and subscription support', async () => {
  let saved, hasSubscription = false, hasPurchase = false, role = 'USER'
  const route = load('src/modules/support/server/http/tickets/route.ts', {
    '@/modules/identity/server/access': { requireUser: async () => ({ id: 7, role }) },
    '@/modules/notifications/server/telegram-locale': { getUserLocale: async () => 'en' },
    '@/extensions/server/runtime': { emitExtensionEvent: async () => {} },
    '@/platform/database/prisma': { db: {
      ticketDepartment: { findUnique: async ({ where }) => ({ active: true, requiresSubscription: where.slug === 'SUBSCRIPTION', requiresProduct: where.slug === 'PRODUCT', fields: '[]' }) },
      subscription: { findFirst: async ({ where }) => { assert.equal(where.userId, 7); assert.equal(where.status, 'ACTIVE'); return hasSubscription ? { id: 9 } : null } },
      order: { findFirst: async ({ where }) => { assert.equal(where.userId, 7); assert.equal(where.status, 'PAID'); assert.equal(where.product.active, true); return hasPurchase ? { productId: 4 } : null } },
      ticket: { create: async ({ data }) => { saved = data; return { id: 1, priority: data.priority } } },
    } },
  })
  const request = data => new NextRequest('http://localhost/api/tickets', { method: 'POST', body: JSON.stringify({ subject: 'Help needed', message: '<p>Please help</p>', ...data }) })
  assert.equal((await route.POST(request({ department: 'SALES' }))).status, 200)
  assert.equal(saved.department, 'SALES'); assert.equal(saved.subscriptionId, undefined)
  assert.equal((await route.POST(request({ department: 'SUBSCRIPTION' }))).status, 400)
  assert.equal((await route.POST(request({ department: 'SUBSCRIPTION', subscriptionId: 9 }))).status, 404)
  hasSubscription = true
  assert.equal((await route.POST(request({ department: 'SUBSCRIPTION', subscriptionId: 9 }))).status, 200)
  assert.equal(saved.subscriptionId, 9)
  assert.equal((await route.POST(request({ department: 'PRODUCT', productId: 4 }))).status, 404)
  hasPurchase = true
  assert.equal((await route.POST(request({ department: 'PRODUCT', productId: 4 }))).status, 200)
  assert.equal(saved.productId, 4)
  assert.equal((await route.POST(request({ department: 'SALES', productId: 4 }))).status, 400)
  role = 'ADMIN'
  assert.equal((await route.POST(request({ department: 'SALES' }))).status, 200)
  assert.equal(saved.messages.create.fromAdmin, false)
})

test('support reply waits for the customer and customer reply reopens the ticket', async () => {
  let role = 'ADMIN', status = 'OPEN'
  const db = {
    ticket: { findUnique: async () => ({ id: 4, userId: 7, status, firstResponseAt: null }), update: async ({ data }) => { status = data.status } },
    ticketMessage: { create: async () => ({ id: 1 }) },
    $transaction: async callback => callback(db),
  }
  const route = load('src/modules/support/server/http/tickets/[id]/route.ts', {
    '@/modules/identity/server/access': { requireUser: async () => ({ id: role === 'ADMIN' ? 1 : 7, role }), requirePerm: async () => true },
    '@/platform/database/prisma': { db },
  })
  const params = { params: Promise.resolve({ id: '4' }) }
  const request = () => new NextRequest('http://localhost/api/tickets/4', { method: 'POST', body: JSON.stringify({ message: '<p>Update</p>' }) })
  assert.equal((await route.POST(request(), params)).status, 200)
  assert.equal(status, 'PENDING')
  role = 'USER'
  assert.equal((await route.POST(request(), params)).status, 200)
  assert.equal(status, 'OPEN')
})

test('an administrator using their customer ticket remains the customer, while a staff reply is marked answered', async () => {
  let status = 'OPEN', sender, lastCustomerAt, lastStaffAt
  const ticket = { id: 4, userId: 7, department: 'SALES', status, firstResponseAt: null, closedAt: null }
  const db = {
    ticket: {
      findUnique: async () => ({ ...ticket, status }),
      update: async ({ data }) => { status = data.status; lastCustomerAt = data.lastCustomerAt; lastStaffAt = data.lastStaffAt },
    },
    ticketMessage: { create: async ({ data }) => { sender = data.fromAdmin; return { id: 1 } } },
    $transaction: async callback => callback(db),
  }
  let userId = 7
  const route = load('src/modules/support/server/http/tickets/[id]/route.ts', {
    '@/modules/identity/server/access': { requireUser: async () => ({ id: userId, role: 'ADMIN' }), requirePerm: async () => true },
    '@/modules/support/server/department-access': { canHandleTicket: async () => true, heldByAnother: () => false, HELD_BY_ANOTHER: 'held' },
    '@/platform/database/prisma': { db },
  })
  const params = { params: Promise.resolve({ id: '4' }) }
  const request = body => new NextRequest('http://localhost/api/tickets/4', { method: 'POST', body: JSON.stringify({ message: '<p>Update</p>', ...body }) })
  assert.equal((await route.POST(request({ asCustomer: true }), params)).status, 200)
  assert.equal(sender, false)
  assert.equal(status, 'OPEN')
  assert.ok(lastCustomerAt instanceof Date)
  userId = 8
  assert.equal((await route.POST(request({ asCustomer: true }), params)).status, 403)
  assert.equal((await route.POST(request({}), params)).status, 200)
  assert.equal(sender, true)
  assert.equal(status, 'PENDING')
  assert.ok(lastStaffAt instanceof Date)
})

test('ticket uploads accept bounded images and reject disguised or excessive files', async () => {
  const { parseTicketSubmission, TicketUploadError } = load('src/modules/support/server/ticket-attachments.ts')
  const png = Buffer.alloc(45)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png)
  png.writeUInt32BE(13, 8)
  png.write('IHDR', 12)
  png.writeUInt32BE(1, 16)
  png.writeUInt32BE(1, 20)
  png.write('IEND', 37)
  const request = blobs => {
    const form = new FormData()
    form.set('payload', JSON.stringify({ message: 'Cannot connect' }))
    for (const [bytes, name] of blobs) form.append('files', new Blob([bytes], { type: 'image/png' }), name)
    return new NextRequest('http://localhost/api/tickets', { method: 'POST', body: form })
  }
  const accepted = await parseTicketSubmission(request([[png, '../error.png']]))
  assert.equal(accepted.files.length, 1)
  assert.equal(accepted.files[0].originalName, 'error.png')
  assert.equal(accepted.files[0].mimeType, 'image/png')
  await assert.rejects(parseTicketSubmission(request([[Buffer.from('<script>alert(1)</script>'), 'error.png']])), TicketUploadError)
  await assert.rejects(parseTicketSubmission(request(Array.from({ length: 4 }, (_, index) => [png, `error-${index}.png`]))), TicketUploadError)
})

test('ticket creation binds an uploaded image to the first message', async () => {
  let saved, stored = false
  const file = { filename: '00000000-0000-4000-8000-000000000001.png', originalName: 'error.png', mimeType: 'image/png', size: 45 }
  const route = load('src/modules/support/server/http/tickets/route.ts', {
    '@/modules/identity/server/access': { requireUser: async () => ({ id: 7, role: 'USER' }) },
    '@/modules/notifications/server/telegram-locale': { getUserLocale: async () => 'en' },
    '@/extensions/server/runtime': { emitExtensionEvent: async () => {} },
    '@/modules/support/server/ticket-attachments': {
      parseTicketSubmission: async () => ({ body: { department: 'SALES', subject: 'Help', message: 'Please see the screenshot' }, files: [file] }),
      saveTicketFiles: async () => { stored = true },
      removeTicketFiles: async () => {},
      ticketAttachmentRows: files => files.map(({ filename, originalName, mimeType, size }) => ({ filename, originalName, mimeType, size })),
    },
    '@/platform/database/prisma': { db: {
      ticketDepartment: { findUnique: async () => ({ active: true, requiresSubscription: false, requiresProduct: false, fields: '[]' }) },
      ticket: { create: async ({ data }) => { saved = data; return { id: 1, priority: data.priority } } },
    } },
  })
  assert.equal((await route.POST(new NextRequest('http://localhost/api/tickets', { method: 'POST', body: '{}' }))).status, 200)
  assert.equal(stored, true)
  assert.equal(saved.messages.create.attachments.create[0].originalName, 'error.png')
})

test('ticket image reads require the ticket owner or assigned support permission', async () => {
  let user = { id: 3, role: 'USER' }, internal = false, permission = false
  const file = { id: 5, filename: '00000000-0000-4000-8000-000000000005.png', mimeType: 'image/png', message: { internal, ticket: { id: 4, userId: 7, department: 'TECH' } } }
  const route = load('src/modules/support/server/http/tickets/[id]/attachments/[attachmentId]/route.ts', {
    '@/modules/identity/server/access': { requireUser: async () => user, requirePerm: async () => permission },
    '@/modules/support/server/department-access': { canHandleTicket: async () => permission, heldByAnother: () => false, HELD_BY_ANOTHER: 'held', managesTickets: () => true },
    '@/platform/database/prisma': { db: { ticketAttachment: { findUnique: async () => ({ ...file, message: { ...file.message, internal } }) } } },
    'node:fs/promises': { readFile: async () => Buffer.from('image bytes') },
  })
  const context = { params: Promise.resolve({ id: '4', attachmentId: '5' }) }
  const request = new NextRequest('http://localhost/api/tickets/4/attachments/5')
  assert.equal((await route.GET(request, context)).status, 404)
  user = { id: 7, role: 'USER' }
  assert.equal((await route.GET(request, context)).status, 200)
  internal = true
  assert.equal((await route.GET(request, context)).status, 404)
  user = { id: 8, role: 'ADMIN' }
  permission = true
  assert.equal((await route.GET(request, context)).status, 200)
})

test('subscription activity only includes the owner’s purchase, renewals and related tickets', async () => {
  let owner = 7, queried = false
  const route = load('src/modules/subscriptions/server/http/subscriptions/[id]/activity/route.ts', {
    '@/modules/identity/server/access': { requireUser: async () => ({ id: owner }) },
    '@/platform/database/prisma': { db: {
      subscription: { findFirst: async ({ where }) => { assert.equal(where.id, 4); return where.userId === 7 ? { id: 4, orderId: 10 } : null } },
      fulfillmentJob: { findMany: async ({ where }) => { queried = true; assert.equal(where.subscriptionId, 4); return [{ orderId: 12 }] } },
      ticket: { findMany: async ({ where }) => { assert.equal(where.userId, 7); assert.equal(where.subscriptionId, 4); return [{ id: 3, status: 'OPEN' }] } },
      order: { findMany: async ({ where }) => { assert.equal(where.userId, 7); assert.deepEqual(where.id.in, [10, 12]); return [{ id: 10, status: 'PAID' }, { id: 12, status: 'PAID' }] } },
    } },
  })
  const context = { params: Promise.resolve({ id: '4' }) }
  owner = 8
  assert.equal((await route.GET(new NextRequest('http://localhost/api/subscriptions/4/activity'), context)).status, 404)
  assert.equal(queried, false)
  owner = 7
  const response = await route.GET(new NextRequest('http://localhost/api/subscriptions/4/activity'), context)
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.deepEqual(data.orders.map(order => order.kind), ['purchase', 'renewal'])
  assert.equal(data.tickets[0].id, 3)
})

test('ticket detail stays owner-scoped and returns the reported subscription context', async () => {
  let userId = 8, role = 'USER', canHandle = false
  const route = load('src/modules/support/server/http/tickets/[id]/route.ts', {
    '@/modules/identity/server/access': { requireUser: async () => ({ id: userId, role }), requirePerm: async () => true },
    '@/modules/support/server/department-access': { canHandleTicket: async () => canHandle, heldByAnother: () => false, HELD_BY_ANOTHER: 'held', managesTickets: () => true },
    '@/platform/database/prisma': { db: {
      ticket: { findUnique: async () => ({ id: 4, userId: 7, subject: 'Connection issue', status: 'OPEN', priority: 'normal', department: 'SUBSCRIPTION', subscriptionId: 9, subscriptionUsername: 'customer-service', subscriptionLink: 'happ://crypt5/owned-link', user: { name: 'Customer', email: 'customer@example.org' }, messages: [] }) },
      ticketDepartment: { findUnique: async () => null },
    } },
  })
  const context = { params: Promise.resolve({ id: '4' }) }
  const request = new NextRequest('http://localhost/api/tickets/4')
  assert.equal((await route.GET(request, context)).status, 403)
  role = 'ADMIN'
  assert.equal((await route.GET(request, context)).status, 403)
  canHandle = true
  assert.equal((await route.GET(request, context)).status, 200)
  role = 'USER'
  userId = 7
  const response = await route.GET(request, context)
  assert.equal(response.status, 200)
  const detail = await response.json()
  assert.equal(detail.subscriptionUsername, 'customer-service')
  assert.equal(detail.subscriptionLink, 'happ://crypt5/owned-link')
  assert.equal(detail.userName, 'Customer')
})

test('journal comments require sign-in, moderation and an approved parent for replies', async () => {
  let user = null, saved, autoApproveComments = false
  const route = load('src/modules/site/server/http/public/blog/[slug]/comments/route.ts', {
    '@/modules/identity/server/access': { requireUser: async () => user },
    '@/modules/journal/server/admin': { getJournalSettings: async () => ({ autoApproveComments }) },
    '@/modules/journal/server/comment-notification-intents': { queueCommentNotification: async () => {} },
    '@/platform/database/prisma': { db: {
      post: { findUnique: async () => ({ id: 5, status: 'PUBLISHED', publishedAt: new Date(Date.now() - 60_000) }) },
      postComment: { findFirst: async () => null, create: async ({ data }) => { saved = data; return { id: 11, status: 'PENDING' } } },
      $transaction: async work => work({ postComment: { create: async ({ data }) => { saved = data; return { id: 11, status: data.status } } } }),
    } },
  })
  const context = { params: Promise.resolve({ slug: 'example' }) }
  const request = body => new NextRequest('http://localhost/api/blog/example/comments', { method: 'POST', body: JSON.stringify(body) })
  assert.equal((await route.POST(request({ body: 'Useful article' }), context)).status, 401)
  user = { id: 31 }
  assert.equal((await route.POST(request({ body: '<script>alert(1)</script>' }), context)).status, 400)
  assert.equal((await route.POST(request({ body: 'A reply', parentId: 50 }), context)).status, 404)
  assert.equal((await route.POST(request({ body: 'Useful article' }), context)).status, 201)
  assert.equal(saved.status, 'PENDING')
  assert.equal(saved.userId, 31)
  // The journal setting «انتشار خودکار دیدگاه» publishes member comments without review.
  autoApproveComments = true
  user = { id: 32 }
  assert.equal((await route.POST(request({ body: 'Another useful note' }), context)).status, 201)
  assert.equal(saved.status, 'APPROVED')
})

test('incident administration denies users without support permission', async () => {
  const route = load('src/modules/support/server/http/admin/incidents/route.ts', {
    '@/modules/identity/server/access': { requirePerm: async () => null },
    '@/platform/database/prisma': { db: {} },
  })
  for (const verb of ['GET', 'POST', 'PATCH']) assert.equal((await route[verb](new NextRequest('http://localhost/api/admin/incidents'))).status, 403)
})

test('connection guide validates every device and language and rejects unsafe downloads', () => {
  const { defaultConnectionGuide, validateConnectionGuide } = load('src/modules/site/domain/connection-guide.ts')
  assert.deepEqual(validateConnectionGuide(defaultConnectionGuide), defaultConnectionGuide)
  for (const url of ['javascript:alert(1)', 'http://example.org', 'https://user:secret@example.org', 'https://example.org/\\evil']) {
    const value = structuredClone(defaultConnectionGuide)
    value.platforms.android.downloadUrl = url
    assert.throws(() => validateConnectionGuide(value))
  }
  const value = structuredClone(defaultConnectionGuide)
  value.platforms.android.downloadUrl = ''
  assert.equal(validateConnectionGuide(value).platforms.android.downloadUrl, '')
  value.platforms.ios.install.en = ' '
  assert.throws(() => validateConnectionGuide(value))
  delete value.platforms.ios
  assert.throws(() => validateConnectionGuide(value))
})

test('connection guide admin requires permission and saves only validated settings', async () => {
  let allowed = false, stored = null
  const mocks = {
    '@/modules/identity/server/access': { requirePerm: async (_req, permission) => allowed && permission === 'settings.manage' },
    '@/platform/database/prisma': { db: { setting: {
      findUnique: async () => stored,
      upsert: async args => { stored = args.create },
    } } },
  }
  const route = load('src/modules/site/server/http/admin/connection-guide/route.ts', mocks)
  const request = value => new NextRequest('http://localhost/api/admin/connection-guide', { method: 'PATCH', body: JSON.stringify(value) })
  assert.equal((await route.GET(request({}))).status, 403)
  assert.equal((await route.PATCH(request({}))).status, 403)
  allowed = true
  assert.equal((await route.PATCH(request({}))).status, 400)
  assert.equal(stored, null)
  const { defaultConnectionGuide } = load('src/modules/site/domain/connection-guide.ts')
  const value = structuredClone(defaultConnectionGuide)
  value.platforms.windows.install.fa = 'متن سفارشی نصب'
  value.privateToken = 'must-not-persist'
  assert.equal((await route.PATCH(request(value))).status, 200)
  const result = await (await route.GET(request({}))).json()
  assert.equal(result.platforms.windows.install.fa, 'متن سفارشی نصب')
  assert.equal(JSON.stringify(stored).includes('must-not-persist'), false)
})

function load(file, mocks = {}, cache = new Map()) {
  const absolute = path.resolve(__dirname, '..', file)
  if (cache.has(absolute)) return cache.get(absolute).exports
  const mod = { exports: {} }; cache.set(absolute, mod)
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const localRequire = name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    // These scenarios isolate maintenance/CSP; native user-groups checks cover the additional access policy.
    if (name === '@/modules/account/server/section-access') return { loadSectionAccess: async () => ({}), sectionLock: async () => 'open' }
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.resolve(__dirname, '../src', name.slice(2)) : path.resolve(path.dirname(absolute), name)
      for (const suffix of ['.ts', '.tsx', '/index.ts']) if (fs.existsSync(base + suffix)) return load(path.relative(path.resolve(__dirname, '..'), base + suffix), mocks, cache)
      if (base.endsWith('.json') && fs.existsSync(base)) return require(base)
    }
    return require(name)
  }
  new Function('require', 'module', 'exports', code)(localRequire, mod, mod.exports)
  return mod.exports
}

test('homepage discovery preserves configured copy and hides closed destinations even with stale public data', () => {
  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server')
  const { default: HomeHero } = load('src/themes/code/mobocom/home/hero.tsx', {
    '@/platform/routing/Link': ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children),
    '@/themes/sdk/server': { themeImage: image => image, themeImageSet: () => undefined },
    '@/themes/sdk/client': { ThemeLiveSearch: () => React.createElement('input', { name: 'q', 'aria-label': 'Search' }) },
  })
  const local = fa => ({ fa, en: fa })
  const section = { id: 'owner-hero', kind: 'hero', enabled: true, title: local('عنوان مدیر\nخط دوم'), eyebrow: local('سرصفحه'), description: local('توضیحات مدیر'), action: { href: '/products', label: local('فروشگاه') }, items: [] }
  const site = { sections: [{ kind: 'services', enabled: true, items: [{ href: '/cinema', title: local('سینما') }, { href: '/prompts', title: local('پرامپت‌ها') }] }] }
  const data = { disabledPaths: ['/cinema', '/vip', '/products'], stats: [{ key: 'cinema', value: 99, href: '/cinema', label: 'محرمانه' }], showcase: [
    { kind: 'cinema', href: '/cinema/closed', title: 'CLOSED TITLE', image: '/closed.webp', cover: '', meta: '' },
    { kind: 'music', href: '/music/album/public', title: 'PUBLIC ALBUM', cover: '/public.webp', meta: 'Artist' },
  ] }
  const html = renderToStaticMarkup(React.createElement(HomeHero, { section, site, data, locale: 'fa' }))
  assert.match(html, /عنوان مدیر/); assert.match(html, /توضیحات مدیر/)
  assert.match(html, /PUBLIC ALBUM/); assert.match(html, /href="\/prompts"/)
  assert.doesNotMatch(html, /CLOSED TITLE|closed.webp|href="\/cinema|href="\/vip|href="\/products|محرمانه/)
  const empty = renderToStaticMarkup(React.createElement(HomeHero, { section, site, data: { ...data, showcase: [], stats: [], disabledPaths: ['/search', '/vip', '/products', '/cinema'] }, locale: 'fa' }))
  assert.match(empty, /عنوان مدیر/)
  assert.match(empty, /is-text-only/, 'the original Universe layout supports an empty catalogue')
  assert.doesNotMatch(empty, /<form|\/public.webp|\/closed.webp|muv-feature-art/)
})

test('homepage service directory composes configured destinations without reopening hidden modules or duplicating cards', () => {
  const { discoveryLinks } = load('src/themes/code/mobocom/home/discovery.ts')
  const text = fa => ({ fa, en: fa })
  const site = { sections: [{ enabled: true, kind: 'services', items: [{ href: '/music', title: text('موزیک'), text: text('آهنگ'), icon: '' }] }], navigation: [
    { href: '/music', label: text('Duplicate') }, { href: '/celebrities', label: text('هنرمندان') },
    { href: '/businesses', label: text('Hidden'), enabled: false }, { href: '/prompts', label: text('Closed') },
  ] }
  const links = discoveryLinks(site, { disabledPaths: ['/prompts'], stats: [] }, 'fa')
  assert.deepEqual(links.map(item => item.href), ['/music', '/celebrities'])
  assert.equal(links[0].icon, '', 'an explicitly removed icon stays removed')
})

test('cover URLs accept local/remote images and reject executable or malformed input', () => {
  const { validateCover } = load('src/shared/content/cover.ts')
  for (const value of ['', '/api/media/covers/test.webp', 'https://example.org/cover.jpg']) assert.equal(validateCover(value), value)
  for (const value of ['javascript:alert(1)', '//example.org/a', '/\\evil', 'data:image/svg+xml,bad', {}, 'https://a b.org']) assert.throws(() => validateCover(value))
})

test('page layout round-trips the cover, preserves layout, and supports clearing it', async () => {
  let stored = null
  const { validatePageLayout, getPageLayout } = load('src/modules/site/server/page-layout.ts', { '@/platform/database/prisma': { db: { setting: { findUnique: async () => stored } } } })
  assert.equal((await getPageLayout(1)).cover, '')
  stored = { value: JSON.stringify(validatePageLayout({ cover: '/images/network-earth.webp', pageLayout: 'sidebar' })) }
  const result = await getPageLayout(1)
  assert.equal(result.cover, '/images/network-earth.webp'); assert.equal(result.pageLayout, 'sidebar')
  assert.equal(validatePageLayout({ ...result, cover: '' }).cover, '')
})

test('page layout mutation reads reject corrupt data; snapshots include known presentation only', async () => {
  let value=JSON.stringify({companyPanel:'contact',cover:'/images/network-earth.webp',formSlug:'contact',futureSetting:'keep',providerSecret:'never version this'})
  const {readPageLayout,getPageLayout,pageLayoutSnapshot}=load('src/modules/site/server/page-layout.ts',{'@/platform/database/prisma':{db:{setting:{findUnique:async()=>({value})}}}})
  const state=await readPageLayout(1),snapshot=pageLayoutSnapshot({id:1,title:'Page'},state.layout)
  assert.equal(state.raw.futureSetting,'keep');assert.equal(JSON.parse(snapshot.__relations).pageLayout.companyPanel,'contact');assert.doesNotMatch(snapshot.__relations,/futureSetting|providerSecret|never version/)
  value='{invalid';await assert.rejects(readPageLayout(1));assert.equal((await getPageLayout(1)).companyPanel,'none')
  value=JSON.stringify({companyPanel:'unsupported'});await assert.rejects(readPageLayout(1),/معتبر/)
})

test('storefront is opt-in and public filtering does not erase editable menus', async () => {
  let enabled = false
  const { defaultSite } = load('src/modules/site/config/defaults.ts')
  const db = { setting: { findUnique: async ({ where }) => where.key === 'storeEnabled' ? { value: String(enabled) } : { value: JSON.stringify(defaultSite) } } }
  const mocks = { react: { cache: fn => fn }, '@/platform/database/prisma': { db }, '@/extensions/server/modules': { isModuleEnabled: async () => true }, '@/extensions/server/state': { getPublicExtensionRuntime: async () => ({}) } }
  const { getPublicSiteConfig, getSiteConfig } = load('src/modules/site/config/store.ts', mocks)
  const hidden = await getPublicSiteConfig()
  assert.equal(hidden.navigation.some(link => link.href === '/products'), false)
  assert.equal(hidden.sections.find(section => section.kind === 'products').enabled, false)
  assert.equal((await getSiteConfig()).navigation.some(link => link.href === '/products'), true)
  enabled = true
  assert.equal((await getPublicSiteConfig()).navigation.some(link => link.href === '/products'), true)
  const { isStoreEnabled } = load('src/modules/catalog/server/storefront.ts', { '@/platform/database/prisma': { db: { setting: { findUnique: async () => null } } }, '@/extensions/server/modules': { isModuleEnabled: async () => true } })
  assert.equal(await isStoreEnabled(), false)
})

test('disabled storefront blocks new product checkout before inventory or payment access', async () => {
  const mocks = { '@/platform/database/prisma': { db: { order: { findUnique: async () => null } } }, '@/modules/catalog/server/storefront': { isStoreEnabled: async () => false } }
  for (const name of ['@/modules/billing/server/gateways', '@/modules/billing/server/billing', '@/modules/wallet/server/wallet', '@/modules/subscriptions/server/usernames', '@/modules/fulfillment/server/jobs', '@/modules/catalog/server/inventory', '@/shared/money', '@/extensions/server/runtime']) mocks[name] = {}
  const { executeCheckout } = load('src/modules/checkout/server/checkout.ts', mocks)
  const result = await executeCheckout({ userId: 1, productId: 1, idempotencyKey: 'test-store-disabled', siteUrl: 'http://localhost' })
  assert.equal(result.code, 'STORE_DISABLED'); assert.equal(result.status, 403)
})

test('direct checkout rejects an active product awaiting approval before payment access', async () => {
  const db = {
    order: { findUnique: async () => null },
    product: { findUnique: async () => ({ id: 7, active: true, approval: 'PENDING', name: 'Awaiting approval', variants: [] }) },
  }
  const mocks = {
    '@/platform/database/prisma': { db },
    '@/modules/catalog/server/storefront': { isStoreEnabled: async () => true },
    '@/modules/membership/server/membership': { isMember: async () => false, opensMembersOnly: async (_userId, member) => !!member },
  }
  for (const name of ['@/modules/billing/server/gateways', '@/modules/billing/server/billing', '@/modules/wallet/server/wallet', '@/modules/subscriptions/server/usernames', '@/modules/fulfillment/server/jobs', '@/modules/catalog/server/inventory', '@/shared/money', '@/extensions/server/runtime']) mocks[name] = {}
  const { executeCheckout } = load('src/modules/checkout/server/checkout.ts', mocks)
  const result = await executeCheckout({ userId: 1, productId: 7, idempotencyKey: 'test-pending-product', siteUrl: 'http://localhost' })
  assert.equal(result.code, 'PRODUCT_NOT_FOUND'); assert.equal(result.status, 404)
  const malformed = await executeCheckout({ userId: 1, lines: [{ productId: 7, quantity: 0 }, { productId: 8, quantity: 1 }], idempotencyKey: 'test-pending-cart', siteUrl: 'http://localhost' })
  assert.equal(malformed.code, 'PRODUCT_NOT_FOUND'); assert.doesNotMatch(malformed.message, /Awaiting approval/)
})

test('authenticated homepage cards hide wallet details while other plan views retain them', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const { default: PlanCards } = load('src/components/PlanCards.tsx', {
    'next-auth/react': { useSession: () => ({ status: 'authenticated' }) },
    'next/navigation': { useRouter: () => ({ push() {} }) },
    '@/i18n/LocaleProvider': { useI18n: () => ({ locale: 'en', t: { walletBalance: 'Wallet balance', walletPayHint: 'Wallet payment hint', topUpWallet: 'Top up' } }) },
    '@/modules/checkout/ui/client': { money: value => `$${value}`, fetchWalletBalances: async () => [] },
  })
  const home = renderToStaticMarkup(React.createElement(PlanCards, { plans: [], showWallet: false }))
  const standard = renderToStaticMarkup(React.createElement(PlanCards, { plans: [] }))
  assert.doesNotMatch(home, /wallet-strip|Wallet balance|Wallet payment hint/)
  assert.match(standard, /Wallet balance/)
})

test('media upload requires CMS access, rejects invalid bytes, and serves uploads immediately', async () => {
  let allowed = false
  const files = new Map()
  const mocks = {
    '@/modules/identity/server/access': { requirePerm: async () => allowed ? { id: 1 } : null },
    // This test owns upload validation/storage. Library identity and persistence
    // have their own connected tests; keep that shared boundary explicit here.
    '@/modules/media/server/library': { libraryActor: async () => ({ id: 1 }), currentLibraryUser: async actor => actor, registerLocalAsset: async () => ({ id: 9, revision: 1 }) },
    'node:fs/promises': { mkdir: async () => {}, writeFile: async (file, bytes) => files.set(file, bytes), readFile: async file => { if (!files.has(file)) throw new Error('missing'); return files.get(file) } },
  }
  const { POST } = load('src/modules/site/server/http/admin/media/route.ts', mocks)
  const { GET } = load('src/modules/site/server/http/media/cover-route.ts', mocks)
  const request = (bytes) => { const form = new FormData(); form.append('file', new Blob([bytes], { type: 'image/webp' }), 'cover.webp'); return new NextRequest('http://localhost/api/admin/media', { method: 'POST', body: form }) }
  const bytes = fs.readFileSync(path.join(__dirname, '../public/images/network-earth.webp'))
  assert.equal((await POST(request(bytes))).status, 403)
  allowed = true
  assert.equal((await POST(request('<svg>bad</svg>'))).status, 400)
  const response = await POST(request(bytes)); assert.equal(response.status, 200)
  const { url } = await response.json()
  const served = await GET(new Request('http://localhost' + url), { params: { file: url.split('/').pop() } })
  assert.equal(served.headers.get('Content-Type'), 'image/webp')
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), [...files.values()].pop())
  assert.equal((await GET(new Request('http://localhost'), { params: { file: '../.env' } })).status, 404)
  const oversized = new NextRequest('http://localhost/api/admin/media', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=test' }, body: Buffer.alloc(17 * 1024 * 1024) })
  assert.equal((await POST(oversized)).status, 413)
})

test('renewal adds time and traffic while preserving remaining allowance and unlimited quotas', () => {
  const { renewalTarget } = load('src/modules/subscriptions/domain/renewal.ts')
  const day = 86400000, now = Date.UTC(2026, 8, 21)
  const input = { now, localExpiresAt: now + 10 * day, panelExpiresAt: now + 10 * day, localLimitGB: 100, panelLimitGB: 100, days: 30, trafficGB: 50 }
  const next = renewalTarget(input)
  assert.equal(next.trafficLimitGB - 40, 110) // 60 GB remaining + the purchased 50 GB.
  assert.equal(new Date(next.expiresAt).getTime(), now + 40 * day)
  assert.equal(new Date(renewalTarget({ ...input, localExpiresAt: now - day, panelExpiresAt: now - day }).expiresAt).getTime(), now + 30 * day)
  assert.equal(renewalTarget({ ...input, panelLimitGB: 0 }).trafficLimitGB, 0)
  assert.equal(renewalTarget({ ...input, trafficGB: 0 }).trafficLimitGB, 0)
  assert.throws(() => renewalTarget({ ...input, days: -1 }))
})

function renewalHarness() {
  const gb = 1024 ** 3
  const expiresAt = new Date(Date.now() + 10 * 86400000)
  const state = {
    lock: null, failCommit: false, failRead: false, failAfterPanel: false, calls: [],
    sub: { id: 9, username: 'test', trafficLimit: 100, trafficUsed: 40, expiresAt, panelSubUrl: '/sub', panel: {}, plan: { days: 999, trafficGB: 999, panel: {} } },
    remote: { trafficLimit: 100 * gb, trafficUsed: 40 * gb, expiresAt, subUrl: '/sub' },
    jobs: [1, 2].map(id => ({ id, subscriptionId: 9, kind: 'RENEW_SUBSCRIPTION', status: 'PENDING', payload: JSON.stringify({ subscriptionId: 9, days: 30, trafficGB: 50, renewalVersion: 2 }) })),
  }
  const db = {
    setting: {
      create: async ({ data }) => { if (state.lock) throw Object.assign(new Error('unique'), { code: 'P2002' }); state.lock = { ...data } },
      findUnique: async () => state.lock,
      updateMany: async () => ({ count: 0 }),
      deleteMany: async ({ where }) => { if (state.lock?.value === where.value) state.lock = null },
    },
    subscription: { findUnique: async () => structuredClone(state.sub), update: async ({ data }) => Object.assign(state.sub, data) },
    fulfillmentJob: {
      findFirst: async ({ where }) => state.jobs.find(job => job.id < where.id.lt && job.status !== 'DONE') || null,
      update: async ({ where, data }) => Object.assign(state.jobs.find(job => job.id === where.id), data),
    },
    $transaction: async fn => { if (state.failCommit) { state.failCommit = false; throw new Error('database unavailable') } return fn(db) },
  }
  const adapter = {
    getUser: async () => state.failRead ? { ok: false } : { ok: true, user: structuredClone(state.remote) },
    updateUser: async (_username, target) => {
      state.calls.push(structuredClone(target))
      state.remote.expiresAt = target.expiresAt; state.remote.trafficLimit = target.trafficGB * gb
      if (state.failAfterPanel) { state.failAfterPanel = false; throw new Error('response lost') }
      return { ok: true, user: structuredClone(state.remote) }
    },
  }
  const { applyPaidRenewal } = load('src/modules/subscriptions/server/renewal.ts', { '@/platform/database/prisma': { db }, '@/modules/providers/server/panels': { getPanelAdapter: () => adapter } })
  return { state, apply: index => applyPaidRenewal(structuredClone(state.jobs[index])) }
}

test('renewal retries after a lost panel response or failed DB commit do not add credit twice', async () => {
  for (const fault of ['failAfterPanel', 'failCommit']) {
    const { state, apply } = renewalHarness()
    state[fault] = true
    const originalExpiry = state.sub.expiresAt.getTime()
    await assert.rejects(apply(0))
    assert.equal(state.remote.trafficLimit, 150 * 1024 ** 3)
    assert.equal(state.sub.trafficLimit, 100)
    await apply(0)
    assert.equal(state.sub.trafficLimit, 150)
    assert.equal(state.sub.trafficUsed, 40)
    assert.equal(state.sub.expiresAt.getTime(), originalExpiry + 30 * 86400000)
    assert.deepEqual(state.calls[0], state.calls[1])
    await apply(0)
    assert.equal(state.calls.length, 2)
  }
})

test('paid renewals execute in order and use purchased allowances instead of edited plan values', async () => {
  const { state, apply } = renewalHarness()
  await assert.rejects(apply(1), /earlier paid renewal/)
  assert.equal(state.calls.length, 0)
  const originalExpiry = state.sub.expiresAt.getTime()
  await apply(0); state.jobs[0].status = 'DONE'
  await apply(1)
  assert.equal(state.sub.trafficLimit, 200)
  assert.equal(state.sub.trafficUsed, 40)
  assert.equal(state.sub.expiresAt.getTime(), originalExpiry + 60 * 86400000)
})

test('unavailable panel leaves renewal credit unapplied and retryable', async () => {
  const { state, apply } = renewalHarness()
  state.failRead = true
  await assert.rejects(apply(0), /cannot read/)
  assert.equal(state.calls.length, 0)
  assert.equal(state.sub.trafficLimit, 100)
  assert.equal(state.lock, null)
  state.failRead = false
  await apply(0)
  assert.equal(state.sub.trafficLimit, 150)
})

test('concurrent workers cannot apply the same renewal twice', async () => {
  const { state, apply } = renewalHarness()
  const results = await Promise.allSettled([apply(0), apply(0)])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(state.calls.length, 1)
  assert.equal(state.sub.trafficLimit, 150)
})

test('customer traffic resets and their legacy alias are denied before calling the provider', async () => {
  let called = false
  const { POST } = load('src/modules/subscriptions/server/http/subscriptions/[id]/route.ts', {
    '@/platform/database/prisma': { db: { subscription: { findUnique: async () => ({ id: 1, userId: 2 }) } } },
    '@/modules/identity/server/access': { requireUser: async () => ({ id: 2 }) },
    '@/modules/subscriptions/server/submanage': { CUSTOMER_SUB_ACTIONS: ['renew', 'sync'], subscriptionAction: async () => { called = true } },
  })
  for (const action of ['reset-traffic', 'resetTraffic']) {
    const req = new NextRequest('http://localhost/api/subscriptions/1', { method: 'POST', body: JSON.stringify({ action }) })
    assert.equal((await POST(req, { params: { id: '1' } })).status, 403)
  }
  assert.equal(called, false)
})

test('disabled public API denies access without resolving credentials', async () => {
  const { authorize } = load('src/modules/public-api/server/v1.ts', {
    '@/modules/public-api/server/availability': { isPublicApiEnabled: async () => false },
    '@/modules/public-api/server/api-keys': { resolveApiCaller: () => { throw new Error('must not resolve credentials') } },
  })
  const result = await authorize(new NextRequest('http://localhost/api/v1/me'))
  assert.equal(result.ok, false); assert.equal(result.response.status, 404)
})

test('category trees expose complete paths, exclude descendants and reject invalid selections', () => {
  const { categoryDescendants, categoryOptions, parseCategoryIds, postCategories } = load('src/modules/site/domain/categories.ts')
  const nodes = [{id:1,name:'Root'}, {id:2,name:'Child',parentId:1}, {id:3,name:'Leaf',parentId:2}, {id:4,name:'Other'}]
  assert.deepEqual(categoryDescendants(nodes,1),[1,2,3])
  assert.equal(categoryOptions(nodes,'en').find(x=>x.value==='3').label,'Root / Child / Leaf')
  assert.deepEqual(categoryOptions(nodes,'en',1).map(x=>x.value),['4'])
  assert.deepEqual(parseCategoryIds(['1',2,1]),[1,2])
  for(const invalid of [null,'1',[0],[-1],[true],[{}],[1.5],Array(101).fill(1)]) assert.throws(()=>parseCategoryIds(invalid))
  assert.deepEqual(postCategories({category:nodes[0],categories:[{category:nodes[0]},{category:nodes[1]}]}).map(x=>x.id),[1,2])
})

test('category parent validation rejects self, ancestor cycles and missing parents', async () => {
  const nodes = [{id:1,name:'Root'}, {id:2,name:'Child',parentId:1}, {id:3,name:'Leaf',parentId:2}]
  const tx = { postCategory: { findMany: async()=>nodes, count: async({where})=>nodes.filter(x=>where.id.in.includes(x.id)).length } }
  const {validateCategoryParent,validateCategorySelection,categoryFilter}=load('src/modules/site/server/categories.ts',{'@/platform/database/prisma':{db:tx}})
  assert.equal(await validateCategoryParent(tx,'',1),null)
  assert.equal(await validateCategoryParent(tx,1,3),1)
  for(const parent of [1,2,3,99]) await assert.rejects(()=>validateCategoryParent(tx,parent,1))
  await assert.rejects(()=>validateCategorySelection(tx,{categoryIds:[1,99]}))
  assert.deepEqual(await validateCategorySelection(tx,{categoryIds:[]}),[])
  assert.deepEqual(await validateCategorySelection(tx,{categoryId:2}),[2])
  assert.deepEqual(await categoryFilter('unknown'),{OR:[{categoryId:{in:[]}},{categories:{some:{categoryId:{in:[]}}}}]})
})

test('renewal preview is read-only, owner-scoped and uses live remaining data', async () => {
  const plan={id:2,name:'Monthly',days:30,trafficGB:50,price:5,priceMinor:500n,currency:'USD',panel:{id:1}}
  const sub={id:3,userId:7,username:'test',plan,panel:null,expiresAt:new Date('2090-01-01'),trafficLimit:100}
  let pending=null, balance=10, online=true, reads=0
  const user={trafficUsed:40*1024**3,trafficLimit:100*1024**3,expiresAt:new Date('2090-01-05')}
  const mocks={
    '@/platform/database/prisma':{db:{subscription:{findUnique:async()=>sub},fulfillmentJob:{findFirst:async()=>pending}}},
    '@/modules/providers/server/panels':{getPanelAdapter:()=>({getUser:async()=>{reads++;return {ok:online,user:online?user:null}}})},
    '@/modules/wallet/server/wallet':{walletBalance:async()=>balance},
  }
  const {getRenewalPreview,renewalTerms}=load('src/modules/subscriptions/server/renewal-preview.ts',mocks)
  assert.equal(await getRenewalPreview(3,8),null);assert.equal(reads,0)
  let result=await getRenewalPreview(3,7)
  assert.equal(result.currentRemainingGB,60);assert.equal(result.nextRemainingGB,110)
  assert.equal(result.nextExpiresAt,new Date(new Date('2090-01-05').getTime()+30*86400000).toISOString())
  assert.equal(result.price,5);assert.equal(result.canPay,true)
  const terms=result.terms
  for(const change of [{priceMinor:600n},{days:31},{trafficGB:60},{currency:'EUR'}]) assert.notEqual(renewalTerms({...plan,...change}),terms)
  balance=0;result=await getRenewalPreview(3,7);assert.equal(result.canPay,false)
  user.trafficLimit=0;result=await getRenewalPreview(3,7);assert.equal(result.currentRemainingGB,null);assert.equal(result.nextRemainingGB,null)
  pending={id:9};await assert.rejects(()=>getRenewalPreview(3,7),/RENEWAL_PENDING/)
  pending=null;online=false;await assert.rejects(()=>getRenewalPreview(3,7),/PANEL_UNAVAILABLE/)
})

test('changed renewal terms are rejected before any wallet charge or order creation', async()=>{
  const mocks={
    '@/platform/database/prisma':{db:{subscription:{findUnique:async()=>({id:3,userId:7,plan:{id:2,price:6,priceMinor:600n,currency:'USD',days:30,trafficGB:50,panel:{id:1}}})},order:{findUnique:async()=>null}}},
    '@/modules/providers/server/panels':{getPanelAdapter:()=>({})},
    '@/modules/subscriptions/server/provision':{},
    '@/modules/billing/server/billing':{},
    '@/modules/wallet/server/wallet':{walletBalance:()=>{throw new Error('Must not touch wallet')}},
    '@/modules/fulfillment/server/jobs':{},
  }
  const {subscriptionAction}=load('src/modules/subscriptions/server/submanage.ts',mocks)
  const result=await subscriptionAction(3,'renew',{idempotencyKey:'renew-test-123',expectedTerms:'old-terms'})
  assert.equal(result.ok,false);assert.equal(result.code,'RENEWAL_CHANGED')
})

test('reminder thresholds handle boundary, unlimited traffic and invalid data safely',()=>{
  const {reminderDefaults,validateReminderSettings,reminderFacts,renderReminder}=load('src/modules/notifications/domain/reminders.ts')
  const now=Date.now();const input={now,expiresAt:now+3*86400000,used:80,limit:100}
  assert.equal(reminderFacts(input,reminderDefaults).expiry,true)
  assert.equal(reminderFacts(input,reminderDefaults).traffic,true)
  assert.equal(reminderFacts({...input,expiresAt:input.expiresAt+1,used:79},reminderDefaults).expiry,false)
  assert.equal(reminderFacts({...input,limit:0},reminderDefaults).traffic,false)
  assert.equal(reminderFacts({...input,expiresAt:now-1000},reminderDefaults).expired,true)
  assert.equal(reminderFacts({...input,expiresAt:now-1000},reminderDefaults).expiry,false)
  assert.equal(reminderFacts({...input,expiresAt:now-86400001},reminderDefaults),null)
  assert.equal(reminderFacts({...input,used:NaN},reminderDefaults),null)
  for(const change of [{expiryDays:0},{expiryDays:31},{trafficPercent:0},{trafficPercent:91},{enabled:'true'},{expiryTemplate:'{secret}'},{trafficTemplate:''},{expiredTemplate:'{secret}'},{expiryTemplateEn:'{secret}'},{trafficTemplateEn:''},{expiredTemplateEn:'{secret}'}]) assert.throws(()=>validateReminderSettings({...reminderDefaults,...change}))
  assert.equal(renderReminder('{plan} {username}',{plan:'<b>plain</b>',username:'a&b'}),'<b>plain</b> a&b')
})

test('reminder worker deduplicates cycles, respects opt-out, and never retries uncertain delivery',async()=>{
  const records=new Map(),settings=new Map(),texts=[];let sends=0,optedOut=false,sendResult={ok:true,status:200},pending=null,locale='en'
  let expiresAt=new Date(Date.now()+86400000),limit=100*1024**3
  const sub={id:1,userId:2,username:'demo',status:'ACTIVE',panel:{active:true},plan:{name:'پلن تست',nameEn:'Test plan',trafficGB:50,days:30},user:{telegramId:'test-chat'}}
  const db={
    setting:{findUnique:async({where})=>settings.has(where.key)?{key:where.key,value:settings.get(where.key)}:null,
      create:async({data})=>{if(settings.has(data.key))throw {code:'P2002'};settings.set(data.key,data.value);return data},
      upsert:async({where,create,update})=>{settings.set(where.key,settings.has(where.key)?update.value:create.value)},
      deleteMany:async({where})=>{if(settings.get(where.key)===where.value)settings.delete(where.key);return {count:1}},
      updateMany:async()=>({count:0})},
    subscription:{findMany:async()=>[sub]},user:{findUnique:async()=>({telegramId:'test-chat',subscriptionAlerts:!optedOut,status:'ACTIVE'})},
    fulfillmentJob:{findFirst:async()=>pending},
    subscriptionReminder:{
      create:async({data})=>{if(records.has(data.id))throw {code:'P2002'};records.set(data.id,{...data,status:'CLAIMED',attempts:1});return data},
      update:async({where,data})=>records.set(where.id,{...records.get(where.id),...data}),
      updateMany:async()=>({count:0})},
  }
  const {reminderDefaults}=load('src/modules/notifications/domain/reminders.ts')
  const mocks={
    '@/platform/database/prisma':{db},
    './telegram-locale':{getBotLocale:async()=>locale,botText:(lang,en,fa)=>lang==='fa'?fa:en},
    './reminder-settings':{getReminderSettings:async()=>({...reminderDefaults,enabled:true})},
    '@/modules/providers/server/panels':{getPanelAdapter:()=>({getUser:async()=>({ok:true,user:{status:'active',trafficUsed:90*1024**3,trafficLimit:limit,expiresAt}})})},
    '@/modules/notifications/server/telegram':{telegramConfig:async()=>({ready:true}),miniAppButton:async(label,path)=>[{text:label,web_app:{url:path}}],bot:async(method,payload)=>{assert.equal(method,'sendMessage');assert.equal(payload.parse_mode,undefined);assert.ok(payload.reply_markup.inline_keyboard[0][0].web_app.url.includes('subscription=1&renew=1'));texts.push(payload.text);sends++;return sendResult}},
  }
  const {runSubscriptionReminders,REMINDER_RUN}=load('src/modules/notifications/server/reminders.ts',mocks)
  const run=async()=>{settings.delete(REMINDER_RUN);return runSubscriptionReminders()}
  await run();assert.equal(sends,2);assert.match(texts[0],/Test plan/);assert.doesNotMatch(texts[0],/پلن تست/);await run();assert.equal(sends,2)
  expiresAt=new Date(expiresAt.getTime()+86400000);optedOut=true;await run();assert.equal(sends,2)
  optedOut=false;pending={id:1};await run();assert.equal(sends,2)
  pending=null;sendResult={ok:false};await run();assert.equal(sends,4);await run();assert.equal(sends,4)
  assert.equal([...records.values()].filter(row=>row.status==='UNKNOWN').length,2)
  expiresAt=new Date(expiresAt.getTime()+86400000);sendResult={ok:true,status:200};locale='fa';await run();assert.equal(sends,6);assert.match(texts.at(-1),/پلن تست/)
})

test('concurrent reminder claims admit one sender for a cycle',async()=>{
  let exists=false
  const mocks={'@/platform/database/prisma':{db:{subscriptionReminder:{create:async()=>{if(exists)throw {code:'P2002'};exists=true},updateMany:async()=>({count:0})}}}}
  const {claimReminder}=load('src/modules/notifications/server/reminders.ts',mocks)
  assert.deepEqual((await Promise.all([claimReminder('same',1,'expiry'),claimReminder('same',1,'expiry')])).sort(),[false,true])
})

test('visual page blocks validate content, reject unsafe links, and load saved sections', async () => {
  let stored = null
  const mocks = { '@/platform/database/prisma': { db: { setting: { findUnique: async () => stored } } } }
  const { validatePageBlocks } = load('src/modules/site/domain/page-blocks.ts', mocks)
  const { getPageBlocks } = load('src/modules/site/server/page-blocks.ts', mocks)
  const block = { id: 'intro', kind: 'hero', title: 'Welcome', titleEn: 'Welcome', text: 'Safe text', image: '/cover.webp', link: '/plans', tone: 'accent' }
  const result = validatePageBlocks([block])
  assert.equal(result[0].link, '/plans')
  stored = { value: JSON.stringify(result) }
  assert.deepEqual(await getPageBlocks(3), result)
  for (const change of [{ link: 'javascript:alert(1)' }, { image: '//evil.example/a' }, { id: 'bad id' }, { kind: 'script' }]) assert.throws(() => validatePageBlocks([{ ...block, ...change }]))
  assert.throws(() => validatePageBlocks([block, block]))
})

test('ticket departments validate fields and restrict staff to assigned teams', () => {
  const { validateDepartment, validateAnswers, parseFields, canHandleDepartment } = load('src/modules/support/domain/department-config.ts')
  const config = validateDepartment({ slug: 'technical', nameFa: 'فنی', nameEn: 'Technical', roleIds: [4], fields: [{ key: 'device', labelFa: 'دستگاه', labelEn: 'Device', type: 'text', required: true }] })
  assert.equal(config.slug, 'TECHNICAL')
  assert.deepEqual(validateAnswers(parseFields(config.fields), { device: 'Android' }), { device: 'Android' })
  assert.throws(() => validateAnswers(parseFields(config.fields), {}))
  assert.throws(() => validateAnswers(parseFields(config.fields), { device: 'Android', rogue: 'x' }))
  assert.equal(canHandleDepartment({ role: 'ADMIN', roleId: 4, permissions: ['tickets.handle'] }, config), true)
  assert.equal(canHandleDepartment({ role: 'ADMIN', roleId: 5, permissions: ['tickets.handle'] }, config), false)
  assert.equal(canHandleDepartment({ role: 'ADMIN', roleId: null }, config), true)
})

test('ticket desk scopes lists and status edits to assigned departments', async () => {
  let listWhere, updates = 0
  const db = {
    ticketDepartment: { findMany: async () => [{ slug: 'SALES', nameFa: 'فروش', nameEn: 'Sales', roleIds: '[4]' }, { slug: 'TECH', nameFa: 'فنی', nameEn: 'Technical', roleIds: '[5]' }], findUnique: async () => ({ roleIds: '[5]' }) },
    ticket: { findMany: async ({ where }) => { listWhere = where; return [] }, findUnique: async () => ({ department: 'TECH' }), update: async () => { updates++; return { id: 1, status: 'CLOSED' } } },
  }
  const route = load('src/modules/support/server/http/admin/tickets/route.ts', { '@/platform/database/prisma': { db }, '@/modules/identity/server/access': { requirePerm: async () => ({ role: 'ADMIN', roleId: 4, permissions: ['tickets.handle'] }) }, '@/modules/identity/rbac': { parsePermissions: value => value.split(',') } })
  assert.equal((await route.GET(new NextRequest('http://localhost/api/admin/tickets'))).status, 200)
  assert.deepEqual(listWhere.department.in, ['SALES'])
  const response = await route.PATCH(new NextRequest('http://localhost/api/admin/tickets', { method: 'PATCH', body: JSON.stringify({ id: 1, status: 'CLOSED' }) }))
  assert.equal(response.status, 403)
  assert.equal(updates, 0)
})

test('Turnstile fails closed and verifies action and hostname when configured', async () => {
  const previous = {
    secret: process.env.TURNSTILE_SECRET_KEY,
    hostname: process.env.TURNSTILE_EXPECTED_HOSTNAME,
    fetch: global.fetch,
  }
  const { verifyTurnstile } = load('src/modules/identity/server/turnstile.ts', {
    '@/platform/http/rate-limit': { clientIp: () => '203.0.113.10' },
  }, new Map())
  try {
    delete process.env.TURNSTILE_SECRET_KEY
    assert.equal(await verifyTurnstile('', new Headers(), 'login'), true)
    process.env.TURNSTILE_SECRET_KEY = 'test-secret-key-with-safe-length'
    process.env.TURNSTILE_EXPECTED_HOSTNAME = 'example.com'
    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body)
      assert.equal(body.remoteip, '203.0.113.10')
      assert.ok(body.idempotency_key)
      return new Response(JSON.stringify({ success: true, action: 'login', hostname: 'example.com' }))
    }
    assert.equal(await verifyTurnstile('valid-token', new Headers(), 'login'), true)
    assert.equal(await verifyTurnstile('valid-token', new Headers(), 'register'), false)
    global.fetch = async () => { throw Error('network down') }
    assert.equal(await verifyTurnstile('valid-token', new Headers(), 'login'), false)
  } finally {
    if (previous.secret === undefined) delete process.env.TURNSTILE_SECRET_KEY; else process.env.TURNSTILE_SECRET_KEY = previous.secret
    if (previous.hostname === undefined) delete process.env.TURNSTILE_EXPECTED_HOSTNAME; else process.env.TURNSTILE_EXPECTED_HOSTNAME = previous.hostname
    global.fetch = previous.fetch
  }
})

test('a write must show where it was made: Origin, Sec-Fetch-Site, Referer, or no cookies at all', async () => {
  const { mutationOrigin } = load('src/platform/http/origin-policy.ts')
  const hosts = ['shop.example', 'www.shop.example']
  const from = (source) => mutationOrigin({ origin: null, secFetchSite: null, referer: null, hasCookies: true, hosts, ...source })
  // Origin decides when it is there.
  assert.equal(from({ origin: 'https://shop.example' }), 'allow')
  assert.equal(from({ origin: 'https://WWW.shop.example' }), 'allow')
  assert.equal(from({ origin: 'https://evil.example' }), 'foreign-origin')
  assert.equal(from({ origin: 'https://shop.example.evil.example' }), 'foreign-origin')
  assert.equal(from({ origin: 'null' }), 'foreign-origin', 'a sandboxed frame is not this site')
  assert.equal(from({ origin: 'https://evil.example', secFetchSite: 'same-origin', referer: 'https://shop.example/' }), 'foreign-origin', 'nothing overrules a foreign Origin')
  // Without Origin the browser's own word decides.
  assert.equal(from({ secFetchSite: 'same-origin' }), 'allow')
  for (const site of ['cross-site', 'same-site', 'none', 'anything']) assert.equal(from({ secFetchSite: site }), 'foreign-origin', site)
  assert.equal(from({ secFetchSite: 'cross-site', referer: 'https://shop.example/' }), 'foreign-origin', 'a Referer does not overrule the browser')
  // An old browser: the Referer.
  assert.equal(from({ referer: 'https://shop.example/cart?x=1' }), 'allow')
  assert.equal(from({ referer: 'https://evil.example/?https://shop.example/' }), 'foreign-origin')
  assert.equal(from({ referer: 'not a url' }), 'foreign-origin')
  // Nothing at all: cookies alone are never enough; without cookies there is nobody to impersonate.
  assert.equal(from({}), 'origin-required')
  assert.equal(from({ origin: '  ', secFetchSite: '', referer: '' }), 'origin-required')
  assert.equal(from({ hasCookies: false }), 'allow')
  assert.equal(from({ hasCookies: false, origin: 'https://evil.example' }), 'foreign-origin', 'a named foreign site is refused with or without cookies')
  assert.equal(mutationOrigin({ origin: 'https://shop.example', secFetchSite: null, referer: null, hasCookies: true, hosts: [null, undefined] }), 'foreign-origin', 'no known host, nothing is ours')

  const { proxy: middleware } = load('src/proxy.ts', { ...INSTALLED, '@/modules/site/server/routes': { loadRouteAliases: async () => ({}) } })
  const send = (path, headers, method = 'POST') => middleware(new NextRequest('http://localhost:3002' + path, { method, headers: { host: '127.0.0.1:3002', 'x-request-id': 'origin-test-456', ...headers } })).then((response) => response.status)
  const session = { cookie: 'next-auth.session-token=abc' }
  assert.equal(await send('/api/account/x', session), 403, 'a session cookie and no word on the source')
  assert.equal(await send('/api/account/x', { ...session, 'sec-fetch-site': 'same-origin' }), 200)
  assert.equal(await send('/api/account/x', { ...session, 'sec-fetch-site': 'cross-site' }), 403)
  assert.equal(await send('/api/account/x', { ...session, referer: 'http://127.0.0.1:3002/account' }), 200)
  assert.equal(await send('/api/account/x', { ...session, origin: 'http://127.0.0.1:3002' }), 200)
  assert.equal(await send('/api/account/x', {}), 200, 'no cookies: a script or an API-key client')
  assert.equal(await send('/api/account/x', { authorization: 'Bearer key' }), 200)
  for (const method of ['PUT', 'PATCH', 'DELETE']) assert.equal(await send('/api/account/x', session, method), 403, method)
  assert.equal(await send('/api/account/x', session, 'GET'), 200, 'reading is not a write')
  // Callbacks that prove themselves another way stay open.
  for (const path of ['/api/auth/callback/credentials', '/api/payment/zarinpal/callback', '/api/telegram/webhook', '/api/internal/jobs', '/api/newsletter/unsubscribe']) assert.equal(await send(path, session), 200, path)
})

test('scripts run by nonce: one per response, on the request for Next and in the policy for the browser', async () => {
  const csp = load('src/platform/http/csp.ts')
  const a = csp.newNonce(), b = csp.newNonce()
  assert.match(a, /^[A-Za-z0-9_-]{22}$/); assert.notEqual(a, b)
  assert.equal(csp.isNonce(a), true)
  for (const bad of ['', 'short', a + '"', "x' 'unsafe-eval", a.slice(0, 21) + '+', null, undefined, 5]) assert.equal(csp.isNonce(bad), false, String(bad))
  const policy = (path, nonce = a, production = true) => csp.contentSecurityPolicy({ path, nonce, production })
  const scripts = (text) => text.split('; ').find((part) => part.startsWith('script-src '))
  assert.equal(scripts(policy('/blog/x')), "script-src 'self' 'nonce-" + a + "' 'strict-dynamic' 'unsafe-inline' https://translate.google.com https://translate.googleapis.com https://translate-pa.googleapis.com https://www.gstatic.com")
  assert.match(policy('/blog/x'), /; script-src-attr 'none'; /, 'inline handlers never run')
  assert.match(policy('/blog/x'), /; object-src 'none'; /)
  assert.match(policy('/blog/x'), /; base-uri 'self'; /)
  assert.doesNotMatch(policy('/admin/posts'), /unsafe-eval/, 'no eval in production')
  assert.match(scripts(policy('/admin/posts', a, false)), /'unsafe-eval'/, 'the development server needs it')
  assert.equal(csp.nonceOf(policy('/x')), a)
  assert.equal(csp.nonceOf("default-src 'self'; style-src 'nonce-" + a + "'"), null, 'only the nonce of script-src')
  assert.equal(csp.nonceOf("script-src 'nonce-bad value'"), null)
  assert.equal(csp.nonceOf(null), null)
  // A value that is not a nonce is never written into the policy.
  assert.doesNotMatch(policy('/x', "x' 'unsafe-eval' 'nonce-y"), /nonce-|strict-dynamic/)
  // The one page that shows pasted ad-network code keeps the older policy, and says so by having no nonce.
  for (const path of ['/forwarder', '/forwarder/abc']) { assert.equal(csp.usesNonce(path), false); assert.doesNotMatch(policy(path), /nonce-|strict-dynamic|script-src-attr/); assert.match(scripts(policy(path)), /'unsafe-inline'.* https:$/) }
  assert.equal(csp.usesNonce('/forwarders'), true)
  assert.match(policy('/miniapp/x'), /frame-ancestors 'self' https:\/\/web\.telegram\.org/)
  assert.match(policy('/login'), /challenges\.cloudflare\.com/)

  const { proxy: middleware } = load('src/proxy.ts', { ...INSTALLED, '@/modules/site/server/routes': { loadRouteAliases: async () => ({}) }, '@/modules/performance/server/pagecache': { pageCacheHandle: async () => null, purgeSoon: () => {} } })
  const get = (path, headers = {}) => middleware(new NextRequest('http://localhost:3002' + path, { headers: { host: '127.0.0.1:3002', 'x-request-id': 'csp-test-12345', ...headers } }))
  const first = await get('/blog/x'), second = await get('/blog/x')
  const sent = csp.nonceOf(first.headers.get('content-security-policy'))
  assert.ok(sent); assert.notEqual(sent, csp.nonceOf(second.headers.get('content-security-policy')), 'a new nonce for every response')
  // What Next is given on the request is the same nonce the browser is told.
  assert.equal(first.headers.get('x-middleware-request-x-nonce'), sent)
  assert.equal(csp.nonceOf(first.headers.get('x-middleware-request-content-security-policy')), sent)
  // A nonce sent by the visitor is never the one used.
  const forged = await get('/blog/x', { 'x-nonce': 'A'.repeat(22), 'content-security-policy': "script-src 'nonce-" + 'A'.repeat(22) + "'" })
  assert.notEqual(csp.nonceOf(forged.headers.get('content-security-policy')), 'A'.repeat(22))
  assert.notEqual(forged.headers.get('x-middleware-request-x-nonce'), 'A'.repeat(22))
  const ads = await get('/forwarder/abc', { 'x-nonce': 'A'.repeat(22), 'content-security-policy': "script-src 'nonce-" + 'A'.repeat(22) + "'" })
  assert.equal(ads.headers.get('x-middleware-request-content-security-policy'), null, 'nor a policy the visitor sent, which Next would read a nonce from')
  assert.doesNotMatch(ads.headers.get('x-middleware-override-headers') || '', /content-security-policy/)
  assert.equal(csp.nonceOf(ads.headers.get('content-security-policy')), null)
  assert.notEqual(ads.headers.get('x-middleware-request-x-nonce'), 'A'.repeat(22), 'no nonce reaches the app on a page without one')
})

test('a stored page goes out with the nonce of the response that carries it', async () => {
  const csp = load('src/platform/http/csp.ts')
  const { withNonce } = load('src/modules/performance/server/pagecache.ts', { '@/platform/database/prisma': { db: {} }, '@/platform/realtime/bus': { publish: async () => {}, subscribe: async () => () => {} } })
  const stored = csp.newNonce(), fresh = csp.newNonce()
  const page = Buffer.from('<script nonce="' + stored + '">a()</script><p>سلام ' + stored.slice(0, 21) + '</p><script nonce="' + stored + '" src="/x.js"></script>{"nonce":"' + stored + '"}')
  const out = withNonce(Buffer.from(page), stored, fresh).toString()
  assert.equal(out.split(fresh).length - 1, 3, 'every copy is replaced')
  assert.equal(out.includes(stored), false)
  assert.equal(out.length, page.toString().length); assert.match(out, /سلام/)
  assert.equal(out.includes(stored.slice(0, 21) + '<'), true, 'a string that is only like the nonce stays')
  for (const [from, to] of [['', fresh], [stored, null], [stored, stored], [stored, fresh + 'x']]) assert.equal(withNonce(Buffer.from(page), from, to).toString(), page.toString())

  // Through the middleware: a page from the cache carries the nonce of this response, and one passed on as rendered keeps its own.
  const body = (nonce) => '<script nonce="' + nonce + '">a()</script>'
  let answer
  const { proxy: middleware } = load('src/proxy.ts', { ...INSTALLED, '@/modules/site/server/routes': { loadRouteAliases: async () => ({}) }, '@/modules/performance/server/pagecache': { pageCacheHandle: async (input) => answer(input), purgeSoon: () => {} } })
  const get = () => middleware(new NextRequest('http://localhost:3002/blog/x', { headers: { host: '127.0.0.1:3002', 'x-request-id': 'csp-test-67890' } }))
  answer = (input) => new Response(withNonce(Buffer.from(body(stored)), stored, input.nonce), { headers: { 'content-type': 'text/html' } })
  const cached = await get(), cachedNonce = csp.nonceOf(cached.headers.get('content-security-policy'))
  assert.equal(await cached.text(), body(cachedNonce)); assert.notEqual(cachedNonce, stored)
  answer = () => new Response(body(stored), { headers: { 'content-type': 'text/html', 'content-security-policy': csp.contentSecurityPolicy({ path: '/blog/x', nonce: stored, production: true }) } })
  const passed = await get()
  assert.equal(csp.nonceOf(passed.headers.get('content-security-policy')), stored, 'the policy names the nonce the body carries')
  assert.equal(await passed.text(), body(stored))
})

test('a section in maintenance shows its notice to visitors and itself to the people who run it', async () => {
  const m = load('src/modules/site/domain/maintenance.ts')
  const bases = { businesses: ['/businesses'], store: ['/products', '/cart', '/checkout/product'], magazine: ['/blog'], games: ['/games'], cinema: ['/cinema', '/watch'], music: ['/music'], software: ['/software'], forum: ['/forum'] }
  // What is stored is read whatever it is: every section present, off unless it clearly says on, words as plain bounded text.
  const state = m.normalizeMaintenance({ games: { enabled: true, title: '  بازی‌ها بسته است  ', message: 'خط یک\r\nخط دو\u0000' }, music: { enabled: 'yes', title: 5 }, nope: { enabled: true }, forum: { enabled: true, title: 'x'.repeat(500) } })
  assert.deepEqual(Object.keys(state).filter((key) => key !== 'site'), ['vpn', 'prompts', 'businesses', 'store', 'magazine', 'games', 'cinema', 'music', 'software', 'forum', 'celebrities'])
  assert.equal(m.runsSection({ role: 'ADMIN', roleId: 4, permissions: ['plans.manage', 'subs.manage'] }, 'vpn'), true)
  assert.equal(m.runsSection({ role: 'ADMIN', roleId: 4, permissions: ['subs.manage'] }, 'vpn'), false)
  assert.equal(m.sectionOfPath('/businesses/owned-example', bases), 'businesses')
  assert.equal(m.runsSection({ role: 'ADMIN', roleId: 4, permissions: ['businesses.manage'] }, 'businesses'), true)
  assert.equal(m.runsSection({ role: 'ADMIN', roleId: 4, permissions: ['reviews.moderate'] }, 'businesses'), false)
  assert.deepEqual(state.games, { enabled: true, title: 'بازی‌ها بسته است', message: 'خط یک\nخط دو', mode: 'update' })
  assert.deepEqual(state.music, { enabled: false, title: '', message: '', mode: 'update' }, 'only true switches a section off for visitors')
  assert.equal(state.forum.title.length, m.MAINTENANCE_LIMITS.title)
  for (const junk of [null, 'x', [], 7]) assert.equal(Object.values(m.normalizeMaintenance(junk)).some((section) => section.enabled), false)
  assert.deepEqual(m.noticeOf(state.games), { title: 'بازی‌ها بسته است', message: 'خط یک\nخط دو' })
  assert.deepEqual(m.noticeOf(state.music), { title: m.DEFAULT_TITLE, message: m.DEFAULT_MESSAGE }, 'the default words where the owner wrote none')
  // Paths.
  for (const [path, section] of [['/games', 'games'], ['/games/x/y', 'games'], ['/gamesx', null], ['/watch/5', 'cinema'], ['/cart', 'store'], ['/checkout/product', 'store'], ['/checkout', null], ['/', null], ['/admin/games', null], ['/blog/a', 'magazine']]) assert.equal(m.sectionOfPath(path, bases), section, path)
  // Who runs a section.
  const owner = { role: 'ADMIN', roleId: null, permissions: null }, ownerEmpty = { role: 'ADMIN', roleId: null, permissions: [] }
  const gamesManager = { role: 'ADMIN', roleId: 4, permissions: ['dashboard.view', 'games.manage'] }
  const storeHalf = { role: 'ADMIN', roleId: 5, permissions: ['dashboard.view', 'cms.products'] }, storeManager = { role: 'ADMIN', roleId: 6, permissions: ['dashboard.view', 'cms.products', 'orders.manage'] }
  const roleWithNothing = { role: 'ADMIN', roleId: 9, permissions: [] }, member = { role: 'CUSTOMER', roleId: null, permissions: null }
  assert.deepEqual([owner, ownerEmpty, gamesManager, storeHalf, storeManager, roleWithNothing, member, null, undefined].map((viewer) => m.runsSection(viewer, 'games')), [true, true, true, false, false, false, false, false, false])
  assert.deepEqual([owner, gamesManager, storeHalf, storeManager].map((viewer) => m.runsSection(viewer, 'store')), [true, false, false, true], 'a section with two permissions needs both')
  assert.equal(m.runsSection({ role: 'CUSTOMER', roleId: null, permissions: ['games.manage'] }, 'games'), false, 'permissions without being staff are nothing')
  const decide = (path, viewer) => m.maintenanceDecision({ path, state, bases, viewer })
  assert.deepEqual(decide('/games/doom', null), { action: 'notice', section: 'games' })
  assert.deepEqual(decide('/games/doom', member), { action: 'notice', section: 'games' })
  assert.deepEqual(decide('/games/doom', storeManager), { action: 'notice', section: 'games' })
  assert.deepEqual(decide('/games/doom', gamesManager), { action: 'pass', preview: 'games' })
  assert.deepEqual(decide('/games/doom', owner), { action: 'pass', preview: 'games' })
  assert.deepEqual(decide('/music', null), { action: 'pass' }); assert.deepEqual(decide('/', null), { action: 'pass' })
  assert.equal(m.isMaintenanceSection('games'), true); assert.equal(m.isMaintenanceSection('constructor'), false)

  // ---- through the middleware
  let stored = state, token = null, tokenReads = 0
  const { proxy: middleware } = load('src/proxy.ts', { ...INSTALLED,
    '@/modules/site/server/routes': { loadRouteAliases: async () => ({ '/games': '/play' }) },
    '@/modules/performance/server/pagecache': { pageCacheHandle: async () => (token ? null : new Response('cached page', { headers: { 'content-type': 'text/html' } })), purgeSoon: () => {} }, // the page cache serves visitors only
    '@/modules/identity/server/access': { requireUser: async () => { tokenReads += 1; return token } },
    '@/modules/site/server/maintenance': { loadMaintenance: async () => stored, maintenanceBases: () => bases },
  })
  const get = (path, headers = {}) => middleware(new NextRequest('http://localhost:3002' + path, { headers: { host: '127.0.0.1:3002', 'x-request-id': 'maintenance-test-1', ...headers } }))
  const noticed = await get('/play/doom')
  assert.equal(noticed.status, 503)
  assert.match(noticed.headers.get('x-middleware-rewrite') || '', /\/maintenance\?section=games$/, 'the notice is shown under the address the section is published at')
  assert.deepEqual([noticed.headers.get('retry-after'), noticed.headers.get('x-robots-tag'), noticed.headers.get('cache-control')], ['3600', 'noindex', 'no-store'])
  assert.ok(noticed.headers.get('content-security-policy'), 'the notice carries the security headers of every page')
  assert.notEqual(await noticed.text(), 'cached page', 'a stored copy of the page is not served in its place')
  token = gamesManager
  const seen = await get('/play/doom')
  assert.equal(seen.status, 200); assert.equal(seen.headers.get('x-middleware-request-x-maintenance-preview'), 'games')
  token = member; assert.equal((await get('/play/doom')).status, 503)
  // A visitor cannot claim the preview by sending the header.
  token = null
  const forged = await get('/play/doom', { 'x-maintenance-preview': 'games' })
  assert.equal(forged.status, 503)
  assert.equal((await get('/music', { 'x-maintenance-preview': 'games' })).headers.get('x-middleware-request-x-maintenance-preview'), null)
  // Nor does a header sent by somebody signed in reach the page: only the middleware says who is previewing.
  token = storeManager
  const sent = await get('/music', { 'x-maintenance-preview': 'games' })
  assert.equal(sent.headers.get('x-middleware-request-x-maintenance-preview'), null)
  assert.doesNotMatch(sent.headers.get('x-middleware-override-headers') || '', /x-maintenance-preview/)
  token = null
  // Other sections, the home page and the admin are untouched; the old address still redirects.
  for (const path of ['/music', '/', '/admin/games', '/api/music/history', '/maintenance']) assert.notEqual((await get(path)).status, 503, path)
  // The section's own API closes with its pages, so nothing of it can be reached from another page.
  assert.equal((await get('/api/games/list')).status, 503)
  assert.equal((await get('/games/doom')).status, 308)
  // The session is read only for a request that would otherwise get a notice.
  tokenReads = 0; await get('/music'); await get('/'); assert.equal(tokenReads, 0)
  await get('/play/doom'); assert.equal(tokenReads, 1)
  // With no section in maintenance nothing is asked and nothing changes.
  stored = m.normalizeMaintenance(null); tokenReads = 0
  assert.equal((await get('/play/doom')).status, 200); assert.equal(tokenReads, 0)
  // A store that cannot be read closes nothing.
  stored = null; assert.equal((await get('/play/doom')).status, 200)
})

test('a section in maintenance leaves search, the sitemap and the feeds; an open one stays', async () => {
  const m = load('src/modules/site/domain/maintenance.ts')
  const bases = { businesses: ['/businesses'], store: ['/products', '/cart'], magazine: ['/blog'], games: ['/games'], cinema: ['/cinema', '/watch'], music: ['/music'], software: ['/software'], forum: ['/forum'] }
  const none = m.normalizeMaintenance(null), some = m.normalizeMaintenance({ magazine: { enabled: true }, cinema: { enabled: true }, music: { enabled: false, title: 'x' } })
  assert.deepEqual(m.closedPlugins(none), [])
  // A section is named by its plugin: the magazine's is journal.
  assert.deepEqual(m.closedPlugins(some), ['journal', 'cinema'])
  for (const [path, closed] of [['/blog', true], ['/blog/a-post', true], ['/watch/5', true], ['/cinema/x', true], ['/music', false], ['/music/album/1', false], ['/blogger', false], ['/', false], ['/p/about', false], ['/products/x', false]]) assert.equal(m.pathClosed(path, some, bases), closed, path)
  assert.equal(m.pathClosed('/blog/a-post', none, bases), false)
  const src = (file) => require('node:fs').readFileSync(require('node:path').resolve(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n')
  // Search asks only for the types of open sections; a studio belongs to games and software and goes when both are closed.
  const search = src('src/modules/search/server/search.ts')
  const rule = search.match(/const types = \(await enabledItemTypes\(\)\)\.filter\(\(item\) => (.+)\)\n/)[1]
  const typesFor = (closedList) => { const closed = new Set(closedList), ITEM_MODULE = { software: 'software', game: 'games', studio: 'games', title: 'cinema', album: 'music', track: 'music', artist: 'music', product: 'store', post: 'journal', thread: 'forum', business: 'businesses' }; return Object.keys(ITEM_MODULE).filter((item) => new Function('item', 'closed', 'ITEM_MODULE', 'return ' + rule)(item, closed, ITEM_MODULE)) }
  assert.deepEqual(typesFor([]), ['software', 'game', 'studio', 'title', 'album', 'track', 'artist', 'product', 'post', 'thread', 'business'])
  assert.deepEqual(typesFor(['journal', 'music']), ['software', 'game', 'studio', 'title', 'product', 'thread', 'business'])
  assert.deepEqual(typesFor(['games']), ['software', 'studio', 'title', 'album', 'track', 'artist', 'product', 'post', 'thread', 'business'])
  assert.deepEqual(typesFor(['games', 'software']), ['title', 'album', 'track', 'artist', 'product', 'post', 'thread', 'business'])
  // The index itself is not narrowed: opening the section again needs no rebuild.
  assert.match(search, /rebuilding \?\?= \(async \(\) => \{[\s\S]{0,120}const types = await enabledItemTypes\(\)/)
  assert.match(src('src/modules/site/server/pages/sitemap.ts'), /!\(maintenance && pathClosed\(path, maintenance, bases\)\)/)
  assert.match(src('src/modules/seo/server/feeds.ts'), /return \(id: string\) => runtime\[id\]\?\.enabled !== false && !closed\.has\(id\)/)
  // The home page treats a closed section like a module that is off: its blocks and links are not offered.
  const home = src('src/modules/site/server/homepage.ts')
  assert.ok(home.includes('const enabled = (id: string) => runtime[id]?.enabled !== false && !closed.has(id)'))
  assert.ok(home.includes('MAINTENANCE_SECTIONS.filter((section) => closed.has(section.plugin)).flatMap((section) => bases[section.id])]'))
  // Maintenance retains its existing fallback; unknown audience policy closes public discovery.
  assert.match(src('src/modules/site/server/maintenance.ts'), /loadMaintenance\(\)\.catch\(\(\) => normalizeMaintenance\(null\)\)/)
  const visibility = load('src/modules/site/server/maintenance.ts', { '@/platform/database/prisma': { db: { setting: { findUnique: async () => null } } }, '@/modules/account/server/section-access': { loadSectionAccess: async () => ({ music: [], magazine: ['group:4'] }) } })
  assert.deepEqual([...await visibility.closedSectionPlugins()], ['journal'], 'empty audiences leave sections publicly discoverable')
  const unavailable = load('src/modules/site/server/maintenance.ts', { '@/platform/database/prisma': { db: { setting: { findUnique: async () => null } } }, '@/modules/account/server/section-access': { loadSectionAccess: async () => { throw Error('offline') } } })
  assert.ok((await unavailable.closedSectionPlugins()).has('music'), 'unknown audience policy cannot disclose a section')
})

const sourceOf = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n')

test('nothing is members-only while the VIP module is off, and prices keep the real membership', async () => {
  const state = { vip: true, session: null, membership: null }
  const membership = load('src/modules/membership/server/membership.ts', {
    react: { cache: (fn) => fn },
    'next-auth': { getServerSession: async () => state.session },
    '@/platform/database/prisma': { db: { userMembership: { findFirst: async () => state.membership } } },
    '@/modules/identity/auth': { authOptions: {} },
    '@/modules/account/server/user-groups': { groupGivesVip: async () => false },
    '@/modules/notifications/server/inbox': { createInboxEvent: async () => null },
    '@/extensions/server/modules': { isModuleEnabled: async (id) => id === 'membership' && state.vip },
    '@/platform/observability/logger': { logEvent: () => {} },
  })
  const active = { id: 1, endsAt: new Date(Date.now() + 86_400_000), startsAt: new Date(0), source: 'PURCHASE', planId: 1 }
  // VIP on: a guest and a plain member do not open members-only things; a paying member does.
  assert.deepEqual(await membership.getViewer(), { userId: null, member: false, endsAt: null, opens: false })
  state.session = { user: { id: 7 } }
  assert.equal((await membership.getViewer()).opens, false)
  assert.equal(await membership.opensMembersOnly(7), false)
  state.membership = active
  assert.deepEqual([(await membership.getViewer()).member, (await membership.getViewer()).opens, await membership.opensMembersOnly(7)], [true, true, true])
  assert.equal(await membership.opensMembersOnly(7, false), false, 'a membership the caller already looked up is not asked for again')
  // VIP off: everybody opens them, the guest too — and nobody is a member, so no member price or quota is given away.
  state.vip = false
  assert.deepEqual([(await membership.getViewer()).member, (await membership.getViewer()).opens, await membership.isMember(7)], [false, true, false])
  state.session = null
  assert.deepEqual(await membership.getViewer(), { userId: null, member: false, endsAt: null, opens: true })
  assert.deepEqual([await membership.opensMembersOnly(null), await membership.opensMembersOnly(7, false)], [true, true])
  // Every place that decides access asks "opens", never "member".
  for (const file of ['src/app/cinema/[slug]/page.tsx', 'src/app/games/[slug]/page.tsx', 'src/app/music/album/[slug]/page.tsx', 'src/app/music/playlist/[slug]/page.tsx', 'src/app/music/track/[slug]/page.tsx', 'src/app/software/[slug]/page.tsx', 'src/app/software/[slug]/releases/[id]/page.tsx', 'src/modules/site/server/http/public/cms/route.ts', 'src/modules/checkout/server/pages/checkout/page.tsx', 'src/modules/checkout/server/pages/product/page.tsx']) {
    assert.match(sourceOf(file), /viewer\.opens/, file)
    const accessSource = sourceOf(file).replace(/viewer\.member && [a-zA-Z.]*[mM]emberPriceMinor|viewer\.member && memberMinor/g, '').replace(/unitPrice\(product, variant, viewer\.member,/g, 'unitPrice(product, variant, priceMembership,')
    assert.doesNotMatch(accessSource, /viewer\.member/, `${file} decides access by a paid membership`)
  }
  assert.match(sourceOf('src/modules/media/server/links.ts'), /if \(!vipOnly \|\| viewer\.opens\) return 'ok'\n  if \(!viewer\.userId\) return 'login'/)
  assert.match(sourceOf('src/modules/site/server/pages/blog/[slug]/page.tsx'), /post\.access === 'MEMBERS' && !viewer\.opens/)
  for (const file of ['src/modules/store/server/cart.ts', 'src/modules/store/server/bundles.ts', 'src/modules/checkout/server/checkout.ts']) assert.doesNotMatch(sourceOf(file), /access === 'MEMBERS' && !member\b/, file)
  assert.match(sourceOf('src/modules/forum/server/community.ts'), /member: member \|\| open, moderates/)
  // The marks are hidden from one place, and both selling modules start switched off.
  assert.match(sourceOf('src/app/layout.tsx'), /data-vip=\{pathDisabled\('\/vip', extensions\) \? 'off' : undefined\}/)
  assert.match(sourceOf('src/app/media-design.css'), /html\[data-vip='off'\] :is\(\.vip-chip,/)
  for (const id of ['membership', 'paywall']) assert.equal(JSON.parse(sourceOf(`src/plugins/${id}/manifest.json`)).defaultEnabled, false, id)
})

test('the base currency is the toman: defaults and empty screens start from it, stored rows keep their own', () => {
  const money = load('src/shared/money/index.ts'), format = load('src/shared/money/format.ts')
  assert.equal(money.BASE_CURRENCY, 'IRT')
  assert.deepEqual([money.normalizeCurrency(''), money.normalizeCurrency(undefined), money.normalizeCurrency('usd'), money.normalizeCurrency('', 'USD')], ['IRT', 'IRT', 'USD', 'USD'])
  assert.equal(money.currencyExponent(money.BASE_CURRENCY), 0)
  assert.equal(format.formatAmount(125000, undefined, 'fa-IR'), '۱۲۵٬۰۰۰ تومان')
  assert.equal(format.formatAmount(125000, '', 'en-US'), '125,000 Toman')
  assert.equal(format.formatAmount(12.5, 'USD', 'en-US'), '$12.50', 'a stored dollar amount is still shown as dollars')
  // New things and empty lists start from the base currency…
  for (const file of ['src/modules/catalog/server/http/admin/plans/route.ts', 'src/modules/promotions/server/http/admin/promotions/route.ts', 'src/modules/billing/server/http/admin/expenses/route.ts', 'src/modules/billing/server/http/admin/invoices/route.ts', 'src/modules/billing/server/http/admin/finance/route.ts', 'src/modules/checkout/server/checkout.ts', 'src/app/admin/page.tsx', 'src/app/dashboard/wallet/page.tsx', 'src/app/admin/plans/page.tsx', 'src/app/admin/invoices/page.tsx']) assert.match(sourceOf(file), /BASE_CURRENCY/, file)
  assert.match(sourceOf('src/modules/billing/server/http/admin/finance/route.ts'), /requestedCurrency \? normalizeCurrency\(requestedCurrency\) : BASE_CURRENCY/)
  // …while the legacy dollar wallet and each gateway's own fiat are left as they were.
  assert.match(sourceOf('src/modules/wallet/server/wallet.ts'), /if \(code !== 'USD'\) return 0/)
  assert.match(sourceOf('src/modules/billing/server/gateways.ts'), /gateway\.fiat \|\| 'USD'/)
})

test('a switched-off module leaves no trace in the public site config, and returns untouched when switched on', () => {
  const { hideDisabledModules } = load('src/modules/site/config/visibility.ts')
  const t = (fa, en = '') => ({ fa, en })
  const item = (title, href = '') => ({ title: t(title), text: t(''), icon: '', href })
  const section = (kind, title, items = [], action = '') => ({ id: kind + title, kind, enabled: true, eyebrow: t(''), title: t(title), description: t(''), items, action: { label: t('برو'), href: action }, formSlug: '' })
  const site = {
    announcement: { enabled: true, text: t('با اشتراک ویژهٔ موبوکام تخفیف بگیرید'), link: { label: t('اشتراک ویژه'), href: '/vip' } },
    navigation: [{ label: t('بازی'), href: '/games' }, { label: t('اشتراک ویژه', 'VIP'), href: '/vip' }],
    footer: [{ label: t('عضویت VIP'), href: '/vip?from=footer' }, { label: t('تماس'), href: '/contact' }],
    sections: [
      section('services', 'همه‌چیز', [item('بازی', '/games'), item('اشتراک ویژه', '/vip')]),
      section('faq', 'پرسش‌ها', [item('ارسال چقدر طول می‌کشد؟'), item('اشتراک ویژه چه مزایایی دارد؟')]),
      section('cta', 'بیشتر ببینید، کمتر بپردازید.', [], '/vip'),
      { ...section('features', 'چرا ما؟', [item('پشتیبانی')]), eyebrow: t('اشتراک ویژهٔ موبوکام', 'MOBOCOM VIP') },
      section('hero', 'خوش آمدید', [], '/vip'),
    ],
  }
  const off = { membership: { enabled: false, paths: ['/vip'] } }, on = { membership: { enabled: true, paths: ['/vip'] } }
  const hidden = hideDisabledModules(site, off)
  assert.equal(hidden.announcement.enabled, false)
  assert.deepEqual(hidden.navigation.map((link) => link.href), ['/games'])
  assert.deepEqual(hidden.footer.map((link) => link.href), ['/contact'])
  assert.deepEqual(hidden.sections[0].items.map((entry) => entry.href), ['/games'], 'an item that leads into the module')
  assert.deepEqual(hidden.sections[1].items.map((entry) => entry.title.fa), ['ارسال چقدر طول می‌کشد؟'], 'an item that only speaks of it')
  assert.equal(hidden.sections[2].enabled, false, 'a call to action that leads there goes whole')
  assert.equal(hidden.sections[3].enabled, false, 'a section whose heading is about it goes whole')
  assert.deepEqual([hidden.sections[4].enabled, hidden.sections[4].action.href, hidden.sections[4].action.label.fa], [true, '', ''], 'another section only loses the button')
  assert.doesNotMatch(JSON.stringify({ ...hidden, sections: hidden.sections.filter((entry) => entry.enabled), announcement: hidden.announcement.enabled ? hidden.announcement : null }), /VIP|اشتراک ویژه|\/vip/)
  // Nothing stored is changed, and with the module on the config passes through as it is.
  assert.equal(site.sections[0].items.length, 2)
  assert.deepEqual(hideDisabledModules(site, on), site)
  assert.equal(hideDisabledModules(site, on).sections[1], site.sections[1])
  // The public config goes through it, so every theme and the home page get the same answer.
  assert.match(sourceOf('src/modules/site/config/store.ts'), /hideDisabledModules\(\{ \.\.\.saved, footerExplore: saved\.footerExplore \?\? saved\.navigation \}, runtime\)/)
})

test("a person's own picture stands beside what they wrote, with the initial as the fallback", () => {
  const { pictureOf } = load('src/modules/identity/domain/picture.ts')
  assert.equal(pictureOf({ telegramPhoto: '/t.jpg', userProfile: { avatar: '/api/profile/media/a' } }), '/api/profile/media/a', 'the profile picture comes first')
  assert.equal(pictureOf({ telegramPhoto: '/t.jpg', userProfile: { avatar: '' } }), '/t.jpg')
  assert.equal(pictureOf({ telegramPhoto: null, userProfile: null }), '')
  assert.deepEqual([pictureOf(null), pictureOf(undefined), pictureOf({})], ['', '', ''])
  // Comments, reviews of every section, product reviews and the author card all ask the one rule.
  for (const file of ['src/modules/site/server/http/public/blog/[slug]/comments/route.ts', 'src/modules/reviews/server/reviews.ts', 'src/modules/catalog/server/http/product-tabs/route.ts', 'src/modules/site/server/pages/blog/[slug]/page.tsx']) assert.match(sourceOf(file), /pictureOf\(/, file)
  // A deleted comment keeps no trace of who wrote it, picture included; a visitor gets no "viewer".
  assert.match(sourceOf('src/modules/site/server/http/public/blog/[slug]/comments/route.ts'), /deleted: true, user: \{ name: '', avatar: '' \}/)
  assert.match(sourceOf('src/modules/site/server/http/public/blog/[slug]/comments/route.ts'), /viewer: mine \? \{ avatar: pictureOf\(mine\) \} : null/)
  for (const file of ['src/components/PostComments.tsx', 'src/components/engage/ReviewList.tsx', 'src/components/ProductTabs.tsx']) assert.match(sourceOf(file), /is-photo/, file)
})

test('Journal card bylines render the canonical avatar without replacing cover art or dropping the initial fallback', () => {
  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server')
  const { LionaGrid } = load('src/components/journal/LionaHome.tsx', {
    '@/components/AppLink': ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children),
  })
  const story = { id: 7, slug: 'owned-avatar', title: 'عنوان', excerpt: '', cover: '/cover.png', date: 'امروز', minutes: 1, views: 0, category: null, author: 'نویسنده', authorAvatar: '/api/profile/media/11111111-1111-4111-8111-111111111111.png' }
  const html = renderToStaticMarkup(React.createElement(LionaGrid, { stories: [story] }))
  assert.match(html, /class="lh-author-avatar"[^>]*src="\/api\/profile\/media\//)
  assert.match(html, /src="\/cover.png"/)
  const fallback = renderToStaticMarkup(React.createElement(LionaGrid, { stories: [{ ...story, authorAvatar: '' }] }))
  assert.doesNotMatch(fallback, /class="lh-author-avatar"/)
  assert.match(fallback, /<i aria-hidden="true">ن<\/i>/)
})

test('Admin control discovery searches only the supplied permitted projection, preserving groups and independent filters', () => {
  const { searchControlGroups } = load('src/components/admin/navigation/groups.ts')
  const groups = [
    { id: 'site', title: 'ظاهر و صفحه‌ها', part: 'وب‌سایت', icon: 'grid', items: [{ href: '/admin/theme-builder', label: 'هدر و فوتر', icon: 'grid' }, { href: '/admin/pages', label: 'صفحه‌ها', icon: 'grid' }] },
    { id: 'music', title: 'موسیقی', part: 'بخش‌های سایت', icon: 'music', items: [{ href: '/admin/music', label: 'موسیقی', icon: 'music' }] },
  ]
  const before=structuredClone(groups)
  assert.deepEqual(searchControlGroups(groups,'فوتر وب‌سایت').flatMap(g=>g.items.map(i=>i.href)),['/admin/theme-builder'])
  assert.deepEqual(searchControlGroups(groups,'موسيقي').map(g=>g.id),['music'])
  assert.equal(searchControlGroups(groups,'','وب‌سایت').length,1)
  assert.equal(searchControlGroups(groups,'هیچ').length,0)
  assert.equal(searchControlGroups([], '').length,0)
  assert.equal(searchControlGroups(groups,'/admin/music')[0].items[0].href,'/admin/music')
  assert.equal(searchControlGroups(groups,'')[0].caption,'وب‌سایت')
  assert.deepEqual(groups,before,'search must not alter shared Admin navigation')
})
test('the admin menu goes by area: each module names one, and each person sees only areas they have something in', () => {
  const { CONTROL_AREAS, controlAreas } = load('src/components/admin/navigation/groups.ts')
  const { EXTENSION_ADMIN_AREAS, assertValidExtensionManifest } = load('src/platform/extensions/contracts.ts')
  assert.deepEqual(CONTROL_AREAS.map(area => area.id), ['home', ...EXTENSION_ADMIN_AREAS])
  const group = (id, area) => ({ id, area, title: id, part: area, icon: 'grid', items: [{ href: `/admin/${id}`, label: id, icon: 'grid' }] })
  const shown = controlAreas([{ ...group('store', 'commerce'), caption: 'فروش' }, group('home', 'home'), group('vip', 'commerce')])
  assert.deepEqual(shown.map(area => area.id), ['home', 'commerce'], 'in menu order, and an area with nothing for this person is left out')
  assert.deepEqual(shown[1].groups.map(item => item.id), ['store', 'vip'])
  assert.equal(shown[1].groups[0].caption, undefined, 'the area names itself; a caption is for search results')
  const base = { id: 'demo', name: 'Demo', version: '1.0.0', kind: 'module', apiVersion: 1, adminPaths: ['/admin/demo'] }
  const manifest = (area) => ({ ...base, apiVersion: require(path.resolve(__dirname, '../src/plugins/store/manifest.json')).apiVersion, adminMenu: { area, items: [{ href: '/admin/demo', label: 'x' }] } })
  assert.doesNotThrow(() => assertValidExtensionManifest(manifest('commerce')))
  assert.doesNotThrow(() => assertValidExtensionManifest(manifest(undefined)), 'a module that names none still installs, and sits under system')
  assert.throws(() => assertValidExtensionManifest(manifest('sales')), /unknown admin area/)
  // Every shipped module names one, and everything that is not one of the site's content sections has left «site sections».
  const dir = path.resolve(__dirname, '../src/plugins')
  for (const id of fs.readdirSync(dir)) {
    const file = path.join(dir, id, 'manifest.json')
    if (!fs.existsSync(file)) continue
    const menu = JSON.parse(fs.readFileSync(file, 'utf8')).adminMenu
    if (menu) assert.ok(EXTENSION_ADMIN_AREAS.includes(menu.area), id)
  }
  const layout = fs.readFileSync(path.resolve(__dirname, '../src/app/admin/layout.tsx'), 'utf8')
  assert.doesNotMatch(layout, /part: (WEBSITE|BUSINESS|SYSTEM)/)
  for (const link of ['/admin/celebrities', '/admin/studios']) assert.ok(layout.includes(`href: '${link}'`), link)
  assert.ok(JSON.parse(fs.readFileSync(path.join(dir, 'store/manifest.json'), 'utf8')).adminMenu.items.some(item => item.href === '/admin/product-deliveries'), 'the delivery page has a link')
})
test('complete article excerpts are rendered inside the reading body without changing its canonical markup', () => {
  const { articleBodyWithExcerpt } = load('src/modules/site/domain/article-output.ts')
  const body = '<div class="mcb-block" id="canonical-block"><h2>متن اصلی</h2></div>'
  const excerpt = 'خلاصهٔ کامل '.repeat(60) + 'پایان خلاصه'
  const result = articleBodyWithExcerpt(body, excerpt)
  assert.ok(result.includes('پایان خلاصه'))
  assert.ok(result.indexOf('پایان خلاصه') < result.indexOf('canonical-block'))
  assert.ok(result.endsWith(body))
  assert.equal(articleBodyWithExcerpt(body, ''), body)
  assert.doesNotMatch(articleBodyWithExcerpt(body, '<img src=x onerror="alert(1)"><script>alert(1)</script>متن'), /onerror|<script/)
})

test('editorial display retains historical text/newlines and cleans formatted content', () => {
  const { renderEditorialText } = load('src/shared/content/sanitize.ts')
  assert.equal(renderEditorialText('سطر یک\nسطر دو & سه'), 'سطر یک<br />سطر دو &amp; سه')
  const rich = renderEditorialText('<p dir="rtl"><strong>داستان</strong></p><img src=x onerror="alert(1)"><script>alert(1)</script>')
  assert.match(rich, /<strong>داستان<\/strong>/)
  assert.doesNotMatch(rich, /onerror|<script/)
})

test('admin pages label themselves in Persian, every permission has a Persian name, and shared admin pieces are styled', () => {
  const root = path.resolve(__dirname, '..')
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')
  const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith('.tsx') ? [`${dir}/${e.name}`] : [])
  // The small label above a page title is Persian (or bilingual through L()), not English capitals.
  for (const file of walk('src/app/admin')) assert.doesNotMatch(read(file), /(eyebrow|kicker)[a-z-]*">[A-Z][A-Z0-9 ·&/-]{2,}</, file)
  // Roles: each core permission reads by a Persian name, without emoji.
  const permissions = [...read('src/modules/identity/rbac.ts').match(/export const PERMISSIONS = \[([\s\S]*?)\] as const/)[1].matchAll(/'([a-z.]+)'/g)].map((m) => m[1])
  const roles = read('src/app/admin/roles/page.tsx'), labels = roles.match(/const PERM_LABELS: Record<string, string> = \{([\s\S]*?)\n\}/)[1]
  for (const permission of permissions) assert.match(labels, new RegExp(`'${permission.replace(/\./g, '\.')}': '[^']*[\u0600-\u06FF]`), permission)
  assert.doesNotMatch(labels, /\p{Extended_Pictographic}/u)
  // The shared CRUD list shows an option's label, never its stored code, and formats numbers.
  const crud = read('src/app/admin/cms/AdminCrud.tsx')
  assert.match(crud, /const option = f\.options\?\.find\(/)
  assert.match(crud, /if \(f\.type === 'number'[^\n]*toLocaleString\(fa \? 'fa-IR' : 'en-US'\)/)
  // Pieces admin pages use that nothing else defined: plain tables, danger/secondary buttons, h3.
  const tidy = read('src/app/admin-tidy.css')
  for (const selector of ['table.table th', '.btn-danger', '.btn-secondary', '.h3', '.sh-weekdays', '.sh-table', '.crm-layout'])assert.ok(tidy.includes(selector), selector)
  // The activity log is in Persian.
  assert.doesNotMatch(read('src/app/admin/audit/page.tsx'), />(Audit log|Filter|Newest|Older|No audit events found\.)</)
})

test('admin presentation cannot style public pages after a client-side route change', () => {
  const read = file => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')
  for (const sheet of ['admin-tidy', 'admin-areas']) {
    require('postcss').parse(read(`src/app/${sheet}.css`)).walkRules(rule => {
      if (rule.parent.type === 'atrule' && rule.parent.name === 'keyframes') return
      for (const selector of rule.selectors) assert.match(selector, /\.admin-shell\b/, `Unscoped Admin selector: ${selector}`)
    })
    assert.doesNotMatch(read('src/app/layout.tsx'), new RegExp(`import\\s+['"].*${sheet}\\.css['"]`))
    assert.match(read('src/app/admin/layout.tsx'), new RegExp(`import\\s+['"]\\.\\./${sheet}\\.css['"]`))
  }
})

test('Persian dates: the shared calendar converts every day both ways and date fields are picked on it', () => {
  const j = load('src/shared/time/jalali.ts')
  assert.deepEqual(j.toJalali(new Date('2026-10-21T00:00:00Z')), { jy: 1405, jm: 7, jd: 29 })
  assert.equal(j.isoDay(j.fromJalali(1405, 1, 1)), '2026-03-21')
  assert.equal(j.jalaliMonthLength(1403, 12), 30)
  assert.equal(j.jalaliMonthLength(1404, 12), 29)
  // Every day from 1398 to 1410 survives the round trip, so the picker's grid never skips or repeats a day.
  for (let at = Date.UTC(2019, 2, 21); at < Date.UTC(2032, 2, 21); at += 86_400_000) {
    const { jy, jm, jd } = j.toJalali(new Date(at))
    assert.equal(j.fromJalali(jy, jm, jd).getTime(), at)
  }
  assert.throws(() => j.fromJalali(1404, 12, 30))
  assert.equal(j.parseIsoDay('2026-02-30'), null)
  assert.equal(j.parseIsoDay('1405-07-29'.replace('1405', 'x')), null)
  assert.equal(j.jalaliDayLabel('2026-10-21'), '۲۹ مهر ۱۴۰۵')
  assert.equal(j.jalaliDayLabel(''), '')
  // A date-and-time field holds device time: a moment read back and saved again does not move.
  const moment = new Date(2026, 9, 21, 9, 5)
  assert.equal(j.localDateTime(moment), '2026-10-21T09:05')
  assert.equal(new Date(j.localDateTime(moment.toISOString())).getTime(), moment.getTime())
  assert.equal(j.localDateTime(null), '')
  // No native browser date or time fields remain (they show mm/dd/yyyy and AM/PM); public forms keep their own Persian picker.
  const root = path.resolve(__dirname, '..')
  const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith('.tsx') ? [`${dir}/${e.name}`] : [])
  for (const file of [...walk('src/app'), ...walk('src/components')]) assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), /type=["'{](date|datetime-local|time)["'}]|type=\{[^}]*'(date|datetime-local|time)'/, file)
  const games = fs.readFileSync(path.join(root, 'src/modules/games/domain/games.ts'), 'utf8')
  assert.match(games, /from '@\/shared\/time\/jalali'/, 'one calendar implementation')
})

test('what a search engine or a link preview reads stays true to the page', () => {
  const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')
  const layout = read('src/app/layout.tsx')
  assert.doesNotMatch(layout, /canonical: seo\.base/, 'a page without its own canonical must not claim the home page')
  assert.doesNotMatch(layout.slice(layout.indexOf('openGraph:')), /url: seo\.base/, 'nor its share address')
  assert.match(read('src/app/page.tsx'), /canonical: seo\.base/, 'the home page states its own')
  assert.match(read('src/modules/site/server/seo.ts'), /images: own\.images \|\| \[seo\.ogImage\]/)
  for (const page of ['music/track', 'music/album', 'music/artist', 'games', 'cinema', 'software', 'prompts/templates', 'celebrities']) assert.match(read(`src/app/${page}/[slug]/page.tsx`), /return shareCard\(/, page)
  assert.match(read('src/modules/site/server/pages/sitemap.ts'), /moved\.has\(row\.id\)/, 'an artist who redirects is not listed')
  assert.match(read('src/modules/seo/server/sitemap-entities.ts'), /listed\.has\(row\.id\)/, 'nor a person who redirects')
  assert.match(read('src/proxy.ts'), /x-robots-tag/)
  assert.match(read('src/app/login/page.tsx'), /robots: \{ index: false \}/)
})

test('a customer never reads a placeholder address, and a privacy page ships with the site', () => {
  const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')
  assert.doesNotMatch(read('src/modules/billing/server/pages/invoice/[number]/page.tsx'), /example\.com/)
  const seed = read('prisma/seed.cjs')
  assert.match(seed, /key: 'supportEmail', value: ''/)
  assert.match(seed, /slug: 'privacy'/)
  assert.match(read('prisma/starter-content/privacy.fa.html'), /<h2>/)
})

test('a banner stored on the site is resized, and the load test asks for pages as a browser does', () => {
  const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')
  assert.match(read('src/plugins/ads/PromoSlot.tsx'), /srcSet=\{widthsOf\(ad\.image\)\}/)
  assert.match(read('scripts/load-test.mjs'), /accept: 'text\/html/, 'the guest cache answers only requests for HTML')
})

const normalizePopupKeys = ({ normalizePopup }) => normalizePopup({ title: 'یک پاپ', audience: 'GROUPS', groupIds: ['vip', 'vip', 3, 'nope', 'crm:ویژه'] }, []).groupIds

test('announcement popups: how often, who, and where', () => {
  const compile = (file) => ts.transpileModule(fs.readFileSync(path.join(process.cwd(), file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const groups = { exports: {} }; new Function('require', 'module', 'exports', compile('src/modules/account/domain/site-groups.ts'))(require, groups, groups.exports)
  const mod = { exports: {} }; new Function('require', 'module', 'exports', compile('src/modules/popups/domain/popups.ts'))((name) => name === '@/modules/account/domain/site-groups' ? groups.exports : require(name), mod, mod.exports)
  const { isSiteGroupKey, idsOf } = groups.exports
  for (const key of ['vip', 'buyers', 'subscribers', 'sellers', 'resellers', 'role:4', 'vip-plan:2', 'forum:9', 'crm:مشتری ویژه']) assert.equal(isSiteGroupKey(key), true, key)
  for (const key of ['', 'x', 'role:', 'role:abc', 'crm:', 'forum:1;drop', 7, null]) assert.equal(isSiteGroupKey(key), false, String(key))
  assert.deepEqual(idsOf(['role:4', 'vip', 'role:9', 'vip-plan:2'], 'role'), [4, 9])
  assert.deepEqual(normalizePopupKeys(mod.exports), ['vip', 'crm:ویژه'], 'unknown group keys are dropped')
  const { isDue, matchesAudience, fitsPage, normalizePopup, safeLink, frequencyLabel } = mod.exports
  const hour = 3600000, now = 1000 * hour
  assert.equal(isDue({ repeatHours: 24, maxViews: 10 }, null, now), true)
  assert.equal(isDue({ repeatHours: 24, maxViews: 10 }, { views: 3, lastAt: now - 23 * hour }, now), false)
  assert.equal(isDue({ repeatHours: 24, maxViews: 10 }, { views: 3, lastAt: now - 24 * hour }, now), true)
  assert.equal(isDue({ repeatHours: 24, maxViews: 10 }, { views: 10, lastAt: 0 }, now), false, 'the total is a ceiling')
  assert.equal(isDue({ repeatHours: 0, maxViews: 0 }, { views: 1, lastAt: 0 }, now), false, 'once')
  assert.equal(isDue({ repeatHours: 48, maxViews: 0 }, { views: 500, lastAt: now - 48 * hour }, now), true, 'no total')
  const guest = { signedIn: false, staff: false, sections: [], groupIds: [] }, member = { ...guest, signedIn: true, groupIds: ['vip'] }, manager = { signedIn: true, staff: true, sections: ['music'], groupIds: [] }
  const rule = (audience, extra = {}) => ({ audience, groupIds: [], sections: [], ...extra })
  assert.equal(matchesAudience(rule('GUESTS'), guest), true); assert.equal(matchesAudience(rule('GUESTS'), member), false)
  assert.equal(matchesAudience(rule('MEMBERS'), guest), false)
  assert.equal(matchesAudience(rule('GROUPS', { groupIds: ['vip', 'buyers'] }), member), true); assert.equal(matchesAudience(rule('GROUPS', { groupIds: ['buyers'] }), member), false)
  assert.equal(matchesAudience(rule('SECTION_MANAGERS', { sections: ['music'] }), manager), true)
  assert.equal(matchesAudience(rule('SECTION_MANAGERS', { sections: ['store'] }), manager), false)
  assert.equal(matchesAudience(rule('SECTION_MANAGERS', { sections: ['music'] }), { ...member, sections: ['music'] }), false, 'a section needs a manager')
  assert.equal(matchesAudience(rule('ALL_MANAGERS'), member), false); assert.equal(matchesAudience(rule('NOPE'), manager), false, 'an unknown audience shows to no one')
  const everywhere = { pages: '', audience: 'ALL' }
  assert.equal(fitsPage(everywhere, '/products'), true)
  for (const path of ['/checkout/cart', '/payment/result', '/login', '/invoice/1', '/admin', '/admin/posts']) assert.equal(fitsPage(everywhere, path), false, path)
  assert.equal(fitsPage({ pages: '', audience: 'ALL_MANAGERS' }, '/admin/posts'), true)
  assert.equal(fitsPage({ pages: '/products\n/', audience: 'ALL' }, '/products/x'), true)
  assert.equal(fitsPage({ pages: '/products\n/', audience: 'ALL' }, '/'), true)
  assert.equal(fitsPage({ pages: '/products\n/', audience: 'ALL' }, '/blog'), false)
  assert.equal(fitsPage({ pages: '/prod', audience: 'ALL' }, '/products'), false, 'a prefix ends at a slash')
  for (const bad of ['javascript:alert(1)', '//evil.example', '/\\evil.example', 'http://x.example', 'data:text/html,x']) assert.throws(() => safeLink(bad), /نشانی/, bad)
  assert.equal(safeLink('/products?x=1'), '/products?x=1'); assert.equal(safeLink('https://a.example/b'), 'https://a.example/b')
  assert.throws(() => normalizePopup({ title: 'یک پاپ', design: 'cover' }, []), /تصویر/)
  assert.throws(() => normalizePopup({ title: 'یک پاپ', actionLabel: 'برو' }, []), /دکمه/)
  assert.throws(() => normalizePopup({ title: 'یک پاپ', audience: 'SECTION_MANAGERS', sections: ['nope'] }, ['music']), /بخش/)
  assert.equal(normalizePopup({ title: 'یک پاپ', status: 'HACK' }, []).status, 'DRAFT')
  assert.equal(frequencyLabel({ repeatHours: 24, maxViews: 10 }), 'هر ۲۴ ساعت، در کل ۱۰ بار')
  assert.equal(frequencyLabel({ repeatHours: 0, maxViews: 0 }), 'فقط یک بار')
})

test('VIP plans: what they cost, what period they give, and what an upgrade credits', () => {
  const p = load('src/modules/membership/domain/plans.ts')
  const now = new Date('2026-11-03T00:00:00Z'), DAY = 86_400_000
  const plan = { days: 30, billing: 'DAYS', fixedEndsAt: null, priceMinor: 1000n, signupFeeMinor: 200n, trialDays: 7, trialPriceMinor: 0n, payWhatYouWant: false, minPriceMinor: 0n }
  assert.deepEqual(p.planCharge(plan, { trial: false, firstPurchase: true }), { valueMinor: 1000n, feeMinor: 200n, amountMinor: 1200n })
  assert.equal(p.planCharge(plan, { trial: false, firstPurchase: false }).amountMinor, 1000n)
  assert.equal(p.planCharge(plan, { trial: true, firstPurchase: false }).amountMinor, 0n)
  assert.equal(p.planCharge(plan, { trial: false, firstPurchase: false, offeredMinor: 1n }).amountMinor, 1000n, 'an offer means nothing on a fixed price')
  const want = { ...plan, payWhatYouWant: true, minPriceMinor: 500n }
  assert.equal(p.planCharge(want, { trial: false, firstPurchase: false, offeredMinor: 700n }).amountMinor, 700n)
  assert.throws(() => p.planCharge(want, { trial: false, firstPurchase: false, offeredMinor: 499n }), /حداقل/)
  const end = new Date(now.getTime() + 10 * DAY)
  assert.equal(p.planPeriod(plan, end, now).startsAt.getTime(), end.getTime(), 'a period queues')
  assert.equal(p.planPeriod(plan, end, now, { fresh: true }).startsAt.getTime(), now.getTime(), 'an upgrade starts now')
  assert.equal(p.planPeriod(plan, end, now, { trial: true }).endsAt.getTime(), now.getTime() + 7 * DAY)
  assert.equal(p.planPeriod({ ...plan, billing: 'LIFETIME' }, null, now).endsAt.getTime(), p.LIFETIME_END.getTime())
  assert.equal(p.planPeriod({ ...plan, billing: 'FIXED', fixedEndsAt: end }, null, now).endsAt.getTime(), end.getTime())
  const period = (fields) => ({ id: 1, kind: 'PERIOD', startsAt: new Date(now.getTime() - 15 * DAY), endsAt: new Date(now.getTime() + 15 * DAY), revokedAt: null, amountMinor: 3000n, currency: 'IRT', ...fields })
  assert.deepEqual(p.prorationCredit([period({})], now, 'IRT'), { creditMinor: 1500n, ids: [1] })
  assert.equal(p.prorationCredit([period({ kind: 'TRIAL' }), period({ revokedAt: now }), period({ currency: 'USD' }), period({ amountMinor: 0n }), period({ endsAt: now })], now, 'IRT').creditMinor, 0n, 'only paid days still to come')
  assert.equal(p.prorationCredit([period({ startsAt: new Date(now.getTime() + DAY), endsAt: new Date(now.getTime() + 31 * DAY) })], now, 'IRT').creditMinor, 3000n, 'a queued period is whole')
  const a = { startsAt: new Date(now.getTime() - 40 * DAY), endsAt: new Date(now.getTime() - 10 * DAY), revokedAt: null }, b = { startsAt: a.endsAt, endsAt: new Date(now.getTime() + 20 * DAY), revokedAt: null }, gone = { startsAt: new Date(now.getTime() - 90 * DAY), endsAt: new Date(now.getTime() - 60 * DAY), revokedAt: null }
  assert.equal(p.chainStart([gone, a, b], now).getTime(), a.startsAt.getTime(), 'a drip counts from the unbroken run')
  assert.equal(p.chainStart([gone], now), null)
  assert.equal(p.reminderDue(new Date(now.getTime() + 2.5 * DAY), now, [7, 3, 1]), 3)
  assert.equal(p.reminderDue(new Date(now.getTime() + 9 * DAY), now, [7, 3, 1]), null)
  assert.equal(p.reminderDue(new Date(now.getTime() - DAY), now, [7, 3, 1]), null)
  assert.deepEqual(p.parseReminderDays('1، 7, x, 3, 999, 3'), [7, 3, 1])
  assert.throws(() => p.normalizeTier({ name: 'طلایی', rank: 0 }), /رتبه/)
  assert.throws(() => p.normalizeTier({ name: 'طلایی', rank: 2, storeDiscountPercent: 95 }), /تخفیف/)
  assert.equal(p.normalizeTier({ name: 'طلایی', rank: 2, color: 'red' }).color, '#b45309')
  assert.equal(p.memberState({ endsAt: end, active: true, trial: true, cancelled: false }, now), 'TRIAL')
  assert.equal(p.memberState({ endsAt: end, active: true, trial: false, cancelled: true }, now), 'CANCELLED')
  assert.equal(p.memberState({ endsAt: new Date(now.getTime() + DAY), active: true, trial: false, cancelled: false }, now), 'EXPIRING')
  assert.equal(p.memberState({ endsAt: null, active: false, trial: false, cancelled: false }, now), 'LAPSED')
  const { membershipHealth } = load('src/modules/membership/domain/membership.ts')
  const row = (fields) => ({ userId: 1, kind: 'PERIOD', source: 'PURCHASE', startsAt: new Date(now.getTime() - 40 * DAY), endsAt: new Date(now.getTime() + 20 * DAY), revokedAt: null, planId: 1, orderId: 1, createdAt: new Date(now.getTime() - 40 * DAY), amountMinor: 6000n, currency: 'IRT', ...fields })
  const health = membershipHealth([row({}), row({ userId: 2, endsAt: new Date(now.getTime() - DAY), amountMinor: 0n }), row({ userId: 3, kind: 'TRIAL', amountMinor: 0n, createdAt: new Date(now.getTime() - 5 * DAY) }), row({ userId: 3, createdAt: new Date(now.getTime() - DAY), amountMinor: 0n })], now)
  assert.deepEqual(health.recurring, [{ currency: 'IRT', amountMinor: 3000n }], 'value per 30 days')
  assert.equal(health.churnPercent, 33); assert.equal(health.conversionPercent, 100)
})

test('a restricted block leaves nothing of itself outside a reader it opens to', () => {
  const { documentHtml, documentFacts } = load('src/modules/editor/domain/render.ts')
  const { createRegistry } = load('src/modules/editor/domain/core-blocks.ts')
  const { moduleBlocks } = load('src/modules/editor/domain/module-blocks.ts')
  const registry = createRegistry()
  const text = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'SECRET' }] }] }
  const document = { version: 1, blocks: [{ id: 'lock000000', type: 'content.restricted', version: 1, props: { audience: 'vip', minRank: 0, message: '<b>فقط اعضا</b>' }, children: [{ id: 'inner00000', type: 'content.richText', version: 2, props: { content: text, dir: 'auto' } }] }] }
  const html = documentHtml(document, registry)
  assert.equal(html.includes('SECRET'), false)
  assert.equal(html.includes('<b>'), false, 'the message is plain text')
  assert.equal(documentFacts(document, registry).text.includes('SECRET'), false)
  assert.deepEqual(moduleBlocks(document, registry).map((block) => block.type), ['content.restricted'], 'what it holds is not resolved ahead of the decision')
})

test('a closed site keeps sign-in, payments and paid services open, and only known choices of look', () => {
  const m = load('src/modules/site/domain/maintenance.ts')
  for (const path of ['/login', '/forgot-password', '/reset-password', '/maintenance', '/payment/result', '/s/abc', '/api/auth/session', '/api/login/email-code', '/api/sms/otp', '/api/password/reset', '/api/payment/callback/x', '/api/telegram/hook', '/api/internal/fulfillment', '/api/sub/x', '/logo.png', '/og.png', '/manifest.webmanifest']) assert.equal(m.openDuringSiteMaintenance(path), true, path)
  for (const path of ['/', '/products', '/forum', '/vip', '/admin', '/admin/users', '/dashboard', '/register', '/api/cart', '/api/admin/users', '/api/products', '/dl/1.zip', '/files/a.pdf', '/api/media/x.mp4', '/loginx']) assert.equal(m.openDuringSiteMaintenance(path), false, path)
  const site = m.normalizeSite({ enabled: true, title: '  بسته  ', design: 'hack', effect: 'float', icon: 'rocket', reopensAt: 'nope', users: [3, 3, '4', -1, 'x'], groups: ['vip', 'nope', 'group:2'] })
  assert.deepEqual([site.enabled, site.title, site.design, site.effect, site.icon, site.reopensAt, site.users, site.groups], [true, 'بسته', 'aurora', 'float', 'rocket', '', [3, 4], ['vip', 'group:2']])
  assert.equal(m.normalizeMaintenance(null).site.enabled, false, 'off unless it clearly says on')
  assert.equal(m.normalizeSite({ enabled: 'true' }).enabled, false)
  assert.equal(m.closedPlugins(m.normalizeMaintenance({ site: { enabled: true } })).length, 0, 'the site switch is not a section')
})

test('why a section is closed brings its own words, and the artists section is run by cinema or music', () => {
  const m = load('src/modules/site/domain/maintenance.ts')
  const state = m.normalizeMaintenance({ music: { enabled: true, mode: 'repair' }, games: { mode: 'hack' }, site: { mode: 'update' } })
  assert.equal(m.noticeOf(state.music).title, 'این بخش در حال تعمیر است')
  assert.equal(state.games.mode, 'update', 'an unknown mode falls back')
  assert.equal(m.noticeOf({ ...state.music, title: 'متن من' }).title, 'متن من', 'the owner\'s words win')
  assert.equal(m.siteNoticeOf(state.site).title, 'سایت در حال به‌روزرسانی است')
  assert.equal(m.siteNoticeOf(m.normalizeSite({})).title, 'سایت در دست توسعه است')
  const bases = { celebrities: ['/celebrities'] }
  assert.equal(m.sectionOfPath('/celebrities/hoomaan', bases), 'celebrities')
  const viewer = (permissions) => ({ role: 'ADMIN', roleId: 9, permissions })
  assert.equal(m.runsSection(viewer(['cinema.manage']), 'celebrities'), true)
  assert.equal(m.runsSection(viewer(['music.manage']), 'celebrities'), true)
  assert.equal(m.runsSection(viewer(['games.manage']), 'celebrities'), false)
  assert.equal(m.runsSection({ role: 'CUSTOMER' }, 'celebrities'), false)
  assert.equal(m.runsSection(null, 'celebrities'), false)
  assert.ok(load('src/modules/account/domain/section-access.ts').sectionOfApi('/api/music/history'))
})
