import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { adminNeedsTwoFactor, getRawToken, resolveCurrentUser, type AuthedUser } from '@/modules/identity/server/access'
import { CONTENT_EDIT_PERMISSIONS, hasPermission } from '@/modules/identity/rbac'
import { AUTHOR_PERMISSIONS } from '@/modules/identity/domain/sections'
import { LibraryError } from '@/modules/media/domain/library'

export type LibraryActor = { id: number; authAt: Date | null; purpose?: 'import' }
export type LibraryUser = AuthedUser & { manageLibrary: boolean; configureLibrary: boolean; serverTools: boolean }
export async function libraryActor(req: NextRequest): Promise<LibraryActor> {
  const token = await getRawToken(req)
  if (!token?.uid) throw new LibraryError('دسترسی مجاز نیست', 403)
  const at = token.authAt ? new Date(token.authAt as string | number) : null
  return { id: Number(token.uid), authAt: at && Number.isFinite(at.getTime()) ? at : null }
}
export async function currentLibraryUser(actor: LibraryActor, reader: Prisma.TransactionClient | typeof db = db): Promise<LibraryUser> {
  const user = await resolveCurrentUser(actor.id, actor.authAt, reader)
  if (!user || user.role !== 'ADMIN' || await adminNeedsTwoFactor(user, reader)) throw new LibraryError('اختیار فعلی حساب برای کتابخانه معتبر نیست', 403)
  const has = (p: string) => user.roleId == null || hasPermission(user.permissions || [], p)
  const manageLibrary = has('media.manage') || has('settings.manage')
  if (actor.purpose === 'import' && !has('imports.manage')) throw new LibraryError('اختیار ورود اطلاعات معتبر نیست', 403)
  if (!manageLibrary && !(actor.purpose === 'import' && has('imports.manage')) && ![...CONTENT_EDIT_PERMISSIONS, ...AUTHOR_PERMISSIONS].some(has)) throw new LibraryError('دسترسی مجاز نیست', 403)
  return { ...user, manageLibrary, configureLibrary: has('settings.manage'), serverTools: has('server.manage') }
}
export function owns(user: LibraryUser, row: { createdById: number | null }) {
  if (!user.manageLibrary && row.createdById !== user.id) throw new LibraryError('ویرایش این مورد به مدیر کتابخانه یا بارگذار آن اختصاص دارد', 403)
}
export async function libraryTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(fn, { isolationLevel: 'Serializable', timeout: 15000 }) }
    catch (error) {
      const code = (error as { code?: string }).code
      if (code === 'P2034' && attempt < 3) continue
      if (code === 'P2002') throw new LibraryError('این نام یا درخواست از قبل وجود دارد؛ فهرست را تازه کنید', 409)
      throw error
    }
  }
}
