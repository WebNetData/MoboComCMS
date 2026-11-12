const{test}=require('node:test'),assert=require('node:assert/strict'),source=require('./connected-source-loader.cjs');
test('production settings keep exact human prices, bounded batches, deterministic image slots and safe structured model text',()=>{
 const p=source()('src/modules/ai/domain/production.ts'),config={categoryIds:[],length:'medium',tone:'دقیق',keywords:'',instruction:'',cover:true,inline:2,imageStyle:'editorial',ratio:'landscape',productKind:'PHYSICAL',currency:'IRT',specifications:'{}'},seed={topic:'موضوع معتبر',facts:'اطلاعات قطعی محصول برای آزمون',price:'1200',stock:0};
 assert.equal(p.parseProduction({kind:'product',config,seeds:[seed]}).seeds[0].price,'1200');for(const price of['','-1','1.234','NaN'])assert.throws(()=>p.parseProduction({kind:'product',config,seeds:[{...seed,price}]}));assert.throws(()=>p.parseProduction({kind:'post',config,seeds:Array(51).fill(seed)}));assert.throws(()=>p.parseProduction({kind:'post',config:{...config,inline:21},seeds:[seed]}));assert.equal(p.parseProduction({kind:"post",config:{...config,inline:20},seeds:[seed]}).config.inline,20);assert.throws(()=>p.parseProduction({kind:'page',config:{...config,categoryIds:[1]},seeds:[seed]}));
 const output={title:'متن معتبر',slug:'valid-slug',excerpt:'خلاصه',coverPrompt:'تصویر اصلی',sections:[{heading:'تیتر',text:'متن واقعی. '.repeat(25),imagePrompt:'تصویر داخلی'}]};assert.equal(p.parseProductionOutput('```json\n'+JSON.stringify(output)+'\n```').slug,'valid-slug');for(const raw of['<html>wrong</html>',JSON.stringify({...output,slug:'javascript:bad'}),JSON.stringify({...output,sections:[]})])assert.throws(()=>p.parseProductionOutput(raw));assert.equal(p.nextImage(config,[]),0);assert.equal(p.nextImage(config,[{index:0},{index:1}]),2);assert.equal(p.nextImage(config,[{index:0},{index:1},{index:2}]),undefined);assert.match(p.productionPrompt('product',config,seed,[],'Brand'),/JSON/);assert(!p.productionPrompt('product',config,seed,[],'Brand').includes('1200'),'model has no authority over price');assert.match(p.imagePrompt(config,output,0),/16:9/)
});

test('production images: the owner writes the image subject; {عنوان}, {بخش} and {پیشنهاد} are filled per image', () => {
  const p = source()('src/modules/ai/domain/production.ts')
  const output = { title: 'سفر به شمال', slug: 'north', excerpt: '', coverPrompt: 'a young man by the sea', sections: [{ heading: 'جنگل', text: 'x'.repeat(30), imagePrompt: 'a young man in a forest' }] }
  const base = { categoryIds: [], length: 'medium', tone: '', keywords: '', instruction: '', cover: true, inline: 1, imageStyle: 'watercolor', ratio: 'landscape', productKind: 'PHYSICAL', currency: 'IRT', specifications: '{}' }
  assert.match(p.imagePrompt(base, output, 1), /Subject: a young man in a forest\./, 'without the owner\'s prompt: the AI\'s idea, as before')
  const own = { ...base, imageSubject: 'منظرهٔ {بخش} برای «{عنوان}»، بدون انسان' }
  assert.match(p.imagePrompt(own, output, 1), /Subject: منظرهٔ جنگل برای «سفر به شمال»، بدون انسان\./)
  assert.match(p.imagePrompt(own, output, 0), /Subject: منظرهٔ سفر به شمال برای «سفر به شمال»/, 'the cover takes the title as its section')
  assert.match(p.imagePrompt({ ...base, imageSubject: '{پیشنهاد}, no people' }, output, 1), /Subject: a young man in a forest, no people\./)
  assert.ok(p.IMAGE_SUBJECT_SUGGESTIONS.length >= 4)
})
