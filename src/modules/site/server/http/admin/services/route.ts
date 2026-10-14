import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { minorToNumber } from '@/shared/money'
import { listForms } from '@/modules/forms/server/service'
import { formStaff, mayHandle } from '@/modules/forms/server/advanced'

/**
 * GET /api/admin/services — everything the site performs as a service, in one place: forms marked as a service
 * (with the work waiting on each) and virtual products marked as a service (with the paid orders waiting).
 * Each half is shown to those who may work on it: form builders and handlers see the forms they may open,
 * order and catalogue staff see the products.
 */
export async function GET(req: NextRequest) {
  const builder = await requirePerm(req, 'cms.pages')
  const handler = builder || await requirePerm(req, 'forms.handle')
  const orders = await requirePerm(req, 'orders.manage')
  const catalog = await requirePerm(req, 'cms.products')
  if (!handler && !orders && !catalog) return err('دسترسی مجاز نیست', 403)

  const forms = handler ? (await listForms()).filter((form) => form.settings?.service && mayHandle(form, handler, Boolean(builder))) : []
  const [groups, staff] = await Promise.all([
    forms.length ? db.formSubmission.groupBy({ by: ['formId', 'stage', 'payStatus'], where: { formId: { in: forms.map((form) => form.id!) }, status: { not: 'SPAM' } }, _count: { _all: true } }) : [],
    forms.some((form) => form.settings?.handlers.length) ? formStaff() : [],
  ])
  const names = new Map(staff.map((member) => [member.id, member.name]))
  const formRows = forms.map((form) => {
    const work = { OPEN: 0, IN_PROGRESS: 0, DONE: 0, REJECTED: 0, UNPAID: 0 } as Record<string, number>
    for (const group of groups) if (group.formId === form.id) { if (group.payStatus === 'UNPAID') work.UNPAID += group._count._all; else if (group.stage in work) work[group.stage] += group._count._all }
    return {
      id: form.id!, title: form.title, slug: form.slug, published: form.published, paid: Boolean(form.settings?.payment.enabled), work,
      handlers: (form.settings?.handlers || []).map((id) => names.get(id) || `کاربر ${id}`),
    }
  })

  const products = orders || catalog ? await db.product.findMany({ where: { isService: true }, orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { id: 'desc' }], take: 200, select: { id: true, name: true, slug: true, image: true, active: true, priceMinor: true, currency: true, openAmount: true, orderFields: true } }) : []
  // Paid orders of each service that nobody has delivered yet.
  const waiting = products.length ? await db.orderLine.groupBy({ by: ['productId'], where: { productId: { in: products.map((product) => product.id) }, order: { status: 'PAID', productDelivery: { is: { status: { in: ['PENDING', 'PROCESSING'] } } } } }, _count: { _all: true } }) : []
  const done = products.length ? await db.orderLine.groupBy({ by: ['productId'], where: { productId: { in: products.map((product) => product.id) }, order: { status: 'PAID', productDelivery: { is: { status: 'DELIVERED' } } } }, _count: { _all: true } }) : []
  const count = (rows: { productId: number | null; _count: { _all: number } }[], id: number) => rows.find((row) => row.productId === id)?._count._all || 0
  const productRows = products.map((product) => ({
    id: product.id, name: product.name, slug: product.slug, image: product.image, active: product.active, price: minorToNumber(product.priceMinor, product.currency), currency: product.currency,
    openAmount: product.openAmount, asksBuyer: product.orderFields !== '[]' && product.orderFields !== '', waiting: count(waiting, product.id), delivered: count(done, product.id),
  }))

  return ok({
    forms: formRows, products: productRows,
    can: { forms: Boolean(handler), buildForms: Boolean(builder), orders: Boolean(orders), catalog: Boolean(catalog) },
    totals: {
      open: formRows.reduce((sum, form) => sum + form.work.OPEN, 0), inProgress: formRows.reduce((sum, form) => sum + form.work.IN_PROGRESS, 0),
      unpaid: formRows.reduce((sum, form) => sum + form.work.UNPAID, 0), orders: productRows.reduce((sum, product) => sum + product.waiting, 0),
    },
  })
}
