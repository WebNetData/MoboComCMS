import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { requireAdmin, requirePerm } from '@/modules/identity/server/access'
import { moduleGuard, isModuleEnabled } from '@/extensions/server/modules'
import { mutationOrigin } from '@/platform/http/origin-policy'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { readJsonObject, JsonBodyError } from '@/platform/http/read-json'
import { auditAdmin } from '@/platform/audit/server'
import { ok, err } from '@/platform/http/response'
import { getSiteSeo } from '@/modules/site/server/seo'
import { AiError, generate } from '../client'
import { withPersonalAi } from '../admin-context'
import { SalesError, campaignPrompt, parseCampaignDraft, reportDays } from '../../domain/sales'
import { campaignResults, categoryOpportunities, customerSuggestions, incompleteOrders } from '../sales/insights'

const reply = (data: unknown) => { const response = ok(data); response.headers.set('Cache-Control', 'private, no-store'); return response }
const failure = (e: unknown) => e instanceof SalesError || e instanceof JsonBodyError || e instanceof AiError ? err(e.message, e.status) : err('گزارش فعلاً در دسترس نیست؛ وضعیت پایگاه داده را بررسی کنید', 503)

/** The same pairs of permissions their owners require: CRM journeys need both users and automation. */
async function access(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return null
  const [users, automation, orders] = await Promise.all([requirePerm(req, 'users.manage'), requirePerm(req, 'automation.manage'), requirePerm(req, 'orders.manage')])
  const store = await isModuleEnabled('store')
  return { admin, crm: !!users && !!automation, customers: !!users, orders: !!orders && store, store }
}

export async function GET(req: NextRequest) {
  const off = await moduleGuard('ai-assistant'); if (off) return off
  const can = await access(req); if (!can) return err('forbidden', 403)
  try {
    const customer = req.nextUrl.searchParams.get('customer')
    if (customer !== null) {
      const id = Number(customer)
      if (!can.customers || !can.store) return err('دسترسی مدیریت کاربران لازم است', 403)
      if (!Number.isSafeInteger(id) || id < 1 || !await db.user.count({ where: { id } })) throw new SalesError('مشتری پیدا نشد', 404)
      return reply({ suggestions: await customerSuggestions(id) })
    }
    if (!can.crm && !can.orders) return err('برای این بخش دسترسی ارتباط با مشتری یا سفارش‌ها لازم است', 403)
    const days = reportDays(req.nextUrl.searchParams.get('days'))
    const [results, opportunities, incomplete] = await Promise.all([
      can.crm ? campaignResults(days) : null,
      can.crm && can.store ? categoryOpportunities() : null,
      can.orders ? incompleteOrders() : null,
    ])
    return reply({ access: { crm: can.crm, orders: can.orders, customers: can.customers && can.store }, results, opportunities, incomplete })
  } catch (e) { return failure(e) }
}

/** POST { action:'draft', categoryId, offer } — copy for a campaign. It writes text only; nothing is saved or sent. */
export async function POST(req: NextRequest) {
  const off = await moduleGuard('ai-assistant'); if (off) return off
  const can = await access(req); if (!can) return err('forbidden', 403)
  if (!can.crm || !can.store) return err('دسترسی ارتباط با مشتری لازم است', 403)
  const site = process.env.NEXTAUTH_URL || req.url
  if (!URL.canParse(site) || mutationOrigin({ origin: req.headers.get('origin'), referer: req.headers.get('referer'), secFetchSite: req.headers.get('sec-fetch-site'), hasCookies: !!req.headers.get('cookie'), hosts: [req.nextUrl.host, new URL(site).host] }) !== 'allow') return err('درخواست باید از همین سایت باشد', 403)
  if (!(await rateLimitStrict(`ai:sales:${can.admin.id}`, 20, 600000)).ok) return err('درخواست زیاد است؛ کمی بعد دوباره امتحان کنید', 429)
  try {
    const body = await readJsonObject(req, 4000)
    if (body.action !== 'draft') throw new SalesError('عملیات معتبر نیست')
    const categoryId = Number(body.categoryId), offer = typeof body.offer === 'string' ? body.offer.trim().slice(0, 200) : ''
    const opportunity = (await categoryOpportunities()).find(o => o.categoryId === categoryId)
    if (!opportunity) throw new SalesError('این دسته در فهرست فرصت‌ها نیست', 404)
    const brand = (await getSiteSeo('fa')).name
    const result = await withPersonalAi(can.admin.id, () => generate({ system: 'فقط JSON معتبر برگردان.', user: campaignPrompt({ brand, category: opportunity.name, products: opportunity.products.map(p => p.name), audience: opportunity.ready, offer }), maxTokens: 600, json: true }), 'store')
    const draft = parseCampaignDraft(result.text)
    await auditAdmin({ req, actor: can.admin, action: 'ai.sales.draft', targetType: 'product-category', targetId: String(categoryId), metadata: { model: result.model } })
    return reply({ draft, model: result.model })
  } catch (e) { return failure(e) }
}
