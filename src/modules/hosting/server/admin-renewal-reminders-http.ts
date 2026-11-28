import type { NextRequest } from 'next/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { err, ok } from '@/platform/http/response'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { readJsonObject, JsonBodyError } from '@/platform/http/read-json'
import { renewalDueFilters, renewalInvoiceFilters, type RenewalDueFilter, type RenewalInvoiceFilter, type RenewalReminderSelection } from '@/modules/hosting/domain/renewal-reminders'
import { dispatchRenewalReminders, previewRenewalReminders, renewalReminderBatchLimit } from './renewal-reminders'

const permissions = ['hosting.manage']
const invalid = () => err('فیلتر یا انتخاب یادآوری معتبر نیست.', 422)
const validId = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 2_147_483_647

function privateResponse(data: unknown) {
  const response = ok(data)
  response.headers.set('cache-control', 'private, no-store')
  return response
}

function selectionOf(value: unknown): RenewalReminderSelection | null {
  if (!value || typeof value !== 'object') return null
  const { id, userId, dueAt, invoiceNumber } = value as Partial<RenewalReminderSelection>
  if (!validId(id) || !validId(userId) || typeof dueAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(dueAt) || !Number.isFinite(Date.parse(dueAt))) return null
  if (invoiceNumber !== null && (typeof invoiceNumber !== 'string' || !invoiceNumber || invoiceNumber.length > 180)) return null
  return { id, userId, dueAt, invoiceNumber }
}

export async function GET_admin_renewal_reminders(req: NextRequest) {
  const guard = await adminGuard(req, 'hosting', permissions)
  if ('response' in guard) return guard.response
  const params = req.nextUrl.searchParams
  const due = (params.get('due') ?? 'ALL') as RenewalDueFilter
  const invoice = (params.get('invoice') ?? 'ALL') as RenewalInvoiceFilter
  const cursor = Number(params.get('cursor') ?? '0')
  if (!renewalDueFilters.includes(due) || !renewalInvoiceFilters.includes(invoice) || (cursor !== 0 && !validId(cursor))) return invalid()
  return privateResponse(await previewRenewalReminders({ due, invoice, cursor }))
}

export async function POST_admin_renewal_reminders(req: NextRequest) {
  const guard = await adminGuard(req, 'hosting', permissions)
  if ('response' in guard) return guard.response
  const origin = req.headers.get('origin')
  if (!origin || !originIsThisSite(origin, req.nextUrl.host)) return err('مبدأ درخواست معتبر نیست', 403)
  let body
  try { body = await readJsonObject(req, 16_000) }
  catch (error) { if (error instanceof JsonBodyError) return err(error.message, error.status); throw error }
  if (body?.confirmed !== true || !Array.isArray(body.items) || !body.items.length || body.items.length > renewalReminderBatchLimit) return invalid()
  const items: RenewalReminderSelection[] = []
  const seen = new Set<number>()
  for (const value of body.items) {
    const item = selectionOf(value)
    if (!item || seen.has(item.id)) return invalid()
    seen.add(item.id)
    items.push(item)
  }
  return privateResponse({ items: await dispatchRenewalReminders(items, { req, actor: guard.admin }) })
}
