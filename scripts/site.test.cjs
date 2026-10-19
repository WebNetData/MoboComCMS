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
