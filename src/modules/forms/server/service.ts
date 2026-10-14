import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { db } from '@/platform/database/prisma'
import { authSecret } from '@/platform/config/env'
import { logEvent } from '@/platform/observability/logger'
import { clientIp, rateLimitHit } from '@/platform/http/rate-limit'
import { sniffImage } from '@/shared/files/image-type'
import { sendMail } from '@/modules/mail/server/mailer'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import {
  CONTENT_TYPES, FormsError, STATUSES, TEMPLATES, checkSubmission, formState, looksSpam, normalizeForm, parseForm, toCsv, visibleFields,
  type Answer, type FormDefinition, type PriceLine, type StoredAnswer, type SubmissionStatus,
} from '@/modules/forms/domain/forms'
import { minorToNumber } from '@/shared/money'
import { FORM_CURRENCY, billFor, sealSecrets } from '@/modules/forms/server/paid'
import { mergeTags, pickConfirmation, scoreOf } from '@/modules/forms/domain/advanced'
import { bookSlots, sendFormNotifications, sendFormWebhooks, webhookAnswers } from '@/modules/forms/server/advanced'

// Uploaded answers live outside the public folder; only administrators read them, through an authorised route.
export const formsDirectory = () => join(process.cwd(), 'storage', 'forms')
const MAX_FILE_BYTES = 5 * 1024 * 1024
const PAGE = 25
const parse = <T>(text: string, fallback: T): T => { try { return JSON.parse(text) as T } catch { return fallback } }

// ------------------------------------------------------------------ forms

export async function listForms() {
  const [rows, groups] = await Promise.all([
    db.siteForm.findMany({ orderBy: { updatedAt: 'desc' } }),
    db.formSubmission.groupBy({ by: ['formId', 'status'], _count: { _all: true } }),
  ])
  return rows.map((row) => {
    const mine = groups.filter((g) => g.formId === row.id)
    const count = (status?: string) => mine.filter((g) => !status || g.status === status).reduce((sum, g) => sum + g._count._all, 0)
    return { ...parseForm(row), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), counts: { total: count(), new: count('NEW'), spam: count('SPAM') } }
  })
}

export async function saveForm(input: unknown) {
  const form = normalizeForm(input)
  const data = { slug: form.slug, title: form.title, description: form.description, fields: JSON.stringify(form.fields), published: form.published, successText: form.successText, settings: JSON.stringify(form.settings) }
  try {
    const row = form.id ? await db.siteForm.update({ where: { id: form.id }, data }) : await db.siteForm.create({ data })
    return parseForm(row)
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'P2002') throw new FormsError('این نشانی قبلاً استفاده شده است', 409)
    if (code === 'P2025') throw new FormsError('فرم پیدا نشد', 404)
    throw error
  }
}

export async function duplicateForm(id: number) {
  const row = await db.siteForm.findUnique({ where: { id } })
  if (!row) throw new FormsError('فرم پیدا نشد', 404)
  let slug = `${row.slug}-copy`.slice(0, 78)
  for (let n = 2; await db.siteForm.findUnique({ where: { slug }, select: { id: true } }); n++) slug = `${row.slug.slice(0, 70)}-copy${n}`
  const copy = await db.siteForm.create({ data: { slug, title: `${row.title} (کپی)`.slice(0, 150), description: row.description, fields: row.fields, published: false, successText: row.successText, settings: row.settings } })
  return parseForm(copy)
}

export async function deleteForm(id: number) {
  const uploads = await db.formUpload.findMany({ where: { formId: id }, select: { id: true } })
  await removeFiles(uploads.map((u) => u.id))
  await db.siteForm.delete({ where: { id } }).catch(() => undefined)
}

export function templateList() {
  return TEMPLATES.map((t) => ({ id: t.id, name: t.name, description: t.description, form: t.build() }))
}

/** The published form for the public page (`null` when it does not exist or is a draft), with what visitors need to know about it. */
export async function publicFormBySlug(slug: string) {
  const row = await db.siteForm.findUnique({ where: { slug } })
  if (!row?.published) return null
  const form = parseForm(row)
  const settings = form.settings!
  const count = settings.maxSubmissions ? await db.formSubmission.count({ where: { formId: row.id, status: { not: 'SPAM' } } }) : 0
  return { form, state: formState(settings, count) }
}

// ------------------------------------------------------------------ files

async function removeFiles(names: string[]) {
  await Promise.all(names.filter((name) => /^[0-9a-f-]{36}\.(png|jpg|webp|pdf)$/.test(name)).map((name) => unlink(join(formsDirectory(), name)).catch(() => undefined)))
}

function sniffUpload(bytes: Buffer): { extension: string; mimeType: string } | null {
  const image = sniffImage(bytes)
  if (image) return image
  return bytes.length > 16 && bytes.toString('latin1', 0, 5) === '%PDF-' && bytes.toString('latin1', Math.max(0, bytes.length - 1024)).includes('%%EOF') ? { extension: 'pdf', mimeType: 'application/pdf' } : null
}

/** One file for a "file" field, kept until the form is submitted (or a day passes). */
export async function uploadFile(slug: string, file: File, ip: string) {
  const row = await db.siteForm.findUnique({ where: { slug } })
  if (!row?.published) throw new FormsError('فرم در دسترس نیست', 404)
  const form = parseForm(row)
  if (!form.fields.some((f) => f.type === 'file' || f.type === 'signature')) throw new FormsError('این فرم ضمیمه نمی‌پذیرد')
  if (!rateLimitHit(`form-upload:${ip}`, 12, 10 * 60_000).ok) throw new FormsError('بارگذاری‌ها زیاد است؛ کمی بعد دوباره تلاش کنید', 429)
  if (file.size > MAX_FILE_BYTES) throw new FormsError('حجم فایل حداکثر ۵ مگابایت است', 413)
  const bytes = Buffer.from(await file.arrayBuffer())
  const type = sniffUpload(bytes)
  if (!type) throw new FormsError('فایل باید PDF، JPG، PNG یا WebP باشد')
  const id = `${randomUUID()}.${type.extension}`
  await mkdir(formsDirectory(), { recursive: true })
  await writeFile(join(formsDirectory(), id), bytes, { flag: 'wx', mode: 0o600 })
  const name = String(file.name || 'file').replace(/[\u0000-\u001f<>"\\/]/g, '_').slice(0, 120)
  await db.formUpload.create({ data: { id, formId: row.id, originalName: name, mimeType: type.mimeType, size: bytes.length } })
  return { id, name, size: bytes.length }
}

export async function readUpload(id: string) {
  if (!/^[0-9a-f-]{36}\.(png|jpg|webp|pdf)$/.test(id)) return null
  const row = await db.formUpload.findUnique({ where: { id } })
  if (!row) return null
  try { return { formId: row.formId, bytes: await readFile(join(formsDirectory(), id)), type: row.mimeType, name: row.originalName } } catch { return null }
}

/** Uploads nobody claimed within a day are removed (called by the scheduler). */
export async function pruneUploads() {
  const stale = await db.formUpload.findMany({ where: { submissionId: null, createdAt: { lt: new Date(Date.now() - 86_400_000) } }, select: { id: true }, take: 500 })
  if (!stale.length) return 0
  await removeFiles(stale.map((u) => u.id))
  await db.formUpload.deleteMany({ where: { id: { in: stale.map((u) => u.id) } } })
  return stale.length
}

// ------------------------------------------------------------------ submitting

const ipHash = (ip: string) => createHash('sha256').update(`${authSecret()}:form:${ip}`).digest('hex').slice(0, 16)

export interface Submitter { userId: number | null; ip: string }

export async function submitForm(slug: string, input: { values: unknown; website?: unknown }, who: Submitter) {
  const found = await publicFormBySlug(slug)
  if (!found) throw new FormsError('فرم در دسترس نیست', 404)
  const { form, state } = found
  const settings = form.settings!
  // A filled honeypot is a robot; it is told everything went well and nothing is stored.
  if (input.website) return { message: form.successText, redirect: '' }
  if (state !== 'open') throw new FormsError(settings.closedMessage || (state === 'soon' ? 'این فرم هنوز باز نشده است' : state === 'full' ? 'ظرفیت این فرم تکمیل شده است' : 'مهلت این فرم تمام شده است'), 403)
  if (settings.requireLogin && !who.userId) throw new FormsError('برای ارسال این فرم ابتدا وارد حساب خود شوید', 401)
  if (settings.oncePerUser && who.userId && await db.formSubmission.findFirst({ where: { formId: form.id!, userId: who.userId, status: { not: 'SPAM' } }, select: { id: true } })) throw new FormsError('شما قبلاً این فرم را ارسال کرده‌اید', 409)
  if (!rateLimitHit(`form-day:${form.id}:${who.ip}`, 40, 24 * 3_600_000).ok) throw new FormsError('کمی بعد دوباره تلاش کنید', 429)

  const { values, errors } = checkSubmission(form.fields, input.values)
  const shown = visibleFields(form.fields, values).filter((f) => !CONTENT_TYPES.includes(f.type))
  const firstBad = form.fields.find((f) => errors[f.id])
  if (firstBad) throw new FormsError(errors[firstBad.id])

  // Files must be uploads made for this form and not yet used.
  const fileIds = shown.filter((f) => f.type === 'file' || f.type === 'signature').flatMap((f) => (values[f.id] as string[]) || [])
  if (fileIds.length) {
    const owned = await db.formUpload.count({ where: { id: { in: fileIds }, formId: form.id!, submissionId: null } })
    if (owned !== fileIds.length) throw new FormsError('فایل بارگذاری‌شده معتبر نیست؛ دوباره بارگذاری کنید')
  }

  // A password is stored encrypted, apart from the readable answers.
  const { answers, secrets } = sealSecrets(shown.map((f) => ({ id: f.id, label: f.label, type: f.type, value: values[f.id] as Answer })))
  const spam = looksSpam(values, settings.spamLinks)
  // A paid form: the bill is priced here, by the server, and the answer waits for its payment.
  const paid = settings.payment.enabled
  if (paid && !who.userId) throw new FormsError('برای ارسال این فرم ابتدا وارد حساب خود شوید', 401)
  const bill = paid ? await billFor(form, values) : null
  if (bill && bill.totalMinor <= 0n) throw new FormsError('مبلغی برای پرداخت محاسبه نشد؛ فیلدهای مبلغ را کامل کنید')
  const money = bill ? { amountMinor: bill.totalMinor, currency: bill.currency, pricing: JSON.stringify(bill.lines), payStatus: 'UNPAID' } : {}
  const score = settings.quiz.enabled ? scoreOf(form.fields, values) : null
  const store = () => db.$transaction(async (tx) => {
    const created = await tx.formSubmission.create({ data: { formId: form.id!, data: JSON.stringify(answers), status: spam ? 'SPAM' : 'NEW', userId: who.userId, ipHash: ipHash(who.ip), secrets, stage: spam || paid ? '' : 'OPEN', score: score?.score ?? 0, scoreMax: score?.max ?? 0, ...money } })
    if (fileIds.length) await tx.formUpload.updateMany({ where: { id: { in: fileIds } }, data: { submissionId: created.id } })
    // An appointment takes its seat with the answer, or the answer is not stored at all.
    if (!spam) await bookSlots(tx, form, shown, values, created.id)
    return created
  })
  let submission: Awaited<ReturnType<typeof store>> | null = null
  for (let attempt = 0; !submission; attempt++) {
    try { submission = await store() } catch (error) {
      // Two people took the same seat at once: the unique key refused one of them; look for the next seat.
      if ((error as { code?: string }).code !== 'P2002' || attempt >= 3) throw error
    }
  }
  const context = { formTitle: form.title, entryId: submission.id, answers, total: bill?.total, score: score || undefined }
  const confirmation = pickConfirmation(settings, form.successText, values)
  const message = mergeTags(confirmation.message, context)
  const quiz = score && settings.quiz.showResult ? { score: score.score, max: score.max, passed: settings.quiz.passScore > 0 ? score.score >= settings.quiz.passScore : null } : undefined
  // Staff hear about a paid form once it is paid (the fulfilment step tells them).
  if (bill && !spam) return { message, redirect: '', quiz, pay: { submissionId: submission.id, amount: bill.total, currency: bill.currency, lines: bill.lines, label: settings.payment.label } }
  if (!spam) {
    const id = submission.id
    void notify(form, id, answers, who.userId).catch((error) => logEvent('error', 'forms.notify_failed', { form: form.slug, error }))
    void sendFormNotifications(form, context, values).catch((error) => logEvent('error', 'forms.notify_failed', { form: form.slug, error }))
    void sendFormWebhooks(form, 'submitted', { entryId: id, answers: webhookAnswers(answers), score: score || undefined }).catch(() => undefined)
  }
  return { message, redirect: confirmation.redirectUrl, quiz }
}

async function notify(form: FormDefinition, submissionId: number, answers: StoredAnswer[], userId: number | null) {
  const settings = form.settings!
  const lines = answers.map((a) => `${a.label}: ${Array.isArray(a.value) ? (a.type === 'file' ? `${a.value.length} فایل` : a.value.join('، ')) : typeof a.value === 'boolean' ? (a.value ? 'بله' : 'خیر') : a.value || '—'}`)
  if (settings.notifyInbox) {
    const handlers = settings.handlers
    const admins = await db.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE', ...(handlers.length ? { id: { in: handlers } } : {}) }, select: { id: true }, take: 50 })
    await Promise.all(admins.map((admin) => createInboxEvent({
      userId: admin.id, kind: 'FORM', dedupeKey: `form:${submissionId}:${admin.id}`, titleFa: `پاسخ تازه در «${form.title}»`, titleEn: 'New form submission',
      bodyFa: lines.slice(0, 3).join(' · ').slice(0, 300), bodyEn: '', href: `/admin/forms?form=${form.id}&tab=inbox`,
    }).catch(() => undefined)))
  }
  const subject = `پاسخ تازه در «${form.title}»`
  const text = `${subject}\n\n${lines.join('\n')}\n\nشناسه: #${submissionId}${userId ? `\nکاربر: ${userId}` : ''}`
  for (const to of settings.notifyEmails) await sendMail({ to, subject, text, source: 'forms' })
  if (settings.autoReply.enabled) {
    const email = answers.find((a) => a.type === 'email' && typeof a.value === 'string' && a.value)
    if (email) await sendMail({ to: String(email.value), subject: settings.autoReply.subject || `دریافت پیام شما — ${form.title}`, text: settings.autoReply.body || form.successText, source: 'forms' })
  }
}

/** The bill of what a visitor has typed so far (the page shows it while they fill the form). */
export async function quoteForm(slug: string, input: unknown) {
  const found = await publicFormBySlug(slug)
  if (!found || !found.form.settings?.payment.enabled) throw new FormsError('فرم در دسترس نیست', 404)
  const { values } = checkSubmission(found.form.fields, input)
  const bill = await billFor(found.form, values)
  return { lines: bill.lines, total: bill.total, currency: bill.currency }
}

// ------------------------------------------------------------------ inbox

export interface SubmissionQuery { formId: number; /** The work queue across several forms (then `formId` is ignored). */ formIds?: number[]; mine?: number; unassigned?: boolean; status?: string; stage?: string; q?: string; page?: number; from?: string; to?: string }

const where = (query: SubmissionQuery) => ({
  formId: query.formIds ? { in: query.formIds } : query.formId,
  ...(query.mine ? { assigneeId: query.mine } : query.unassigned ? { assigneeId: null, stage: { in: ['OPEN', 'IN_PROGRESS'] } } : {}),
  ...(query.status === 'ALL' || !query.status ? { status: { not: 'SPAM' } } : STATUSES.includes(query.status as SubmissionStatus) ? { status: query.status } : {}),
  ...(query.q ? { data: { contains: query.q.slice(0, 100) } } : {}),
  ...(query.stage && ['OPEN', 'IN_PROGRESS', 'DONE', 'REJECTED'].includes(query.stage) ? { stage: query.stage } : query.stage === 'UNPAID' ? { payStatus: 'UNPAID' } : {}),
  ...(query.from || query.to ? { createdAt: { ...(query.from && !Number.isNaN(Date.parse(query.from)) ? { gte: new Date(query.from) } : {}), ...(query.to && !Number.isNaN(Date.parse(query.to)) ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}) } } : {}),
})

const view = (row: { formId: number; form?: { title: string } | null; id: number; data: string; status: string; note: string; userId: number | null; createdAt: Date; amountMinor: bigint; currency: string; pricing: string; payStatus: string; paidAt: Date | null; orderId: number | null; stage: string; assigneeId: number | null; reply: string; secrets: string; secretsErasedAt: Date | null; score: number; scoreMax: number; uploads?: { id: number | string; originalName: string; size: number }[] }, users: Map<number, string>) => ({
  amount: row.amountMinor > 0n ? minorToNumber(row.amountMinor, row.currency || FORM_CURRENCY) : 0, currency: row.currency || FORM_CURRENCY, lines: parse<PriceLine[]>(row.pricing || '[]', []), payStatus: row.payStatus, paidAt: row.paidAt?.toISOString() || null, orderId: row.orderId,
  stage: row.stage, assigneeId: row.assigneeId, assignee: row.assigneeId ? users.get(row.assigneeId) || `کاربر ${row.assigneeId}` : '', reply: row.reply, hasSecrets: !!row.secrets, secretsErasedAt: row.secretsErasedAt?.toISOString() || null, score: row.score, scoreMax: row.scoreMax,
  formId: row.formId, formTitle: row.form?.title || '',
  id: row.id, status: row.status, note: row.note, userId: row.userId, user: row.userId ? users.get(row.userId) || `کاربر ${row.userId}` : '', createdAt: row.createdAt.toISOString(),
  answers: parse<StoredAnswer[]>(row.data, []), files: (row.uploads || []).map((u) => ({ id: String(u.id), name: u.originalName, size: u.size })),
})

async function userNames(ids: (number | null)[]) {
  const list = [...new Set(ids.filter((id): id is number => !!id))]
  const rows = list.length ? await db.user.findMany({ where: { id: { in: list } }, select: { id: true, name: true, email: true } }) : []
  return new Map(rows.map((u) => [u.id, u.name || u.email || `کاربر ${u.id}`]))
}

export async function listSubmissions(query: SubmissionQuery) {
  const page = Math.max(1, query.page || 1)
  const [rows, total, groups] = await Promise.all([
    db.formSubmission.findMany({ where: where(query), orderBy: { createdAt: 'desc' }, skip: (page - 1) * PAGE, take: PAGE, include: { form: { select: { title: true } }, uploads: { select: { id: true, originalName: true, size: true } } } }),
    db.formSubmission.count({ where: where(query) }),
    db.formSubmission.groupBy({ by: ['status'], where: { formId: query.formIds ? { in: query.formIds } : query.formId }, _count: { _all: true } }),
  ])
  const users = await userNames(rows.flatMap((r) => [r.userId, r.assigneeId]))
  // How much work waits, by stage, for the tiles above the list.
  const stages = await db.formSubmission.groupBy({ by: ['stage', 'payStatus'], where: { formId: query.formIds ? { in: query.formIds } : query.formId, status: { not: 'SPAM' } }, _count: { _all: true } })
  const work = { OPEN: 0, IN_PROGRESS: 0, DONE: 0, REJECTED: 0, UNPAID: 0 } as Record<string, number>
  for (const group of stages) { if (group.payStatus === 'UNPAID') work.UNPAID += group._count._all; else if (group.stage in work) work[group.stage] += group._count._all }
  return { work, rows: rows.map((r) => view(r, users)), total, page, pages: Math.max(1, Math.ceil(total / PAGE)), counts: Object.fromEntries(groups.map((g) => [g.status, g._count._all])) as Record<string, number> }
}

export async function updateSubmissions(ids: number[], patch: { status?: unknown; note?: unknown }) {
  const list = [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 200)
  if (!list.length) throw new FormsError('پاسخی انتخاب نشده است')
  const data: { status?: string; read?: boolean; note?: string } = {}
  if (patch.status !== undefined) {
    if (!STATUSES.includes(patch.status as SubmissionStatus)) throw new FormsError('وضعیت معتبر نیست')
    data.status = patch.status as string
    data.read = patch.status !== 'NEW'
  }
  if (patch.note !== undefined) { if (list.length !== 1) throw new FormsError('یادداشت برای یک پاسخ ثبت می‌شود'); data.note = String(patch.note).slice(0, 1000) }
  if (!Object.keys(data).length) throw new FormsError('تغییری ارسال نشده است')
  const result = await db.formSubmission.updateMany({ where: { id: { in: list } }, data })
  if (!result.count) throw new FormsError('پاسخ پیدا نشد', 404)
  return result.count
}

export async function deleteSubmissions(ids: number[]) {
  const list = [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 200)
  if (!list.length) throw new FormsError('پاسخی انتخاب نشده است')
  const uploads = await db.formUpload.findMany({ where: { submissionId: { in: list } }, select: { id: true } })
  await removeFiles(uploads.map((u) => u.id))
  return (await db.formSubmission.deleteMany({ where: { id: { in: list } } })).count
}

export async function exportCsv(query: SubmissionQuery) {
  const form = await db.siteForm.findUnique({ where: { id: query.formId } })
  if (!form) throw new FormsError('فرم پیدا نشد', 404)
  const def = parseForm(form)
  const rows = await db.formSubmission.findMany({ where: where(query), orderBy: { createdAt: 'asc' }, take: 20_000 })
  const users = await userNames(rows.map((r) => r.userId))
  const columns = def.fields.filter((f) => !CONTENT_TYPES.includes(f.type)).map((f) => ({ id: f.id, label: f.label }))
  const body = toCsv(columns, rows.map((r) => { const v = view(r, users); return { id: v.id, createdAt: v.createdAt, status: v.status, user: v.user, answers: v.answers } }))
  return { slug: def.slug, body }
}

/** Submissions per day for the last `days`, and totals. */
export async function formStats(formId: number, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000)
  const [recent, groups] = await Promise.all([
    db.formSubmission.findMany({ where: { formId, createdAt: { gte: since }, status: { not: 'SPAM' } }, select: { createdAt: true }, take: 50_000 }),
    db.formSubmission.groupBy({ by: ['status'], where: { formId }, _count: { _all: true } }),
  ])
  const perDay = new Map<string, number>()
  for (const row of recent) { const day = row.createdAt.toISOString().slice(0, 10); perDay.set(day, (perDay.get(day) || 0) + 1) }
  const series: { day: string; count: number }[] = []
  for (let i = days - 1; i >= 0; i--) { const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10); series.push({ day, count: perDay.get(day) || 0 }) }
  return { series, counts: Object.fromEntries(groups.map((g) => [g.status, g._count._all])) as Record<string, number> }
}

export { clientIp }
