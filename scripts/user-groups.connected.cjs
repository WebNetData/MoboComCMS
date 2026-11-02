// Real PostgreSQL group membership, current Identity guards, prices and atomic audience writes.
// Request session, module availability, carrier-off configuration and leaf presentation are declared boundaries; no provider is invoked.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto')
const ts = require('typescript-api'), { PrismaClient } = require('@prisma/client'), { encode } = require('next-auth/jwt'), { NextRequest } = require('next/server')
const db = new PrismaClient(), prefix = `user-groups-${Date.now()}`, users = [], groups = [], roles = [], items = [], popups = [], cache = new Map()
const secret = crypto.randomBytes(32).toString('hex'); process.env.NEXTAUTH_SECRET = secret; process.env.NEXTAUTH_URL = 'http://localhost:3000'
let viewerId = 0, failAudit = false, beforeSetting, preparedSetting
const wrapped = new Proxy(db, { get(target, key) {
  if (key === '$transaction') return fn => target.$transaction(async tx => fn(new Proxy(tx, { get(inner, field) {
    if (field === 'auditLog' && failAudit) return { create: async () => { throw Error('OWNED_AUDIT_FAILURE') } }
    return typeof inner[field] === 'function' ? inner[field].bind(inner) : inner[field]
  } })))
  return typeof target[key] === 'function' ? target[key].bind(target) : target[key]
} })
function load(file) {
  if (cache.has(file)) return cache.get(file).exports
  let source = fs.readFileSync(file, 'utf8')
  if (file.endsWith('/user-groups.ts') && file.includes('/domain/') && process.env.GROUPS_FAULT === 'expired') source = source.replace("{ expiresAt: { gt: now } }", "{ expiresAt: { not: null } }")
  if (file.endsWith('/checkout/server/checkout.ts') && process.env.GROUPS_FAULT === 'price') source = source.replace('await groupDeal(command.userId, [product.id])', 'undefined')
  const mod = { exports: {} }; cache.set(file, mod)
  const req = name => {
    if (name === '@/platform/database/prisma') return { db: wrapped }
    if (name === 'next-auth') return { getServerSession: async () => viewerId ? { user: { id: String(viewerId) } } : null }
    if (name === '@/modules/identity/auth') return { authOptions: {} }
    if (name === '@/i18n/server') return { getServerTheme: async () => 'dark' }
    if (name === '@/components/SiteHeader' || name === '@/components/SiteFooter') return { __esModule: true, default: 'SiteChrome' }
    if (name === '@/components/store/ProductCheckout') return { __esModule: true, default: 'ProductCheckout' }
    if (name === '@/modules/shipping/server/carriers') return { getCarrierSettings: async () => ({ enabled: false }) }
    if (name === '@/extensions/server/runtime') return { emitExtensionEvent: async () => {} }
    if (name === '@/modules/notifications/server/inbox') return { createInboxEvent: async () => null, invoicePaidEvent: async () => {} }
    if (name === '@/modules/sms/server/sms') return { notifyAdmins: async () => {} }
    if (name === '@/modules/automation/server/engine') return { emitAutomation: async () => {} }
    if (name === '@/modules/referrals/server/referrals') return { awardReferralForInvoice: async () => {} }
    if (name === '@/extensions/server/modules') return { isModuleEnabled: async () => true, moduleGuard: async () => null, getModuleStates: async () => Object.fromEntries(['journal','music','cinema','games','software','store','prompt-master','membership','forum','popups'].map(id => [id,true])) }
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? 'src/' + name.slice(2) : path.posix.join(path.posix.dirname(file), name)
      for (const candidate of [base, base + '.ts', base + '/index.ts']) if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate.endsWith('.json') ? JSON.parse(fs.readFileSync(candidate, 'utf8')) : load(candidate)
    }
    return require(name)
  }
  new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText)(req,mod,mod.exports)
  return mod.exports
}
const request = async user => new NextRequest('http://localhost:3000/api/admin/item-audience', { headers: { Origin: 'http://localhost:3000', cookie: `next-auth.session-token=${await encode({ secret, token: { uid: String(user.id), sub: String(user.id), authAt: Date.now() } })}` } })
async function main() {
  const benefit = load('src/modules/account/server/user-groups.ts'), audience = load('src/modules/account/server/item-audience.ts'), command = load('src/modules/account/server/audience-command.ts'), writes = load('src/modules/account/server/group-command.ts'), sections = load('src/modules/account/server/section-access.ts'), siteGroups = load('src/modules/account/server/site-groups.ts')
  for (const kind of ['member','outsider','full','catalogue','magazine','empty']) {
    let roleId = null
    if (['catalogue','magazine','empty'].includes(kind)) { const r = await db.role.create({ data: { name: prefix + kind, permissions: kind === 'catalogue' ? 'cms.products' : kind === 'magazine' ? 'cms.posts' : '' } }); roles.push(r.id); roleId = r.id }
    const u = await db.user.create({ data: { email: `${prefix}-${kind}@example.invalid`, passwordHash: 'test-only', role: ['full','catalogue','magazine','empty'].includes(kind) ? 'ADMIN' : 'CUSTOMER', roleId, totpEnabledAt: new Date() } }); users.push(u)
  }
  const [member, outsider, full, catalogue, magazine] = users, fullReq = await request(full)
  for (const name of ['active','expired','inactive','second']) groups.push(await db.userGroup.create({ data: { name: prefix + name, active: name !== 'inactive', vipBenefits: true, hideAds: true, discountPercent: 20 } }))
  for (const [index, group] of groups.entries()) await db.userGroupMember.create({ data: { userId: member.id, groupId: group.id, expiresAt: index === 1 ? new Date(Date.now()-10000) : index === 3 ? new Date(Date.now()-1) : null } })
  assert.deepEqual(await siteGroups.siteGroupsOf(member.id, groups.map(g => `group:${g.id}`)), [`group:${groups[0].id}`], 'expired and inactive memberships give no audience')
  assert.equal(await benefit.groupGivesVip(member.id), true); assert.equal(await benefit.groupHidesAds(outsider.id), false)
  const popupOwner = load('src/modules/popups/server/popups.ts')
  const popup = await popupOwner.savePopup({title:prefix,status:'ACTIVE',audience:'GROUPS',groupIds:[`group:${groups[0].id}`]},full.id);popups.push(popup.id)
  const popupUser = u => ({id:u.id,email:u.email,role:u.role,roleId:u.roleId,permissions:null})
  assert.equal((await popupOwner.popupsFor(popupUser(member))).some(row=>row.id===popup.id),true,'custom group receives selected popup')
  assert.equal((await popupOwner.popupsFor(popupUser(outsider))).some(row=>row.id===popup.id),false)
  assert.equal((await popupOwner.popupsFor(null)).some(row=>row.id===popup.id),false)
  const managers = await popupOwner.savePopup({title:prefix+' managers',status:'ACTIVE',audience:'ALL_MANAGERS'},full.id);popups.push(managers.id)
  const emptyRole = await load('src/modules/identity/server/access.ts').requireUser(await request(users[5]))
  assert.equal((await popupOwner.popupsFor(emptyRole)).some(row=>row.id===managers.id),false,'an empty staff role is not full access')
  await db.userGroupMember.updateMany({where:{userId:member.id,groupId:groups[0].id},data:{expiresAt:new Date(Date.now()-1000)}})
  assert.equal((await popupOwner.popupsFor(popupUser(member))).some(row=>row.id===popup.id),false,'popup audience rechecks expiry')
  await db.userGroupMember.updateMany({where:{userId:member.id,groupId:groups[0].id},data:{expiresAt:null}})
  const p = await db.product.create({ data: { slug: prefix, name: prefix, price: 100, priceMinor: 10000n, currency: 'USD', stock: 10, approval: 'APPROVED' } }); items.push(['product',p.id])
  await db.productGroupPrice.create({ data: { groupId: groups[0].id, productId: p.id, priceMinor: 7000n } })
  const deal = await benefit.groupDeal(member.id,[p.id]), pricing = load('src/modules/store/server/pricing.ts')
  assert.equal(pricing.unitPrice({ ...p, memberPriceMinor: 8000n },null,true,new Date(),deal).unitMinor,7000n)
  assert.equal((await benefit.groupDeal(outsider.id,[p.id])).percent,0)
  const allowed = [`group:${groups[0].id}`], own = await command.audienceSnapshot('product',p.id)
  await assert.rejects(command.saveItemAudience(fullReq,'product',p.id,{groups:allowed,prices:{[groups[0].id]:'-5'}}))
  assert.equal((await db.product.findUniqueOrThrow({where:{id:p.id}})).audienceGroups,'','invalid price cannot partly restrict/open an item')
  failAudit = true
  try { await assert.rejects(command.saveItemAudience(fullReq,'product',p.id,{groups:allowed,prices:{[groups[0].id]:'60'}}),/OWNED_AUDIT_FAILURE/) } finally { failAudit = false }
  assert.equal((await db.product.findUniqueOrThrow({where:{id:p.id}})).audienceGroups,'')
  assert.equal((await db.productGroupPrice.findFirstOrThrow({where:{productId:p.id}})).priceMinor,7000n)
  const saved = await command.saveItemAudience(await request(catalogue),'product',p.id,{groups:allowed,revision:own.revision,prices:{[groups[0].id]:'60'}})
  assert.equal((await benefit.groupDeal(member.id,[p.id])).prices.get(`${p.id}:0`),6000n)
  await assert.rejects(command.saveItemAudience(fullReq,'product',p.id,{groups:[],revision:own.revision}),e=>e.status===409)
  await assert.rejects(command.saveItemAudience(await request(magazine),'product',p.id,{groups:[]}),e=>e.status===403)
  await assert.rejects(writes.writeUserGroup(await request(member),{op:'save',group:{name:'forbidden'}}),e=>e.status===403)
  viewerId = member.id; assert.equal(await audience.opensItem('product',p.id),true)
  viewerId = outsider.id; assert.equal(await audience.opensItem('product',p.id),false)
  viewerId = magazine.id; assert.equal(await audience.opensItem('product',p.id),false)
  viewerId = catalogue.id; assert.equal(await audience.opensItem('product',p.id),true)
  viewerId = 0; assert.equal(await audience.opensItem('product',p.id),false)
  const artist = await db.musicArtist.create({data:{name:prefix,slug:prefix}});items.push(['musicArtist',artist.id])
  const album = await db.musicAlbum.create({data:{title:prefix,slug:prefix,artistId:artist.id,status:'PUBLISHED',publishedAt:new Date(0),audienceGroups:JSON.stringify(allowed)}});items.push(['musicAlbum',album.id])
  const track = await db.musicTrack.create({data:{title:prefix,slug:prefix,artistId:artist.id,albumId:album.id,status:'PUBLISHED',publishedAt:new Date(0),audienceGroups:JSON.stringify([`group:${groups[3].id}`])}});items.push(['musicTrack',track.id])
  viewerId = member.id;assert.equal(await audience.opensItem('track',track.id),false,'album and track audiences both apply')
  await db.userGroupMember.updateMany({where:{groupId:groups[3].id,userId:member.id},data:{expiresAt:null}})
  assert.equal(await audience.opensItem('track',track.id),true)
  const live = load('src/modules/media/server/queries/core.ts');assert.equal(await db.musicTrack.count({where:{id:track.id,...live.liveTrack()}}),0)
  await command.saveItemAudience(fullReq,'album',album.id,{groups:[]})
  assert.equal((await db.musicTrack.findUniqueOrThrow({where:{id:track.id}})).audienceGroups,JSON.stringify([`group:${groups[3].id}`]),'album edits preserve independent track limits')
  const template = await db.promptTemplate.create({data:{slug:prefix,title:prefix,content:'Create a complete and useful response for {{idea}} with clear practical steps.',status:'PUBLISHED',publishedAt:new Date(0)}});items.push(['promptTemplate',template.id])
  await command.saveItemAudience(fullReq,'prompt',template.id,{groups:allowed})
  assert.equal(await db.promptTemplate.count({where:{id:template.id,audienceGroups:''}}),0)
  const registry = load('src/modules/content/server/registry.ts')
  assert.equal((await registry.itemCards([{type:'product',id:p.id},{type:'prompt',id:template.id},{type:'track',id:track.id}])).size,0,'shared discovery never hydrates audience-limited items')
  beforeSetting = await db.setting.findUnique({where:{key:'site.section-access.v1'}})
  await sections.saveSectionAccess({music:allowed},{req:fullReq,actor:{id:full.id,email:full.email,role:'ADMIN',roleId:null,permissions:null}})
  preparedSetting = (await db.setting.findUniqueOrThrow({where:{key:'site.section-access.v1'}})).value
  assert.equal(await sections.sectionLock('music',async()=>null),'login')
  assert.equal(await sections.userOpensSection('music',member.id),true)
  assert.equal(await sections.userOpensSection('music',outsider.id),false)
  assert.equal(await sections.userOpensSection('music',full.id),true)
  const music = await registry.itemCards([{type:'artist',id:artist.id}])
  assert.equal(music.size,0,'section limits close global discovery for unrestricted child items too')
  assert.ok(await registry.searchIndexCard({type:'artist',id:artist.id}),'temporary section limits do not destroy the private search index')
  await assert.rejects(sections.saveSectionAccess({music:['bad-key']}))
  assert.equal((await db.setting.findUniqueOrThrow({where:{key:'site.section-access.v1'}})).value,preparedSetting)
  assert.equal(saved.revision.length,64)
  viewerId = member.id
  await db.product.update({where:{id:p.id},data:{kind:'PHYSICAL'}})
  const physicalPage = await load('src/modules/checkout/server/pages/product/page.tsx').default({params:Promise.resolve({slug:p.slug}),searchParams:Promise.resolve({})})
  const findCheckout = node => !node || typeof node!=='object' ? null : node.type==='ProductCheckout' ? node : (Array.isArray(node)?node: [node.props?.children]).map(findCheckout).find(Boolean)
  assert.equal(findCheckout(physicalPage).props.item.price,60,'physical checkout preview uses the same server group price')
  await db.product.update({where:{id:p.id},data:{kind:'VIRTUAL'}})
  await db.walletAccount.create({data:{userId:member.id,currency:'USD',balanceMinor:100000n}})
  const checkout = load('src/modules/checkout/server/checkout.ts')
  const purchase = {userId:member.id,productId:p.id,payWith:'wallet',idempotencyKey:prefix+'-checkout'}
  const paid = await checkout.executeCheckout(purchase)
  assert.equal(paid.ok,true,JSON.stringify(paid));assert.equal(paid.data.paid,true)
  assert.equal((await db.invoice.findUniqueOrThrow({where:{orderId:paid.data.orderId}})).totalMinor,6000n,'checkout charges the current group price')
  assert.equal((await db.walletAccount.findUniqueOrThrow({where:{userId_currency:{userId:member.id,currency:'USD'}}})).balanceMinor,94000n)
  const replay = await checkout.executeCheckout(purchase);assert.equal(replay.data.orderId,paid.data.orderId)
  assert.equal((await db.walletAccount.findUniqueOrThrow({where:{userId_currency:{userId:member.id,currency:'USD'}}})).balanceMinor,94000n,'retry never charges twice')
  console.log('User groups: real expiry/inactive/role separation, exact prices, transactional audit/input rollback, stale claims, owner-scoped item/album/prompt and section decisions passed')
}
main().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(async()=>{
  try {
    if(preparedSetting){if(beforeSetting)assert.equal((await db.setting.updateMany({where:{key:beforeSetting.key,value:preparedSetting},data:{value:beforeSetting.value}})).count,1);else assert.equal((await db.setting.deleteMany({where:{key:'site.section-access.v1',value:preparedSetting}})).count,1)}
    const ids=users.map(u=>u.id);await db.auditLog.deleteMany({where:{actorUserId:{in:ids}}})
    await db.sitePopup.deleteMany({where:{id:{in:popups}}})
    const orders=(await db.order.findMany({where:{userId:{in:ids}},select:{id:true}})).map(row=>row.id)
    await db.fulfillmentJob.deleteMany({where:{orderId:{in:orders}}});await db.payment.deleteMany({where:{userId:{in:ids}}});await db.walletTx.deleteMany({where:{userId:{in:ids}}});await db.invoice.deleteMany({where:{userId:{in:ids}}});await db.inventoryReservation.deleteMany({where:{orderId:{in:orders}}});await db.order.deleteMany({where:{userId:{in:ids}}})
    await db.contentRevision.deleteMany({where:{actorId:{in:ids}}})
    for(const [model,id]of items.slice().reverse())await db[model].deleteMany({where:{id}})
    await db.userGroup.deleteMany({where:{id:{in:groups.map(g=>g.id)}}});await db.user.deleteMany({where:{id:{in:ids},email:{startsWith:prefix}}});await db.role.deleteMany({where:{id:{in:roles},name:{startsWith:prefix}}})
  } finally {await db.$disconnect()}
})
