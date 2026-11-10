const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')
// Compile only our pure domain modules; tests execute the same production validators.
const cache = new Map()
function load(relative) {
  const file = path.resolve(__dirname, '..', relative)
  if (cache.has(file)) return cache.get(file)
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  const localRequire = name => name.startsWith('.') ? load(path.relative(path.resolve(__dirname,'..'), path.resolve(path.dirname(file), `${name}.ts`))) : require(name)
  new Function('require','module','exports',source)(localRequire,mod,mod.exports)
  cache.set(file,mod.exports)
  return mod.exports
}
const { validateSite, validateTheme, safeHref } = load('src/modules/site/config/validation.ts')
const { defaultSite } = load('src/modules/site/config/defaults.ts')
const { validForm, validateSubmission } = load('src/modules/forms/domain/forms.ts')
const monitorPlugin = load('src/plugins/operations-monitor/server.ts').plugin
const remnaPlugin = load('src/plugins/remnawave-control/server.ts').plugin
const { reconcileSubscription, safeRepairable } = load('src/modules/providers/domain/remnawave-reconciliation.ts')
const sampleTheme = JSON.parse(fs.readFileSync(path.join(__dirname,'../public/themes/example.json'),'utf8'))
const definition = { slug:'contact-us',title:'تماس',description:'',published:true,successText:'ثبت شد',fields:[{id:'email',label:'ایمیل',type:'email',required:true,options:[]},{id:'topic',label:'موضوع',type:'select',required:true,options:['support','sales']},{id:'consent',label:'رضایت',type:'checkbox',required:true,options:[]}] }

test('Mini App discovery excludes only exact closed path segments and their children',()=>{
  const {miniAppPathOpen,miniAppSections}=load('src/modules/site/domain/miniapp-feed.ts')
  for(const url of ['/music','/music/album/one','/music?q=x','/music#recent'])assert.equal(miniAppPathOpen(url,['/music/']),false,url)
  for(const url of ['/musical','/blog','/products'])assert.equal(miniAppPathOpen(url,['','/music']),true,url)
  assert.equal(miniAppPathOpen('/blog',['/']),false)
  const sections=miniAppSections(['/music','/products'],[{key:'cinema',value:12}],true)
  assert.ok(!sections.some(s=>s.key==='music'||s.key==='store'));assert.equal(sections.find(s=>s.key==='cinema').count,12)
  assert.equal(new Set(sections.map(s=>s.key)).size,sections.length)
})

test('Mini App native links preserve identifiers, queries and fragments without partial prefix matches',()=>{
  const {miniAppHref}=load('src/modules/site/domain/miniapp-navigation.ts')
  assert.equal(miniAppHref('/dashboard/orders/42?tab=paid#files'),'/miniapp/orders/42?tab=paid#files')
  assert.equal(miniAppHref('/dashboard/tickets/12'),'/miniapp/support/12')
  assert.equal(miniAppHref('/dashboard?from=x'),'/miniapp/account?from=x')
  for(const href of ['/plans-old','/dashboard/wallets','/login?next=/music','https://example.invalid/dashboard/orders'])assert.equal(miniAppHref(href),href)
})

test('Mini App tabs have one selected owner and Back has a safe direct-launch fallback',()=>{
  const {miniAppTab,miniAppParent}=load('src/modules/site/domain/miniapp-navigation.ts')
  for(const [path,key]of [['/miniapp','home'],['/miniapp/','home'],['/miniapp/explore','explore'],['/miniapp/plans','explore'],['/miniapp/library','library'],['/miniapp/purchases','library'],['/miniapp/payments','wallet'],['/miniapp/orders/42','account']])assert.equal(miniAppTab(path),key)
  assert.equal(miniAppParent('/miniapp/orders/42'),'/miniapp/orders');assert.equal(miniAppParent('/miniapp/account'),'/miniapp')
  assert.equal(miniAppTab('/miniapp/library-old'),'account')
})

test('Mini App home discovery balances media owners without duplicating or changing their order',()=>{
  const {miniAppHighlights}=load('src/modules/site/domain/miniapp-feed.ts')
  const items=[...Array.from({length:8},(_,i)=>({kind:'music',href:'/music/'+i})),{kind:'cinema',href:'/cinema/one'},{kind:'games',href:'/games/one'}]
  const shelf=miniAppHighlights(items,5)
  assert.deepEqual(shelf.map(i=>i.href),['/music/0','/cinema/one','/games/one','/music/1','/music/2'])
  assert.equal(miniAppHighlights([],10).length,0);assert.equal(miniAppHighlights(items,0).length,0)
  assert.equal(miniAppHighlights(items,100).length,items.length)
})
test('default bilingual configuration and portable theme are valid',()=>{assert.equal(validateSite(defaultSite),true);assert.equal(validateTheme(sampleTheme),true)})
test('stored navigation rejects executable URLs, protocol-relative links and backslashes',()=>{for(const href of ['javascript:alert(1)','//evil.example','/\\evil.example','data:text/html,bad','https://a\n.example'])assert.equal(safeHref(href),false,href);for(const href of ['/plans','/#faq','#network','https://example.org/guide','mailto:help@example.org'])assert.equal(safeHref(href),true,href)})
test('invalid section structure and duplicate identifiers cannot be persisted',()=>{const v=structuredClone(defaultSite);v.sections.push(structuredClone(v.sections[0]));assert.equal(validateSite(v),false);v.sections.pop();v.sections[0].enabled='yes';assert.equal(validateSite(v),false)})
test('invalid themes cannot inject CSS',()=>{assert.equal(validateTheme({...sampleTheme,colors:{...sampleTheme.colors,accent:'red;display:none'}}),false);assert.equal(validateTheme({...sampleTheme,radius:999}),false)})
test('form definitions require unique safe field IDs and usable select options',()=>{assert.equal(validForm(definition),true);const v=structuredClone(definition);v.fields.push(v.fields[0]);assert.equal(validForm(v),false);v.fields.pop();v.fields[0].id='__proto__';assert.equal(validForm(v),false);v.fields[0].id='email';v.fields[1].options=[];assert.equal(validForm(v),false)})
test('submissions enforce required fields, email and declared option values',()=>{assert.throws(()=>validateSubmission(definition.fields,{}),/الزامی/);assert.throws(()=>validateSubmission(definition.fields,{email:'bad',topic:'sales',consent:true}),/ایمیل/);assert.throws(()=>validateSubmission(definition.fields,{email:'a@b.org',topic:'injected',consent:true}),/گزینه/);assert.throws(()=>validateSubmission(definition.fields,{email:'a@b.org',topic:'sales',consent:false}),/الزامی/)})
test('only declared fields are kept and text is trimmed',()=>{const result=validateSubmission(definition.fields,{email:' a@b.org ',topic:'sales',consent:true,admin:true});assert.deepEqual({...result},{email:'a@b.org',topic:'sales',consent:true});assert.equal(Object.hasOwn(result,'admin'),false)})
test('oversized strings and wrong input types are rejected',()=>{assert.throws(()=>validateSubmission(definition.fields,{email:'x'.repeat(600),topic:'sales',consent:true}),/طولانی/);assert.throws(()=>validateSubmission(definition.fields,{email:[],topic:'sales',consent:true}),/معتبر/);assert.throws(()=>validateSubmission(definition.fields,[]),/معتبر/)})
test('operations monitor rejects invalid Telegram and disk thresholds',()=>{
  const settings={alerts:false,'chat-id':'','disk-warning':75,'disk-critical':85,'backup-max-age-hours':4,'order-wait-minutes':15}
  assert.doesNotThrow(()=>monitorPlugin.validateSettings(settings))
  assert.throws(()=>monitorPlugin.validateSettings({...settings,alerts:true}),/Telegram user ID/)
  assert.throws(()=>monitorPlugin.validateSettings({...settings,'chat-id':'-123'}),/Telegram user ID/)
  assert.throws(()=>monitorPlugin.validateSettings({...settings,'disk-critical':75}),/Critical disk threshold/)
  assert.throws(()=>monitorPlugin.validateSettings({...settings,'backup-max-age-hours':0}),/backup-max-age-hours/)
})
test('RemnaWave reconciliation only offers safe automatic fixes',()=>{
  const local={status:'DISABLED',expiresAt:new Date('2026-10-10T00:00:00Z'),trafficLimit:50,panelSubUrl:'https://panel.example/sub/a'}
  const remote={found:true,status:'active',expiresAt:new Date('2026-10-08T00:00:00Z'),trafficLimit:40*1024**3,squads:[],subUrl:'https://panel.example/sub/a'}
  const issues=reconcileSubscription(local,remote)
  assert.deepEqual(issues,['SQUADS_MISSING','DISABLED_LEAK','EXPIRY_DRIFT','TRAFFIC_DRIFT'])
  assert.deepEqual(safeRepairable(issues),['SQUADS_MISSING','DISABLED_LEAK'])
  assert.deepEqual(reconcileSubscription(local,{found:false,error:true}),['PANEL_ERROR'])
  assert.deepEqual(reconcileSubscription(local,{found:false}),['REMOTE_MISSING'])
  assert.deepEqual(reconcileSubscription({...local,status:'ACTIVE'},{found:true,status:'limit_reached',expiresAt:local.expiresAt,trafficLimit:50*1024**3,squads:['s'],subUrl:local.panelSubUrl}),['REMOTE_EXHAUSTED'])
  assert.throws(()=>remnaPlugin.validateSettings({'auto-repair':true,'batch-size':21}),/Batch size/)
})

test('sign-up: the password strength meter grows with length and kinds of characters', () => {
  const { passwordStrength } = load('src/app/login/password-strength.ts')
  assert.equal(passwordStrength(''), 0)
  assert.equal(passwordStrength('abc'), 1)
  assert.equal(passwordStrength('abcdefgh'), 1)
  assert.equal(passwordStrength('abcdefg1'), 1)
  assert.equal(passwordStrength('Abcdefg1'), 2)
  assert.equal(passwordStrength('Abcdefgh1234'), 3)
  assert.equal(passwordStrength('Moboc0m!Strong-Pass'), 4)
  const frame = fs.readFileSync(path.resolve(__dirname, '..', 'src/app/login/AuthFrame.tsx'), 'utf8')
  assert.match(frame, /className="auth-showcase" aria-hidden="true"/, 'the account glimpse is decorative')
  assert.match(fs.readFileSync(path.resolve(__dirname, '..', 'src/app/login/AuthFields.tsx'), 'utf8'), /aria-pressed=\{shown\}/)
})

// ---- a page translated into a left-to-right language reads left to right (owner, 2026-10-28)
test('the translation cookie decides the page direction', () => {
  const { translationTarget, translatedDirection, isRtlLanguage } = load('src/i18n/translation.ts')
  assert.equal(translationTarget('/fa/en'), 'en')
  assert.equal(translationTarget(encodeURIComponent('/fa/zh-CN')), 'zh-CN')
  assert.equal(translationTarget(''), '')
  assert.equal(translationTarget('/fa/fa'), '')
  assert.equal(translationTarget('/fa/en"><script>'), '')
  assert.equal(translationTarget('%E0%A4%A'), '')
  assert.equal(translatedDirection('/fa/en'), 'ltr')
  assert.equal(translatedDirection('/fa/tr'), 'ltr')
  assert.equal(translatedDirection('/fa/ar'), 'rtl')
  assert.equal(translatedDirection('/fa/ur'), 'rtl')
  assert.equal(translatedDirection(undefined), null)
  assert.equal(isRtlLanguage('ps'), true)
  const layout = fs.readFileSync(path.resolve(__dirname, '../src/app/layout.tsx'), 'utf8')
  assert.match(layout, /extensions\['google-translate'\]\?\.enabled \? translatedDirection\(\(await cookies\(\)\)\.get\('googtrans'\)\?\.value\) : null/)
  assert.match(layout, /dir=\{translated \|\| dirOf\(locale\)\} data-translated=\{translated \|\| undefined\}/)
  const css = fs.readFileSync(path.resolve(__dirname, '../src/app/studio.css'), 'utf8')
  assert.match(css, /html\[data-translated=ltr\] body \[dir=rtl\]\{direction:ltr\}/)
  assert.match(css, /\.mc-translate\{position:fixed;bottom:24px;inset-inline-end:24px/)
  // the floating support shortcut is gone (owner, 2026-10-28)
  assert.equal(fs.existsSync(path.resolve(__dirname, '../src/plugins/support-dock')), false)
  assert.equal(defaultSite.plugins['support-dock'], undefined)
})

// ---- the language choice in the site header, with flags (owner, 2026-10-28)
test('the language choice sits in the header with a flag for every offered language', () => {
  const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')
  assert.match(read('src/platform/extensions/contracts.ts'), /\| 'site\.header-actions'/)
  assert.match(read('src/themes/code/mobocom/client.tsx'), /<div className="mb-header-actions">\s*<ThemePluginOutlet slot="site\.header-actions"/)
  assert.match(read('src/components/site/default-theme/DefaultSiteHeader.tsx'), /<PluginOutlet slot="site\.header-actions"/)
  const client = read('src/plugins/google-translate/client.tsx')
  assert.match(client, /\{ slot: 'site\.header-actions', Component: HeaderLanguage/)
  assert.match(client, /\{ slot: 'site\.after-footer', Component: GoogleTranslate/)
  assert.match(read('src/app/language-menu.css'), /body:has\(\.mc-lang\) \.mc-translate \{ display: none; \}/)
  // every language offered by default has a drawn flag (Persian too), and Persian and English names
  const flags = read('src/plugins/google-translate/flags.tsx')
  const offered = JSON.parse(read('src/plugins/google-translate/manifest.json')).settings.find((s) => s.key === 'languages').default.split(',')
  for (const code of ['fa', ...offered]) {
    const key = code.includes('-') ? `'${code}'` : code
    assert.ok(flags.includes(`\n  ${key}: (`), `flag ${code}`)
    assert.ok(flags.includes(`${key}: '`), `names ${code}`)
  }
})

test('member orders and invoices: one quiet document system, scoped so the mini app and other shells keep theirs', () => {
  const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n')
  const css = read('src/app/account-orders.css'), ui = read('src/app/ui.css'), globals = read('src/app/globals.css')
  // Every rule of the page stylesheet starts at the member shell, so /miniapp/orders (same views) is untouched.
  for (const rule of css.replace(/\/\*[\s\S]*?\*\//g, '').match(/^[^@\s}{][^{]*\{/gm)) assert.match(rule, /^(html\[[^\]]+\] )?\.member-shell \.app-main /, rule)
  for (const route of ['orders/page.tsx', 'orders/[id]/page.tsx', 'invoices/page.tsx', 'invoices/[number]/page.tsx']) assert.match(read(`src/app/dashboard/${route}`), /import '(\.\.\/)+account-orders\.css'/, route)
  // Where an order stands is shown in words by its pill; the meter beside it is decoration only.
  const orders = read('src/modules/store/server/pages/my-orders.tsx')
  assert.match(orders, /<span className="sx-my-meter" aria-hidden="true">/)
  assert.match(orders, /\{progress\(order\.state\.key\)\}/)
  // The invoice ledger names its columns once for sight and in every cell for screen readers; filters say when they are on.
  const invoices = read('src/app/dashboard/invoices/page.tsx')
  assert.match(invoices, /<div className="iv-ledger-head" aria-hidden="true">/)
  for (const label of ['شمارهٔ فاکتور: ', 'تاریخ صدور: ', 'مبلغ: ']) assert.ok(invoices.includes(`<span className="sr-only">${label}</span>`), label)
  assert.equal((invoices.match(/aria-pressed=\{status === /g) || []).length, 4)
  // The invoice document and its card payment carry no coloured band, gradient total or glow; the bank card is graphite.
  const sheet = ui.slice(ui.indexOf('/* ---------- invoice sheet'), ui.indexOf('.manual-instructions {'))
  assert.doesNotMatch(sheet, /#4f46e5|#7c3aed|#312e81|::before \{ inline-size|drop-shadow/)
  assert.match(sheet, /\.invoice-grand \{[^}]*background: none;/)
  assert.match(sheet, /\.invoice-page \.card::before \{ content: none; \}/)
  const transfer = globals.slice(globals.indexOf('.ct-box{'), globals.indexOf('.ct-picked{'))
  assert.doesNotMatch(transfer, /#4338ca|#7c3aed|#1e1b4b|236,72,153|backdrop-filter/)
  assert.match(transfer, /\.ct-card\{[^}]*background:linear-gradient\(140deg,#2a2e36/)
})
