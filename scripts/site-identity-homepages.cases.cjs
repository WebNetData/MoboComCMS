const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./connected-source-loader.cjs')()
const identity=load('src/modules/site/domain/site-identity.ts'),builder=load('src/modules/site/domain/builder.ts')
test('site identity keeps legacy icons and rejects executable, credentialed or malformed icon settings',()=>{
 assert.deepEqual(identity.siteIcons().icon,'/favicon.svg');assert.equal(identity.appIcons().length,3)
 for(const value of ['javascript:alert(1)','data:image/svg+xml,abc','//evil.test/a.png','https://u:p@evil.test/a.png','#icon','/a\\b.png','https://evil.test/\nicon'])assert.equal(identity.validSiteIdentity({favicon:value}),false)
 assert(identity.validSiteIdentity({favicon:'/uploads/icon.ico?v=2',appleIcon:'https://example.test/apple.png',shortName:'سایت من',themeColor:'#123abc'}))
 for(const raw of [{themeColor:'red'},{shortName:'x'.repeat(31)},{script:'alert(1)'},{favicon:42}])assert.equal(identity.validSiteIdentity(raw),false)
 assert.equal(identity.appIcons({appIcon:'/uploads/app.png'})[0].src,'/uploads/app.png');assert(!identity.appIcons({appIcon:'/uploads/app.png'}).some(i=>i.src.includes('/pwa-icon/')))
})
test('seven specialist home presets stay editable documents with real owned feeds and no invented prices or testimonials',()=>{
 const {SPECIALIST_HOMES}=load('src/modules/site/domain/specialist-homes.ts'),{THEME_PRESETS}=load('src/modules/site/domain/builder-templates.ts'),{builderWidgetModule}=load('src/modules/site/domain/builder-content.ts')
 assert.equal(SPECIALIST_HOMES.length,7);assert.equal(new Set(SPECIALIST_HOMES.map(p=>p.module)).size,7)
 for(const p of SPECIALIST_HOMES){assert(THEME_PRESETS.page.some(t=>t.id===p.id));const doc=builder.validateBuilderDoc(p.doc);assert.equal(doc.sections.length,p.doc.sections.length);assert.equal(doc.mode,'builder');assert.equal(doc.code.js,'');const widgets=doc.sections.flatMap(s=>s.columns.flatMap(c=>c.widgets));assert(widgets.some(w=>['posts','products','media','hosting'].includes(w.type)),p.id);assert(!widgets.some(w=>['pricing','testimonials','stats','counters','html'].includes(w.type)),p.id);assert(widgets.some(w=>builderWidgetModule(w)===p.module),p.id);assert(doc.sections.some(s=>s.anchor==='latest'),p.id)}
 assert.equal(builderWidgetModule(builder.createWidget('hosting')),'hosting');assert(builder.MEDIA_SOURCES.includes('software-new'));assert.equal(builderWidgetModule({...builder.createWidget('media'),props:{source:'software-top'}}),'software')
})
