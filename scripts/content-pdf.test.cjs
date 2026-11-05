const {test}=require('node:test'),assert=require('node:assert/strict')
const load=require('./connected-source-loader.cjs')()
const {normalizePdfSettings,pdfRef,pdfLink,PDF_DESIGNS}=load('src/modules/content/domain/pdf.ts')
const {pdfDocument}=load('src/modules/content/domain/pdf-document.ts')
test('PDF settings select eight code-owned designs and independently gate movie/series',()=>{
 const s=normalizePdfSettings({assignments:{movie:{enabled:false},series:{design:'cinema'},post:{design:'<script>'}},watermarkOpacity:900,watermarkAngle:-100,paper:'script'})
 assert.equal(Object.keys(PDF_DESIGNS).length,8);assert.equal(s.assignments.movie.enabled,false);assert.equal(s.assignments.series.enabled,true);assert.equal(s.assignments.series.design,'cinema');assert.equal(s.assignments.post.design,'editorial');assert.equal(s.watermarkOpacity,35);assert.equal(s.watermarkAngle,-60);assert.equal(s.paper,'A4')
})
test('PDF references and watermark addresses cannot select arbitrary URLs or private files',()=>{
 for(const key of ['https://example.com','post:0','post:-1','post:1?url=http://localhost','invoice:4','post:100000000000'])assert.equal(pdfRef(key),null)
 assert.deepEqual(pdfRef('forum-post:12'),{type:'forum-post',id:12})
 for(const url of ['https://example.com/logo.png','/files/private/a.png','/files/uploads/%2e%2e/secret','/files/uploads/a%2fb.png','/files/uploads/a.png?token=x'])assert.equal(normalizePdfSettings({watermarkImage:url}).watermarkImage,'')
 assert.equal(normalizePdfSettings({watermarkImage:'/files/uploads/brand/logo.png'}).watermarkImage,'/files/uploads/brand/logo.png')
 for(const url of ['javascript:alert(1)','file:///etc/passwd','https://u:p@example.com/a','/api/downloads/9','/dl/token'])assert.equal(pdfLink(url,'https://mobocom.net'),'')
})
test('PDF semantic projection keeps full content, tables and safe links, drops executable markup',()=>{
 const tail='END-OF-FULL-CONTENT',blocks=pdfDocument('<script>SECRET</script><h2>عنوان &amp; نام</h2><p>'+('متن فارسی English ۱۴۰۵ '.repeat(1000))+tail+'</p><table><tr><td>الف</td><td>ب</td></tr></table><a href="https://example.com">منبع</a><img src="/files/uploads/a.png" alt="تصویر"><iframe>PRIVATE</iframe>','https://mobocom.net')
 assert.equal(blocks[0].text,'عنوان & نام');assert.ok(blocks.some(b=>b.text?.endsWith(tail)));assert.ok(!JSON.stringify(blocks).includes('SECRET'));assert.ok(!JSON.stringify(blocks).includes('PRIVATE'));assert.ok(blocks.some(b=>b.kind==='table'&&b.rows[0][1]==='ب'));assert.ok(blocks.some(b=>b.link==='https://example.com/'))
 assert.throws(()=>pdfDocument('x'.repeat(1_500_001),'https://mobocom.net'),e=>e.status===413)
})
test('Native PDF embeds a document and refuses a missing required logo watermark',async()=>{
 const render=require('./connected-source-loader.cjs')({'@/modules/media/server/library':{publicImageBytes:async()=>{throw Error('missing fixture image')}}})('src/modules/content/server/pdf/render.ts').renderContentPdf
 const content={ref:{type:'page',id:1},kind:'page',title:'نسخهٔ فارسی MoboCom',subtitle:'',summary:'',html:'<h2>خواندن</h2><p>متن کامل فارسی در کنار English ۱۴۰۵.</p>',image:'',url:'/p/read',updatedAt:new Date(),author:'',facts:[]}
 const bytes=await render(content,normalizePdfSettings({}),'https://mobocom.net','minimal');assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.ok(bytes.length>5000)
 await assert.rejects(()=>render(content,normalizePdfSettings({watermarkKind:'image',watermarkImage:'/files/uploads/missing.png'}),'https://mobocom.net','minimal'),e=>e.status===503)
})
test('PDF worker slots reject excess work and release after a failure',async()=>{
 const {withPdfSlot}=require('./connected-source-loader.cjs')({'./settings':{},'@/extensions/server/modules':{},'@/modules/site/server/seo':{}})('src/modules/content/server/pdf/service.ts')
 let release;const held=new Promise(r=>{release=r}),a=withPdfSlot(()=>held),b=withPdfSlot(()=>held)
 await assert.rejects(()=>withPdfSlot(async()=>0),e=>e.status===429);release();await Promise.all([a,b]);await assert.rejects(()=>withPdfSlot(async()=>{throw Error('owned failure')}));assert.equal(await withPdfSlot(async()=>7),7)
})
