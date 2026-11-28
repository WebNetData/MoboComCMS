// Connected checks: run only against a disposable PostgreSQL database as a non-root user, without .env.
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { NextRequest } = require('next/server')
const { encode } = require('next-auth/jwt')
const sourceLoader = require('./connected-source-loader.cjs')
assert(process.env.DATABASE_URL && /test|check/i.test(new URL(process.env.DATABASE_URL).pathname), 'disposable test database required')
if (typeof process.getuid === 'function') assert.notEqual(process.getuid(), 0, 'run as a non-root user')
const db = new PrismaClient(), stamp = `repair-approval-${crypto.randomUUID()}`
const phones = Array.from({ length: 3 }, () => `+989${String(crypto.randomInt(0, 1e9)).padStart(9, '0')}`)
const secret = crypto.randomBytes(18).toString('base64url')
const oldKey = process.env.PANEL_CREDENTIAL_KEY, oldSecret = process.env.NEXTAUTH_SECRET
process.env.NEXTAUTH_SECRET = stamp
process.env.PANEL_CREDENTIAL_KEY = crypto.randomBytes(32).toString('hex')
let calls = [], unlinks = [], before, last, formId, owned = false, human = true, allowRate = true
const userIds = [], roleIds = [], submissionIds = []
const mocks = {
  'node:fs/promises': { ...require('node:fs/promises'), unlink: async path => { unlinks.push(path) } },
  '@/platform/database/prisma': { db },
  '@/platform/config/env': { authSecret: () => stamp },
  '@/platform/observability/logger': { logEvent() {}, requestIdFrom: () => stamp },
  '@/modules/settings/server': { getSettings: async () => ({ siteUrl: 'http://site.invalid', brandName: 'FixtureBrand' }) },
  '@/platform/http/rate-limit': { clientIp: () => stamp, rateLimitStrict: async () => ({ ok: allowRate }) },
  '@/modules/identity/server/human-check': { verifyHuman: async () => human },
  '@/modules/sms/server/ippanel': { sendText: async (...args) => { calls.push(args); return { ok: true, id: '123', error: '' } }, sendPattern: async (...args) => { calls.push(args); return { ok: true, id: '123', error: '' } } },
  react: { ...require('react'), cache: fn => fn },
}
const load = sourceLoader(mocks)
const sms = load('src/modules/sms/server/sms.ts')
const forms = load('src/modules/forms/domain/forms.ts')
const service = load('src/modules/forms/server/service.ts')
const advanced = load('src/modules/forms/server/advanced.ts')
const paid = load('src/modules/forms/server/paid.ts')
const tracking = load('src/modules/forms/server/tracking.ts')
const codes = load('src/modules/forms/server/tracking-code.ts')
const repair = load('src/modules/forms/server/repair-work')
const access = load('src/modules/forms/server/repair-access.ts')
const adminApi = load('src/modules/forms/server/http/repair-work.ts'), publicApi = load('src/modules/forms/server/http/tracking.ts')
const submissionApi = load('src/modules/site/server/http/admin/forms/submissions/route.ts')
const faultLoad = sourceLoader({ ...mocks, '@/platform/audit/server': { auditAdmin: async () => undefined, auditAdminStrict: async (input, tx) => { await tx.auditLog.create({ data: { actorUserId: input.actor.id, actorEmail: input.actor.email, action: input.action, targetType: input.targetType, targetId: String(input.targetId), requestId: stamp, ip: '127.0.0.1', metadata: '{}' } }); throw Error('strict audit fault') } } })
const repairFault = faultLoad('src/modules/forms/server/repair-work')
const audit = actor => ({ req: new NextRequest('http://site.invalid/api/admin/forms/repair', { headers: { cookie: `next-auth.session-token=${actor.token}` } }), actor: { id: actor.id, email: actor.email } })
const actor = (user, builder, handler) => ({ id: user.id, email: user.email, token: user.token, builder, handler })
const answer = phone => JSON.stringify([{ id: 'mobile', label: 'Mobile', type: 'mobile', value: phone }, { id: 'private', label: 'Private', type: 'secret', value: 'PRIVATE_ANSWER' }])
async function createUser(label, roleId = null) { const user = await db.user.create({ data: { email: `${stamp}-${label}@example.invalid`, name: label, passwordHash: 'fixture-only', role: 'ADMIN', roleId, status: 'ACTIVE', totpEnabledAt: new Date() } }); userIds.push(user.id); return { ...user, token: await encode({ secret: process.env.NEXTAUTH_SECRET, token: { uid: String(user.id), authAt: Date.now() } }) } }
async function createRow(extra = {}) { const row = await db.formSubmission.create({ data: { formId, data: answer(phones[0]), receiptToken: crypto.randomBytes(18).toString('base64url'), pickupCode: '734921', stage: 'RECEIVED', receivedAt: new Date(), ...extra } }); submissionIds.push(row.id); return row }
async function config() { const visible = sms.publicSmsConfig(await sms.getSmsConfig()); await sms.saveSmsConfig({ ...visible, enabled: true, apiKey: stamp, fromNumber: '3000505', otpText: 'FIXTURE {code}', otpTemplates: { ...visible.otpTemplates, repair: { text: 'REPAIR {code}', pattern: '', param: 'code' } }, otpTemplateOverrides: { ...visible.otpTemplateOverrides, repair: true } }); last = (await db.setting.findUniqueOrThrow({ where: { key: 'sms.config.v1' } })).value }
const otp = () => { const code = calls.at(-1)?.[3]?.match(/\b[1-9]\d{5}\b/)?.[0]; assert(code, 'recording provider must receive a six-digit code'); return code }
const ageOtp = () => db.otpCode.updateMany({ where: { phone: { in: phones } }, data: { createdAt: new Date(Date.now() - 61000) } })
const issue = (row, estimate, decision, phone = phones[0]) => repair.requestEstimateCode({ number: row.id, phone, estimateId: estimate.id, decision, ip: stamp })
const decide = (row, estimate, decision, code, phone = phones[0]) => repair.decideEstimate({ number: row.id, phone, estimateId: estimate.id, decision, code, ip: stamp })
const update = (row, who, revision, patch) => repair.changeRepairWork(row.id, who, { revision, ...patch }, audit(who))
async function main() {
  before = await db.setting.findUnique({ where: { key: 'sms.config.v1' } })
  assert.equal(await db.user.count({ where: { phone: { in: phones } } }), 0)
  assert.equal(await db.otpCode.count({ where: { phone: { in: phones } } }), 0)
  assert.equal(await db.smsLog.count({ where: { phone: { in: phones } } }), 0); owned = true
  const role = await db.role.create({ data: { name: `${stamp}-handler`, permissions: 'forms.handle' } }); roleIds.push(role.id)
  const managerUser = await createUser('manager'), holderUser = await createUser('holder', role.id), colleagueUser = await createUser('colleague', role.id), outsiderUser = await createUser('outsider', role.id)
  const manager = actor(managerUser, true, true), holder = actor(holderUser, false, true), colleague = actor(colleagueUser, false, true), outsider = actor(outsiderUser, false, true)
  const template = forms.TEMPLATES.find(item => item.id === 'computer-repair').build()
  const form = await service.saveForm({ ...template, slug: stamp, settings: { ...template.settings, handlers: [holder.id, colleague.id], workflow: [...template.settings.workflow, { key: 'IN_PROGRESS', label: 'Started' }] } }); formId = form.id
  const row = await createRow({ assigneeId: holder.id })
  await config()
  assert.equal((await repair.getRepairWork(row.id, holder)).canEdit, true)
  await assert.rejects(repair.getRepairWork(row.id, colleague))
  await assert.rejects(repair.getRepairWork(row.id, outsider))
  await assert.rejects(update(row, colleague, 0, { dueAt: new Date(Date.now() + 86400000).toISOString() }))
  for (const amount of ['0', '-1', '1.1', '1000000000000']) await assert.rejects(update(row, holder, 0, { estimate: { amount, description: 'repair work' } }))
  await assert.rejects(update(row, holder, 0, { dueAt: 'not-a-date' }))
  const due = new Date(Date.now() + 86400000).toISOString()
  const initial = await update(row, holder, 0, { dueAt: due, estimate: { amount: '125000', description: 'Replace part' } })
  assert.equal(initial.revision, 1); assert.equal(initial.dueAt, due)
  assert.equal(initial.estimate.amountMinor, '125000'); assert.equal(initial.estimate.currency, 'IRT'); assert.equal(initial.estimate.status, 'PENDING')
  assert.equal(new Date(initial.estimate.expiresAt) - new Date(initial.estimate.createdAt), 7 * 86400000)
  await assert.rejects(update(row, holder, 0, { dueAt: null }))
  const beforeFault = await db.formSubmission.findUniqueOrThrow({ where: { id: row.id } })
  const eventCount = await db.repairEvent.count({ where: { submissionId: row.id } })
  const auditCount = await db.auditLog.count({ where: { actorUserId: holder.id } })
  await assert.rejects(repairFault.changeRepairWork(row.id, holder, { revision: 1, estimate: { amount: '130000', description: 'Another repair' } }, audit(holder)), /strict audit fault/)
  const afterFault = await db.formSubmission.findUniqueOrThrow({ where: { id: row.id } })
  assert.equal(afterFault.repairVersion, beforeFault.repairVersion); assert.equal(afterFault.estimateRevision, beforeFault.estimateRevision)
  assert.equal(await db.repairEstimate.count({ where: { submissionId: row.id } }), 1); assert.equal(await db.repairEvent.count({ where: { submissionId: row.id } }), eventCount); assert.equal(await db.auditLog.count({ where: { actorUserId: holder.id } }), auditCount)
  assert.equal(initial.overdue, false)
  const paper = codes.repairTrackingCode(row.id, row.receiptToken), publicView = await tracking.lookupRepair(paper)
  assert.equal(publicView.repair.estimate.amountMinor, '125000')
  for (const hidden of [phones[0], row.receiptToken, row.pickupCode, 'PRIVATE_ANSWER', 'contactHash', 'receiptHash', 'assignee']) assert(!JSON.stringify(publicView).includes(hidden), hidden)
  const miss = await issue({ id: row.id + 1000000 }, initial.estimate, 'APPROVED')
  assert.deepEqual(await issue(row, initial.estimate, 'APPROVED', phones[1]), miss); assert.equal(calls.length, 0)
  assert.deepEqual(await issue(row, initial.estimate, 'APPROVED'), miss); assert.equal(calls.length, 1)
  let code = otp()
  await assert.rejects(tracking.verifyRepairCode({ number: row.id, phone: phones[0], code }))
  await assert.rejects(decide(row, initial.estimate, 'REJECTED', code))
  const wrong = code === '100000' ? '100001' : '100000'
  for (let i = 1; i <= 5; i++) { await assert.rejects(decide(row, initial.estimate, 'APPROVED', wrong)); const challenge = await db.otpCode.findFirstOrThrow({ where: { phone: phones[0], purpose: `REPAIR_DECISION:${row.id}:${initial.estimate.id}:APPROVED` }, orderBy: { id: 'desc' } }); assert.equal(challenge.attempts, i) }
  await assert.rejects(decide(row, initial.estimate, 'APPROVED', code))
  await ageOtp(); await issue(row, initial.estimate, 'APPROVED'); const approve = otp()
  await ageOtp(); await issue(row, initial.estimate, 'REJECTED'); const reject = otp()
  const race = await Promise.allSettled([decide(row, initial.estimate, 'APPROVED', approve), decide(row, initial.estimate, 'REJECTED', reject)])
  assert.equal(race.filter(result => result.status === 'fulfilled').length, 1)
  const decided = await db.repairEstimate.findUniqueOrThrow({ where: { id: initial.estimate.id } }); assert(['APPROVED', 'REJECTED'].includes(decided.status)); assert(decided.decidedAt)
  const current = await repair.getRepairWork(row.id, manager)
  const replacement = await update(row, manager, current.revision, { estimate: { amount: '150000', description: 'Revised part and labour' } })
  const old = await db.repairEstimate.findUniqueOrThrow({ where: { id: initial.estimate.id } }); assert.equal(old.status, decided.status); assert(old.supersededAt)
  await assert.rejects(decide(row, initial.estimate, 'APPROVED', approve))
  await assert.rejects(decide(row, replacement.estimate, 'APPROVED', approve))
  const snapshot = await db.formSubmission.findUniqueOrThrow({ where: { id: row.id }, select: access.REPAIR_SELECT })
  const steps = [{ key: 'RECEIVED', receipt: true, pickup: false, invoice: false }, { key: 'CUSTOM', receipt: false, pickup: false, invoice: false }, { key: 'DONE', receipt: false, pickup: true, invoice: true }]
  await assert.rejects(db.$transaction(tx => repair.assertRepairStage(tx, snapshot, 'CUSTOM', steps)))
  await assert.rejects(db.$transaction(tx => repair.assertRepairStage(tx, snapshot, 'DONE', steps)))
  await assert.rejects(db.$transaction(tx => repair.assertRepairInvoiceConsent(tx, row.id, 1n, 'IRT')))
  const takeRow = await createRow({ stage: 'OPEN' })
  await update(takeRow, manager, 0, { estimate: { amount: '1200', description: 'Pending repair' } })
  await assert.rejects(paid.workOnSubmission(takeRow.id, holder, { take: true }))
  const untaken = await db.formSubmission.findUniqueOrThrow({ where: { id: takeRow.id } }); assert.equal(untaken.stage, 'OPEN'); assert.equal(untaken.assigneeId, null)
  const legacy = await createRow(); const legacySnapshot = await db.formSubmission.findUniqueOrThrow({ where: { id: legacy.id }, select: access.REPAIR_SELECT })
  await db.$transaction(tx => repair.assertRepairStage(tx, legacySnapshot, 'CUSTOM', steps)); await db.$transaction(tx => repair.assertRepairInvoiceConsent(tx, legacy.id, 999n, 'IRT'))
  await ageOtp(); await issue(row, replacement.estimate, 'APPROVED'); code = otp(); await decide(row, replacement.estimate, 'APPROVED', code)
  const approved = await db.formSubmission.findUniqueOrThrow({ where: { id: row.id }, select: access.REPAIR_SELECT })
  await db.$transaction(tx => repair.assertRepairStage(tx, approved, 'CUSTOM', steps))
  const oldRow = await createRow()
  const oldCreated = new Date(Date.now() - 9 * 86400000), oldDecision = new Date(Date.now() - 8 * 86400000), oldExpiry = new Date(Date.now() - 2 * 86400000)
  await db.repairEstimate.create({ data: { submissionId: oldRow.id, version: 1, amountMinor: 2000n, currency: 'IRT', description: 'Previously approved', status: 'APPROVED', contactHash: access.repairHash('contact', phones[0]), receiptHash: access.repairHash('receipt', oldRow.receiptToken), createdAt: oldCreated, decidedAt: oldDecision, expiresAt: oldExpiry } })
  await db.formSubmission.update({ where: { id: oldRow.id }, data: { estimateRevision: 1 } })
  const oldApproved = await db.formSubmission.findUniqueOrThrow({ where: { id: oldRow.id }, select: access.REPAIR_SELECT })
  await db.$transaction(tx => repair.assertRepairStage(tx, oldApproved, 'CUSTOM', steps))

  await assert.rejects(db.$transaction(tx => repair.assertRepairInvoiceConsent(tx, row.id, 150001n, 'IRT')))
  await assert.rejects(db.$transaction(tx => repair.assertRepairInvoiceConsent(tx, row.id, 150000n, 'USD')))
  await db.$transaction(tx => repair.assertRepairInvoiceConsent(tx, row.id, 150000n, 'IRT'))
  const declinedRow = await createRow()
  const declinedView = await update(declinedRow, manager, 0, { estimate: { amount: '1000', description: 'Diagnostic and repair' } })
  await ageOtp(); await issue(declinedRow, declinedView.estimate, 'REJECTED'); await decide(declinedRow, declinedView.estimate, 'REJECTED', otp())
  const declinedSnapshot = await db.formSubmission.findUniqueOrThrow({ where: { id: declinedRow.id }, select: access.REPAIR_SELECT })
  await assert.rejects(db.$transaction(tx => repair.assertRepairStage(tx, declinedSnapshot, 'CUSTOM', steps)))
  await db.$transaction(tx => repair.assertRepairStage(tx, declinedSnapshot, 'DONE', steps)) // Existing pickup/invoice guards still decide custody.
  await assert.rejects(paid.workOnSubmission(declinedRow.id, holder, { stage: 'DONE', pickupCode: '000000' }, false))
  await assert.rejects(paid.workOnSubmission(declinedRow.id, holder, { stage: 'DONE', pickupCode: declinedRow.pickupCode }, false))
  await paid.workOnSubmission(declinedRow.id, manager, { stage: 'DONE', pickupCode: declinedRow.pickupCode, override: 'تحویل دستگاه بدون انجام تعمیر' }, true)
  assert((await db.repairEvent.findFirstOrThrow({ where: { submissionId: declinedRow.id, kind: 'STAGE' }, orderBy: { id: 'desc' } })).detail.includes('بدون انجام تعمیر'))
  await advanced.editSubmission(row.id, { mobile: phones[2] })
  assert.equal((await repair.getRepairWork(row.id, manager)).estimate, null)
  await advanced.editSubmission(row.id, { mobile: phones[0] })
  assert.equal((await repair.getRepairWork(row.id, manager)).estimate, null, 'restoring the former phone never revives old consent')
  const changed = await db.formSubmission.findUniqueOrThrow({ where: { id: row.id }, select: access.REPAIR_SELECT })
  await assert.rejects(db.$transaction(tx => repair.assertRepairStage(tx, changed, 'CUSTOM', steps)))
  const uploadId = `${crypto.randomUUID()}.pdf`
  await db.formUpload.create({ data: { id: uploadId, formId, submissionId: row.id, originalName: 'fixture.pdf', mimeType: 'application/pdf', size: 1 } })
  await assert.rejects(service.deleteSubmissions([row.id])); await assert.rejects(service.deleteForm(formId)); assert.deepEqual(unlinks, [], 'deletion refuses before touching uploads')
  assert(await db.formSubmission.findUnique({ where: { id: row.id } })); assert(await db.siteForm.findUnique({ where: { id: formId } }))
  const invalidBase = { submissionId: row.id, version: 99, amountMinor: 100n, currency: 'IRT', description: 'Fixture estimate', contactHash: access.repairHash('contact', phones[0]), receiptHash: access.repairHash('receipt', row.receiptToken), expiresAt: new Date(Date.now() + 86400000) }
  for (const patch of [{ amountMinor: 0n }, { currency: 'USD' }, { status: 'BAD' }, { version: 0 }]) await assert.rejects(db.repairEstimate.create({ data: { ...invalidBase, ...patch } }))
  await assert.rejects(db.repairEstimate.update({ where: { id: replacement.estimate.id }, data: { amountMinor: 1n } }))
  const raceRow = await createRow({ data: answer(phones[1]) })
  const raceQuote = await update(raceRow, manager, 0, { estimate: { amount: '3000', description: 'Race quote' } })
  await issue(raceRow, raceQuote.estimate, 'APPROVED', phones[1]); const raceCode = otp()
  const raceVersion = (await repair.getRepairWork(raceRow.id, manager)).revision
  const replaceRace = await Promise.allSettled([decide(raceRow, raceQuote.estimate, 'APPROVED', raceCode, phones[1]), update(raceRow, manager, raceVersion, { estimate: { amount: '3500', description: 'Concurrent replacement' } })])
  assert.equal(replaceRace.filter(r => r.status === 'fulfilled').length, 1, 'approval/replacement cannot both claim the same revision')
  const expiredRow = await createRow({ data: answer(phones[1]), createdAt: new Date(Date.now() - 10 * 86400000) })
  const expiredQuote = await db.repairEstimate.create({ data: { submissionId: expiredRow.id, version: 1, amountMinor: 4000n, description: 'Expired offer', contactHash: access.repairHash('contact', phones[1]), receiptHash: access.repairHash('receipt', expiredRow.receiptToken), createdAt: oldCreated, expiresAt: oldExpiry } })
  await db.formSubmission.update({ where: { id: expiredRow.id }, data: { estimateRevision: 1 } })
  const callsBeforeExpiry = calls.length
  await issue(expiredRow, expiredQuote, 'APPROVED', phones[1]); assert.equal(calls.length, callsBeforeExpiry)
  await assert.rejects(decide(expiredRow, expiredQuote, 'APPROVED', raceCode, phones[1]))
  const overdue = await update(expiredRow, manager, 0, { dueAt: new Date(Date.now() - 3600000).toISOString() }); assert.equal(overdue.overdue, true)
  // Real canonical session/role checks in the new HTTP adapter; HumanCheck/provider are doubles.
  const httpRow = await createRow({ assigneeId: holder.id, data: answer(phones[1]) })
  const adminReq = (who, method, body, origin = 'http://site.invalid') => new NextRequest(`http://site.invalid/api/admin/forms/repair?id=${httpRow.id}`, { method, headers: { host: 'site.invalid', 'content-type': 'application/json', ...(who ? { cookie: `next-auth.session-token=${who.token}` } : {}), ...(origin ? { Origin: origin } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  assert.equal((await adminApi.GET(adminReq(null, 'GET'))).status, 403)
  assert.equal((await adminApi.GET(adminReq(colleague, 'GET'))).status, 403)
  assert.equal((await adminApi.GET(adminReq(outsider, 'GET'))).status, 403)
  const read = await adminApi.GET(adminReq(holder, 'GET')); assert.equal(read.status, 200); assert.equal(read.headers.get('cache-control'), 'private, no-store')
  const draft = { id: httpRow.id, revision: 0, estimate: { amount: '2000', description: 'HTTP consent fixture' } }
  assert.equal((await adminApi.PATCH(adminReq(holder, 'PATCH', draft, null))).status, 403)
  assert.equal((await adminApi.PATCH(adminReq(holder, 'PATCH', draft, 'http://foreign.invalid'))).status, 403)
  assert.equal((await adminApi.PATCH(adminReq(holder, 'PATCH', { ...draft, extra: 'x'.repeat(7000) }))).status, 413)
  const saved = await adminApi.PATCH(adminReq(holder, 'PATCH', draft)); assert.equal(saved.status, 200); const apiView = await saved.json()
  assert.equal((await adminApi.PATCH(adminReq(holder, 'PATCH', draft))).status, 409)
  await assert.rejects(update(httpRow, { ...colleague, builder: true }, apiView.revision, { dueAt: null }))
  const changeStage = (who, stage, id = httpRow.id) => submissionApi.PATCH(new NextRequest('http://site.invalid/api/admin/forms/submissions', {
    method: 'PATCH',
    headers: { host: 'site.invalid', Origin: 'http://site.invalid', 'Content-Type': 'application/json', cookie: `next-auth.session-token=${who.token}` },
    body: JSON.stringify({ id, work: { stage } }),
  }))
  for (const stage of ['REPAIRING', 'READY']) {
    const blocked = await changeStage(manager, stage)
    assert.equal(blocked.status, 409)
    assert.match((await blocked.json()).error, /در انتظار تأیید برآورد هزینه توسط مشتری/)
    const unquoted = await changeStage(manager, stage, legacy.id)
    assert.equal(unquoted.status, 200, await unquoted.clone().text())
    assert.equal((await db.formSubmission.findUniqueOrThrow({ where: { id: legacy.id } })).stage, stage)
  }
  assert.equal((await db.formSubmission.findUniqueOrThrow({ where: { id: httpRow.id } })).stage, 'RECEIVED')
  const publicReq = (body, origin = 'http://site.invalid') => new NextRequest('http://site.invalid/api/repair-tracking', { method: 'POST', headers: { host: 'site.invalid', 'content-type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) })
  const consent = { action: 'request-decision-code', number: httpRow.id, phone: phones[1], estimateId: apiView.estimate.id, decision: 'APPROVED', humanCheck: 'fixture' }
  assert.equal((await publicApi.POST(publicReq(consent, null))).status, 403)
  human = false; assert.equal((await publicApi.POST(publicReq(consent))).status, 400); human = true
  allowRate = false; assert.equal((await publicApi.POST(publicReq(consent))).status, 429); allowRate = true
  const requested = await publicApi.POST(publicReq(consent)); assert.equal(requested.status, 200); const apiCode = otp()
  const confirmed = await publicApi.POST(publicReq({ ...consent, action: 'decide-estimate', code: apiCode })); assert.equal(confirmed.status, 200)
  assert.equal((await confirmed.json()).request.repair.estimate.status, 'APPROVED')
  assert.equal((await publicApi.POST(publicReq({ ...consent, action: 'decide-estimate', code: apiCode }))).status, 403)
  assert.equal((await changeStage(colleague, 'REPAIRING')).status, 403)
  for (const stage of ['REPAIRING', 'READY']) {
    const moved = await changeStage(manager, stage)
    assert.equal(moved.status, 200, await moved.clone().text())
    const updated = await db.formSubmission.findUniqueOrThrow({ where: { id: httpRow.id } })
    assert.equal(updated.stage, stage)
    assert.equal(updated.assigneeId, holder.id)
  }
  console.log('PASS repair approval connected checks')
}
main().finally(async () => {
  try {
    if (owned) {
      await db.smsLog.deleteMany({ where: { phone: { in: phones } } }); await db.otpCode.deleteMany({ where: { phone: { in: phones } } })
      await db.repairEvent.deleteMany({ where: { submissionId: { in: submissionIds } } }); await db.repairEstimate.deleteMany({ where: { submissionId: { in: submissionIds } } })
      await db.formSubmission.deleteMany({ where: { id: { in: submissionIds } } }); if (formId) await db.siteForm.deleteMany({ where: { id: formId } })
      await db.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } }); await db.user.deleteMany({ where: { id: { in: userIds } } }); await db.role.deleteMany({ where: { id: { in: roleIds } } })
    }
    if (last !== undefined) { const restored = before ? await db.setting.updateMany({ where: { key: 'sms.config.v1', value: last }, data: { value: before.value } }) : await db.setting.deleteMany({ where: { key: 'sms.config.v1', value: last } }); assert.equal(restored.count, 1, 'settings changed concurrently; preserve them') }
  } finally { if (oldKey === undefined) delete process.env.PANEL_CREDENTIAL_KEY; else process.env.PANEL_CREDENTIAL_KEY = oldKey; if (oldSecret === undefined) delete process.env.NEXTAUTH_SECRET; else process.env.NEXTAUTH_SECRET = oldSecret; await db.$disconnect() }
}).catch(error => { console.error(error); process.exitCode = 1 })
