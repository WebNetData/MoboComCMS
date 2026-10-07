import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requireAdmin } from '@/modules/identity/server/access'
import { MAX_SAVED_VIEWS, cleanViewName, normalizeViewHref } from '@/modules/identity/domain/saved-views'

export class ViewError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

/** A staff member's own saved views, newest first. */
export async function listSavedViews(userId: number) {
  return db.adminSavedView.findMany({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: MAX_SAVED_VIEWS, select: { id: true, name: true, href: true } })
}

/** Saves an admin address under a name. The same name again replaces the address it pointed to. */
export async function saveView(userId: number, input: { name?: unknown; href?: unknown }) {
  const name = cleanViewName(input.name), href = normalizeViewHref(input.href)
  if (!name) throw new ViewError('نامی برای این نما بنویسید')
  if (!href) throw new ViewError('این نشانی قابل ذخیره نیست')
  const existing = await db.adminSavedView.findUnique({ where: { userId_name: { userId, name } }, select: { id: true } })
  if (!existing && await db.adminSavedView.count({ where: { userId } }) >= MAX_SAVED_VIEWS) throw new ViewError(`حداکثر ${MAX_SAVED_VIEWS.toLocaleString('fa-IR')} نما ذخیره می‌شود؛ یکی را حذف کنید`, 409)
  return db.adminSavedView.upsert({ where: { userId_name: { userId, name } }, create: { userId, name, href }, update: { href }, select: { id: true, name: true, href: true } })
}

export async function deleteView(userId: number, id: number) {
  const removed = await db.adminSavedView.deleteMany({ where: { id, userId } })
  if (!removed.count) throw new ViewError('این نما پیدا نشد', 404)
  return { deleted: true }
}

const failure = (error: unknown) => (error instanceof ViewError ? err(error.message, error.status) : err('خطای داخلی؛ دوباره تلاش کنید', 500))
const sameSite = (req: NextRequest) => { const origin = req.headers.get('origin'); return !origin || new URL(origin).host === req.headers.get('host') }

/** GET /api/admin/views — the signed-in staff member's saved views. */
export async function GET_views(req: NextRequest) {
  const admin = await requireAdmin(req)
  return admin ? ok({ views: await listSavedViews(admin.id) }) : err('forbidden', 403)
}

/** POST /api/admin/views { name, href } · DELETE /api/admin/views?id= */
export async function POST_views(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin || !sameSite(req)) return err('forbidden', 403)
  try { return ok({ view: await saveView(admin.id, (await req.json().catch(() => null)) || {}), views: await listSavedViews(admin.id) }, 201) } catch (error) { return failure(error) }
}

export async function DELETE_views(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin || !sameSite(req)) return err('forbidden', 403)
  try { await deleteView(admin.id, Number(req.nextUrl.searchParams.get('id'))); return ok({ views: await listSavedViews(admin.id) }) } catch (error) { return failure(error) }
}
