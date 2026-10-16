// Actual journal page/query owner against PostgreSQL; only namespaced fixtures are written.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),{PrismaClient}=require('@prisma/client')
const db=new PrismaClient(),stamp=`owned-journal-paging-${Date.now()}`,ids=[],categories=[]
let pageSize=12
const mocks={
 '@/platform/database/prisma':{db},'@/components/AppLink':'a','@/components/SiteHeader':'SiteHeader',
 '@/components/journal/LionaHome':{__esModule:true,default:'LionaHome',LionaGrid:'LionaGrid'},
 '@/i18n/server':{getServerLocale:async()=>'fa',getServerTheme:async()=>'dark'},
 '@/i18n/config':{dict:()=>({blog:'مجله',allCategories:'همه',noPosts:'مطلبی نیست'})},
 '@/shared/content/sanitize':{richTextToPlain:(s)=>String(s||'')},
 '@/components/content/builder/BuilderRenderer':'BuilderRenderer',
 '@/components/content/builder/ThemeChrome':{ThemeHeader:'ThemeHeader',ThemeFooter:'ThemeFooter'},
 '@/modules/site/server/builder-preview':{resolveBuilderDoc:async()=>null,isPreview:()=>false,editableFor:()=>false},
 '@/modules/site/server/theme-templates':{resolvePlacedPage:async()=>null},
 '@/extensions/server/modules':{requireModule:async id=>assert.equal(id,'journal')},
 '@/components/site/SectionBarSlot':'SectionBarSlot','@/components/search/LiveSearchInput':'LiveSearchInput',
 '@/modules/journal/server/admin':{getJournalSettings:async()=>({...load('src/modules/journal/domain/journal.ts').DEFAULT_JOURNAL_SETTINGS,pageSize})},
}
const cache=new Map()
function load(relative){
 const file=path.resolve(__dirname,'..',relative);if(cache.has(file))return cache.get(file).exports
 const mod={exports:{}};cache.set(file,mod)
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
 const local=name=>{if(Object.hasOwn(mocks,name))return mocks[name];if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?path.resolve(__dirname,'../src',name.slice(2)):path.resolve(path.dirname(file),name);for(const ext of ['.ts','.tsx','/index.ts'])if(fs.existsSync(base+ext))return load(path.relative(path.resolve(__dirname,'..'),base+ext))}return require(name)}
 new Function('require','module','exports',code)(local,mod,mod.exports);return mod.exports
}
function find(tree,type){if(!tree||typeof tree!=='object')return null;if(tree.type===type||tree.type?.name===type)return tree;if(Array.isArray(tree))return tree.map(x=>find(x,type)).find(Boolean)||null;return find(tree.props?.children,type)}
async function main(){try{
 const parent=await db.postCategory.create({data:{slug:stamp,name:'آزمون صفحه‌بندی'}});categories.push(parent.id)
 const child=await db.postCategory.create({data:{slug:stamp+'-child',name:'زیرموضوع آزمون',parentId:parent.id}});categories.push(child.id)
 for(let i=0;i<29;i++){const row=await db.post.create({data:{slug:`${stamp}-${i}`,title:`${stamp} ${i%2?'match':'other'} ${i}`,excerpt:'توضیح آزمایشی',content:'محتوای آزمایشی',status:'PUBLISHED',publishedAt:new Date('2001-01-01'),...(i%3===0?{categories:{create:{categoryId:child.id}}}:{categoryId:parent.id})}});ids.push(row.id)}
 for(const [kind,status,publishedAt]of [['future','PUBLISHED',new Date('2999-01-01')],['draft','DRAFT',new Date('2001-01-01')]]){const row=await db.post.create({data:{slug:`${stamp}-${kind}`,title:stamp+' match '+kind,content:'private fixture',categoryId:parent.id,status,publishedAt}});ids.push(row.id)}
 const {default:BlogPage}=load('src/modules/site/server/pages/blog/page.tsx'),render=async params=>BlogPage({searchParams:Promise.resolve(params)})
 const listed=[],expected=ids.slice(0,29).reverse()
 for(let page=1;page<=3;page++){const tree=await render({category:stamp,page:String(page)}),grid=find(tree,'LionaGrid'),pager=find(tree,'JournalPagination');assert.ok(!find(tree,'LionaHome'));assert.equal(pager.props.page,page);assert.equal(pager.props.pages,3);assert.equal(pager.props.total,29);assert.equal(pager.props.category,stamp);const actual=grid.props.stories.map(x=>x.id);assert.deepEqual(actual,expected.slice((page-1)*12,page*12));listed.push(...actual)}
 assert.deepEqual(listed,expected);assert.equal(new Set(listed).size,29)
 const filtered=await render({category:stamp,q:stamp+' match',page:'2'}),filterPager=find(filtered,'JournalPagination');assert.equal(filterPager.props.total,14);assert.equal(filterPager.props.page,2);assert.equal(filterPager.props.query,stamp+' match');assert.equal(find(filtered,'LionaGrid').props.stories.length,2)
 for(const page of ['1','bad','999999']){const tree=await render({page});assert.ok(find(tree,'LionaGrid'));assert.ok(find(tree,'JournalPagination'));assert.ok(!find(tree,'LionaHome'),'explicit archive must never turn into editorial home')}
 const home=await render({});assert.ok(find(home,'LionaHome'));assert.ok(!find(home,'JournalPagination'))
 const empty=await render({category:stamp,q:stamp+' missing'});assert.ok(!find(empty,'LionaGrid'));assert.ok(!find(empty,'JournalPagination'))
 const last=find(await render({category:stamp,page:'999'}),'JournalPagination');assert.equal(last.props.page,3);assert.equal(last.props.first,25);assert.equal(last.props.last,29)
 pageSize=24;const configured=find(await render({category:stamp,page:'2'}),'JournalPagination');assert.equal(configured.props.pages,2);assert.equal(configured.props.first,25)
 const after=await db.post.findMany({where:{id:{in:ids}},orderBy:{id:'asc'},select:{id:true,status:true,content:true}});assert.equal(after.length,31);assert.ok(after.every(row=>row.content=== (row.id>=ids[29]?'private fixture':'محتوای آزمایشی')));assert.equal(after.filter(row=>row.status==='DRAFT').length,1)
 console.log('Journal PostgreSQL: exact/disjoint pages, stable tie order, parent/secondary category, search, settings, empty/invalid/last page, explicit archive/home and unchanged rows passed.')
}finally{await db.post.deleteMany({where:{id:{in:ids},slug:{startsWith:stamp}}});await db.postCategory.deleteMany({where:{id:{in:categories},slug:{startsWith:stamp}}});await db.$disconnect()}}
main().catch(e=>{console.error(e.stack);process.exitCode=1})
