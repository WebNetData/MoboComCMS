import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { createJournalPost } from '@/modules/journal/server/create'
import { createCatalogProduct } from '@/modules/catalog/server/create'
import { createPage } from '@/modules/site/server/page-commands'
import { changePostStates } from '@/modules/journal/server/review-bulk'
import { contentChanged } from '@/modules/content/server/events'
import { addOrderNote, transitionOrder } from '@/modules/store/server/orders'
import type { EditorActor } from '@/modules/editor/server/documents'
import { AiOperationError, type AiOperation } from '../../domain/operations'
import { assertOperationSnapshot } from './context'
import { operationDocument } from './document'

type Guard = (tx: Prisma.TransactionClient) => Promise<void>
type Commit = (tx: Prisma.TransactionClient, result: Record<string, unknown>) => Promise<void>
export async function executeOperation(req: NextRequest, actor: { id: number; email: string; roleId?: number | null; permissions?: string[] | null }, op: AiOperation, snapshot: string, guard: Guard, commit: Commit) {
  const a = op.args, id = Number(a.id)
  if (op.tool === 'post.create' || op.tool === 'page.create') {
    const writer: EditorActor = { ...actor, roleId: actor.roleId ?? null, permissions: actor.permissions ?? null }, document = await operationDocument(String(a.body), writer)
    const fields = { slug: a.slug, title: a.title, status: a.status, ...document, ...(op.tool === 'post.create' ? { excerpt: a.excerpt } : {}) }
    const receipt = async (tx: Prisma.TransactionClient, _before: Record<string, unknown>, after: Record<string, unknown>) => { await guard(tx); await commit(tx, { id: after.id, href: op.tool === 'post.create' ? `/admin/posts?edit=${after.id}` : `/admin/pages?edit=${after.id}`, title: a.title }) }
    if (op.tool === 'post.create') await createJournalPost({ categoryId: a.categoryId, status: a.status }, fields, actor, receipt)
    else await createPage({}, fields, actor, receipt)
    return
  }
  if (op.tool === 'product.create') {
    const escape = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    await createCatalogProduct({ name: a.name, slug: a.slug, description: `<p>${escape(String(a.body)).replace(/\n/g, '<br>')}</p>`, price: a.price, currency: a.currency, kind: a.kind, stock: a.stock, active: a.active, categoryId: a.categoryId }, actor, async (tx, _before, after) => { await guard(tx); await commit(tx, { id: after.id, href: `/admin/store/products/${after.id}`, title: a.name }) })
    return
  }
  if (op.tool === 'post.publish') {
    const row = await db.post.findUnique({ where: { id } })
    if (!row || row.updatedAt.toISOString() !== JSON.parse(snapshot).updatedAt) throw new AiOperationError('مطلب پس از پیشنهاد تغییر کرده است', 409)
    const changed = await changePostStates({ rows: [row], status: 'PUBLISHED', actor, req, commit: async (tx, after) => { await guard(tx); await commit(tx, { id, href: `/admin/posts?edit=${id}`, title: after.title }) } })
    if (!changed.changed.length) throw new AiOperationError('مطلب هم‌زمان تغییر کرده است', 409)
    for (const item of changed.changed) contentChanged({ type: 'post', id }, item.before, item.after)
    return
  }
  const beforeWrite: Guard = async tx => { await guard(tx); await assertOperationSnapshot(op, snapshot, tx) }
  const receipt = async (tx: Prisma.TransactionClient) => commit(tx, { id, href: `/admin/store/orders/${id}`, title: `سفارش ${id}` })
  if (op.tool === 'order.note') await addOrderNote({ orderId: id, note: a.note, visible: false, actorId: actor.id, scope: { actorId: actor.id, manager: true }, beforeWrite, commit: receipt })
  else if (op.tool === 'order.transition') await transitionOrder({ orderId: id, to: String(a.status), note: a.note, trackingCode: a.trackingCode || undefined, notify: false, restock: false, actorId: actor.id, scope: { actorId: actor.id, manager: true }, beforeWrite, commit: receipt })
  else throw new AiOperationError('این ابزار پشتیبانی نمی‌شود')
}
