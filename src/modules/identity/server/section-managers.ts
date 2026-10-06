import { db } from '@/platform/database/prisma'
import { isFullAccess, parsePermissions } from '@/modules/identity/rbac'
import { SITE_SECTIONS, isSectionRole, normalizeSections, sectionRole, sectionsOf } from '@/modules/identity/domain/sections'

// Managers of the site's sections. An account has one role; a manager's role is the one that stands for
// exactly their sections (found or made on demand), so choosing sections never needs a role built by hand.

export class StaffError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export type StaffKind = 'full' | 'sections' | 'custom'
export type StaffRow = { id: number; email: string; name: string; status: string; kind: StaffKind; roleName: string; sections: string[]; twoFactor: boolean; lastLoginAt: Date | null }

const kindOf = (user: { roleId: number | null; roleRef: { permissions: string } | null }): StaffKind =>
  user.roleId == null || isFullAccess(user.roleRef?.permissions || '') ? 'full' : isSectionRole(parsePermissions(user.roleRef?.permissions || '')) ? 'sections' : 'custom'

/** Every staff account, with the sections its role covers and whether this page may change it. */
export async function listStaff(): Promise<StaffRow[]> {
  const users = await db.user.findMany({
    where: { role: 'ADMIN' }, orderBy: [{ roleId: 'asc' }, { id: 'asc' }],
    select: { id: true, email: true, name: true, status: true, roleId: true, totpEnabledAt: true, lastLoginAt: true, roleRef: { select: { name: true, nameFa: true, permissions: true } } },
  })
  return users.map((user) => {
    const kind = kindOf(user)
    return {
      id: user.id, email: user.email, name: user.name || '', status: user.status, kind,
      roleName: kind === 'full' ? 'مدیر کل سایت' : user.roleRef?.nameFa || user.roleRef?.name || '',
      sections: kind === 'full' ? SITE_SECTIONS.map((section) => section.id) : sectionsOf(parsePermissions(user.roleRef?.permissions || '')),
      twoFactor: !!user.totpEnabledAt, lastLoginAt: user.lastLoginAt,
    }
  })
}

/**
 * Makes an account the manager of exactly these sections; none takes the account back to an ordinary member.
 * Refused for the actor's own account, for full-access accounts and for accounts whose role is not a plain
 * section role (those are the role form's). An account never ends up as staff without a role, which would
 * be full access.
 */
export async function setSectionManager(actorId: number, target: { userId?: unknown; email?: unknown }, sectionIds: unknown) {
  const sections = normalizeSections(sectionIds)
  // A list that names something but nothing known is a mistake, not a request to remove the manager.
  if (!Array.isArray(sectionIds) || (sectionIds.length > 0 && !sections.length)) throw new StaffError('بخش‌های انتخاب‌شده معتبر نیستند')
  const email = String(target.email ?? '').trim().toLowerCase()
  const id = Number(target.userId)
  const user = Number.isSafeInteger(id) && id > 0
    ? await db.user.findUnique({ where: { id }, select: { id: true, email: true, role: true, roleId: true, status: true, roleRef: { select: { permissions: true } } } })
    : email ? await db.user.findUnique({ where: { email }, select: { id: true, email: true, role: true, roleId: true, status: true, roleRef: { select: { permissions: true } } } }) : null
  if (!user) throw new StaffError('حسابی با این ایمیل پیدا نشد؛ ابتدا باید در سایت ثبت‌نام کرده باشد', 404)
  if (user.id === actorId) throw new StaffError('نمی‌توانید بخش‌های حساب خودتان را تغییر دهید', 403)
  if (user.status !== 'ACTIVE') throw new StaffError('این حساب فعال نیست', 409)
  if (user.role === 'ADMIN') {
    const kind = kindOf(user)
    if (kind === 'full') throw new StaffError('این حساب مدیر کل سایت است و از اینجا تغییر نمی‌کند', 403)
    if (kind === 'custom') throw new StaffError('این حساب نقش سفارشی دارد؛ آن را از صفحهٔ «نقش‌ها» تغییر دهید', 409)
  }
  if (!sections.length) {
    // Role and roleId change together: staff without a role would be full access.
    await db.user.update({ where: { id: user.id }, data: { role: 'CUSTOMER', roleId: null } })
    return { id: user.id, email: user.email, sections, roleId: null as number | null }
  }
  const wanted = sectionRole(sections)
  const permissions = wanted.permissions.join(',')
  // The role is this page's own: its permissions are set to exactly its sections every time.
  const role = await db.role.upsert({ where: { name: wanted.name }, update: { permissions, nameFa: wanted.nameFa, nameEn: wanted.nameEn }, create: { name: wanted.name, nameFa: wanted.nameFa, nameEn: wanted.nameEn, permissions, isSystem: false } })
  await db.user.update({ where: { id: user.id }, data: { role: 'ADMIN', roleId: role.id } })
  return { id: user.id, email: user.email, sections, roleId: role.id as number | null }
}
