const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const vm = require('node:vm')
const ts = require('typescript')
function load(file, mocks = {}, cache = new Map()) {
  const key = file.replace(/\\/g,'/')
  if (cache.has(key)) return cache.get(key).exports
  const abs = path.join(__dirname,'..',key)
  const source = ts.transpileModule(fs.readFileSync(abs,'utf8'), { compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true} }).outputText
  const mod = { exports:{} }; cache.set(key,mod)
  const localRequire = name => {
    if (Object.hasOwn(mocks,name)) return mocks[name]
    if (name.startsWith('@/')) {
      const base = 'src/' + name.slice(2)
      for (const candidate of [base+'.ts',base+'.tsx',base+'/index.ts',base+'/index.tsx']) if (fs.existsSync(path.join(__dirname,'..',candidate))) return load(candidate,mocks,cache)
      if (base.endsWith('.json') && fs.existsSync(path.join(__dirname,'..',base))) return require(path.join(__dirname,'..',base))
    }
    return require(name)
  }
  new Function('require','module','exports',source)(localRequire,mod,mod.exports)
  return mod.exports
}
const content = load('src/modules/subscriptions/domain/subscription-content.ts')
const telegram = load('src/modules/notifications/server/telegram.ts',{'@/platform/database/prisma':{db:{}},'@/modules/site/server/site-url':{},'@/modules/subscriptions/server/happ-protocol':{}})

test('customer overview excludes expired usage and preserves unlimited allowance', () => {
  const { customerOverview, subscriptionState, sortCustomerSubscriptions } = load('src/modules/subscriptions/domain/customer-overview.ts')
  const now = Date.parse('2026-09-24T00:00:00Z')
  const subs = [
    { status: 'ACTIVE', trafficUsedGB: 40, trafficLimitGB: 0, expiresAt: '2026-10-24T00:00:00Z', daysLeft: 30 },
    { status: 'ACTIVE', trafficUsedGB: 9.5, trafficLimitGB: 10, expiresAt: '2026-09-28T00:00:00Z', daysLeft: 4 },
    { status: 'ACTIVE', trafficUsedGB: 100, trafficLimitGB: 100, expiresAt: '2026-09-23T00:00:00Z', daysLeft: 0 },
  ]
  const summary = customerOverview(subs, now)
  assert.equal(summary.active, 2)
  assert.equal(summary.attention, 1)
  assert.equal(summary.usedGB, 49.5)
  assert.equal(summary.limitGB, null)
  assert.equal(subscriptionState(subs[2], now), 'expired')
  assert.equal(sortCustomerSubscriptions(subs, now)[0], subs[1])
})

test('reseller team permissions are checked on each request and revoked members lose access', async () => {
  let active = true
  const agency = { id: 9, userId: 1, active: true, prices: [], user: { id: 1, email: 'owner@example.com' } }
  const db = {
    reseller: { findUnique: async ({ where }) => where.userId ? null : agency },
    resellerMember: { findUnique: async () => ({ resellerId: 9, active, permissions: 'accounts.view,sales.review' }) },
  }
  const domain = load('src/modules/reseller/server/reseller.ts', {
    '@/platform/database/prisma': { db },
    '@/platform/http/response': { err: (message, status) => ({ message, status }) },
    '@/modules/identity/server/access': { requireUser: async () => ({ id: 2 }) },
    '@/modules/subscriptions/server/happ-protocol': {},
    '@/modules/billing/server/billing': {},
    '@/modules/wallet/server/wallet': {},
    '@/modules/fulfillment/server/jobs': {},
    '@/shared/money': {},
  })
  const allowed = await domain.requireReseller({})
  assert.equal(allowed.ok, true)
  assert.equal(allowed.owner, false)
  assert.equal(domain.resellerCan(allowed, 'accounts.view'), true)
  assert.equal(domain.resellerCan(allowed, 'accounts.manage'), false)
  assert.equal(domain.resellerCan(allowed, 'sales.view'), true)
  assert.equal(domain.resellerCan(allowed, 'sales.review'), true)
  active = false
  const revoked = await domain.requireReseller({})
  assert.equal(revoked.ok, false)
  assert.equal(revoked.response.status, 403)
})

test('team members cannot install a bot or manage teammates through the API', async () => {
  const guard = { ok: true, owner: false, permissions: ['sales.view'], reseller: { id: 9 }, auth: { id: 2 } }
  const mocks = {
    '@/platform/database/prisma': { db: {} },
    '@/platform/http/response': { err: (message, status) => ({ message, status }), ok: data => data },
    '@/modules/reseller/server/reseller': { requireReseller: async () => guard, resellerCan: () => true, parseResellerPermissions: value => value.split(','), RESELLER_PERMISSIONS: ['sales.view'] },
    '@/modules/reseller/server/reseller-bot': { installResellerBot: () => { throw Error('bot installation must not run') } },
    '@/modules/reseller/server/reseller-bot-sales': {},
    '@/shared/money': {},
    '@/platform/observability/logger': { logEvent: () => {} },
  }
  const botRoute = load('src/modules/reseller/server/http/reseller/bot/route.ts', mocks)
  const teamRoute = load('src/modules/reseller/server/http/reseller/team/route.ts', mocks)
  assert.equal((await botRoute.PUT({})).status, 403)
  assert.equal((await teamRoute.GET({})).status, 403)
})

test('RemnaWave health and subscription telemetry use the panel read API',async()=>{
  const {RemnaWaveAdapter}=load('src/modules/providers/server/panels.ts',{
    '@/modules/subscriptions/domain/subscription-content':{},
    '@/modules/site/server/site-url':{},
    '@/shared/security/random':{randomPassword:()=> 'test'},
    '@/modules/providers/server/panel-credentials':{decryptPanelCredential:value=>value},
  })
  const previous=global.fetch
  const calls=[]
  global.fetch=async(url,init)=>{
    calls.push({url:String(url),authorization:init.headers.Authorization})
    const body=String(url).includes('/system/health')?{response:{runtimeMetrics:[{name:'api'}]}}:{response:{username:'alice',status:'ACTIVE',expireAt:'2026-11-01T00:00:00Z',trafficLimitBytes:10*1024**3,userTraffic:{usedTrafficBytes:1024**3,lifetimeUsedTrafficBytes:3*1024**3},subLastOpenedAt:'2026-10-01T00:00:00Z',subLastUserAgent:'Happ/1',hwidDeviceLimit:2,activeInternalSquads:[{uuid:'squad-1'}],subscriptionUrl:'https://panel.example/sub/a'}}
    return {ok:true,status:200,text:async()=>JSON.stringify(body)}
  }
  try {
    const adapter=new RemnaWaveAdapter('https://panel.example','private-token')
    const health=await adapter.getHealth()
    const user=await adapter.getUser('alice')
    assert.equal(health.ok,true);assert.equal(health.components,1)
    assert.equal(user.ok,true);assert.equal(user.user.trafficUsed,1024**3)
    assert.equal(user.user.lifetimeTrafficUsed,3*1024**3)
    assert.equal(user.user.deviceLimit,2)
    assert.equal(user.user.lastOpenedAt.toISOString(),'2026-10-01T00:00:00.000Z')
    assert.ok(calls.every(call=>call.authorization==='Bearer private-token'))
  } finally {global.fetch=previous}
})

test('RemnaWave lookup never accepts the wrong user from an ignored username route',async()=>{
  const {RemnaWaveAdapter}=load('src/modules/providers/server/panels.ts',{
    '@/modules/subscriptions/domain/subscription-content':{},'@/modules/site/server/site-url':{},
    '@/shared/security/random':{randomPassword:()=> 'test'},'@/modules/providers/server/panel-credentials':{decryptPanelCredential:value=>value},
  })
  const previous=global.fetch
  global.fetch=async(url)=>({ok:true,status:200,text:async()=>JSON.stringify(String(url).includes('by-username')?{response:{username:'alice',uuid:'wrong'}}:{response:{users:[{username:'alice',uuid:'wrong'},{username:'bob',uuid:'correct',status:'ACTIVE'}]}})})
  try {
    const found=await new RemnaWaveAdapter('https://panel.example','token').getUser('bob')
    assert.equal(found.ok,true);assert.equal(found.user.username,'bob')
  } finally {global.fetch=previous}
})

test('Telegram redirect keeps signed fields separate from local navigation',()=>{
  const {parseTelegramWidgetRedirect}=load('src/modules/identity/telegram-widget-redirect.ts')
  const valid=new URLSearchParams('id=123&first_name=Amir&auth_date=1700000000&hash=abc&next=%2Fminiapp')
  assert.deepEqual(parseTelegramWidgetRedirect(valid),{
    authData:JSON.stringify({id:'123',first_name:'Amir',auth_date:'1700000000',hash:'abc'}),
    destination:'/miniapp',
  })
  assert.equal(parseTelegramWidgetRedirect(new URLSearchParams('id=123&id=456&auth_date=1&hash=x')),null)
  assert.equal(parseTelegramWidgetRedirect(new URLSearchParams('next=/dashboard')),null)
  assert.equal(parseTelegramWidgetRedirect(new URLSearchParams('id=1&auth_date=2&hash=x&next=%2F%2Fevil.example')).destination,'/dashboard')
})

test('Telegram language choice persists per user and rejects invalid ids',async()=>{
  const values=new Map()
  const users=new Map([['12345',{id:7,telegramId:'12345'}]])
  const db={$transaction:async operations=>Promise.all(operations),user:{
    findUnique:async({where})=>where.telegramId?users.get(where.telegramId)||null:where.id===7?users.get('12345'):null,
  },setting:{
    findUnique:async({where})=>values.has(where.key)?{value:values.get(where.key)}:null,
    upsert:async({where,create,update})=>values.set(where.key,values.has(where.key)?update.value:create.value),
  }}
  const languages=load('src/modules/notifications/server/telegram-locale.ts',{'@/platform/database/prisma':{db}})
  assert.equal(await languages.getBotLocale('12345'),null)
  await languages.setBotLocale('12345','fa')
  assert.equal(await languages.getBotLocale('12345'),'fa')
  assert.equal(await languages.getUserLocale(7),'fa')
  await languages.setUserLocale(7,'en')
  assert.equal(await languages.getBotLocale('12345'),'en')
  assert.equal(values.get('telegram.locale.12345'),'en')
  await languages.setBotLocale('12345','en')
  assert.equal(await languages.getBotLocale('12345'),'en')
  assert.equal(languages.languageKeyboard[0][0].callback_data,'lang:en')
  assert.equal(languages.languageKeyboard[0][1].callback_data,'lang:fa')
  await assert.rejects(languages.setBotLocale('bad:id','fa'))
})

test('plan labels never leak untranslated Persian names into English alerts',()=>{
  const {planName,planDescription}=load('src/modules/catalog/domain/plan-locale.ts')
  const legacy={name:'پلن ماهانه',description:'دسترسی سریع',nameEn:'',descriptionEn:'',trafficGB:50,days:30}
  assert.equal(planName(legacy,'en'),'50 GB · 30-day plan')
  assert.equal(planDescription(legacy,'en'),'')
  assert.equal(planName(legacy,'fa'),'پلن ماهانه')
  assert.equal(planName({...legacy,nameEn:'Premium'},'en'),'Premium')
})

test('signed-in website renders the shared account language across devices',async()=>{
  let accountLocale='fa'
  const server=load('src/i18n/server.ts',{
    './config':{normalizeLocale:(value,fallback)=>value==='en'||value==='fa'?value:fallback},
    'next/headers':{cookies:async()=>({get:()=>({value:'en'})})},
    'next-auth':{getServerSession:async()=>({user:{id:'7'}})},
    '@/modules/identity/auth':{authOptions:{}},
    '@/modules/notifications/server/telegram-locale':{getUserLocale:async()=>accountLocale},
  })
  assert.equal(await server.getServerLocale(),'fa')
  accountLocale=null
  assert.equal(await server.getServerLocale(),'en')
})

test('subscription delivery alert follows the selected Telegram language',async()=>{
  let locale='en'
  const sent=[]
  const previousFetch=global.fetch
  const previous={token:process.env.TELEGRAM_BOT_TOKEN,base:process.env.TELEGRAM_API_BASE,enabled:process.env.TELEGRAM_ENABLED}
  process.env.TELEGRAM_BOT_TOKEN='test-token';process.env.TELEGRAM_API_BASE='https://bot.example';process.env.TELEGRAM_ENABLED='true'
  global.fetch=async(_url,init)=>{sent.push(JSON.parse(init.body));return {ok:true,status:200,json:async()=>({ok:true,result:{}})}}
  try {
    const db={
      setting:{findMany:async()=>[],findUnique:async()=>null},
      subscription:{findUnique:async()=>({username:'happ_user',trafficLimit:50,subToken:'token',expiresAt:new Date(Date.now()+30*86400000),plan:{name:'پلن ماهانه',nameEn:'Monthly plan',trafficGB:50,days:30},user:{telegramId:'12345'}})},
    }
    const telegramModule=load('src/modules/notifications/server/telegram.ts',{
      '@/platform/database/prisma':{db},
      '@/modules/notifications/server/telegram-locale':{getBotLocale:async()=>locale,botText:(value,en,fa)=>value==='fa'?fa:en},
      '@/modules/subscriptions/server/happ-protocol':{safeHappLink:async()=> 'happ://example'},
    })
    assert.equal(await telegramModule.notifySubscriptionReady(1),true)
    assert.match(sent.at(-1).text,/Monthly plan/)
    assert.doesNotMatch(sent.at(-1).text,/پلن ماهانه/)
    locale='fa'
    assert.equal(await telegramModule.notifySubscriptionReady(1),true)
    assert.match(sent.at(-1).text,/پلن ماهانه/)
  } finally {
    global.fetch=previousFetch
    for(const [name,value] of Object.entries({TELEGRAM_BOT_TOKEN:previous.token,TELEGRAM_API_BASE:previous.base,TELEGRAM_ENABLED:previous.enabled})) if(value===undefined) delete process.env[name]; else process.env[name]=value
  }
})

test('Telegram bot asks for language on start and keeps the chosen language',async()=>{
  let locale=null
  const registered=[]
  const calls=[]
  const bot=async(method,payload)=>{calls.push({method,payload});return {ok:true}}
  const route=load('src/modules/notifications/server/http/telegram/webhook/route.ts',{
    'next/server':{NextResponse:{json:body=>body}},
    '@/platform/database/prisma':{db:{user:{findFirst:async()=>null}}},
    '@/modules/subscriptions/server/submanage':{},
    '@/modules/subscriptions/server/subs':{},
    '@/modules/subscriptions/server/happ-protocol':{},
    '@/modules/notifications/server/telegram':{bot,telegramConfig:async()=>({ready:true,webhookSecret:'secret'}),miniAppButton:async label=>[{text:label,url:'https://example.com/miniapp'}]},
    '@/modules/notifications/server/telegram-locale':{
      botText:(choice,en,fa)=>choice==='fa'?fa:en,
      getBotLocale:async()=>locale,
      setBotLocale:async(_id,choice)=>{locale=choice},
      languagePrompt:'Choose language / انتخاب زبان',
      languageKeyboard:[[{text:'English',callback_data:'lang:en'},{text:'فارسی',callback_data:'lang:fa'}]],
    },
    '@/modules/identity/telegram-account':{userForTelegram:async user=>{registered.push(user.id);return {id:1,status:'ACTIVE'}}},
    '@/modules/wallet/server/wallet':{},
    '@/shared/money/format':{},
    '@/modules/checkout/server/checkout':{},
    '@/modules/billing/server/gateways':{},
  })
  const request=update=>({headers:{get:()=> 'secret'},json:async()=>update})
  await route.POST(request({message:{chat:{id:123,type:'private'},from:{id:123},text:'/start'}}))
  assert.deepEqual(registered,[123])
  assert.equal(calls.at(-1).payload.text,'Choose language / انتخاب زبان')
  assert.equal(calls.at(-1).payload.reply_markup.inline_keyboard[0][1].callback_data,'lang:fa')
  await route.POST(request({callback_query:{id:'cb1',from:{id:123},message:{chat:{id:123,type:'private'},message_id:4},data:'lang:fa'}}))
  assert.equal(locale,'fa')
  assert.match(calls.at(-1).payload.text,/خوش آمدید/)
  await route.POST(request({message:{chat:{id:123,type:'private'},from:{id:123},text:'/start'}}))
  assert.match(calls.at(-1).payload.text,/خوش آمدید/)
})

test('bot installation keeps the native Telegram menu',async()=>{
  const original=global.fetch
  let sent
  global.fetch=async(_url,options)=>{sent=JSON.parse(options.body);return new Response(JSON.stringify({ok:true,result:true}),{status:200})}
  try {
    const result=await telegram.setMenuButton('https://example.com',{token:'test',username:'happ_bot',apiBase:'https://api.telegram.org',webhookSecret:'',enabled:true,ready:true})
    assert.equal(result.ok,true)
    assert.deepEqual(sent.menu_button,{type:'default'})
  } finally {global.fetch=original}
})

test('manual fulfillment retry requires a paid order and reuses its existing job', async()=>{
  let paid=true, status='FAILED', calls=0, created=0, rescheduled=0
  const job={id:41,status:'FAILED',lockedAt:null}
  const db={
    invoice:{findFirst:async()=>paid?{id:17,order:{id:9,status:'PAID',planId:2,productId:null}}:null},
    fulfillmentJob:{findFirst:async()=>({...job,status}),updateMany:async()=>{rescheduled++;return {count:1}}},
  }
  const operations=load('src/modules/fulfillment/server/operations.ts',{
    '@/platform/database/prisma':{db},
    './jobs':{enqueueOrderFulfillment:async()=>{created++;return job},processFulfillmentJob:async(id)=>{calls++;assert.equal(id,41);return {ok:true}}},
  })
  assert.equal((await operations.retryPaidFulfillment(9)).ok,true)
  assert.equal(calls,1);assert.equal(created,0);assert.equal(rescheduled,1)
  status='DONE'
  assert.equal((await operations.retryPaidFulfillment(9)).ok,false)
  assert.equal(calls,1)
  paid=false
  assert.equal((await operations.retryPaidFulfillment(9)).ok,false)
  assert.equal(calls,1)
})

test('missing paid renewal job cannot be recreated by admin retry', async()=>{
  let enqueued=0
  const db={
    invoice:{findFirst:async()=>({id:17,order:{id:9,status:'PAID',planId:2,productId:null}})},
    fulfillmentJob:{findFirst:async()=>null},
    order:{findUnique:async()=>({meta:JSON.stringify({kind:'renewal',subscriptionId:3})})},
  }
  const operations=load('src/modules/fulfillment/server/operations.ts',{
    '@/platform/database/prisma':{db},
    './jobs':{enqueueOrderFulfillment:async()=>{enqueued++},processFulfillmentJob:async()=>{throw Error('must not run')}},
  })
  const result=await operations.retryPaidFulfillment(9)
  assert.equal(result.ok,false)
  assert.equal(enqueued,0)
})
function initData(overrides={}) {
  const fields = {auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:12345,first_name:'Test'}),...overrides}
  const secret = crypto.createHmac('sha256','WebAppData').update('test-token').digest()
  const hash = crypto.createHmac('sha256',secret).update(Object.entries(fields).map(([k,v])=>`${k}=${v}`).sort().join('\n')).digest('hex')
  return new URLSearchParams({...fields,hash}).toString()
}
test('Telegram accepts a signed identity and rejects tampering, expiry, future dates and duplicate keys',()=>{
  const value=initData()
  assert.equal(telegram.verifyInitData(value,'test-token').id,12345)
  assert.equal(telegram.verifyInitData(value.replace('Test','Other'),'test-token'),null)
  assert.equal(telegram.verifyInitData(value,'wrong-token'),null)
  assert.equal(telegram.verifyInitData(value+'&auth_date=1','test-token'),null)
  for (const offset of [-700,120]) assert.equal(telegram.verifyInitData(initData({auth_date:String(Math.floor(Date.now()/1000)+offset)}),'test-token'),null)
  assert.equal(telegram.verifyInitData(initData({user:'{"id":-5}'}),'test-token'),null)
})
function loginWidgetData(overrides={}) {
  const fields={id:12345,first_name:'Test',username:'happ_test',auth_date:Math.floor(Date.now()/1000),...overrides}
  const secret=crypto.createHash('sha256').update('test-token').digest()
  const hash=crypto.createHmac('sha256',secret).update(Object.entries(fields).map(([k,v])=>`${k}=${v}`).sort().join('\n')).digest('hex')
  return JSON.stringify({...fields,hash})
}
test('Telegram website login validates signatures, age and allowed fields',()=>{
  assert.equal(telegram.verifyLoginWidget(loginWidgetData(),'test-token').id,12345)
  assert.equal(telegram.verifyLoginWidget(loginWidgetData(),'wrong-token'),null)
  assert.equal(telegram.verifyLoginWidget(loginWidgetData({auth_date:Math.floor(Date.now()/1000)-700}),'test-token'),null)
  assert.equal(telegram.verifyLoginWidget(loginWidgetData({admin:true}),'test-token'),null)
  const tampered=JSON.parse(loginWidgetData());tampered.first_name='Other'
  assert.equal(telegram.verifyLoginWidget(JSON.stringify(tampered),'test-token'),null)
})
test('profiles reject HTML, arbitrary URLs and mislabeled JSON',()=>{
  assert.deepEqual(content.parseLinks(Buffer.from('vless://abc@example.org:443#VPN').toString('base64')),['vless://abc@example.org:443#VPN'])
  for(const body of ['<html>https://error.example</html>','https://example.org','javascript://alert(1)','']) assert.equal(content.validProfile(body,'links'),false)
  assert.equal(content.validProfile('vless://abc@example.org:443','xray'),false)
  assert.equal(content.validProfile('{"outbounds":[{"protocol":"vless"}]}','xray'),true)
  assert.equal(content.upstreamUrl('https://shop.test/s/token','https://shop.test'),null)
  assert.equal(content.upstreamUrl('https://alias.test/api/sub/token','https://shop.test'),null)
})
test('unavailable panel returns a bounded 502 without requesting the mirror',async()=>{
  const row={id:1,status:'ACTIVE',expiresAt:new Date(Date.now()+86400000),subToken:'secret',username:'qa',panelSubUrl:'https://shop.test/s/secret',panel:{type:'REMNAWAVE'},plan:{name:'QA',panel:null}}
  let fetches=0
  const original=global.fetch
  global.fetch=async()=>{fetches++;throw new Error('must not fetch own route')}
  try {
    const subs=load('src/modules/subscriptions/server/subs.ts',{'qrcode':{},'@/platform/database/prisma':{db:{subscription:{findUnique:async()=>row}}},'@/modules/providers/server/panels':{getPanelAdapter:()=>({getSubscription:async()=>({ok:false,message:'unavailable'})})},'@/modules/subscriptions/server/provision':{},'@/modules/site/server/site-url':{siteBaseUrl:async()=> 'https://shop.test',mirrorUrl:(base,token)=>`${base}/s/${token}`,legacyMirrorUrl:(base,token)=>`${base}/api/sub/${token}`},'@/modules/subscriptions/domain/subscription-content':content})
    const response=await subs.serveSubscription(new Request('https://shop.test/s/secret'),'secret')
    assert.equal(response.status,502); assert.equal(fetches,0)
    row.status='DISABLED'
    assert.equal((await subs.serveSubscription(new Request('https://shop.test/s/secret'),'secret')).status,403)
  } finally {global.fetch=original}
})
test('upstream HTML success is rejected and redirects are disabled',async()=>{
  const original=global.fetch
  global.fetch=async(url,opts)=>{assert.equal(opts.redirect,'error');assert.ok(opts.signal);return new Response('<html>unavailable</html>')}
  try {assert.equal(await content.fetchProfile('https://panel.test/sub/abc','links'),'')} finally {global.fetch=original}
})
test('reseller custom traffic can exceed the base plan while contract caps and finite inputs remain enforced',async()=>{
  const reseller=load('src/modules/reseller/server/reseller.ts',{'bcryptjs':{},'@/platform/database/prisma':{db:{}},'@/platform/http/response':{},'@/modules/identity/server/access':{},'@/modules/subscriptions/server/happ-protocol':{},'@/modules/billing/server/billing':{},'@/modules/wallet/server/wallet':{},'@/modules/fulfillment/server/jobs':{}})
  const contract={id:1,maxAccounts:10,maxActiveAccounts:10,trafficQuotaGB:500,maxTrafficPerAccountGB:200,allowUnlimitedTraffic:true,maxDaysPerAccount:60,allowUnlimitedDays:false,maxDevicesPerAccount:3}
  const usage={accounts:1,activeAccounts:1,trafficGrantedGB:100,devicesGranted:1}
  const request={trafficGB:150.5,days:30,deviceLimit:2,planLimits:{trafficGB:50,days:30,deviceLimit:2}}
  assert.equal((await reseller.checkResellerLimits(contract,request,usage)).ok,true)
  for(const volume of [NaN,Infinity,-1,0,201]) assert.equal((await reseller.checkResellerLimits(contract,{...request,trafficGB:volume},usage)).ok,false)
  assert.equal((await reseller.checkResellerLimits(contract,{...request,days:0},usage)).ok,false)
  assert.equal((await reseller.checkResellerLimits(contract,{...request,deviceLimit:0},usage)).ok,false)
  assert.equal((await reseller.checkResellerLimits(contract,request,{...usage,trafficGrantedGB:400})).code,'TRAFFIC_QUOTA')
})
test('Telegram link tickets are consumed once and reject expired values',async()=>{
  const rows=new Map()
  const setting={create:async({data})=>rows.set(data.key,data),findUnique:async({where})=>rows.get(where.key),delete:async({where})=>rows.delete(where.key)}
  const tg=load('src/modules/notifications/server/telegram.ts',{'@/platform/database/prisma':{db:{setting,$transaction:fn=>fn({setting})}},'@/modules/site/server/site-url':{},'@/modules/subscriptions/server/happ-protocol':{}})
  const ticket=await tg.linkToken(42)
  assert.ok(ticket.length<64)
  assert.deepEqual(await tg.verifyLinkToken(ticket),{userId:42})
  assert.equal(await tg.verifyLinkToken(ticket),null)
  assert.equal(await tg.verifyLinkToken(await tg.linkToken(42,-10)),null)

  const webTicket=await tg.telegramWebLinkToken({id:12345,first_name:'Test',username:'tester'})
  assert.equal(webTicket.length,32)
  assert.deepEqual(await tg.verifyTelegramWebLinkToken(webTicket),{telegram:{id:12345,first_name:'Test',last_name:'',username:'tester',language_code:''}})
  assert.equal(await tg.verifyTelegramWebLinkToken(webTicket),null)
  assert.equal(await tg.verifyTelegramWebLinkToken(await tg.telegramWebLinkToken({id:12345},-10)),null)
})

test('Telegram placeholder detection only accepts auto-created local identities',()=>{
  const identity=load('src/modules/identity/telegram-account.ts',{
    'bcryptjs':{},
    '@/platform/database/prisma':{db:{}},
    '@/modules/notifications/server/telegram':{},
  })
  assert.equal(identity.isTelegramPlaceholderEmail('tg12345.0123456789abcdef@telegram.local','12345'),true)
  assert.equal(identity.isTelegramPlaceholderUser({email:'tg12345.0123456789abcdef@telegram.local',telegramId:'12345',role:'CUSTOMER',roleId:null}),true)
  assert.equal(identity.isTelegramPlaceholderEmail('tg999.0123456789abcdef@telegram.local','12345'),false)
  assert.equal(identity.isTelegramPlaceholderEmail('customer@example.com','12345'),false)
  assert.equal(identity.isTelegramPlaceholderUser({email:'tg12345.0123456789abcdef@telegram.local',telegramId:'12345',role:'ADMIN',roleId:null}),false)
})
test('Telegram placeholder merge keeps one canonical user and combines wallet ownership',async()=>{
  const users=new Map([
    [1,{id:1,email:'amir@example.com',name:'Amir',role:'CUSTOMER',roleId:null,status:'ACTIVE',telegramId:null,telegramLinkedAt:null,walletBalance:5}],
    [2,{id:2,email:'tg12345.0123456789abcdef@telegram.local',name:'Telegram Amir',role:'CUSTOMER',roleId:null,status:'ACTIVE',telegramId:'12345',telegramLinkedAt:new Date(),walletBalance:10}],
  ])
  const wallets=[{id:22,userId:2,currency:'USD',balanceMinor:1000n}]
  const moved=[]
  const user={
    findUnique:async({where})=> where.id ? users.get(where.id)||null : [...users.values()].find(u=>u.telegramId===where.telegramId)||null,
    update:async({where,data})=>{const row=users.get(where.id);if(!row)throw Error('missing user');Object.assign(row,data);return row},
    delete:async({where})=>{users.delete(where.id);return{}},
  }
  const walletAccount={
    findMany:async({where})=>wallets.filter(w=>w.userId===where.userId),
    create:async({data})=>{const row={id:100+wallets.length,...data};wallets.push(row);return row},
    update:async({where,data})=>{const row=wallets.find(w=>w.id===where.id);row.balanceMinor+=data.balanceMinor.increment;return row},
    deleteMany:async({where})=>{for(let i=wallets.length-1;i>=0;i--)if(wallets[i].userId===where.userId)wallets.splice(i,1);return{count:1}},
  }
  const table=name=>({updateMany:async({where,data})=>{moved.push([name,where,data]);return{count:1}}})
  const tx={user,walletAccount,reseller:{findUnique:async()=>null},order:table('order'),subscription:table('subscription'),ticket:table('ticket'),ticketMessage:table('ticketMessage'),crmNote:table('crmNote'),post:table('post'),invoice:table('invoice'),payment:table('payment'),walletTx:table('walletTx'),apiKey:table('apiKey'),auditLog:table('auditLog')}
  const identity=load('src/modules/identity/telegram-account.ts',{
    'bcryptjs':{},
    '@/platform/database/prisma':{db:{$transaction:fn=>fn(tx)}},
    '@/modules/notifications/server/telegram':{},
  })
  const result=await identity.attachTelegramToUser(1,{id:12345,first_name:'Amir',username:'amir_tg'})
  assert.deepEqual(result,{ok:true,userId:1,merged:true})
  assert.equal(users.has(2),false)
  assert.equal(users.get(1).telegramId,'12345')
  assert.equal(users.get(1).telegramUsername,'amir_tg')
  assert.equal(users.get(1).walletBalance,15)
  assert.equal(wallets.length,1)
  assert.equal(wallets[0].userId,1)
  assert.equal(wallets[0].balanceMinor,1500n)
  assert.equal(moved.length,11)
  for(const [,where,data] of moved){assert.ok(where.userId===2||where.actorUserId===2||where.authorId===2);assert.ok(data.userId===1||data.actorUserId===1||data.authorId===1)}
})

test('Telegram-linked referral registration accepts a new account but rejects previous buyers',async()=>{
  const referral={ownerId:8,code:'WELCOME123',rewardBps:500}
  for(const previousPurchase of [false,true]) {
    let attributed=0, updated=0
    const placeholder={id:12,email:'tg12345.0123456789abcdef@telegram.local',telegramId:'12345',role:'CUSTOMER',roleId:null,status:'ACTIVE',name:'Guest',telegramLinkedAt:new Date()}
    const tx={
      user:{findUnique:async({where})=>where.email?null:placeholder,update:async()=>{updated++;return placeholder}},
      invoice:{findFirst:async()=>previousPurchase?{id:90}:null},
      referralAttribution:{findUnique:async()=>null,upsert:async()=>{attributed++;return {}}},
    }
    const identity=load('src/modules/identity/telegram-account.ts',{'bcryptjs':{},'@/platform/database/prisma':{db:{$transaction:fn=>fn(tx)}},'@/modules/notifications/server/telegram':{}})
    const result=await identity.claimTelegramAccount({tg:{id:12345,first_name:'Guest'},email:'new@example.com',passwordHash:'hashed',referral})
    assert.equal(result.ok,!previousPurchase)
    assert.equal(updated,previousPurchase?0:1)
    assert.equal(attributed,previousPurchase?0:1)
  }
})

test('Happ uses the VPN panel subscription URL and never the shop domain',async()=>{
  const rows=new Map();let requests=0
  const sources={old:'https://panel.example/sub/old-secret',new:'https://panel.example/sub/new-secret',bad:'https://shop.example/s/bad'}
  const setting={findUnique:async({where})=>rows.get(where.key),upsert:async({create})=>rows.set(create.key,create)}
  const subscription={findUnique:async({where})=>sources[where.subToken]?{panelSubUrl:sources[where.subToken]}:null}
  const protocol=load('src/modules/subscriptions/server/happ-protocol.ts',{
    '@/platform/database/prisma':{db:{setting,subscription}},
    '@/modules/site/server/site-url':{siteBaseUrl:async()=> 'https://shop.example'},
    '@/modules/subscriptions/domain/subscription-content':content,
  })
  const oldFetch=global.fetch
  global.fetch=async(url,options)=>{
    assert.equal(url,'https://crypto.happ.su/api-v2.php');requests++
    const body=JSON.parse(options.body);assert.deepEqual(Object.keys(body),['url'])
    assert.ok(body.url.startsWith('https://panel.example/sub/'))
    assert.equal(body.url.includes('shop.example'),false)
    return Response.json({encrypted_link:'happ://crypt5/fixtureEncryptedLink'})
  }
  try {
    assert.equal(await protocol.safePanelSubscriptionUrl('old'),'https://panel.example/sub/old-secret')
    const links=await Promise.all([protocol.happImportUrl('old'),protocol.happImportUrl('old')]);assert.equal(links[0],links[1]);assert.equal(requests,1)
    await protocol.happImportUrl('old');assert.equal(requests,1)
    await protocol.happImportUrl('new');assert.equal(requests,2)
    assert.equal(await protocol.safePanelSubscriptionUrl('bad'),'')
    assert.equal(await protocol.safeHappLink('bad'),'');assert.equal(requests,2)
    await assert.rejects(()=>protocol.encryptHappUrl('http://panel.example/sub/test'));assert.equal(requests,2)
    global.fetch=async()=>Response.json({encrypted_link:'https://raw.example/sub/secret'})
    assert.equal(await protocol.safeHappLink('new'),'happ://crypt5/fixtureEncryptedLink')
    assert.equal(protocol.isEncryptedHappLink('happ://subscription/import/test'),false)
    assert.equal(protocol.isHappClient(new Headers({'user-agent':'Happ/3.0.0'})),true)
    assert.equal(protocol.isHappClient(new Headers({'x-happ-client':'MoboComCMS/1'})),false)
  } finally {global.fetch=oldFetch}
})
test('subscription mirrors never fetch loopback, private, credential-bearing or metadata hosts',()=>{
  const site='https://shop.test'
  for (const value of [
    'http://127.0.0.1/sub','http://127.0.0.1:8080/sub','http://localhost/sub','http://localhost.:8080/sub',
    'http://[::1]/sub','http://[::ffff:127.0.0.1]/sub','http://[0:0:0:0:0:0:0:1]/sub','http://[fe80::1]/sub','http://[fd00::1]/sub',
    'http://10.0.0.5/sub','http://172.16.9.9/sub','http://192.168.1.10/sub',
    'http://169.254.169.254/latest/meta-data','http://100.100.100.200/sub','http://0.0.0.0/sub',
    'http://panel.internal/sub','http://panel.lan/sub','http://user:pass@panel.example.com/sub',
  ]) assert.equal(content.upstreamUrl(value,site),null,value)
  assert.equal(content.upstreamUrl('https://panel.example.com/sub/abc',site),'https://panel.example.com/sub/abc')
})
test('shared limiter enforces its window budget and trusts only the proxy-appended address',()=>{
  const rl=load('src/platform/http/rate-limit.ts')
  assert.equal(rl.clientIp(new Headers({'x-forwarded-for':'9.9.9.9, 203.0.113.7'})),'203.0.113.7')
  assert.equal(rl.clientIp(new Headers({'x-real-ip':'203.0.113.9'})),'203.0.113.9')
  assert.equal(rl.clientIp(new Headers()),'local')
  const key='qa:'+crypto.randomUUID()
  for (let i=0;i<3;i+=1) assert.equal(rl.rateLimitHit(key,3,60000).ok,true)
  const blocked=rl.rateLimitHit(key,3,60000)
  assert.equal(blocked.ok,false);assert.ok(blocked.retryAfter>0)
  assert.equal(rl.rateLimitHit('qa:'+crypto.randomUUID(),1,60000).ok,true)
})
test('client idempotency keys stay unpredictable and never fall back to Math.random',()=>{
  const {newIdempotencyKey}=load('src/shared/security/idempotency.ts')
  const keys=new Set(Array.from({length:50},()=>newIdempotencyKey('web')))
  assert.equal(keys.size,50)
  for (const key of keys) assert.match(key,/^web-[0-9a-f-]{32,}$/)
  const callers=[
    'src/shared/security/idempotency.ts',
    'src/components/SubscriptionCard.tsx',
    'src/app/reseller/page.tsx',
    'src/app/dashboard/wallet/page.tsx',
    'src/app/miniapp/wallet/page.tsx',
    'src/modules/checkout/ui/client.ts',
  ]
  for (const file of callers) {
    const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8')
    assert.equal(source.includes('Math.random'),false,`${file} must not use Math.random`)
  }
})

test('customer-facing subscription surfaces expose only Happ crypt5 links',()=>{
  const files = [
    'src/modules/subscriptions/server/http/subscriptions/route.ts',
    'src/modules/public-api/server/http/v1/subscriptions/route.ts',
    'src/modules/notifications/server/telegram.ts',
    'src/modules/notifications/server/http/telegram/webhook/route.ts',
    'src/modules/reseller/server/reseller.ts',
    'src/modules/reseller/server/http/reseller/accounts/route.ts',
    'src/modules/reseller/server/http/reseller/route.ts',
    'src/lib/api.ts',
  ]
  for (const file of files) {
    const source = fs.readFileSync(path.join(__dirname,'..',file),'utf8')
    assert.equal(source.includes('safePanelSubscriptionUrl'),false,`${file} must not expose raw panel subscription URLs`)
    assert.equal(source.includes('safeHappLink'),true,`${file} must expose Happ crypt5 links`)
  }
  const details = fs.readFileSync(path.join(__dirname,'..','src/modules/subscriptions/server/http/sub/[token]/details/route.ts'),'utf8')
  assert.match(details,/endpoints:\s*happUrl\s*\?\s*\[primary\]\s*:\s*\[\]/)
  assert.match(details,/primary,\s*\n\s*happUrl/)
  assert.equal(details.includes('rawPrimary.url'),false)
  const ui = fs.readFileSync(path.join(__dirname,'..','src/components/ConnectPanel.tsx'),'utf8')
  assert.match(ui,/navigator\.clipboard\.writeText\(encryptedLink\)/)
  assert.equal(ui.includes('navigator.clipboard.writeText(panelLink)'),false)
})

test('Telegram bot purchase flow uses the shared checkout with idempotent callbacks',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','src/modules/notifications/server/http/telegram/webhook/route.ts'),'utf8')
  assert.match(source,/case '\/buy'/)
  assert.match(source,/callback_data: `plan:view:\$\{p\.id\}`/)
  assert.match(source,/callback_data: `buy:wallet:\$\{plan\.id\}`/)
  assert.match(source,/callback_data: `buy:gateway:\$\{plan\.id\}:\$\{token\}`/)
  assert.match(source,/await userForTelegram\(cq\.from as TelegramUser\)/)
  assert.match(source,/await executeCheckout\(\{/)
  assert.match(source,/idempotencyKey: checkoutIdempotencyKey\(/)
  assert.match(source,/createHash\('sha256'\)/)
  assert.match(source,/account\.email\?\.endsWith\('@telegram\.local'\) \? null : account\.email/)
  assert.match(source,/After confirmation, the subscription and Happ link will be sent here automatically/)
})

test('FrenzyEx signs callbacks over the exact raw body bytes',()=>{
  const frenzy=load('src/modules/billing/infrastructure/frenzyex.ts')
  const raw=Buffer.from('{"event":"payment.completed","status":"paid","price_amount":150000}')
  const secret='callback-secret'
  const sig=crypto.createHmac('sha256',secret).update(raw).digest('hex')
  assert.equal(frenzy.verifyFrenzySignature(raw,sig,secret),true)
  assert.equal(frenzy.verifyFrenzySignature(Buffer.from(raw.toString().replace('150000','150001')),sig,secret),false)
  assert.equal(frenzy.verifyFrenzySignature(raw,'00',secret),false)
})

test('FrenzyEx card checkout uses TMN, standard card-to-card and server bearer auth',async()=>{
  const frenzy=load('src/modules/billing/infrastructure/frenzyex.ts')
  const original=global.fetch
  let seen
  global.fetch=async(url,init)=>{
    seen={url:String(url),init,body:JSON.parse(String(init.body||'{}'))}
    return new Response(JSON.stringify({request_id:'frx_req_1',status:'pending',checkout_url:'https://frenzy.test/checkout/frx_req_1',bot_pay_url:'https://t.me/FrenzyExBot?start=paybot_frx_req_1',expires_at:'2026-09-22T12:00:00'}),{status:200,headers:{'content-type':'application/json'}})
  }
  try {
    const out=await frenzy.createFrenzyPayment('frx_live_secret',{amountToman:395500n,orderRef:'INV-1',description:'MoboComCMS plan'})
    assert.equal(out.ok,true)
    assert.match(seen.url,/\/api\/v1\/payment-requests$/)
    assert.equal(seen.init.headers.Authorization,'Bearer frx_live_secret')
    assert.equal(seen.body.amount,395500)
    assert.equal(seen.body.amount_ccy,'TMN')
    assert.equal(seen.body.payment_method,'standard')
    assert.equal(seen.body.order_ref,'INV-1')
    assert.equal(Object.hasOwn(seen.body,'callback_url'),false)
  } finally {global.fetch=original}
})

test('Currency / Rial gateway converts USD with the configured Toman rate and prefers bot-native payment in Telegram',async()=>{
  let requested=null
  const gateways=load('src/modules/billing/server/gateways.ts',{
    '@/platform/database/prisma':{db:{}},
    '@/modules/settings/server':{getSettings:async()=>({usdRateToman:'158200'})},
    '@/modules/billing/infrastructure/plisio':{createInvoice:async()=>({ok:false}),plisioCurrencies:async()=>({ok:true})},
    '@/modules/billing/infrastructure/frenzyex':{
      createFrenzyPayment:async(apiKey,input)=>{requested={apiKey,input};return {ok:true,requestId:'req123',checkoutUrl:'https://checkout.test/req123',botPayUrl:'https://t.me/FrenzyExBot?start=paybot_req123',expiresAt:'2026-09-22T12:00:00'}},
      testFrenzyCredentials:async()=>({ok:true}),
    },
  })
  const gateway={id:7,name:'anything',provider:'FRENZYEX',apiKey:'frx_live_x',secretKey:'secret',fiat:'TMN',currencies:'',feePercent:0,feeBps:0,minAmount:0,minAmountMinor:0n,instructions:''}
  const out=await gateways.createGatewayInvoice(gateway,{orderNumber:'INV-2',amount:2.5,currency:'USD',orderName:'MoboComCMS',callbackUrl:'https://shop.test/api/payment/frenzyex/webhook',successUrl:'https://shop.test/success',failUrl:'https://shop.test/fail',channel:'telegram'})
  assert.equal(out.ok,true)
  assert.equal(requested.input.amountToman,395500n)
  assert.equal(out.providerCurrency,'TMN')
  assert.equal(out.providerAmount,395500)
  assert.match(out.paymentUrl,/FrenzyExBot/)
  assert.equal(gateways.customerGatewayLabel(gateway,'fa'),'درگاه پرداخت ارزی ریالی')
})

test('Currency / Rial gateway falls back to the env rate when the seeded DB rate is zero',async()=>{
  const previous=process.env.FRENZYEX_USD_RATE_TOMAN
  process.env.FRENZYEX_USD_RATE_TOMAN='230000'
  let requested=null
  try {
    const gateways=load('src/modules/billing/server/gateways.ts',{
      '@/platform/database/prisma':{db:{}},
      '@/modules/settings/server':{getSettings:async()=>({usdRateToman:'0'})},
      '@/modules/billing/infrastructure/plisio':{createInvoice:async()=>({ok:false}),plisioCurrencies:async()=>({ok:true})},
      '@/modules/billing/infrastructure/frenzyex':{
        createFrenzyPayment:async(apiKey,input)=>{requested={apiKey,input};return {ok:true,requestId:'req-env-rate',checkoutUrl:'https://checkout.test/req-env-rate'}},
        testFrenzyCredentials:async()=>({ok:true}),
      },
    })
    const gateway={id:7,name:'درگاه پرداخت ارزی ریالی',provider:'FRENZYEX',apiKey:'frx_live_x',secretKey:'secret',fiat:'TMN',currencies:'',feePercent:0,feeBps:0,minAmount:0,minAmountMinor:0n,instructions:''}
    const out=await gateways.createGatewayInvoice(gateway,{orderNumber:'INV-RATE',amount:2.5,currency:'USD',orderName:'MoboComCMS',callbackUrl:'https://shop.test/api/payment/frenzyex/webhook',successUrl:'https://shop.test/success',failUrl:'https://shop.test/fail',channel:'web'})
    assert.equal(out.ok,true)
    assert.equal(requested.input.amountToman,575000n)
  } finally {
    if(previous===undefined) delete process.env.FRENZYEX_USD_RATE_TOMAN
    else process.env.FRENZYEX_USD_RATE_TOMAN=previous
  }
})

test('checkout gateway registry exposes multiple active gateways and honors an explicit choice',async()=>{
  const rows=[
    {id:1,name:'Crypto',provider:'PLISIO',apiKey:'pl-key',secretKey:'pl-secret',fiat:'USD',currencies:'BTC,USDT',feePercent:0,feeBps:0,minAmount:0,minAmountMinor:0n,instructions:'',active:true,isDefault:true,sortOrder:0},
    {id:2,name:'Rial',provider:'FRENZYEX',apiKey:'frx-key',secretKey:'frx-secret',fiat:'TMN',currencies:'',feePercent:0,feeBps:0,minAmount:0,minAmountMinor:0n,instructions:'',active:true,isDefault:false,sortOrder:1},
  ]
  const gateways=load('src/modules/billing/server/gateways.ts',{
    '@/platform/database/prisma':{db:{gateway:{findMany:async()=>rows}}},
    '@/modules/settings/server':{getSettings:async()=>({usdRateToman:'158200'})},
    '@/modules/billing/infrastructure/plisio':{createInvoice:async()=>({ok:false}),plisioCurrencies:async()=>({ok:true})},
    '@/modules/billing/infrastructure/frenzyex':{createFrenzyPayment:async()=>({ok:false}),testFrenzyCredentials:async()=>({ok:true})},
  })
  const options=await gateways.checkoutGatewayOptions('USD')
  assert.equal(options.length,2)
  assert.deepEqual(options.map(x=>x.ref),['db:1','db:2'])
  assert.equal(options[0].isDefault,true)
  assert.equal((await gateways.resolveCheckoutGateway('db:2','USD')).id,2)
  assert.equal(await gateways.resolveCheckoutGateway('db:999','USD'),null)
})

test('multi-gateway checkout selection is wired through web, wallet and provider callbacks',()=>{
  const checkoutRoute=fs.readFileSync(path.join(__dirname,'..','src/modules/checkout/server/http/checkout/route.ts'),'utf8')
  const checkout=fs.readFileSync(path.join(__dirname,'..','src/modules/checkout/server/checkout.ts'),'utf8')
  const wallet=fs.readFileSync(path.join(__dirname,'..','src/modules/wallet/server/topup.ts'),'utf8')
  const planUi=fs.readFileSync(path.join(__dirname,'..','src/components/PlanCheckout.tsx'),'utf8')
  const plisioWebhook=fs.readFileSync(path.join(__dirname,'..','src/modules/billing/server/http/payment/plisio/webhook/route.ts'),'utf8')
  assert.match(checkoutRoute,/gatewayRef:/)
  assert.match(checkout,/resolveCheckoutGateway\(command\.gatewayRef, currency\)/)
  assert.match(wallet,/resolveCheckoutGateway\(input\.gatewayRef, requestedCurrency\)/)
  assert.match(planUi,/gatewayRef: gatewayRef \|\| undefined/)
  assert.match(plisioWebhook,/invoiceGatewaySecret/)
  assert.match(plisioWebhook,/invoice\?\.gateway\?\.provider === 'PLISIO'/)
})

test('FrenzyEx webhook requires raw-body HMAC and delegates exact paid settlement to the shared reconciler',()=>{
  const webhook=fs.readFileSync(path.join(__dirname,'..','src/modules/billing/server/http/payment/frenzyex/webhook/route.ts'),'utf8')
  const reconcile=fs.readFileSync(path.join(__dirname,'..','src/modules/billing/server/frenzyex-reconciliation.ts'),'utf8')
  assert.match(webhook,/await req\.arrayBuffer\(\)/)
  assert.match(webhook,/verifyFrenzySignature\(raw, signature/)
  assert.match(webhook,/event !== 'payment\.completed'/)
  assert.match(webhook,/payload\.status[^\n]*paid/)
  assert.match(webhook,/invoice\.number !== orderRef/)
  assert.match(webhook,/provider: 'FRENZYEX', eventKey: requestId/)
  assert.match(webhook,/settleFrenzyInvoice\(/)
  assert.match(reconcile,/provider amount mismatch/)
  assert.match(reconcile,/provider currency mismatch/)
  assert.match(reconcile,/order_ref mismatch/)
  assert.match(reconcile,/status\?: 'PENDING' \| 'PROCESSED' \| 'FAILED'/)
})

test('FrenzyEx ambiguous create keeps the expected Toman amount for safe callback recovery',async()=>{
  const gateways=load('src/modules/billing/server/gateways.ts',{
    '@/platform/database/prisma':{db:{}},
    '@/modules/settings/server':{getSettings:async()=>({usdRateToman:'158200'})},
    '@/modules/billing/infrastructure/plisio':{createInvoice:async()=>({ok:false}),plisioCurrencies:async()=>({ok:true})},
    '@/modules/billing/infrastructure/frenzyex':{
      createFrenzyPayment:async()=>({ok:false,ambiguous:true,message:'request timed out'}),
      testFrenzyCredentials:async()=>({ok:true}),
    },
  })
  const gateway={id:7,name:'درگاه پرداخت ارزی ریالی',provider:'FRENZYEX',apiKey:'frx_live_x',secretKey:'secret',fiat:'TMN',currencies:'',feePercent:0,feeBps:0,minAmount:0,minAmountMinor:0n,instructions:''}
  const out=await gateways.createGatewayInvoice(gateway,{orderNumber:'INV-3',amount:2.5,currency:'USD',orderName:'MoboComCMS',callbackUrl:'https://shop.test/api/payment/frenzyex/webhook',successUrl:'https://shop.test/success',failUrl:'https://shop.test/fail',channel:'web'})
  assert.equal(out.ok,false)
  assert.equal(out.ambiguous,true)
  assert.equal(out.providerAmount,395500)
  assert.equal(out.providerCurrency,'TMN')

  const checkout=fs.readFileSync(path.join(__dirname,'..','src/modules/checkout/server/checkout.ts'),'utf8')
  assert.match(checkout,/frenzyex:create:invoice:\$\{invoice\.id\}/)
  const reconcile=fs.readFileSync(path.join(__dirname,'..','src/modules/billing/server/frenzyex-reconciliation.ts'),'utf8')
  assert.match(reconcile,/OR: \[\{ providerTxnId: requestId \}, \{ providerTxnId: '' \}\]/)
  assert.match(reconcile,/payment request already bound to another request_id/)
  assert.match(reconcile,/POST create[\s\S]*never retried here/)
})

test('FrenzyEx recovery uses authenticated GET and controlled cancel without recreating a checkout',async()=>{
  const frenzy=load('src/modules/billing/infrastructure/frenzyex.ts')
  const original=global.fetch
  const calls=[]
  global.fetch=async(url,init)=>{
    calls.push({url:String(url),method:init.method,auth:init.headers.Authorization})
    if(init.method==='POST') return Response.json({request_id:'req-recover',status:'canceled',order_ref:'HV-1',amount:150000,amount_ccy:'TMN'})
    return Response.json({request_id:'req-recover',status:'pending',order_ref:'HV-1',amount:150000,amount_ccy:'TMN',expires_at:'2026-09-22T12:00:00'})
  }
  try {
    const status=await frenzy.getFrenzyPayment('frx_live_key','req-recover')
    assert.equal(status.ok,true);assert.equal(status.snapshot.status,'pending')
    const canceled=await frenzy.cancelFrenzyPayment('frx_live_key','req-recover')
    assert.equal(canceled.ok,true);assert.equal(canceled.snapshot.status,'canceled')
    assert.equal(calls[0].method,'GET')
    assert.match(calls[0].url,/\/api\/v1\/payment-requests\/req-recover$/)
    assert.equal(calls[1].method,'POST')
    assert.match(calls[1].url,/\/api\/v1\/payment-requests\/req-recover\/cancel$/)
    for(const call of calls) assert.equal(call.auth,'Bearer frx_live_key')
  } finally {global.fetch=original}
})

test('internal worker reconciles FrenzyEx before fulfillment and reservation cleanup',()=>{
  const worker=fs.readFileSync(path.join(__dirname,'..','src/app/api/internal/fulfillment/run/route.ts'),'utf8')
  const reconcile=fs.readFileSync(path.join(__dirname,'..','src/modules/billing/server/frenzyex-reconciliation.ts'),'utf8')
  const paymentPos=worker.indexOf('await processFrenzyReconciliationBatch(limit)')
  const fulfillmentPos=worker.indexOf('await processFulfillmentBatch(limit)')
  const releasePos=worker.indexOf('await releaseExpiredReservations')
  assert.ok(paymentPos>0 && fulfillmentPos>paymentPos && releasePos>fulfillmentPos)
  assert.match(reconcile,/getFrenzyPayment\(apiKey, requestId\)/)
  assert.match(reconcile,/snapshot\.status === 'paid'/)
  assert.match(reconcile,/snapshot\.status === 'expired' \|\| snapshot\.status === 'canceled'/)
  assert.match(reconcile,/cancelFrenzyPayment\(apiKey, requestId\)/)
  assert.match(reconcile,/ambiguous create without request_id remains flagged/)
  assert.match(reconcile,/operational evidence, not another money receipt/)
})


test('pending wallet top-up settlement is atomically claimed before balance mutation',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','src/modules/wallet/server/wallet.ts'),'utf8')
  assert.match(source,/where: \{ id: input\.txId, status: 'PENDING' \}/)
  assert.match(source,/data: \{ status: 'PROCESSING' \}/)
  assert.match(source,/claimed\.count !== 1/)
})

test('VPN panel credentials are encrypted at rest and plaintext rows stay upgrade-compatible',()=>{
  const oldKey=process.env.PANEL_CREDENTIAL_KEY
  const oldNodeEnv=process.env.NODE_ENV
  process.env.PANEL_CREDENTIAL_KEY='11'.repeat(32)
  process.env.NODE_ENV='production'
  try {
    const credentials=load('src/modules/providers/server/panel-credentials.ts')
    const encrypted=credentials.encryptPanelCredential('super-secret-token')
    assert.match(encrypted,/^encv1:/)
    assert.equal(encrypted.includes('super-secret-token'),false)
    assert.equal(credentials.decryptPanelCredential(encrypted),'super-secret-token')
    assert.equal(credentials.decryptPanelCredential('historical-plaintext'),'historical-plaintext')
    assert.equal(credentials.maskPanelCredential(encrypted),'••••oken')
    const tampered=encrypted.slice(0,-1)+(encrypted.endsWith('A')?'B':'A')
    assert.throws(()=>credentials.decryptPanelCredential(tampered))
  } finally {
    if (oldKey === undefined) delete process.env.PANEL_CREDENTIAL_KEY; else process.env.PANEL_CREDENTIAL_KEY=oldKey
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV=oldNodeEnv
  }
})

test('fresh deployments keep the legacy shop-domain Happ profile proxy disabled',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','src/app/api/happ/sub/[token]/route.ts'),'utf8')
  assert.match(source,/ALLOW_LEGACY_HAPP_PROXY !== 'true'/)
  const prodEnv=fs.readFileSync(path.join(__dirname,'..','.env.production.example'),'utf8')
  assert.match(prodEnv,/ALLOW_LEGACY_HAPP_PROXY=false/)
})

test('reseller bot public settings never expose credentials and webhook secrets are compared safely',()=>{
  const module=load('src/modules/reseller/server/reseller-bot.ts',{
    '@/platform/database/prisma':{db:{}},
    '@/modules/notifications/server/telegram':{bot:async()=>({ok:true}),telegramConfig:async()=>({token:''})},
    '@/modules/providers/server/panel-credentials':{decryptPanelCredential:value=>value,encryptPanelCredential:value=>value},
    '@/modules/site/server/site-url':{siteBaseUrl:async()=> 'https://example.com'},
  })
  const publicSettings=module.botPublic({id:7,botId:'123',username:'shopbot',ownerTelegramId:'456',brandName:'Agency',publicUrl:'',cardNumber:'1234567890123456',cardHolder:'Owner',active:true,lastError:'',installedAt:null,tokenCipher:'VERY_SECRET',webhookSecret:'ALSO_SECRET'})
  assert.equal(publicSettings.link,'https://t.me/shopbot')
  assert.equal(JSON.stringify(publicSettings).includes('VERY_SECRET'),false)
  assert.equal(JSON.stringify(publicSettings).includes('ALSO_SECRET'),false)
  assert.equal(module.secretMatches('secret','secret'),true)
  assert.equal(module.secretMatches('secret','wrong'),false)
  assert.equal(module.secretMatches('secret',null),false)
})

test('reseller bot cannot charge a sale without a receipt or without owner approval',async()=>{
  let charges=0, lookups=0
  const row={id:3,resellerId:8,ownerTelegramId:'999',brandName:'Agency',active:true}
  const db={
    reseller:{findUnique:async()=>({active:true})},
    resellerSale:{findFirst:async()=>{lookups++;return {id:11,botId:3,resellerId:8,status:'REVIEW',receiptFileId:''}}},
  }
  const module=load('src/modules/reseller/server/reseller-bot-sales.ts',{
    '@/platform/database/prisma':{db},
    '@/modules/notifications/server/telegram':{bot:async()=>({ok:true})},
    '@/modules/reseller/server/reseller-bot':{resellerBotConfig:()=>({token:'test',apiBase:'https://api.telegram.org'})},
    '@/modules/offers/server/offers':{resellerOwnerKey:id=>`RESELLER:${id}`},
    '@/modules/reseller/server/reseller':{createResellerAccount:async()=>{charges++;throw Error('must not charge')},resellerWholesaleMinor:()=>0n},
    '@/modules/subscriptions/server/happ-protocol':{safeHappLink:async()=>''},
    '@/shared/money':{legacyNumber:()=>1},
  })
  assert.match(await module.reviewResellerSale(row,11,true),/receipt review/)
  await module.handleResellerUpdate(row,{update_id:44,callback_query:{id:'callback',from:{id:111},data:'approve:11',message:{chat:{id:111,type:'private'}}}})
  assert.equal(charges,0)
  assert.equal(lookups,1)
})

test('discounts use exact minor units and enforce scope, time and capacity',()=>{
  const { promotionDiscount }=load('src/modules/promotions/server/promotions.ts',{'@/platform/database/prisma':{db:{}}})
  const base={active:true,kind:'PERCENT',percentBps:2500,amountMinor:0n,currency:'USD',planId:7,minSubtotalMinor:5000n,maxUses:5,reservedCount:2,startsAt:null,endsAt:null}
  assert.deepEqual(promotionDiscount(base,{planId:7,amountMinor:10101n,currency:'USD'}),{ok:true,discountMinor:2525n})
  assert.equal(promotionDiscount({...base,reservedCount:5},{planId:7,amountMinor:10101n,currency:'USD'}).code,'PROMOTION_EXHAUSTED')
  assert.equal(promotionDiscount(base,{planId:8,amountMinor:10101n,currency:'USD'}).code,'PROMOTION_SCOPE')
  assert.equal(promotionDiscount({...base,startsAt:new Date('2030-01-01')},{planId:7,amountMinor:10101n,currency:'USD'},new Date('2029-01-01')).code,'PROMOTION_INACTIVE')
})

test('terminal unpaid orders release reserved discount capacity exactly once',async()=>{
  let capacity=2, state='RESERVED'
  const db={
    promotionRedemption:{
      findMany:async args=>{assert.deepEqual(args.where.order.status.in,['FAILED','CANCELLED','EXPIRED']);return [{orderId:12}]},
      findUnique:async()=>({id:5,promotionId:3,orderId:12}),
      updateMany:async()=>{if(state!=='RESERVED') return {count:0};state='RELEASED';return {count:1}},
    },
    promotion:{update:async()=>{capacity--;return {}}},
    $transaction:async callback=>callback(db),
  }
  const {releaseTerminalPromotionReservations}=load('src/modules/promotions/server/promotions.ts',{'@/platform/database/prisma':{db}})
  assert.equal(await releaseTerminalPromotionReservations(),1)
  assert.equal(capacity,1)
  assert.equal(await releaseTerminalPromotionReservations(),0)
  assert.equal(capacity,1)
})

test('trial defaults to one day and one GB and rejects unsafe limits',async()=>{
  const module=load('src/modules/trials/server/trials.ts',{
    '@/platform/database/prisma':{db:{setting:{findMany:async()=>[]}}},
    '@/modules/fulfillment/server/jobs':{},
  })
  assert.deepEqual(await module.trialPolicy(),{enabled:false,planId:0,days:1,trafficGB:1,deviceLimit:1})
  assert.equal(module.validTrialPolicy({days:1,trafficGB:1,deviceLimit:1}),true)
  assert.equal(module.validTrialPolicy({days:0,trafficGB:1,deviceLimit:1}),false)
  assert.equal(module.validTrialPolicy({days:1,trafficGB:0,deviceLimit:1}),false)
})

test('paid wallet recovery credits only unsettled top-ups',async()=>{
  const calls=[]
  const db={
    invoice:{findMany:async()=>[
      {id:1,number:'A',userId:9,total:5,totalMinor:500n,currency:'USD'},
      {id:2,number:'B',userId:9,total:10,totalMinor:1000n,currency:'USD'},
    ]},
    walletTx:{findMany:async()=>[
      {id:11,invoiceId:1,status:'DONE'},
      {id:22,invoiceId:2,status:'PENDING'},
    ]},
  }
  const jobs=load('src/modules/fulfillment/server/jobs.ts',{
    '@/platform/database/prisma':{db},
    '@/modules/catalog/server/inventory':{},
    '@/modules/subscriptions/server/provision':{},
    '@/modules/providers/server/panels':{},
    '@/modules/notifications/server/telegram':{},
    '@/extensions/server/runtime':{},
    '@/extensions/generated/server-registry':{serverPlugins:{}},
    '@/extensions/server/state':{},
    '@/extensions/sdk/server':{},
    '@/platform/observability/logger':{logEvent:()=>{}},
    '@/modules/subscriptions/server/renewal':{},
    '@/modules/notifications/server/inbox':{},
    '@/modules/wallet/server/wallet':{moveWallet:async input=>{calls.push(input);return {ok:true}}},
  })
  const result=await jobs.recoverPaidWalletTopups()
  assert.equal(result.credited,1)
  assert.equal(calls.length,1)
  assert.equal(calls[0].txId,22)
  assert.equal(calls[0].amount,10)
})

test('notification read actions are scoped to the signed-in owner',async()=>{
  const {NextRequest}=require('next/server')
  const updates=[]
  const db={userNotification:{updateMany:async query=>{updates.push(query);return {count:1}}}}
  const route=load('src/modules/notifications/server/http/inbox/route.ts',{
    '@/platform/database/prisma':{db},
    '@/modules/identity/server/access':{requireUser:async()=>({id:7})},
  })
  const req=new NextRequest('http://localhost/api/inbox',{method:'PATCH',body:JSON.stringify({id:42})})
  assert.equal((await route.PATCH(req)).status,200)
  assert.deepEqual(updates[0].where,{id:42,userId:7,readAt:null})
})

test('paid orders missing delivery jobs are enqueued once, but delivered orders are skipped',async()=>{
  const queued=[]
  const db={
    invoice:{findMany:async()=>[
      {id:1,orderId:10,planId:3,productId:null},
      {id:2,orderId:20,planId:3,productId:null},
    ]},
    fulfillmentJob:{findMany:async()=>[],upsert:async input=>{queued.push(input.create);return {id:99}}},
    subscription:{findMany:async()=>[{orderId:20}]},
    order:{findUnique:async()=>({meta:'{}'})},
  }
  const jobs=load('src/modules/fulfillment/server/jobs.ts',{
    '@/platform/database/prisma':{db},
    '@/modules/catalog/server/inventory':{},
    '@/modules/subscriptions/server/provision':{},
    '@/modules/providers/server/panels':{},
    '@/modules/notifications/server/telegram':{},
    '@/extensions/server/runtime':{},
    '@/extensions/generated/server-registry':{serverPlugins:{}},
    '@/extensions/server/state':{},
    '@/extensions/sdk/server':{},
    '@/platform/observability/logger':{logEvent:()=>{}},
    '@/modules/subscriptions/server/renewal':{},
    '@/modules/notifications/server/inbox':{},
    '@/modules/wallet/server/wallet':{},
  })
  const result=await jobs.recoverMissingPaidFulfillment()
  assert.equal(result.enqueued,1)
  assert.equal(queued[0].orderId,10)
  assert.equal(queued[0].dedupeKey,'PROVISION_SUBSCRIPTION:order:10')
})

test('device timezone chooses the first-visit language without overriding manual preference',()=>{
  const {deviceLocaleBootstrap}=load('src/i18n/device-locale.ts')
  function run(zone,initialCookie='',htmlLang='en') {
    const jar=new Map(initialCookie.split('; ').filter(Boolean).map(part=>part.split('=')))
    const reloads=[]
    const document={
      documentElement:{lang:htmlLang},
      get cookie(){return [...jar].map(([key,value])=>`${key}=${value}`).join('; ')},
      set cookie(value){const [key,entry]=value.split(';')[0].split('=');jar.set(key,entry)},
    }
    const location={href:'https://example.com/',replace:url=>reloads.push(url)}
    vm.runInNewContext(deviceLocaleBootstrap,{document,location,Intl:{DateTimeFormat:()=>({resolvedOptions:()=>({timeZone:zone})})}})
    return {jar,reloads}
  }
  const iran=run('Asia/Tehran')
  assert.equal(iran.jar.get('lang'),'fa')
  assert.equal(iran.jar.get('lang_source'),'auto')
  assert.equal(iran.reloads.length,1)
  const global=run('Europe/London','lang=fa','fa')
  assert.equal(global.jar.get('lang'),'en')
  assert.equal(global.reloads.length,1)
  const manual=run('Europe/London','lang=fa; lang_source=manual','fa')
  assert.equal(manual.jar.get('lang'),'fa')
  assert.equal(manual.reloads.length,0)
  const moved=run('Europe/London','lang=fa; lang_source=auto','fa')
  assert.equal(moved.jar.get('lang'),'en')
  assert.equal(moved.reloads.length,1)
})
